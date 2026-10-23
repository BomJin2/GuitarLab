use super::{dev_command, error, installation::ModelId, run_request};
use crate::{
    ipc::AppError,
    storage::{database::checked_directory, projects::canceled},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{fs, path::Path, sync::atomic::AtomicBool, time::Duration};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CacheInfo {
    schema_version: u8,
    model_id: ModelId,
    model_version: String,
    state: String,
    artifact_count: u32,
    total_bytes: u64,
    reused_files: u32,
}
pub fn validate(value: &Value) -> Result<(), AppError> {
    validate_for(value, ModelId::BasicPitch)
}
pub fn validate_for(value: &Value, model: ModelId) -> Result<(), AppError> {
    let info: CacheInfo =
        serde_json::from_value(value.clone()).map_err(|_| error("AI_PROTOCOL_INVALID"))?;
    if info.schema_version != 1
        || info.model_id != model
        || info.model_version != model.version()
        || info.state != "CACHE_VERIFIED"
        || !match model {
            ModelId::BasicPitch => [(41, 144_366_287), (42, 146_364_006)],
            ModelId::Demucs => [(33, 707_117_623), (34, 708_033_316)],
        }
        .contains(&(info.artifact_count, info.total_bytes))
        || info.reused_files > info.artifact_count
    {
        return Err(error("AI_PROTOCOL_INVALID"));
    }
    Ok(())
}
pub fn download(
    root: &Path,
    job_id: &str,
    cancel: &AtomicBool,
    progress: impl Fn(u64) -> Result<(), AppError>,
) -> Result<Value, AppError> {
    download_with_resources(root, job_id, cancel, progress, None)
}
pub fn download_with_resources(
    root: &Path,
    job_id: &str,
    cancel: &AtomicBool,
    progress: impl Fn(u64) -> Result<(), AppError>,
    resources: Option<&Path>,
) -> Result<Value, AppError> {
    download_model_with_resources(
        root,
        job_id,
        cancel,
        progress,
        resources,
        ModelId::BasicPitch,
    )
}
pub fn download_model_with_resources(
    root: &Path,
    job_id: &str,
    cancel: &AtomicBool,
    progress: impl Fn(u64) -> Result<(), AppError>,
    resources: Option<&Path>,
    model: ModelId,
) -> Result<Value, AppError> {
    crate::storage::project_model::validate_uuid(job_id)?;
    canceled(cancel)?;
    let command = if let Some(resources) = resources {
        super::bundled::command(resources, cancel)?
    } else {
        dev_command()?
    };
    let plan = model.setup_for(resources.is_some());
    let cache = checked_directory(root, &Path::new("ai/downloads").join(plan.cache))?;
    let work = checked_directory(root, &Path::new("ai/download-jobs").join(job_id))?;
    let result = run_request(
        command,
        job_id,
        cancel,
        Duration::from_secs(1800),
        json!({"protocolVersion":1,"type":"start","jobId":job_id,"action":"download_model","modelId":model,
               "input":{"cacheDir":cache,"workDir":work}}),
        progress,
    );
    // 부모가 worker를 중단한 경우에도 현재 UUID의 배타적 임시 파일만 정리합니다.
    for entry in fs::read_dir(&work).map_err(|_| error("AI_CACHE_CLEANUP_FAILED"))? {
        let entry = entry.map_err(|_| error("AI_CACHE_CLEANUP_FAILED"))?;
        let name = entry.file_name();
        let name = name
            .to_str()
            .ok_or_else(|| error("AI_CACHE_CLEANUP_FAILED"))?;
        let allowed = name == "download.part"
            || name == "basic_pitch-0.4.0+guitarlab.onnx1-py3-none-any.whl"
            || name
                .strip_prefix("onnx-")
                .and_then(|value| value.strip_suffix(".part"))
                .is_some_and(|value| crate::storage::project_model::validate_uuid(value).is_ok());
        if !allowed {
            return Err(error("AI_CACHE_CLEANUP_FAILED"));
        }
        let part = crate::storage::database::checked_file(
            root,
            &Path::new("ai/download-jobs").join(job_id).join(name),
        )?;
        fs::remove_file(part).map_err(|_| error("AI_CACHE_CLEANUP_FAILED"))?;
    }
    fs::remove_dir(work).map_err(|_| error("AI_CACHE_CLEANUP_FAILED"))?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn demucs_results_match_requested_model_and_exact_profile_totals() {
        for (count, bytes) in [(33, 707117623), (34, 708033316)] {
            let value = json!({"schemaVersion":1,"modelId":"htdemucs_6s","modelVersion":"4.1.0","state":"CACHE_VERIFIED","artifactCount":count,"totalBytes":bytes,"reusedFiles":count});
            validate_for(&value, ModelId::Demucs).expect("고정 분리 모델 캐시");
            assert!(validate_for(&value, ModelId::BasicPitch).is_err());
            for (key, wrong) in [
                ("artifactCount", json!(35)),
                ("totalBytes", json!(1)),
                ("reusedFiles", json!(count + 1)),
                ("modelVersion", json!("0.4.0")),
                ("state", json!("INSTALLED")),
                ("url", json!("private")),
            ] {
                let mut invalid = value.clone();
                invalid[key] = wrong;
                assert!(validate_for(&invalid, ModelId::Demucs).is_err());
            }
        }
    }

    #[test]
    #[ignore = "승인된 cp312 패키지 캐시를 재사용하고 고정 Demucs 가중치2개 약53MiB만 HTTPS로 받아 검증합니다. 개인 음원/기존 설치는 변경하지 않습니다"]
    fn actual_demucs_download_weights_reuses_offline_and_cancels_without_install() {
        use std::{path::PathBuf, sync::atomic::Ordering};
        let resources = super::super::bundled::tests::resource_candidate();
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        let plan = ModelId::Demucs.setup_for(true);
        let cache = checked_directory(root, &Path::new("ai/downloads").join(plan.cache))
            .expect("새 테스트 캐시");
        let source = PathBuf::from(std::env::var_os("APPDATA").expect("앱 데이터"))
            .join("com.guitarlab.app/ai/downloads")
            .join(plan.cache);
        let manifest: Value = serde_json::from_str(include_str!(
            "../../../ai/models/demucs-4.1.0-htdemucs-6s-windows-cp312.json"
        ))
        .expect("고정 계획");
        for item in manifest["artifacts"].as_array().expect("패키지 목록") {
            let name = item["filename"].as_str().expect("파일명");
            fs::hard_link(source.join(name), cache.join(name))
                .expect("수정 없이 읽기 전용 캐시 재사용");
        }
        let cancel = AtomicBool::new(false);
        let id = uuid::Uuid::new_v4().to_string();
        let progress = std::sync::Mutex::new(Vec::new());
        let result = download_model_with_resources(
            root,
            &id,
            &cancel,
            |percent| {
                progress.lock().expect("진행").push(percent);
                Ok(())
            },
            Some(&resources),
            ModelId::Demucs,
        )
        .expect("실제 고정 가중치 수신/검증");
        assert_eq!(result["artifactCount"], 34);
        assert_eq!(result["totalBytes"], 708033316u64);
        assert_eq!(result["reusedFiles"], 32);
        let values = progress.lock().expect("진행 결과");
        assert!(values.len() <= 22 && values.windows(2).all(|pair| pair[0] < pair[1]));
        assert_eq!(values.last(), Some(&100));
        assert!(!root.join("ai/download-jobs").join(id).exists());
        let reused = download_model_with_resources(
            root,
            &uuid::Uuid::new_v4().to_string(),
            &cancel,
            |_| Ok(()),
            Some(&resources),
            ModelId::Demucs,
        )
        .expect("완성 캐시 재사용");
        assert_eq!(reused["reusedFiles"], 34);
        let canceled_id = uuid::Uuid::new_v4().to_string();
        let cause = download_model_with_resources(
            root,
            &canceled_id,
            &cancel,
            |percent| {
                if percent > 0 {
                    cancel.store(true, Ordering::Release);
                }
                Ok(())
            },
            Some(&resources),
            ModelId::Demucs,
        )
        .expect_err("진행 중 취소");
        assert_eq!(cause.code, "CANCELED");
        assert!(!root.join("ai/download-jobs").join(canceled_id).exists());
        assert!(!root.join("ai/environments").exists());
        for item in manifest["modelFiles"].as_array().expect("가중치 목록") {
            let path = cache.join(item["path"].as_str().expect("가중치 파일명"));
            assert_eq!(
                crate::storage::projects::hash(&fs::read(path).expect("원본 캐시 보존")),
                item["sha256"]
            );
        }
    }
    #[test]
    fn download_report_never_claims_installation_and_requires_fixed_totals() {
        let value = json!({"schemaVersion":1,"modelId":"basic-pitch","modelVersion":"0.4.0","state":"CACHE_VERIFIED","artifactCount":41,"totalBytes":144366287,"reusedFiles":0});
        validate(&value).expect("다운로드 결과");
        let mut portable = value.clone();
        portable["artifactCount"] = json!(42);
        portable["totalBytes"] = json!(146364006);
        portable["reusedFiles"] = json!(42);
        validate(&portable).expect("고정 cp312 캐시");
        portable["totalBytes"] = json!(144366287);
        assert!(validate(&portable).is_err());
        for (key, wrong) in [
            ("state", json!("INSTALLED")),
            ("totalBytes", json!(1)),
            ("reusedFiles", json!(42)),
            ("path", json!("private")),
        ] {
            let mut invalid = value.clone();
            invalid[key] = wrong;
            assert!(validate(&invalid).is_err());
        }
    }
}
