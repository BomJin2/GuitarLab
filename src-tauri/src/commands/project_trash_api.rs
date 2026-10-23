use crate::{
    ipc::AppError,
    recording::{model::record_error, service::RecordingService},
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::{storage_error, validate_uuid},
        projects::ProjectStore,
    },
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{atomic::AtomicBool, Arc};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionRequest {
    schema_version: u8,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrashRequest {
    schema_version: u8,
    project_id: String,
    expected_revision: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreRequest {
    schema_version: u8,
    project_id: String,
    trash_id: String,
}
fn version(value: u8) -> Result<(), AppError> {
    if value != 1 {
        return Err(AppError::invalid());
    }
    Ok(())
}
fn mutate(
    jobs: &StorageJobs,
    recording: &Arc<RecordingService>,
    work: impl FnOnce(&AtomicBool) -> Result<Value, AppError> + Send + 'static,
) -> Result<JobSnapshot, AppError> {
    if recording.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let recording = recording.clone();
    super::storage_api::launch(job, move |job| recording.while_idle(|| work(&job.cancel)));
    Ok(initial)
}
#[tauri::command]
pub async fn list_trashed_projects(
    request: VersionRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    version(request.schema_version)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(json!({"schemaVersion":1,"projects":store.trashed_projects()?}))
    })
    .await
    .map_err(|_| storage_error())?
}
#[tauri::command]
pub async fn trash_project(
    request: TrashRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    let store = store.inner().clone();
    mutate(&jobs, &recording, move |cancel| {
        Ok(
            json!({"schemaVersion":1,"state":"PROJECT_TRASHED","entry":store.trash_project(&request.project_id, request.expected_revision, cancel)?}),
        )
    })
}
#[tauri::command]
pub async fn restore_trashed_project(
    request: RestoreRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    validate_uuid(&request.trash_id)?;
    let store = store.inner().clone();
    mutate(&jobs, &recording, move |cancel| {
        Ok(
            json!({"schemaVersion":1,"state":"PROJECT_RESTORED","project":store.restore_trashed_project(&request.project_id, &request.trash_id, cancel)?}),
        )
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_reject_versions_unknown_fields_paths_and_invalid_revision() {
        let id = "00000000-0000-4000-8000-000000000001";
        let valid = json!({"schemaVersion":1,"projectId":id,"expectedRevision":0});
        for (key, value) in [
            ("schemaVersion", json!(2)),
            ("path", json!("private")),
            ("projectId", json!("../outside")),
            ("expectedRevision", json!(-1)),
            ("expectedRevision", json!(4294967296_u64)),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(
                serde_json::from_value::<TrashRequest>(bad).map_or(true, |r| version(
                    r.schema_version
                )
                .and_then(|_| validate_uuid(&r.project_id))
                .is_err())
            );
        }
        let restore: RestoreRequest =
            serde_json::from_value(json!({"schemaVersion":1,"projectId":id,"trashId":id}))
                .expect("복원 요청");
        version(restore.schema_version).expect("버전");
        validate_uuid(&restore.trash_id).expect("UUID");
        assert!(serde_json::from_value::<RestoreRequest>(
            json!({"schemaVersion":1,"projectId":id,"trashId":id,"path":"private"})
        )
        .is_err());
        assert!(serde_json::from_value::<VersionRequest>(
            json!({"schemaVersion":1,"sql":"private"})
        )
        .is_err());
    }
}
