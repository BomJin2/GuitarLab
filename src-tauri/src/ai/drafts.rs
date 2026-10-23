use super::{
    error,
    transcription::{DraftFile, TranscribeRequest},
};
use crate::{
    ipc::AppError,
    storage::{
        database::connect,
        project_model::{validate_uuid, AssetKind},
        projects::{canceled, hash, ProjectStore},
    },
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

fn context(request: &TranscribeRequest) -> Result<String, AppError> {
    request.validate()?;
    let text = serde_json::to_string(request).map_err(|_| AppError::invalid())?;
    if text.len() > 65536 {
        return Err(AppError::invalid());
    }
    Ok(text)
}
fn validate_result(
    store: &ProjectStore,
    request: &TranscribeRequest,
    result: &Value,
    cancel: &AtomicBool,
) -> Result<(), AppError> {
    let invalid = || error("AI_OUTPUT_INVALID");
    if !result
        .as_object()
        .is_some_and(|o| o.len() == if request.stem_id.is_some() { 11 } else { 10 })
        || result["schemaVersion"] != 1
        || result["projectId"] != request.project_id
        || result["assetId"] != request.asset_id
        || result["modelId"] != "basic-pitch"
        || result["modelVersion"] != "0.4.0"
        || result["status"] != "AI_DRAFT"
        || result["confidenceMeaning"] != "MEAN_NOTE_ACTIVATION"
    {
        return Err(invalid());
    }
    let assets = store.assets(&request.project_id)?;
    let asset = assets
        .iter()
        .find(|a| a.id == request.asset_id && a.kind == AssetKind::Original)
        .ok_or_else(invalid)?;
    if let Some(stem_id) = &request.stem_id {
        if result["stemId"] != *stem_id {
            return Err(invalid());
        }
        let bytes = super::stem_store::read_guitar_stem(
            store,
            &request.project_id,
            &request.asset_id,
            stem_id,
            cancel,
        )?;
        let duration = (bytes.len() - 44) as f64 / 8.0 / 44100.0 * 1000.0;
        if result["inputSha256"] != hash(&bytes)
            || result["durationMs"]
                .as_f64()
                .is_none_or(|d| !d.is_finite() || (d - duration).abs() > 0.000001)
        {
            return Err(invalid());
        }
    } else if result["inputSha256"] != asset.sha256 || result.get("stemId").is_some() {
        return Err(invalid());
    }
    let file: DraftFile = serde_json::from_value(
        json!({"schemaVersion":1,"durationMs":result["durationMs"],"notes":result["notes"]}),
    )
    .map_err(|_| invalid())?;
    file.validate(request)
}
pub(super) fn save(
    store: &ProjectStore,
    request: &TranscribeRequest,
    result: &Value,
    id: &str,
    cancel: &AtomicBool,
) -> Result<(), AppError> {
    canceled(cancel)?;
    validate_uuid(id)?;
    let context = context(request)?;
    validate_result(store, request, result, cancel)?;
    let result = serde_json::to_string(result).map_err(|_| error("AI_OUTPUT_INVALID"))?;
    if result.len() > 2 * 1024 * 1024 {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    let _guard = store.writer.lock().map_err(|_| error("STORAGE_ERROR"))?;
    let mut db = connect(&store.root)?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| error("STORAGE_ERROR"))?;
    store.summary(&tx, &request.project_id)?;
    let count: u32 = tx
        .query_row(
            "SELECT count(*) FROM ai_transcription_drafts WHERE project_id=?1",
            [&request.project_id],
            |r| r.get(0),
        )
        .map_err(|_| error("STORAGE_ERROR"))?;
    if count >= 100 {
        return Err(error("AI_DRAFT_LIMIT"));
    }
    tx.execute("INSERT INTO ai_transcription_drafts(id,project_id,asset_id,context_json,context_sha256,result_json,result_sha256) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![id,request.project_id,request.asset_id,context,hash(context.as_bytes()),result,hash(result.as_bytes())]).map_err(|_| error("STORAGE_ERROR"))?;
    canceled(cancel)?;
    tx.commit().map_err(|_| error("STORAGE_ERROR"))
}
pub fn restore(
    store: &ProjectStore,
    request: &TranscribeRequest,
    cancel: &AtomicBool,
) -> Result<Value, AppError> {
    canceled(cancel)?;
    let expected = context(request)?;
    // asset ID를 다른 프로젝트의 문맥으로 조회할 수 없습니다.
    if !store
        .assets(&request.project_id)?
        .iter()
        .any(|a| a.id == request.asset_id && a.kind == AssetKind::Original)
    {
        return Err(AppError::invalid());
    }
    let db = connect(&store.root)?;
    let row: Option<(String,String,String)> = db.query_row("SELECT context_json,result_json,result_sha256 FROM ai_transcription_drafts WHERE project_id=?1 AND asset_id=?2 AND context_sha256=?3 ORDER BY sequence DESC LIMIT 1",params![request.project_id,request.asset_id,hash(expected.as_bytes())],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|_|error("STORAGE_ERROR"))?;
    let draft = if let Some((context, result, digest)) = row {
        if context != expected
            || context.len() > 65536
            || result.len() > 2 * 1024 * 1024
            || hash(result.as_bytes()) != digest
        {
            return Err(error("AI_OUTPUT_INVALID"));
        }
        let value: Value = serde_json::from_str(&result).map_err(|_| error("AI_OUTPUT_INVALID"))?;
        validate_result(store, request, &value, cancel)?;
        value
    } else {
        if let Some(stem_id) = &request.stem_id {
            super::stem_store::read_guitar_stem(
                store,
                &request.project_id,
                &request.asset_id,
                stem_id,
                cancel,
            )?;
        }
        Value::Null
    };
    canceled(cancel)?;
    Ok(json!({"schemaVersion":1,"draft":draft}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{
        project_model::{AssetStorage, SyncAnchor},
        projects_tests::Fixture,
    };
    fn fixture() -> (Fixture, TranscribeRequest, Value) {
        let f = Fixture::new();
        let project = f.project();
        let source = f.store.root.join("자체.wav");
        std::fs::write(&source, include_bytes!("../../../public/fixtures/sine.wav"))
            .expect("자체 입력");
        let asset = f
            .store
            .import_asset(
                &project,
                &source,
                AssetKind::Original,
                AssetStorage::Managed,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("등록")
            .asset;
        let request = TranscribeRequest {
            schema_version: 1,
            project_id: project,
            asset_id: asset.id,
            stem_id: None,
            tuning_midi: [64, 59, 55, 50, 45, 40],
            sync_anchors: vec![
                SyncAnchor {
                    score_tick: 0,
                    audio_time_ms: 0.,
                },
                SyncAnchor {
                    score_tick: 7680,
                    audio_time_ms: 4000.,
                },
            ],
            grid: 240,
        };
        let result = json!({"schemaVersion":1,"projectId":request.project_id,"assetId":request.asset_id,"inputSha256":asset.sha256,"modelId":"basic-pitch","modelVersion":"0.4.0","status":"AI_DRAFT","confidenceMeaning":"MEAN_NOTE_ACTIVATION","durationMs":4000,"notes":[{"onsetMs":10,"offsetMs":450,"pitchMidi":64,"confidence":0.6,"startTick":0,"durationTicks":960,"candidates":[{"stringIndex":1,"fret":0}],"fingering":{"stringIndex":1,"fret":0},"reviewReasons":["LOW_CONFIDENCE"],"source":"ai"}]});
        (f, request, result)
    }
    #[test]
    fn latest_exact_context_reopens_without_model_and_keeps_previous_rows() {
        let (f, mut request, result) = fixture();
        let cancel = AtomicBool::new(false);
        assert!(restore(&f.store, &request, &cancel).expect("빈 결과")["draft"].is_null());
        let first = uuid::Uuid::new_v4().to_string();
        save(&f.store, &request, &result, &first, &cancel).expect("초안 보존");
        assert!(save(&f.store, &request, &result, &first, &cancel).is_err());
        let reopened = ProjectStore::new(f.store.root.clone());
        assert_eq!(
            restore(&reopened, &request, &cancel).expect("모델 없이 재열기")["draft"],
            result
        );
        request.grid = 480;
        assert!(restore(&reopened, &request, &cancel).expect("다른 grid")["draft"].is_null());
        request.grid = 240;
        request.sync_anchors[1].audio_time_ms = 4001.;
        assert!(restore(&reopened, &request, &cancel).expect("다른 싱크")["draft"].is_null());
        request.sync_anchors[1].audio_time_ms = 4000.;
        request.tuning_midi[0] = 62;
        assert!(restore(&reopened, &request, &cancel).expect("다른 튜닝")["draft"].is_null());
        request.tuning_midi[0] = 64;
        let mut newer = result.clone();
        newer["notes"][0]["confidence"] = json!(0.65);
        save(
            &f.store,
            &request,
            &newer,
            &uuid::Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("새 초안");
        assert_eq!(
            restore(&reopened, &request, &cancel).expect("최신")["draft"],
            newer
        );
        let db = connect(&f.store.root).expect("DB");
        assert_eq!(
            db.query_row("SELECT count(*) FROM ai_transcription_drafts", [], |r| r
                .get::<_, u32>(0))
                .expect("이력"),
            2
        );
        assert_eq!(
            std::fs::read(f.store.root.join("자체.wav")).expect("원본"),
            include_bytes!("../../../public/fixtures/sine.wav")
        );
    }
    #[test]
    fn cancellation_corruption_foreign_asset_and_save_failure_keep_prior_draft() {
        let (f, mut request, result) = fixture();
        let cancel = AtomicBool::new(false);
        let first = uuid::Uuid::new_v4().to_string();
        save(&f.store, &request, &result, &first, &cancel).expect("첫 초안");
        assert_eq!(
            save(
                &f.store,
                &request,
                &result,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(true)
            )
            .expect_err("취소")
            .code,
            "CANCELED"
        );
        assert!(restore(&f.store, &request, &AtomicBool::new(true)).is_err());
        let project = request.project_id.clone();
        request.project_id = f.project();
        assert!(restore(&f.store, &request, &cancel).is_err());
        request.project_id = project;
        let mut forged = result.clone();
        forged["inputSha256"] = json!("a".repeat(64));
        assert!(save(
            &f.store,
            &request,
            &forged,
            &uuid::Uuid::new_v4().to_string(),
            &cancel
        )
        .is_err());
        let db = connect(&f.store.root).expect("DB");
        db.execute_batch("CREATE TRIGGER fail_ai_insert BEFORE INSERT ON ai_transcription_drafts BEGIN SELECT RAISE(ABORT,'자체 실패 주입'); END;").expect("실패 주입");
        assert!(save(
            &f.store,
            &request,
            &result,
            &uuid::Uuid::new_v4().to_string(),
            &cancel
        )
        .is_err());
        assert_eq!(
            restore(&f.store, &request, &cancel).expect("실패 뒤 보존")["draft"],
            result
        );
        db.execute(
            "UPDATE ai_transcription_drafts SET result_json='{}' WHERE id=?1",
            [first],
        )
        .expect("손상 주입");
        assert_eq!(
            restore(&f.store, &request, &cancel)
                .expect_err("손상 거부")
                .code,
            "AI_OUTPUT_INVALID"
        );
    }
    #[test]
    fn version_three_migrates_without_changing_project_or_asset_and_limits_growth() {
        let (f, request, result) = fixture();
        let before = serde_json::to_value(f.store.assets(&request.project_id).expect("등록 원본"))
            .expect("기준");
        let db = connect(&f.store.root).expect("DB");
        db.execute_batch("DROP TABLE project_trash; DROP TABLE imported_guitar_stems; DROP TABLE project_youtube_syncs; DROP TABLE project_backings; DROP TABLE audio_stems; DROP TABLE audio_stem_sets; DROP TABLE ai_transcription_drafts; PRAGMA user_version=3;")
            .expect("기존 v3 재현");
        drop(db);
        let db = connect(&f.store.root).expect("추가004");
        assert_eq!(
            db.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
                .expect("버전"),
            9
        );
        assert_eq!(
            serde_json::to_value(f.store.assets(&request.project_id).expect("이전 자산"))
                .expect("비교"),
            before
        );
        let cancel = AtomicBool::new(false);
        for _ in 0..100 {
            save(
                &f.store,
                &request,
                &result,
                &uuid::Uuid::new_v4().to_string(),
                &cancel,
            )
            .expect("한도 안 보존");
        }
        assert_eq!(
            save(
                &f.store,
                &request,
                &result,
                &uuid::Uuid::new_v4().to_string(),
                &cancel
            )
            .expect_err("한도")
            .code,
            "AI_DRAFT_LIMIT"
        );
        assert_eq!(
            restore(&f.store, &request, &cancel).expect("기존 보존")["draft"],
            result
        );
    }
}
