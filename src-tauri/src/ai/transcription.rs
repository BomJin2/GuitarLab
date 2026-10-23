use super::{error, run_request};
use crate::{
    ipc::AppError,
    recording::wave,
    storage::{
        database::{checked_directory, checked_file},
        project_model::{validate_uuid, AssetKind, SyncAnchor},
        projects::{canceled, hash, ProjectStore},
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::Path,
    sync::atomic::AtomicBool,
    time::Duration,
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TranscribeRequest {
    pub schema_version: u8,
    pub project_id: String,
    pub asset_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stem_id: Option<String>,
    pub tuning_midi: [u8; 6],
    pub sync_anchors: Vec<SyncAnchor>,
    pub grid: u32,
}
impl TranscribeRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.asset_id)?;
        if let Some(stem_id) = &self.stem_id {
            validate_uuid(stem_id)?;
        }
        if self.schema_version != 1
            || self.tuning_midi.iter().any(|p| *p > 127)
            || ![60, 120, 240, 480, 960].contains(&self.grid)
            || !(2..=256).contains(&self.sync_anchors.len())
        {
            return Err(AppError::invalid());
        }
        for (i, a) in self.sync_anchors.iter().enumerate() {
            if a.score_tick > 100_000_000
                || !a.audio_time_ms.is_finite()
                || !(0.0..=86_400_000.0).contains(&a.audio_time_ms)
                || (i > 0
                    && (a.score_tick <= self.sync_anchors[i - 1].score_tick
                        || a.audio_time_ms <= self.sync_anchors[i - 1].audio_time_ms))
            {
                return Err(AppError::invalid());
            }
        }
        Ok(())
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fingering {
    pub string_index: u8,
    pub fret: u8,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewReason {
    LowConfidence,
    OutOfRange,
    QuantizationShift,
    FingeringAmbiguous,
    Polyphony,
}
fn required_fingering<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Fingering>, D::Error> {
    Option::<Fingering>::deserialize(deserializer)
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftNote {
    pub onset_ms: f64,
    pub offset_ms: f64,
    pub pitch_midi: u8,
    pub confidence: f64,
    pub start_tick: u64,
    pub duration_ticks: u64,
    pub candidates: Vec<Fingering>,
    #[serde(deserialize_with = "required_fingering")]
    pub fingering: Option<Fingering>,
    pub review_reasons: Vec<ReviewReason>,
    pub source: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftFile {
    pub schema_version: u8,
    pub duration_ms: f64,
    pub notes: Vec<DraftNote>,
}
impl DraftFile {
    pub fn validate(&self, request: &TranscribeRequest) -> Result<(), AppError> {
        let invalid = || error("AI_OUTPUT_INVALID");
        if self.schema_version != 1
            || !self.duration_ms.is_finite()
            || !(0.0..=60000.0).contains(&self.duration_ms)
            || self.duration_ms == 0.0
            || self.notes.is_empty()
            || self.notes.len() > 2000
        {
            return Err(invalid());
        }
        for (i, n) in self.notes.iter().enumerate() {
            if !n.onset_ms.is_finite()
                || !n.offset_ms.is_finite()
                || n.onset_ms < 0.0
                || n.onset_ms > self.duration_ms
                || n.offset_ms <= n.onset_ms
                || n.offset_ms > self.duration_ms + 50.0
                || n.pitch_midi > 127
                || !n.confidence.is_finite()
                || !(0.0..=1.0).contains(&n.confidence)
                || n.start_tick > 100_000_000
                || n.duration_ticks == 0
                || n.duration_ticks > 100_000_000 - n.start_tick
                || n.start_tick % u64::from(request.grid) != 0
                || n.duration_ticks % u64::from(request.grid) != 0
                || n.candidates.len() > 6
                || n.review_reasons.len() > 5
                || n.source != "ai"
                || (i > 0 && n.onset_ms < self.notes[i - 1].onset_ms)
            {
                return Err(invalid());
            }
            for (index, c) in n.candidates.iter().enumerate() {
                if !(1..=6).contains(&c.string_index)
                    || c.fret > 24
                    || u16::from(request.tuning_midi[usize::from(c.string_index - 1)])
                        + u16::from(c.fret)
                        != u16::from(n.pitch_midi)
                    || n.candidates[..index]
                        .iter()
                        .any(|p| p.string_index == c.string_index)
                {
                    return Err(invalid());
                }
            }
            if n.fingering
                .as_ref()
                .is_some_and(|c| !n.candidates.contains(c))
                || (n.review_reasons.contains(&ReviewReason::Polyphony) && n.fingering.is_some())
                || (n.confidence < 0.7 && !n.review_reasons.contains(&ReviewReason::LowConfidence))
                || (n.candidates.is_empty()
                    && !n.review_reasons.contains(&ReviewReason::OutOfRange))
                || n.review_reasons
                    .iter()
                    .enumerate()
                    .any(|(i, r)| n.review_reasons[..i].contains(r))
            {
                return Err(invalid());
            }
        }
        Ok(())
    }
}

pub fn transcribe_asset(
    store: &ProjectStore,
    request: &TranscribeRequest,
    job_id: &str,
    cancel: &AtomicBool,
) -> Result<Value, AppError> {
    transcribe_asset_with_resources(store, request, job_id, cancel, None)
}
pub fn transcribe_asset_with_resources(
    store: &ProjectStore,
    request: &TranscribeRequest,
    job_id: &str,
    cancel: &AtomicBool,
    resources: Option<&Path>,
) -> Result<Value, AppError> {
    request.validate()?;
    validate_uuid(job_id)?;
    canceled(cancel)?;
    let assets = store.assets(&request.project_id)?;
    let asset = assets
        .iter()
        .find(|a| a.id == request.asset_id)
        .ok_or_else(AppError::invalid)?;
    if asset.kind != AssetKind::Original {
        return Err(error("AI_INPUT_INVALID"));
    }
    let bytes = if let Some(stem_id) = &request.stem_id {
        super::stem_store::read_guitar_stem(
            store,
            &request.project_id,
            &request.asset_id,
            stem_id,
            cancel,
        )?
    } else {
        if asset.bytes > 64 * 1024 * 1024 || !asset.name.to_ascii_lowercase().ends_with(".wav") {
            return Err(error("AI_INPUT_INVALID"));
        }
        store.read_asset(
            &request.project_id,
            &request.asset_id,
            cancel,
            |_, _| Ok(()),
        )?
    };
    if !bytes.starts_with(b"RIFF") || bytes.get(8..12) != Some(b"WAVE") {
        return Err(error("AI_INPUT_INVALID"));
    }
    let relative = std::path::PathBuf::from(format!("projects/{}/analysis", request.project_id));
    let parent = checked_directory(&store.root, &relative)?;
    if wave::available_bytes(&parent).map_err(|_| error("STORAGE_ERROR"))?
        < bytes.len() as u64 + 16 * 1024 * 1024
    {
        return Err(error("DISK_SPACE_LOW"));
    }
    let work = parent.join(job_id);
    fs::create_dir(&work).map_err(|_| error("STORAGE_ERROR"))?;
    let input = work.join("input.wav");
    let output = work.join("notes.json");
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&input)
            .map_err(|_| error("STORAGE_ERROR"))?;
        for block in bytes.chunks(65536) {
            canceled(cancel)?;
            file.write_all(block).map_err(|_| error("STORAGE_ERROR"))?;
        }
        file.sync_all().map_err(|_| error("STORAGE_ERROR"))?;
        drop(file);
        let message = json!({"protocolVersion":1,"type":"start","jobId":job_id,"action":"transcribe","input":{"assetPath":input,"workDir":work},"options":{"tuningMidi":request.tuning_midi,"syncAnchors":request.sync_anchors,"grid":request.grid}});
        let result = run_request(
            super::managed::model_command_with_resources(
                &store.root,
                super::installation::ModelId::BasicPitch,
                resources,
                cancel,
            )?,
            job_id,
            cancel,
            Duration::from_secs(180),
            message,
            |_| Ok(()),
        )?;
        if result["notesPath"].as_str().map(Path::new) != Some(output.as_path()) {
            return Err(error("AI_PROTOCOL_INVALID"));
        }
        let path = checked_file(&store.root, &relative.join(job_id).join("notes.json"))?;
        let mut file = fs::File::open(path).map_err(|_| error("AI_OUTPUT_INVALID"))?;
        if file
            .metadata()
            .map_err(|_| error("AI_OUTPUT_INVALID"))?
            .len()
            > 2 * 1024 * 1024
        {
            return Err(error("AI_OUTPUT_INVALID"));
        }
        let mut data = Vec::new();
        Read::by_ref(&mut file)
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut data)
            .map_err(|_| error("AI_OUTPUT_INVALID"))?;
        if data.len() > 2 * 1024 * 1024 {
            return Err(error("AI_OUTPUT_INVALID"));
        }
        let draft: DraftFile =
            serde_json::from_slice(&data).map_err(|_| error("AI_OUTPUT_INVALID"))?;
        draft.validate(request)?;
        canceled(cancel)?;
        let mut result = json!({"schemaVersion":1,"projectId":request.project_id,"assetId":request.asset_id,"inputSha256":hash(&bytes),"modelId":"basic-pitch","modelVersion":"0.4.0","status":"AI_DRAFT","confidenceMeaning":"MEAN_NOTE_ACTIVATION","durationMs":draft.duration_ms,"notes":draft.notes});
        if let Some(stem_id) = &request.stem_id {
            result["stemId"] = json!(stem_id);
        }
        super::drafts::save(store, request, &result, job_id, cancel)?;
        Ok(result)
    })();
    for file in [&input, &output] {
        if file.exists() && fs::remove_file(file).is_err() {
            eprintln!("GuitarLab 분석 임시 파일 정리 실패: AI_TEMP_CLEANUP_FAILED");
        }
    }
    if fs::remove_dir(&work).is_err() {
        eprintln!("GuitarLab 분석 임시 폴더 정리 실패: AI_TEMP_CLEANUP_FAILED");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{project_model::AssetStorage, projects_tests::Fixture};
    fn request(project_id: String, asset_id: String) -> TranscribeRequest {
        TranscribeRequest {
            schema_version: 1,
            project_id,
            asset_id,
            stem_id: None,
            tuning_midi: [64, 59, 55, 50, 45, 40],
            sync_anchors: vec![
                SyncAnchor {
                    score_tick: 0,
                    audio_time_ms: 0.0,
                },
                SyncAnchor {
                    score_tick: 7680,
                    audio_time_ms: 4000.0,
                },
            ],
            grid: 240,
        }
    }
    #[test]
    fn request_result_and_foreign_or_score_asset_cannot_bypass_bounds() {
        let fixture = Fixture::new();
        let project = fixture.project();
        let score_asset = fixture.asset(&project, AssetStorage::Managed);
        let request = request(project, score_asset);
        request.validate().expect("유효 계약");
        let foreign: TranscribeRequest = serde_json::from_value(json!({"schemaVersion":1,"projectId":fixture.project(),"assetId":request.asset_id,"tuningMidi":request.tuning_midi,"syncAnchors":request.sync_anchors,"grid":240})).expect("다른 프로젝트 계약");
        assert!(transcribe_asset(
            &fixture.store,
            &foreign,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false)
        )
        .is_err());
        assert_eq!(
            transcribe_asset(
                &fixture.store,
                &request,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(false)
            )
            .expect_err("악보 거부")
            .code,
            "AI_INPUT_INVALID"
        );
        let result = json!({"schemaVersion":1,"durationMs":4000,"notes":[{"onsetMs":0,"offsetMs":480,"pitchMidi":64,"confidence":0.6,"startTick":0,"durationTicks":960,"candidates":[{"stringIndex":1,"fret":0}],"fingering":{"stringIndex":1,"fret":0},"reviewReasons":["LOW_CONFIDENCE"],"source":"ai"}]});
        serde_json::from_value::<DraftFile>(result.clone())
            .expect("결과")
            .validate(&request)
            .expect("검증");
        let mut bad = result.clone();
        bad["notes"][0]["candidates"][0]["fret"] = json!(1);
        assert!(serde_json::from_value::<DraftFile>(bad)
            .expect("구조")
            .validate(&request)
            .is_err());
        let mut bad = result.clone();
        bad["notes"][0]["reviewReasons"] = json!([]);
        assert!(serde_json::from_value::<DraftFile>(bad)
            .expect("구조")
            .validate(&request)
            .is_err());
        let mut bad = result.clone();
        bad["notes"][0]["onsetMs"] = json!(-1);
        assert!(serde_json::from_value::<DraftFile>(bad)
            .expect("구조")
            .validate(&request)
            .is_err());
        let mut bad = result;
        bad["notes"][0]
            .as_object_mut()
            .expect("음표")
            .remove("fingering");
        assert!(serde_json::from_value::<DraftFile>(bad).is_err());
        let mut bad = json!({"schemaVersion":1,"projectId":request.project_id,"assetId":request.asset_id,"tuningMidi":request.tuning_midi,"syncAnchors":request.sync_anchors,"grid":240});
        bad["path"] = json!("C:/outside.wav");
        assert!(serde_json::from_value::<TranscribeRequest>(bad).is_err());
    }
    #[test]
    #[ignore = "사용자가 승인 설치한 Basic Pitch 개발 모델 환경이 필요합니다"]
    fn real_model_eight_synthetic_notes_keep_original_and_cleanup_job() {
        let fixture = Fixture::new();
        let project = fixture.project();
        let original = include_bytes!("../../../public/fixtures/sine.wav");
        let source = fixture.store.root.join("자체 사인파.wav");
        fs::write(&source, original).expect("자체 원본");
        let asset = fixture
            .store
            .import_asset(
                &project,
                &source,
                AssetKind::Original,
                AssetStorage::Managed,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("합성 import")
            .asset
            .id;
        let id = uuid::Uuid::new_v4().to_string();
        let result = transcribe_asset(
            &fixture.store,
            &request(project.clone(), asset.clone()),
            &id,
            &AtomicBool::new(false),
        )
        .expect("실제 모델 작업");
        let notes = result["notes"].as_array().expect("음표");
        assert_eq!(notes.len(), 8);
        for (index, note) in notes.iter().enumerate() {
            assert_eq!(note["pitchMidi"], json!([64, 67, 69, 71][index % 4]));
            assert!((note["onsetMs"].as_f64().expect("온셋") - index as f64 * 500.0).abs() < 100.0);
        }
        assert_eq!(result["inputSha256"], json!(hash(original)));
        assert_eq!(fs::read(source).expect("원본"), original);
        assert!(!fixture
            .store
            .root
            .join(format!("projects/{project}/analysis/{id}"))
            .exists());
        assert_eq!(result["status"], "AI_DRAFT");
        assert_eq!(
            super::super::drafts::restore(
                &fixture.store,
                &request(project.clone(), asset.clone()),
                &AtomicBool::new(false)
            )
            .expect("실제 모델 결과 보존")["draft"],
            result
        );
        let canceled_id = uuid::Uuid::new_v4().to_string();
        let cancellation = std::sync::Arc::new(AtomicBool::new(false));
        let trigger = cancellation.clone();
        let started = std::time::Instant::now();
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(500));
            trigger.store(true, std::sync::atomic::Ordering::Release);
        });
        assert_eq!(
            transcribe_asset(
                &fixture.store,
                &request(project.clone(), asset),
                &canceled_id,
                &cancellation
            )
            .expect_err("실제 모델 중단")
            .code,
            "CANCELED"
        );
        thread.join().expect("취소 요청");
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(!fixture
            .store
            .root
            .join(format!("projects/{project}/analysis/{canceled_id}"))
            .exists());
    }
}
