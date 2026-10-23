use super::{error, installation::ModelId, managed, run_request};
use crate::{
    ipc::AppError,
    storage::{
        database::{checked_directory, checked_file},
        project_model::{validate_uuid, AssetKind},
        projects::{canceled, hash, ProjectStore},
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    fs::OpenOptions,
    io::{Read, Write},
    path::Path,
    sync::atomic::AtomicBool,
    time::Duration,
};

pub(super) const REVISION: &str = "3c5ee475be622df764938de97e4281a7b07ffa58";
pub(super) const WEIGHTS: &str = "d2a1745f0744721f6b8ca5bf469b67c651ea5ed1b52998cab033b2158609d411";
pub(super) const MAX_WAV: usize = 44 + 44100 * 60 * 8;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SeparateRequest {
    pub schema_version: u8,
    pub project_id: String,
    pub asset_id: String,
}
impl SeparateRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.asset_id)?;
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SeparationFile {
    schema_version: u8,
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
    outputs: Vec<OutputFile>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OutputFile {
    role: String,
    path: std::path::PathBuf,
    sha256: String,
    peak: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StemPreview {
    role: String,
    sha256: String,
    peak: f64,
    bytes: usize,
}
pub(super) fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>, AppError> {
    let mut file = fs::File::open(path).map_err(|_| error("AI_OUTPUT_INVALID"))?;
    if file
        .metadata()
        .map_err(|_| error("AI_OUTPUT_INVALID"))?
        .len()
        > limit as u64
    {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("AI_OUTPUT_INVALID"))?;
    if bytes.len() > limit {
        return Err(error("AI_OUTPUT_INVALID"));
    }
    Ok(bytes)
}
pub(super) fn validate_wav(
    bytes: &[u8],
    frames: u64,
    cancel: &AtomicBool,
) -> Result<f64, AppError> {
    let invalid = || error("AI_OUTPUT_INVALID");
    if frames == 0 || frames > 44100 * 60 || bytes.len() != 44 + frames as usize * 8 {
        return Err(invalid());
    }
    let size = (frames * 8) as u32;
    let mut expected = Vec::with_capacity(44);
    expected.extend_from_slice(b"RIFF");
    expected.extend_from_slice(&(size + 36).to_le_bytes());
    expected.extend_from_slice(b"WAVEfmt ");
    expected.extend_from_slice(&16u32.to_le_bytes());
    expected.extend_from_slice(&3u16.to_le_bytes());
    expected.extend_from_slice(&2u16.to_le_bytes());
    expected.extend_from_slice(&44100u32.to_le_bytes());
    expected.extend_from_slice(&352800u32.to_le_bytes());
    expected.extend_from_slice(&8u16.to_le_bytes());
    expected.extend_from_slice(&32u16.to_le_bytes());
    expected.extend_from_slice(b"data");
    expected.extend_from_slice(&size.to_le_bytes());
    if bytes[..44] != expected {
        return Err(invalid());
    }
    let mut peak = 0.0f64;
    for (i, value) in bytes[44..].as_chunks::<4>().0.iter().enumerate() {
        if i.is_multiple_of(4096) {
            canceled(cancel)?;
        }
        let sample = f32::from_le_bytes(*value);
        if !sample.is_finite() {
            return Err(invalid());
        }
        peak = peak.max(f64::from(sample.abs()));
    }
    Ok(peak)
}
fn read_result(
    store: &ProjectStore,
    request: &SeparateRequest,
    job_id: &str,
    input_hash: &str,
    frames: u64,
    cancel: &AtomicBool,
) -> Result<(Value, Vec<u8>), AppError> {
    let invalid = || error("AI_OUTPUT_INVALID");
    let relative = std::path::PathBuf::from(format!(
        "projects/{}/separations/{job_id}",
        request.project_id
    ));
    let manifest = checked_file(&store.root, &relative.join("separation.json"))?;
    let result: SeparationFile =
        serde_json::from_slice(&read_bounded(&manifest, 16384)?).map_err(|_| invalid())?;
    if result.schema_version != 1
        || result.input_sha256 != input_hash
        || result.model_id != "htdemucs_6s"
        || result.model_version != "4.1.0"
        || result.model_revision != REVISION
        || result.weights_sha256 != WEIGHTS
        || result.sample_rate != 44100
        || result.channels != 2
        || result.frames != frames
        || !result.duration_ms.is_finite()
        || (result.duration_ms - frames as f64 * 1000.0 / 44100.0).abs() > 0.000001
        || result.start_offset_ms != 0.0
        || result.outputs.len() != 2
    {
        return Err(invalid());
    }
    let mut stems = Vec::with_capacity(2);
    let mut binary = Vec::new();
    for (output, (name, role)) in result.outputs.into_iter().zip([
        ("guitar.wav", "GUITAR_FULL"),
        ("accompaniment.wav", "ACCOMPANIMENT"),
    ]) {
        canceled(cancel)?;
        let path = checked_file(&store.root, &relative.join(name))?;
        if output.role != role
            || output.path != path
            || !output.peak.is_finite()
            || output.peak < 0.0
        {
            return Err(invalid());
        }
        let bytes = read_bounded(&path, MAX_WAV)?;
        let peak = validate_wav(&bytes, frames, cancel)?;
        if (peak - output.peak).abs() > 0.000001 || hash(&bytes) != output.sha256 {
            return Err(invalid());
        }
        stems.push(StemPreview {
            role: output.role,
            sha256: output.sha256,
            peak,
            bytes: bytes.len(),
        });
        binary.extend_from_slice(&bytes);
    }
    canceled(cancel)?;
    Ok((
        json!({"schemaVersion":1,"projectId":request.project_id,"assetId":request.asset_id,"inputSha256":input_hash,"modelId":"htdemucs_6s","modelVersion":"4.1.0","modelRevision":REVISION,"weightsSha256":WEIGHTS,"sampleRate":44100,"channels":2,"frames":frames,"durationMs":result.duration_ms,"startOffsetMs":0,"status":"AI_ESTIMATE","stems":stems}),
        binary,
    ))
}

pub fn separate_asset(
    store: &ProjectStore,
    request: &SeparateRequest,
    job_id: &str,
    cancel: &AtomicBool,
) -> Result<(Value, Vec<u8>), AppError> {
    separate_asset_with_resources(store, request, job_id, cancel, None)
}
pub fn separate_asset_with_resources(
    store: &ProjectStore,
    request: &SeparateRequest,
    job_id: &str,
    cancel: &AtomicBool,
    resources: Option<&Path>,
) -> Result<(Value, Vec<u8>), AppError> {
    request.validate()?;
    validate_uuid(job_id)?;
    canceled(cancel)?;
    let assets = store.assets(&request.project_id)?;
    let asset = assets
        .iter()
        .find(|a| a.id == request.asset_id)
        .ok_or_else(AppError::invalid)?;
    if asset.kind != AssetKind::Original
        || asset.bytes > 64 * 1024 * 1024
        || !asset.name.to_ascii_lowercase().ends_with(".wav")
    {
        return Err(error("AI_INPUT_INVALID"));
    }
    let bytes = store.read_asset(
        &request.project_id,
        &request.asset_id,
        cancel,
        |_, _| Ok(()),
    )?;
    let mut budget = 64 * 1024 * 1024;
    let decoded = crate::mixer::pcm::decode(&bytes, &mut budget, cancel).map_err(|cause| {
        if cause.code == "CANCELED" {
            cause
        } else {
            error("AI_INPUT_INVALID")
        }
    })?;
    if decoded.samples.len() > decoded.rate as usize * 60 {
        return Err(error("AI_INPUT_INVALID"));
    }
    let frames = decoded.samples.len() as u64 * 44100 / u64::from(decoded.rate);
    drop(decoded);
    let parent = checked_directory(
        &store.root,
        Path::new(&format!("projects/{}/separations", request.project_id)),
    )?;
    if crate::recording::wave::available_bytes(&parent).map_err(|_| error("STORAGE_ERROR"))?
        < bytes.len() as u64 + 64 * 1024 * 1024
    {
        return Err(error("DISK_SPACE_LOW"));
    }
    let work = parent.join(job_id);
    fs::create_dir(&work).map_err(|_| error("STORAGE_ERROR"))?;
    let input = work.join("input.wav");
    let output = work.join("separation.json");
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&input)
            .map_err(|_| error("STORAGE_ERROR"))?;
        for block in bytes.chunks(65536) {
            canceled(cancel)?;
            file.write_all(block).map_err(|_| error("STORAGE_ERROR"))?;
        }
        file.sync_all().map_err(|_| error("STORAGE_ERROR"))?;
        drop(file);
        let result = run_request(
            managed::model_command_with_resources(&store.root, ModelId::Demucs, resources, cancel)?,
            job_id,
            cancel,
            Duration::from_secs(300),
            json!({"protocolVersion":1,"type":"start","jobId":job_id,"action":"separate","input":{"assetPath":input,"workDir":work}}),
            |_| Ok(()),
        )?;
        if result["separationPath"].as_str().map(Path::new) != Some(output.as_path()) {
            return Err(error("AI_PROTOCOL_INVALID"));
        }
        let (result, binary) = read_result(store, request, job_id, &hash(&bytes), frames, cancel)?;
        let saved = super::stem_store::save(store, request, result, &binary, job_id, cancel)?;
        Ok((saved, binary))
    })();
    for name in [
        "input.wav",
        "separation.json",
        "guitar.wav",
        "accompaniment.wav",
    ] {
        let file = work.join(name);
        if file.exists() && fs::remove_file(file).is_err() {
            eprintln!("GuitarLab 분리 임시 파일 정리 실패: AI_TEMP_CLEANUP_FAILED");
        }
    }
    if fs::remove_dir(&work).is_err() {
        eprintln!("GuitarLab 분리 임시 폴더 정리 실패: AI_TEMP_CLEANUP_FAILED");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{project_model::AssetStorage, projects_tests::Fixture};

    fn request(f: &Fixture) -> SeparateRequest {
        let project_id = f.project();
        SeparateRequest {
            schema_version: 1,
            asset_id: f.asset(&project_id, AssetStorage::Managed),
            project_id,
        }
    }
    fn wav() -> Vec<u8> {
        let mut bytes = b"RIFF\x34\0\0\0WAVEfmt \x10\0\0\0\x03\0\x02\0".to_vec();
        bytes.extend_from_slice(&44100u32.to_le_bytes());
        bytes.extend_from_slice(&352800u32.to_le_bytes());
        bytes.extend_from_slice(b"\x08\0\x20\0data\x10\0\0\0");
        for sample in [0.5f32, -0.5, 0.25, -0.25] {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }
    #[test]
    fn paths_hashes_peak_frame_count_and_nonfinite_samples_are_rechecked() {
        let f = Fixture::new();
        let r = request(&f);
        let id = uuid::Uuid::new_v4().to_string();
        let work = checked_directory(
            &f.store.root,
            Path::new(&format!("projects/{}/separations/{id}", r.project_id)),
        )
        .expect("작업 경로");
        let data = wav();
        let digest = hash(&data);
        let paths = [work.join("guitar.wav"), work.join("accompaniment.wav")];
        for path in &paths {
            fs::write(path, &data).expect("자체 WAV");
        }
        let manifest = json!({"schemaVersion":1,"inputSha256":"fixture","modelId":"htdemucs_6s","modelVersion":"4.1.0","modelRevision":REVISION,"weightsSha256":WEIGHTS,"sampleRate":44100,"channels":2,"frames":2,"durationMs":2.0*1000.0/44100.0,"startOffsetMs":0,"outputs":[{"role":"GUITAR_FULL","path":paths[0],"sha256":digest,"peak":0.5},{"role":"ACCOMPANIMENT","path":paths[1],"sha256":digest,"peak":0.5}]});
        let write = |value: &Value| {
            fs::write(
                work.join("separation.json"),
                serde_json::to_vec(value).expect("JSON"),
            )
            .expect("manifest")
        };
        write(&manifest);
        let cancel = AtomicBool::new(false);
        let (result, binary) =
            read_result(&f.store, &r, &id, "fixture", 2, &cancel).expect("검증 출력");
        assert_eq!(binary.len(), data.len() * 2);
        assert_eq!(result["stems"][0]["bytes"], data.len());
        assert!(!result.to_string().contains("path"));
        for key in ["inputSha256", "modelRevision", "weightsSha256"] {
            let mut bad = manifest.clone();
            bad[key] = json!("wrong");
            write(&bad);
            assert!(read_result(&f.store, &r, &id, "fixture", 2, &cancel).is_err());
        }
        let mut bad = manifest.clone();
        bad["outputs"][0]["path"] = json!(f.store.root.join("outside.wav"));
        write(&bad);
        assert!(read_result(&f.store, &r, &id, "fixture", 2, &cancel).is_err());
        let mut bad = manifest.clone();
        bad["outputs"][0]["peak"] = json!(0.4);
        write(&bad);
        assert!(read_result(&f.store, &r, &id, "fixture", 2, &cancel).is_err());
        write(&manifest);
        assert!(read_result(&f.store, &r, &id, "fixture", 3, &cancel).is_err());
        let mut damaged = data.clone();
        damaged[44..48].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(validate_wav(&damaged, 2, &cancel).is_err());
        fs::write(&paths[0], damaged).expect("손상 주입");
        assert!(read_result(&f.store, &r, &id, "fixture", 2, &cancel).is_err());
        assert_eq!(fs::read(&paths[1]).expect("다른 결과 보존"), data);
    }
    #[test]
    fn score_foreign_asset_unknown_fields_and_cancel_are_rejected_before_model() {
        let f = Fixture::new();
        let r = request(&f);
        let id = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            separate_asset(&f.store, &r, &id, &AtomicBool::new(true))
                .expect_err("취소")
                .code,
            "CANCELED"
        );
        assert_eq!(
            separate_asset(&f.store, &r, &id, &AtomicBool::new(false))
                .expect_err("악보 거부")
                .code,
            "AI_INPUT_INVALID"
        );
        let foreign = SeparateRequest {
            project_id: f.project(),
            ..r
        };
        assert!(separate_asset(&f.store, &foreign, &id, &AtomicBool::new(false)).is_err());
        assert!(serde_json::from_value::<SeparateRequest>(json!({"schemaVersion":1,"projectId":foreign.project_id,"assetId":foreign.asset_id,"path":"arbitrary"})).is_err());
    }
    #[test]
    #[ignore = "사용자가 승인 설치한 Demucs 개발 모델 환경이 필요합니다"]
    fn real_demucs_worker_preview_keeps_original_and_cleans_success_and_cancel() {
        let f = Fixture::new();
        let project_id = f.project();
        let original = include_bytes!("../../../public/fixtures/sine.wav");
        let source = f.store.root.join("자체 합성.wav");
        fs::write(&source, original).expect("자체 음원");
        let asset_id = f
            .store
            .import_asset(
                &project_id,
                &source,
                AssetKind::Original,
                AssetStorage::Managed,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("자체 import")
            .asset
            .id;
        let r = SeparateRequest {
            schema_version: 1,
            project_id: project_id.clone(),
            asset_id,
        };
        let id = uuid::Uuid::new_v4().to_string();
        let (result, binary) =
            separate_asset(&f.store, &r, &id, &AtomicBool::new(false)).expect("실제 분리");
        assert_eq!(result["frames"], 176400);
        assert_eq!(result["inputSha256"], hash(original));
        assert_eq!(binary.len(), (44 + 176400 * 8) * 2);
        let reopened = ProjectStore::new(f.store.root.clone());
        let (restored, restored_binary) =
            super::super::stem_store::restore(&reopened, &r, &AtomicBool::new(false))
                .expect("실제 분리 불변 파일 복원");
        assert_eq!(restored["separation"], result);
        assert_eq!(restored_binary.expect("복원 PCM"), binary);
        let guitar_id = result["stems"][0]["id"]
            .as_str()
            .expect("실제 기타 stem")
            .to_owned();
        let mut copy_request = crate::ai::transcription::TranscribeRequest {
            schema_version: 1,
            project_id: project_id.clone(),
            asset_id: r.asset_id.clone(),
            stem_id: Some(guitar_id.clone()),
            tuning_midi: [64, 59, 55, 50, 45, 40],
            grid: 240,
            sync_anchors: vec![
                crate::storage::project_model::SyncAnchor {
                    score_tick: 0,
                    audio_time_ms: 0.0,
                },
                crate::storage::project_model::SyncAnchor {
                    score_tick: 7680,
                    audio_time_ms: 4000.0,
                },
            ],
        };
        match crate::ai::transcription::transcribe_asset(
            &reopened,
            &copy_request,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
        ) {
            Ok(draft) => {
                assert_eq!(draft["stemId"], guitar_id);
                assert_eq!(draft["inputSha256"], result["stems"][0]["sha256"]);
                assert!(!draft["notes"].as_array().expect("실제 검출").is_empty());
                assert_eq!(
                    crate::ai::drafts::restore(&reopened, &copy_request, &AtomicBool::new(false))
                        .expect("실제 기타 초안 복원")["draft"],
                    draft
                );
                println!(
                    "실제 분리 기타 카피: {}음",
                    draft["notes"].as_array().expect("검출").len()
                );
            }
            Err(error) => {
                assert_eq!(error.code, "AI_TRANSCRIPTION_EMPTY");
                println!("실제 분리 기타 카피: 검출 음표 없음");
            }
        }
        copy_request.stem_id = None;
        assert!(
            crate::ai::drafts::restore(&reopened, &copy_request, &AtomicBool::new(false))
                .expect("원본 초안과 분리")["draft"]
                .is_null()
        );
        let mix: crate::mixer::model::MixDocument = serde_json::from_value(json!({
            "schemaVersion":1,"projectId":project_id,"masterGain":1.0,
            "layers":result["stems"].as_array().expect("실제 stem").iter().map(|stem| json!({
                "kind":"STEM","id":stem["id"],"gain":1.0,"mute":false,"solo":false,"offsetMs":0
            })).collect::<Vec<_>>()
        }))
        .expect("실제 분리 출력 믹스");
        let (mixed, stats) =
            crate::mixer::render::render(&reopened, &mix, &AtomicBool::new(false), |_, _| Ok(()))
                .expect("실제 분리 WAV 믹스");
        assert_eq!(stats.frames, 192000);
        assert_eq!(stats.limited_frames, 0);
        assert!(stats.peak > 0.1 && stats.peak < 0.2);
        let output = f.store.root.join("자체 분리 믹스.wav");
        crate::mixer::export::save_new_wav(&output, &mixed, &AtomicBool::new(false))
            .expect("새 분리 WAV 출력");
        assert_eq!(fs::read(&output).expect("출력 파일"), mixed);
        assert!(
            crate::mixer::export::save_new_wav(&output, &mixed, &AtomicBool::new(false)).is_err()
        );
        assert!(!f
            .store
            .root
            .join(format!("projects/{project_id}/separations/{id}"))
            .exists());
        let canceled_id = uuid::Uuid::new_v4().to_string();
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        let trigger = cancel.clone();
        let started = std::time::Instant::now();
        let thread = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(800));
            trigger.store(true, std::sync::atomic::Ordering::Release);
        });
        assert_eq!(
            separate_asset(&f.store, &r, &canceled_id, &cancel)
                .expect_err("실행 중 취소")
                .code,
            "CANCELED"
        );
        thread.join().expect("취소 thread");
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(!f
            .store
            .root
            .join(format!("projects/{project_id}/separations/{canceled_id}"))
            .exists());
        assert_eq!(fs::read(source).expect("원본 보존"), original);
    }
}
