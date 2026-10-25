use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_metadata::ProjectMetadata,
        project_model::validate_uuid,
        projects::ProjectStore,
    },
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateMetadataRequest {
    schema_version: u8,
    project_id: String,
    expected: ProjectMetadata,
    changes: ProjectMetadata,
}
impl UpdateMetadataRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_uuid(&self.project_id)?;
        self.expected.validate()?;
        self.changes.validate()
    }
}
#[tauri::command]
pub async fn update_project_metadata(
    request: UpdateMetadataRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    let store = store.inner().clone();
    super::storage_api::launch_idle(&jobs, &recording, move |cancel| {
        let project = store.update_metadata(
            &request.project_id,
            request.expected,
            request.changes,
            cancel,
        )?;
        Ok(json!({"schemaVersion":1,"project":project}))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn request_validates_version_ids_fields_and_metadata_before_starting_a_job() {
        let valid = json!({"schemaVersion":1,"projectId":"00000000-0000-4000-8000-000000000001","expected":{"title":"기존","artist":null},"changes":{"title":"새 제목","artist":"가수"}});
        assert!(
            serde_json::from_value::<UpdateMetadataRequest>(valid.clone())
                .expect("요청")
                .validate()
                .is_ok()
        );
        for (key, value) in [
            ("schemaVersion", json!(2)),
            ("projectId", json!("../private")),
            ("path", json!("private")),
            ("changes", json!({"title":"","artist":null})),
            ("expected", json!({"title":"기존"})),
            (
                "changes",
                json!({"title":"새 제목","artist":null,"path":"private"}),
            ),
        ] {
            let mut invalid = valid.clone();
            invalid[key] = value;
            assert!(!serde_json::from_value::<UpdateMetadataRequest>(invalid)
                .is_ok_and(|request| request.validate().is_ok()));
        }
    }
}
