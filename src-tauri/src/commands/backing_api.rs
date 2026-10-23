use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        backing::ProjectBacking,
        jobs::{JobSnapshot, StorageJobs},
        project_model::validate_uuid,
        projects::ProjectStore,
    },
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackingRequest {
    schema_version: u8,
    project_id: String,
}
impl BackingRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_uuid(&self.project_id)
    }
}

#[tauri::command]
pub async fn get_project_backing(
    request: BackingRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let snapshot = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        serde_json::to_value(store.backing(&request.project_id, &job.cancel)?)
            .map_err(|_| AppError::internal())
    });
    Ok(snapshot)
}

#[tauri::command]
pub async fn save_backing_selection(
    request: ProjectBacking,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음 STOP과 저장을 마친 뒤 주소를 저장하세요.",
            true,
        ));
    }
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let snapshot = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        store.save_backing(&request, &job.cancel)?;
        serde_json::to_value(request).map_err(|_| AppError::internal())
    });
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn read_contract_rejects_paths_versions_and_unknown_fields() {
        let id = uuid::Uuid::new_v4().to_string();
        let request: BackingRequest =
            serde_json::from_value(json!({"schemaVersion":1,"projectId":id}))
                .expect("정상 조회 계약");
        request.validate().expect("정상 UUID");
        for value in [
            json!({"schemaVersion":1,"projectId":id,"url":"https://example.invalid"}),
            json!({"schemaVersion":1}),
        ] {
            assert!(serde_json::from_value::<BackingRequest>(value).is_err());
        }
        for value in [
            json!({"schemaVersion":2,"projectId":id}),
            json!({"schemaVersion":1,"projectId":"../escape"}),
        ] {
            assert!(serde_json::from_value::<BackingRequest>(value)
                .expect("입력 형식")
                .validate()
                .is_err());
        }
    }
}
