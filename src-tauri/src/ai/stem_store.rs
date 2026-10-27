use super::{
    error,
    separation::{read_bounded, validate_wav, SeparateRequest, MAX_WAV, REVISION, WEIGHTS},
};
use crate::{
    ipc::AppError,
    storage::{
        database::{checked_directory, checked_file, connect},
        project_model::{validate_uuid, AssetKind, MAX_SAFE},
        projects::{canceled, hash, now_ms, ProjectStore},
    },
};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stem {
    id: String,
    role: String,
    sha256: String,
    peak: f64,
    bytes: usize,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StemSet {
    schema_version: u8,
    stem_set_id: String,
    created_at_ms: u64,
    project_id: String,
    asset_id: String,
    input_sha256: String,
    model_id: String,
    model_version: String,
    model_revision: String,
    weights_sha256: String,
    sample_rate: u32,
    channels: u8,
    frames: u64,
    duration_ms: f64,
    start_offset_ms: f64,
    status: String,
    stems: Vec<Stem>,
}
impl StemSet {
    fn validate(&self, request: &SeparateRequest, source_hash: &str) -> Result<(), AppError> {
        let invalid = || error("AI_OUTPUT_INVALID");
        validate_uuid(&self.stem_set_id).map_err(|_| invalid())?;
        if self.schema_version != 1
            || self.created_at_ms > MAX_SAFE
            || self.project_id != request.project_id
            || self.asset_id != request.asset_id
            || self.input_sha256 != source_hash
            || self.model_id != "htdemucs_6s"
            || self.model_version != "4.1.0"
            || self.model_revision != REVISION
            || self.weights_sha256 != WEIGHTS
            || self.sample_rate != 44100
            || self.channels != 2
            || self.frames == 0
            || self.frames > 44100 * 60
            || !self.duration_ms.is_finite()
            || (self.duration_ms - self.frames as f64 * 1000.0 / 44100.0).abs() > 0.000001
            || self.start_offset_ms != 0.0
            || self.status != "AI_ESTIMATE"
            || self.stems.len() != 2
        {
            return Err(invalid());
        }
        for (stem, role) in self.stems.iter().zip(["GUITAR_FULL", "ACCOMPANIMENT"]) {
            validate_uuid(&stem.id).map_err(|_| invalid())?;
            if stem.role != role
                || stem.bytes != 44 + self.frames as usize * 8
                || !stem.peak.is_finite()
                || stem.peak < 0.0
                || stem.sha256.len() != 64
                || !stem
                    .sha256
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
            {
                return Err(invalid());
            }
        }
        if self.stems[0].id == self.stems[1].id {
            return Err(invalid());
        }
        Ok(())
    }
    fn relative(&self) -> PathBuf {
        PathBuf::from(format!(
            "projects/{}/stems/{}",
            self.project_id, self.stem_set_id
        ))
    }
}
fn source_hash(store: &ProjectStore, request: &SeparateRequest) -> Result<String, AppError> {
    request.validate()?;
    store
        .assets(&request.project_id)?
        .into_iter()
        .find(|a| a.id == request.asset_id && a.kind == AssetKind::Original)
        .map(|a| a.sha256)
        .ok_or_else(AppError::invalid)
}
fn validate_bytes(
    set: &StemSet,
    stem: &Stem,
    bytes: &[u8],
    cancel: &AtomicBool,
) -> Result<(), AppError> {
    let peak = validate_wav(bytes, set.frames, cancel)?;
    if bytes.len() != stem.bytes
        || (peak - stem.peak).abs() > 0.000001
        || hash(bytes) != stem.sha256
    {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    Ok(())
}

pub(super) fn save(
    store: &ProjectStore,
    request: &SeparateRequest,
    mut value: Value,
    binary: &[u8],
    id: &str,
    cancel: &AtomicBool,
) -> Result<Value, AppError> {
    canceled(cancel)?;
    validate_uuid(id)?;
    let source_hash = source_hash(store, request)?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| error("AI_OUTPUT_INVALID"))?;
    object.insert("stemSetId".into(), json!(id));
    object.insert("createdAtMs".into(), json!(now_ms()?));
    for stem in object
        .get_mut("stems")
        .ok_or_else(|| error("AI_OUTPUT_INVALID"))?
        .as_array_mut()
        .ok_or_else(|| error("AI_OUTPUT_INVALID"))?
    {
        stem.as_object_mut()
            .ok_or_else(|| error("AI_OUTPUT_INVALID"))?
            .insert("id".into(), json!(Uuid::new_v4().to_string()));
    }
    let set: StemSet = serde_json::from_value(value).map_err(|_| error("AI_OUTPUT_INVALID"))?;
    set.validate(request, &source_hash)?;
    if binary.len() != set.stems.iter().map(|s| s.bytes).sum::<usize>() {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    let mut at = 0;
    for stem in &set.stems {
        validate_bytes(&set, stem, &binary[at..at + stem.bytes], cancel)?;
        at += stem.bytes;
    }
    let text = serde_json::to_string(&set).map_err(|_| error("AI_OUTPUT_INVALID"))?;
    if text.len() > 16384 {
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
            "SELECT count(*) FROM audio_stem_sets WHERE project_id=?1",
            [&request.project_id],
            |r| r.get(0),
        )
        .map_err(|_| error("STORAGE_ERROR"))?;
    if count >= 20 {
        return Err(error("AI_STEM_LIMIT"));
    }
    let parent = checked_directory(
        &store.root,
        Path::new(&format!("projects/{}/stems", request.project_id)),
    )?;
    if crate::recording::wave::available_bytes(&parent).map_err(|_| error("STORAGE_ERROR"))?
        < binary.len() as u64 + 8 * 1024 * 1024
    {
        return Err(error("DISK_SPACE_LOW"));
    }
    let directory = parent.join(id);
    fs::create_dir(&directory).map_err(|_| error("STORAGE_ERROR"))?;
    let mut created = Vec::new();
    let result = (|| {
        let mut at = 0;
        for stem in &set.stems {
            let path = directory.join(format!("{}.wav", stem.id));
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&path)
                .map_err(|_| error("STORAGE_ERROR"))?;
            created.push(path);
            for block in binary[at..at + stem.bytes].chunks(65536) {
                canceled(cancel)?;
                file.write_all(block).map_err(|_| error("STORAGE_ERROR"))?;
            }
            file.sync_all().map_err(|_| error("STORAGE_ERROR"))?;
            at += stem.bytes;
        }
        canceled(cancel)?;
        tx.execute("INSERT INTO audio_stem_sets(id,project_id,asset_id,metadata_json,metadata_sha256) VALUES(?1,?2,?3,?4,?5)", params![id,request.project_id,request.asset_id,text,hash(text.as_bytes())]).map_err(|_| error("STORAGE_ERROR"))?;
        for stem in &set.stems {
            let bytes = i64::try_from(stem.bytes).map_err(|_| error("AI_OUTPUT_INVALID"))?;
            tx.execute("INSERT INTO audio_stems(id,project_id,stem_set_id,role,sha256,bytes) VALUES(?1,?2,?3,?4,?5,?6)", params![stem.id,request.project_id,id,stem.role,stem.sha256,bytes]).map_err(|_| error("STORAGE_ERROR"))?;
        }
        canceled(cancel)?;
        tx.commit().map_err(|_| error("STORAGE_ERROR"))
    })();
    if let Err(cause) = result {
        for path in created {
            if fs::remove_file(path).is_err() {
                eprintln!("GuitarLab 새 stem 정리 실패: AI_TEMP_CLEANUP_FAILED");
            }
        }
        if fs::remove_dir(directory).is_err() {
            eprintln!("GuitarLab 새 stem 폴더 정리 실패: AI_TEMP_CLEANUP_FAILED");
        }
        return Err(cause);
    }
    serde_json::to_value(set).map_err(|_| error("AI_OUTPUT_INVALID"))
}

pub fn restore(
    store: &ProjectStore,
    request: &SeparateRequest,
    cancel: &AtomicBool,
) -> Result<(Value, Option<Vec<u8>>), AppError> {
    restore_set(store, request, None, cancel)
}

pub(crate) fn read_guitar_stem(
    store: &ProjectStore,
    project_id: &str,
    asset_id: &str,
    stem_id: &str,
    cancel: &AtomicBool,
) -> Result<Vec<u8>, AppError> {
    canceled(cancel)?;
    validate_uuid(project_id)?;
    validate_uuid(asset_id)?;
    validate_uuid(stem_id)?;
    let db = connect(&store.root)?;
    let role: String = db
        .query_row(
            "SELECT role FROM audio_stems WHERE project_id=?1 AND id=?2",
            params![project_id, stem_id],
            |r| r.get(0),
        )
        .map_err(|_| error("AI_INPUT_INVALID"))?;
    if role != "GUITAR_FULL" {
        return Err(error("AI_INPUT_INVALID"));
    }
    read_stem(store, project_id, stem_id, Some(asset_id), cancel)
}

pub(crate) fn read_stem(
    store: &ProjectStore,
    project_id: &str,
    stem_id: &str,
    expected_asset_id: Option<&str>,
    cancel: &AtomicBool,
) -> Result<Vec<u8>, AppError> {
    canceled(cancel)?;
    validate_uuid(project_id)?;
    validate_uuid(stem_id)?;
    if let Some(expected) = expected_asset_id {
        validate_uuid(expected)?;
    }
    let db = connect(&store.root)?;
    let (set_id, asset_id): (String, String) = db.query_row(
        "SELECT s.stem_set_id,t.asset_id FROM audio_stems s JOIN audio_stem_sets t ON t.id=s.stem_set_id AND t.project_id=s.project_id WHERE s.project_id=?1 AND s.id=?2",
        params![project_id, stem_id], |r| Ok((r.get(0)?,r.get(1)?)),
    ).map_err(|_| error("AI_OUTPUT_INVALID"))?;
    validate_uuid(&set_id)?;
    if expected_asset_id.is_some_and(|expected| expected != asset_id) {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    let request = SeparateRequest {
        schema_version: 1,
        project_id: project_id.into(),
        asset_id,
    };
    let (value, binary) = restore_set(store, &request, Some(&set_id), cancel)?;
    let set: StemSet = serde_json::from_value(value["separation"].clone())
        .map_err(|_| error("AI_OUTPUT_INVALID"))?;
    let binary = binary.ok_or_else(|| error("AI_OUTPUT_INVALID"))?;
    let mut offset = 0;
    for stem in &set.stems {
        if stem.id == stem_id {
            return binary
                .get(offset..offset + stem.bytes)
                .map(|b| b.to_vec())
                .ok_or_else(|| error("AI_OUTPUT_INVALID"));
        }
        offset += stem.bytes;
    }
    Err(error("AI_OUTPUT_INVALID"))
}

fn restore_set(
    store: &ProjectStore,
    request: &SeparateRequest,
    set_id: Option<&str>,
    cancel: &AtomicBool,
) -> Result<(Value, Option<Vec<u8>>), AppError> {
    canceled(cancel)?;
    let source_hash = source_hash(store, request)?;
    let db = connect(&store.root)?;
    let row: Option<(String, String, String)> = db.query_row("SELECT id,metadata_json,metadata_sha256 FROM audio_stem_sets WHERE project_id=?1 AND asset_id=?2 AND (?3 IS NULL OR id=?3) ORDER BY sequence DESC LIMIT 1", params![request.project_id,request.asset_id,set_id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|_| error("STORAGE_ERROR"))?;
    let Some((id, text, digest)) = row else {
        return Ok((json!({"schemaVersion":1,"separation":null}), None));
    };
    if text.len() > 16384 || hash(text.as_bytes()) != digest {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    let set: StemSet = serde_json::from_str(&text).map_err(|_| error("AI_OUTPUT_INVALID"))?;
    set.validate(request, &source_hash)?;
    if set.stem_set_id != id {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    let count: u32 = db
        .query_row(
            "SELECT count(*) FROM audio_stems WHERE project_id=?1 AND stem_set_id=?2",
            params![request.project_id, id],
            |r| r.get(0),
        )
        .map_err(|_| error("STORAGE_ERROR"))?;
    if count != 2 {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    let mut binary = Vec::new();
    for stem in &set.stems {
        canceled(cancel)?;
        let row: (String, String, i64) = db.query_row("SELECT role,sha256,bytes FROM audio_stems WHERE id=?1 AND project_id=?2 AND stem_set_id=?3", params![stem.id,request.project_id,id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|_| error("AI_OUTPUT_INVALID"))?;
        let expected_bytes = i64::try_from(stem.bytes).map_err(|_| error("AI_OUTPUT_INVALID"))?;
        if row != (stem.role.clone(), stem.sha256.clone(), expected_bytes) {
            return Err(error("AI_OUTPUT_INVALID"));
        }
        let path = checked_file(
            &store.root,
            &set.relative().join(format!("{}.wav", stem.id)),
        )?;
        let bytes = read_bounded(&path, MAX_WAV)?;
        validate_bytes(&set, stem, &bytes, cancel)?;
        binary.extend_from_slice(&bytes);
    }
    canceled(cancel)?;
    Ok((json!({"schemaVersion":1,"separation":set}), Some(binary)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{project_model::AssetStorage, projects_tests::Fixture};
    fn fixture() -> (Fixture, SeparateRequest, Value, Vec<u8>) {
        let f = Fixture::new();
        let project_id = f.project();
        let source = f.store.root.join("자체 입력.wav");
        fs::write(&source, include_bytes!("../../../public/fixtures/sine.wav")).expect("자체 원본");
        let asset = f
            .store
            .import_asset(
                &project_id,
                &source,
                AssetKind::Original,
                AssetStorage::Managed,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("등록")
            .asset;
        let mut wav = b"RIFF\x34\0\0\0WAVEfmt \x10\0\0\0\x03\0\x02\0".to_vec();
        wav.extend_from_slice(&44100u32.to_le_bytes());
        wav.extend_from_slice(&352800u32.to_le_bytes());
        wav.extend_from_slice(b"\x08\0\x20\0data\x10\0\0\0");
        for sample in [0.5f32, -0.5, 0.25, -0.25] {
            wav.extend_from_slice(&sample.to_le_bytes());
        }
        let digest = hash(&wav);
        let metadata = json!({"schemaVersion":1,"projectId":project_id,"assetId":asset.id,"inputSha256":asset.sha256,"modelId":"htdemucs_6s","modelVersion":"4.1.0","modelRevision":REVISION,"weightsSha256":WEIGHTS,"sampleRate":44100,"channels":2,"frames":2,"durationMs":2.0*1000.0/44100.0,"startOffsetMs":0,"status":"AI_ESTIMATE","stems":[{"role":"GUITAR_FULL","sha256":digest,"peak":0.5,"bytes":wav.len()},{"role":"ACCOMPANIMENT","sha256":digest,"peak":0.5,"bytes":wav.len()}]});
        let mut binary = wav.clone();
        binary.extend_from_slice(&wav);
        (
            f,
            SeparateRequest {
                schema_version: 1,
                project_id,
                asset_id: asset.id,
            },
            metadata,
            binary,
        )
    }
    fn path(f: &Fixture, metadata: &Value, index: usize) -> PathBuf {
        f.store.root.join(format!(
            "projects/{}/stems/{}/{}.wav",
            metadata["projectId"].as_str().expect("프로젝트"),
            metadata["stemSetId"].as_str().expect("set ID"),
            metadata["stems"][index]["id"].as_str().expect("stem ID")
        ))
    }
    #[test]
    fn guitar_draft_keeps_original_context_and_rejects_residual_hash_duration_and_wrong_source() {
        use crate::ai::{drafts, transcription::TranscribeRequest};
        use crate::storage::project_model::SyncAnchor;
        let (f, r, metadata, binary) = fixture();
        let cancel = AtomicBool::new(false);
        let set = save(
            &f.store,
            &r,
            metadata,
            &binary,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("테스트 DEMO stem");
        let original_hash = f.store.assets(&r.project_id).expect("자산")[0]
            .sha256
            .clone();
        let mut request = TranscribeRequest {
            schema_version: 1,
            project_id: r.project_id.clone(),
            asset_id: r.asset_id.clone(),
            stem_id: None,
            imported_stem_id: None,
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
        };
        assert!(serde_json::to_value(&request)
            .expect("기존 문맥")
            .get("stemId")
            .is_none());
        let original = json!({"schemaVersion":1,"projectId":r.project_id,"assetId":r.asset_id,"inputSha256":original_hash,"modelId":"basic-pitch","modelVersion":"0.4.0","status":"AI_DRAFT","confidenceMeaning":"MEAN_NOTE_ACTIVATION","durationMs":4000.0,"notes":[{"onsetMs":0.0,"offsetMs":0.01,"pitchMidi":64,"confidence":0.6,"startTick":0,"durationTicks":240,"candidates":[{"stringIndex":1,"fret":0}],"fingering":{"stringIndex":1,"fret":0},"reviewReasons":["LOW_CONFIDENCE"],"source":"ai"}]});
        drafts::save(
            &f.store,
            &request,
            &original,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("기존 원본 초안");
        let guitar = set["stems"][0]["id"].as_str().expect("기타 ID");
        request.stem_id = Some(guitar.into());
        let mut result = original.clone();
        result["stemId"] = json!(guitar);
        result["inputSha256"] = set["stems"][0]["sha256"].clone();
        result["durationMs"] = set["durationMs"].clone();
        drafts::save(
            &f.store,
            &request,
            &result,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("별도 기타 초안");
        let reopened = ProjectStore::new(f.store.root.clone());
        assert_eq!(
            drafts::restore(&reopened, &request, &cancel).expect("기타 재열기")["draft"],
            result
        );
        for (key, value) in [
            ("inputSha256", json!("a".repeat(64))),
            ("durationMs", json!(4000)),
            ("stemId", json!(Uuid::new_v4().to_string())),
        ] {
            let mut bad = result.clone();
            bad[key] = value;
            assert!(drafts::save(
                &reopened,
                &request,
                &bad,
                &Uuid::new_v4().to_string(),
                &cancel
            )
            .is_err());
        }
        assert!(read_guitar_stem(
            &reopened,
            &r.project_id,
            &r.asset_id,
            set["stems"][1]["id"].as_str().expect("잔여 ID"),
            &cancel
        )
        .is_err());
        assert!(read_guitar_stem(
            &reopened,
            &r.project_id,
            &Uuid::new_v4().to_string(),
            guitar,
            &cancel
        )
        .is_err());
        assert!(read_guitar_stem(
            &reopened,
            &r.project_id,
            &r.asset_id,
            guitar,
            &AtomicBool::new(true)
        )
        .is_err());
        request.stem_id = Some(set["stems"][1]["id"].as_str().expect("잔여 ID").into());
        assert!(drafts::restore(&reopened, &request, &cancel).is_err());
        request.stem_id = None;
        assert_eq!(
            drafts::restore(&reopened, &request, &cancel).expect("기존 문맥 유지")["draft"],
            original
        );
        assert_eq!(
            fs::read(path(&f, &set, 0)).expect("불변 기타 파일"),
            binary[..binary.len() / 2]
        );
    }
    #[test]
    fn stem_mix_uses_immutable_ids_and_roundtrips_gain_mute_solo_resampling_and_cancel() {
        use crate::mixer::{
            model::{LayerKind, MixDocument, MixLayer},
            render,
        };
        let (f, request, mut metadata, _) = fixture();
        let cancel = AtomicBool::new(false);
        let mut wav = b"RIFF\x34\0\0\0WAVEfmt \x10\0\0\0\x03\0\x02\0".to_vec();
        wav.extend_from_slice(&44100u32.to_le_bytes());
        wav.extend_from_slice(&352800u32.to_le_bytes());
        wav.extend_from_slice(b"\x08\0\x20\0data\x10\0\0\0");
        for _ in 0..4 {
            wav.extend_from_slice(&0.25f32.to_le_bytes());
        }
        for stem in metadata["stems"].as_array_mut().expect("테스트 stem") {
            stem["sha256"] = json!(hash(&wav));
            stem["peak"] = json!(0.25);
        }
        let binary = [wav.clone(), wav.clone()].concat();
        let saved = save(
            &f.store,
            &request,
            metadata.clone(),
            &binary,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("분리 보존");
        let mut mix = MixDocument {
            schema_version: 1,
            project_id: request.project_id.clone(),
            master_gain: 1.0,
            layers: saved["stems"]
                .as_array()
                .expect("분리 2개")
                .iter()
                .map(|s| MixLayer {
                    kind: LayerKind::Stem,
                    id: s["id"].as_str().expect("UUID").into(),
                    gain: 1.0,
                    mute: false,
                    solo: false,
                    offset_ms: 0.0,
                })
                .collect(),
        };
        f.store.save_mix(&mix).expect("분리 믹스 저장");
        let reopened = ProjectStore::new(f.store.root.clone());
        assert_eq!(
            serde_json::to_value(reopened.mix(&mix.project_id).expect("재열기")).expect("JSON"),
            json!(mix)
        );
        let mut newer_wav = wav.clone();
        for sample in newer_wav[44..].as_chunks_mut::<4>().0 {
            sample.copy_from_slice(&0.75f32.to_le_bytes());
        }
        for stem in metadata["stems"].as_array_mut().expect("새 테스트 stem") {
            stem["sha256"] = json!(hash(&newer_wav));
            stem["peak"] = json!(0.75);
        }
        save(
            &f.store,
            &request,
            metadata,
            &[newer_wav.clone(), newer_wav].concat(),
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("최신 분리 추가");
        let (bytes, stats) =
            render::render(&reopened, &mix, &cancel, |_, _| Ok(())).expect("이전 ID 출력");
        assert_eq!(stats.frames, 3);
        assert!((stats.peak - 0.5).abs() < 0.000001);
        assert_eq!(stats.limited_frames, 0);
        mix.layers[0].solo = true;
        let (_, solo) = render::render(&reopened, &mix, &cancel, |_, _| Ok(())).expect("Solo");
        assert!((solo.peak - 0.25).abs() < 0.000001);
        mix.layers[0].solo = false;
        mix.layers[0].mute = true;
        mix.master_gain = 0.4;
        mix.layers[1].gain = 0.5;
        mix.layers[1].offset_ms = 10.0;
        let (_, quiet) =
            render::render(&reopened, &mix, &cancel, |_, _| Ok(())).expect("mute/gain/offset");
        assert!((quiet.peak - 0.05).abs() < 0.000001);
        assert!(quiet.frames > 480);
        assert!(render::render(&reopened, &mix, &AtomicBool::new(true), |_, _| Ok(())).is_err());
        let source = path(&f, &saved, 0);
        assert_eq!(fs::read(&source).expect("불변 stem"), wav);
        assert!(!bytes.is_empty());
        assert!(read_stem(&reopened, &f.project(), &mix.layers[0].id, None, &cancel).is_err());
        assert_eq!(
            read_stem(
                &reopened,
                &request.project_id,
                &mix.layers[0].id,
                Some(&request.asset_id),
                &cancel
            )
            .expect("현재 반주 stem"),
            wav
        );
        assert!(read_stem(
            &reopened,
            &request.project_id,
            &mix.layers[0].id,
            Some(&Uuid::new_v4().to_string()),
            &cancel
        )
        .is_err());
        let mut broken = wav.clone();
        broken[44..48].copy_from_slice(&f32::NAN.to_le_bytes());
        fs::write(&source, &broken).expect("테스트 손상 주입");
        assert!(render::render(&reopened, &mix, &cancel, |_, _| Ok(())).is_err());
        assert_eq!(fs::read(source).expect("손상 원본 유지"), broken);
    }
    #[test]
    fn immutable_pair_reopens_latest_without_model_or_original_audio_and_keeps_prior_files() {
        let (f, r, metadata, binary) = fixture();
        let cancel = AtomicBool::new(false);
        let (empty, no_bytes) = restore(&f.store, &r, &cancel).expect("빈 저장소");
        assert!(empty["separation"].is_null() && no_bytes.is_none());
        let first = save(
            &f.store,
            &r,
            metadata.clone(),
            &binary,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("첫 보존");
        let first_bytes = fs::read(path(&f, &first, 0)).expect("불변 첫 WAV");
        let second = save(
            &f.store,
            &r,
            metadata,
            &binary,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("새 ID 보존");
        assert_ne!(first["stemSetId"], second["stemSetId"]);
        assert_ne!(first["stems"][0]["id"], second["stems"][0]["id"]);
        let db = connect(&f.store.root).expect("DB");
        let source: String = db
            .query_row(
                "SELECT relative_path FROM project_assets WHERE id=?1",
                [&r.asset_id],
                |row| row.get(0),
            )
            .expect("자체 관리 사본");
        let source = checked_file(&f.store.root, Path::new(&source)).expect("범위 검사");
        fs::remove_file(source).expect("복원에 원본 오디오가 필요 없는지 확인");
        let reopened = ProjectStore::new(f.store.root.clone());
        let (value, bytes) = restore(&reopened, &r, &cancel).expect("새 store 복원");
        assert_eq!(value["separation"], second);
        assert_eq!(bytes.expect("두 WAV"), binary);
        assert_eq!(
            fs::read(path(&f, &first, 0)).expect("첫 결과 보존"),
            first_bytes
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM audio_stems", [], |row| row
                .get::<_, u32>(0))
                .expect("독립 stem 행"),
            4
        );
        assert_eq!(
            fs::read(f.store.root.join("자체 입력.wav")).expect("원본 보존"),
            include_bytes!("../../../public/fixtures/sine.wav")
        );
    }
    #[test]
    fn cancellation_bad_metadata_foreign_asset_and_second_insert_failure_do_not_publish_or_erase() {
        let (f, r, metadata, binary) = fixture();
        let cancel = AtomicBool::new(false);
        let first = save(
            &f.store,
            &r,
            metadata.clone(),
            &binary,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("기존 보존");
        let before = fs::read(path(&f, &first, 0)).expect("기준 WAV");
        let id = Uuid::new_v4().to_string();
        assert_eq!(
            save(
                &f.store,
                &r,
                metadata.clone(),
                &binary,
                &id,
                &AtomicBool::new(true)
            )
            .expect_err("취소")
            .code,
            "CANCELED"
        );
        assert_eq!(
            restore(&f.store, &r, &AtomicBool::new(true))
                .expect_err("조회 취소")
                .code,
            "CANCELED"
        );
        for bad in [Value::Bool(true), json!({"stems":[true]}), {
            let mut bad = metadata.clone();
            bad["inputSha256"] = json!("forged");
            bad
        }] {
            assert!(save(&f.store, &r, bad, &binary, &id, &cancel).is_err());
        }
        let foreign = SeparateRequest {
            schema_version: 1,
            project_id: f.project(),
            asset_id: r.asset_id.clone(),
        };
        assert!(restore(&f.store, &foreign, &cancel).is_err());
        let db = connect(&f.store.root).expect("DB");
        db.execute_batch("CREATE TRIGGER fail_second_stem BEFORE INSERT ON audio_stems WHEN NEW.role='ACCOMPANIMENT' BEGIN SELECT RAISE(FAIL,'injected'); END;").expect("실패 주입");
        assert_eq!(
            save(&f.store, &r, metadata, &binary, &id, &cancel)
                .expect_err("후반 DB 실패")
                .code,
            "STORAGE_ERROR"
        );
        db.execute_batch("DROP TRIGGER fail_second_stem;")
            .expect("실패 제거");
        assert!(!f
            .store
            .root
            .join(format!("projects/{}/stems/{id}", r.project_id))
            .exists());
        assert_eq!(
            db.query_row("SELECT count(*) FROM audio_stem_sets", [], |row| row
                .get::<_, u32>(0))
                .expect("원자 등록"),
            1
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM audio_stems", [], |row| row
                .get::<_, u32>(0))
                .expect("원자 쌍"),
            2
        );
        assert_eq!(
            restore(&f.store, &r, &cancel).expect("기존 복원").0["separation"],
            first
        );
        assert_eq!(fs::read(path(&f, &first, 0)).expect("기존 WAV"), before);
    }
    #[test]
    fn damaged_latest_metadata_rows_and_wave_never_fall_back_or_touch_previous_set() {
        let (f, r, metadata, binary) = fixture();
        let cancel = AtomicBool::new(false);
        let first = save(
            &f.store,
            &r,
            metadata.clone(),
            &binary,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("첫 보존");
        let latest = save(
            &f.store,
            &r,
            metadata,
            &binary,
            &Uuid::new_v4().to_string(),
            &cancel,
        )
        .expect("최신 보존");
        let db = connect(&f.store.root).expect("DB");
        let id = latest["stemSetId"].as_str().expect("set ID");
        let text = serde_json::to_string(&latest).expect("공개 JSON");
        db.execute(
            "UPDATE audio_stem_sets SET metadata_sha256=?1 WHERE id=?2",
            params!["0".repeat(64), id],
        )
        .expect("hash 손상");
        assert!(restore(&f.store, &r, &cancel).is_err());
        let mut bad = latest.clone();
        bad["stems"][0]["id"] = json!("../../outside");
        let bad = serde_json::to_string(&bad).expect("위조 JSON");
        db.execute(
            "UPDATE audio_stem_sets SET metadata_json=?1,metadata_sha256=?2 WHERE id=?3",
            params![bad, hash(bad.as_bytes()), id],
        )
        .expect("경로 위조");
        assert!(restore(&f.store, &r, &cancel).is_err());
        db.execute(
            "UPDATE audio_stem_sets SET metadata_json=?1,metadata_sha256=?2 WHERE id=?3",
            params![text, hash(text.as_bytes()), id],
        )
        .expect("정상 JSON 복귀");
        let stem_id = latest["stems"][0]["id"].as_str().expect("stem ID");
        db.execute(
            "UPDATE audio_stems SET sha256=?1 WHERE id=?2",
            params!["0".repeat(64), stem_id],
        )
        .expect("행 손상");
        assert!(restore(&f.store, &r, &cancel).is_err());
        db.execute(
            "UPDATE audio_stems SET sha256=?1 WHERE id=?2",
            params![
                latest["stems"][0]["sha256"].as_str().expect("원래 SHA"),
                stem_id
            ],
        )
        .expect("행 복귀");
        let mut damaged = binary[..60].to_vec();
        damaged[44..48].copy_from_slice(&f32::NAN.to_le_bytes());
        fs::write(path(&f, &latest, 0), &damaged).expect("샘플 손상");
        assert!(restore(&f.store, &r, &cancel).is_err());
        assert_eq!(
            fs::read(path(&f, &latest, 0)).expect("손상 원본 보존"),
            damaged
        );
        assert_eq!(
            fs::read(path(&f, &first, 0)).expect("이전 결과 보존"),
            binary[..60]
        );
    }
    #[test]
    fn version_four_migration_keeps_existing_rows_and_twenty_set_limit_does_not_delete() {
        let (f, r, metadata, binary) = fixture();
        let cancel = AtomicBool::new(false);
        let before =
            serde_json::to_value(f.store.assets(&r.project_id).expect("기존 자산")).expect("JSON");
        let db = connect(&f.store.root).expect("DB");
        db.execute_batch(
            "DROP TABLE project_trash; DROP TABLE imported_guitar_stems; DROP TABLE project_youtube_syncs; DROP TABLE project_backings; DROP TABLE audio_stems; DROP TABLE audio_stem_sets; PRAGMA user_version=4;",
        )
        .expect("기존 v4");
        let draft_id = Uuid::new_v4().to_string();
        let demo = "{}";
        db.execute("INSERT INTO ai_transcription_drafts(id,project_id,asset_id,context_json,context_sha256,result_json,result_sha256) VALUES(?1,?2,?3,?4,?5,?4,?5)",params![draft_id,r.project_id,r.asset_id,demo,hash(demo.as_bytes())]).expect("DEMO 이전 초안 행");
        drop(db);
        let db = connect(&f.store.root).expect("추가005");
        assert_eq!(
            db.pragma_query_value::<u32, _>(None, "user_version", |row| row.get(0))
                .expect("버전"),
            9
        );
        assert_eq!(
            db.query_row(
                "SELECT result_json FROM ai_transcription_drafts WHERE id=?1",
                [draft_id],
                |row| row.get::<_, String>(0)
            )
            .expect("이전 초안"),
            demo
        );
        assert_eq!(
            serde_json::to_value(f.store.assets(&r.project_id).expect("기존 자산")).expect("JSON"),
            before
        );
        for _ in 0..20 {
            save(
                &f.store,
                &r,
                metadata.clone(),
                &binary,
                &Uuid::new_v4().to_string(),
                &cancel,
            )
            .expect("불변 쌍 보존");
        }
        assert_eq!(
            save(
                &f.store,
                &r,
                metadata,
                &binary,
                &Uuid::new_v4().to_string(),
                &cancel
            )
            .expect_err("상한")
            .code,
            "AI_STEM_LIMIT"
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM audio_stem_sets", [], |row| row
                .get::<_, u32>(0))
                .expect("set 유지"),
            20
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM audio_stems", [], |row| row
                .get::<_, u32>(0))
                .expect("stem 유지"),
            40
        );
        assert!(restore(&f.store, &r, &cancel)
            .expect("상한 후 복원")
            .1
            .is_some());
    }
}
