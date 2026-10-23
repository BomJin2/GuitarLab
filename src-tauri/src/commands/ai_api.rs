use crate::{
    ai,
    ipc::AppError,
    recording::service::RecordingService,
    storage::jobs::{JobSnapshot, StorageJobs},
};
use crate::{ai::transcription::TranscribeRequest, storage::projects::ProjectStore};
use serde::Deserialize;
use std::sync::Arc;
use tauri::Manager;

fn runtime_resources(app: &tauri::AppHandle) -> Result<Option<std::path::PathBuf>, AppError> {
    let root = app
        .path()
        .resource_dir()
        .map_err(|_| AppError::invalid())?
        .join("ai-runtime");
    match std::fs::symlink_metadata(&root) {
        Ok(_) => Ok(Some(root)),
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(AppError::invalid()),
    }
}

#[tauri::command]
pub async fn restore_project_separation(
    request: ai::separation::SeparateRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 분리 결과를 불러오세요.",
            true,
        ));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let store = store.inner().clone();
    super::storage_api::launch(job, move |job| {
        let (result, bytes) = ai::stem_store::restore(&store, &request, &job.cancel)?;
        if let Some(bytes) = bytes {
            job.set_binary(bytes)?;
        }
        Ok(result)
    });
    Ok(initial)
}

#[tauri::command]
pub async fn separate_project_audio(
    app: tauri::AppHandle,
    request: ai::separation::SeparateRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 분리하세요.",
            true,
        ));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let id = initial.job_id.clone();
    let store = store.inner().clone();
    super::storage_api::launch(job, move |job| {
        let resources = runtime_resources(&app)?;
        let (result, bytes) = ai::separation::separate_asset_with_resources(
            &store,
            &request,
            &id,
            &job.cancel,
            resources.as_deref(),
        )?;
        job.set_binary(bytes)?;
        Ok(result)
    });
    Ok(initial)
}

#[tauri::command]
pub async fn restore_transcription_draft(
    request: TranscribeRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 초안을 불러오세요.",
            true,
        ));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let store = store.inner().clone();
    super::storage_api::launch(job, move |job| {
        ai::drafts::restore(&store, &request, &job.cancel)
    });
    Ok(initial)
}

#[tauri::command]
pub async fn transcribe_project_audio(
    app: tauri::AppHandle,
    request: TranscribeRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 분석하세요.",
            true,
        ));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let id = initial.job_id.clone();
    let store = store.inner().clone();
    super::storage_api::launch(job, move |job| {
        let resources = runtime_resources(&app)?;
        ai::transcription::transcribe_asset_with_resources(
            &store,
            &request,
            &id,
            &job.cancel,
            resources.as_deref(),
        )
    });
    Ok(initial)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InspectRequest {
    schema_version: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifyModelRequest {
    schema_version: u8,
    model_id: ai::installation::ModelId,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallModelRequest {
    schema_version: u8,
    model_id: ai::installation::ModelId,
}
impl InstallModelRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn install_ai_model(
    app: tauri::AppHandle,
    request: InstallModelRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
    setup: tauri::State<'_, Arc<ai::setup::SetupService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 모델을 설치하세요.",
            true,
        ));
    }
    let guard = setup.inner().begin()?;
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let id = initial.job_id.clone();
    let root = store.root.clone();
    super::storage_api::launch(job, move |job| {
        let _guard = guard;
        let resources = runtime_resources(&app)?;
        ai::setup::install_with_resources(
            &root,
            &id,
            &job.cancel,
            |stage| job.progress(stage, 5),
            request.model_id,
            resources.as_deref(),
        )
    });
    Ok(initial)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DownloadModelRequest {
    schema_version: u8,
    model_id: ai::installation::ModelId,
    download_consent: bool,
}
impl DownloadModelRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 || !self.download_consent {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn download_ai_model(
    app: tauri::AppHandle,
    request: DownloadModelRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 모델 파일을 받으세요.",
            true,
        ));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let id = initial.job_id.clone();
    let root = store.root.clone();
    super::storage_api::launch(job, move |job| {
        let resources = runtime_resources(&app)?;
        ai::model_cache::download_model_with_resources(
            &root,
            &id,
            &job.cancel,
            |percent| job.progress(percent, 100),
            resources.as_deref(),
            request.model_id,
        )
    });
    Ok(initial)
}

