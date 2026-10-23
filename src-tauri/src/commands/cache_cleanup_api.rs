use crate::{
    ai::{cache_cleanup, installation::ModelId},
    ipc::AppError,
    recording::{model::record_error, service::RecordingService},
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::storage_error,
        projects::ProjectStore,
    },
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InspectRequest {
    schema_version: u8,
    model_id: ModelId,
}
impl InspectRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClearRequest {
    schema_version: u8,
    model_id: ModelId,
    clear_consent: bool,
    expected_revision: String,
}
impl ClearRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || !self.clear_consent
            || self.expected_revision.len() != 64
            || !self
                .expected_revision
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn inspect_model_download_cache(
    request: InspectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<cache_cleanup::Usage, AppError> {
    request.validate()?;
    let root = store.root.clone();
    tauri::async_runtime::spawn_blocking(move || cache_cleanup::inspect(&root, request.model_id))
        .await
        .map_err(|_| storage_error())?
}
#[tauri::command]
pub async fn clear_model_download_cache(
    request: ClearRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let root = store.root.clone();
    let recording = recording.inner().clone();
    super::storage_api::launch(job, move |job| {
        recording.while_idle(|| {
            let result = cache_cleanup::clear(
                &root,
                request.model_id,
                &request.expected_revision,
                &job.cancel,
                |percent| job.progress(percent, 100),
            )?;
            serde_json::to_value(result).map_err(|_| storage_error())
        })
    });
    Ok(initial)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_reject_path_profile_unknown_model_and_missing_consent_or_revision() {
        let valid = serde_json::json!({"schemaVersion":1,"modelId":"basic-pitch","clearConsent":true,"expectedRevision":"a".repeat(64)});
        serde_json::from_value::<ClearRequest>(valid.clone())
            .expect("요청")
            .validate()
            .expect("동의");
        for (key, value) in [
            ("schemaVersion", serde_json::json!(2)),
            ("modelId", serde_json::json!("unknown")),
            ("path", serde_json::json!("private")),
            ("profile", serde_json::json!("cp310")),
            ("clearConsent", serde_json::json!(false)),
            ("expectedRevision", serde_json::json!("wrong")),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(serde_json::from_value::<ClearRequest>(bad)
                .map_or(true, |request| request.validate().is_err()));
        }
        assert!(serde_json::from_str::<InspectRequest>(
            r#"{"schemaVersion":1,"modelId":"basic-pitch","path":"private"}"#
        )
        .is_err());
        assert!(serde_json::from_str::<InspectRequest>(
            r#"{"schemaVersion":2,"modelId":"basic-pitch"}"#
        )
        .expect("버전")
        .validate()
        .is_err());
    }
}