#[tauri::command]
pub async fn verify_ai_model(
    app: tauri::AppHandle,
    request: VerifyModelRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<JobSnapshot, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 모델을 확인하세요.",
            true,
        ));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let id = initial.job_id.clone();
    let root = store.root.clone();
    super::storage_api::launch(job, move |job| {
        let resources = runtime_resources(&app)?;
        ai::installation::verify_with_resources(
            request.model_id,
            &root,
            &id,
            &job.cancel,
            resources.as_deref(),
        )
    });
    Ok(initial)
}

#[tauri::command]
pub async fn inspect_ai_runtime(
    app: tauri::AppHandle,
    request: InspectRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 AI 환경을 확인하세요.",
            true,
        ));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let id = initial.job_id.clone();
    super::storage_api::launch(job, move |job| {
        let resources = app.path().resource_dir().map_err(|_| AppError::invalid())?;
        let result = ai::inspect_with_resources(&resources, &id, &job.cancel)?;
        serde_json::to_value(result).map_err(|_| AppError::invalid())
    });
    Ok(initial)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn install_refuses_external_paths_versions_and_other_models() {
        let valid = json!({"schemaVersion":1,"modelId":"basic-pitch"});
        serde_json::from_value::<InstallModelRequest>(valid.clone())
            .expect("요청")
            .validate()
            .expect("허용");
        serde_json::from_value::<InstallModelRequest>(
            json!({"schemaVersion":1,"modelId":"htdemucs_6s"}),
        )
        .expect("분리 설치 요청")
        .validate()
        .expect("고정 분리 모델 허용");
        for (key, value) in [
            ("schemaVersion", json!(2)),
            ("modelId", json!("unknown")),
            ("path", json!("private")),
            ("url", json!("https://example.com")),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(match serde_json::from_value::<InstallModelRequest>(bad) {
                Ok(request) => request.validate().is_err(),
                Err(_) => true,
            });
        }
    }
    #[test]
    fn download_requires_explicit_consent_and_only_allowlisted_models() {
        let valid = json!({"schemaVersion":1,"modelId":"basic-pitch","downloadConsent":true});
        serde_json::from_value::<DownloadModelRequest>(valid.clone())
            .expect("요청")
            .validate()
            .expect("동의");
        let mut demucs = valid.clone();
        demucs["modelId"] = json!("htdemucs_6s");
        serde_json::from_value::<DownloadModelRequest>(demucs)
            .expect("분리 모델 요청")
            .validate()
            .expect("명시적 분리 모델 동의");
        for (key, value) in [
            ("schemaVersion", json!(2)),
            ("modelId", json!("unknown")),
            ("downloadConsent", json!(false)),
            ("path", json!("private")),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(match serde_json::from_value::<DownloadModelRequest>(bad) {
                Ok(request) => request.validate().is_err(),
                Err(_) => true,
            });
        }
    }
    #[test]
    fn model_request_refuses_paths_unknown_fields_and_nonallowlisted_ids() {
        let request = json!({"schemaVersion":1,"modelId":"basic-pitch"});
        assert!(serde_json::from_value::<VerifyModelRequest>(request.clone()).is_ok());
        for (key, value) in [
            ("path", json!("private")),
            ("modelId", json!("unknown")),
            ("schemaVersion", json!(true)),
        ] {
            let mut bad = request.clone();
            bad[key] = value;
            assert!(serde_json::from_value::<VerifyModelRequest>(bad).is_err());
        }
    }
}
