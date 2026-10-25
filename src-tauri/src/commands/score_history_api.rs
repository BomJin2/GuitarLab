use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::validate_uuid,
        projects::{canceled, ProjectStore},
    },
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevisionPageRequest {
    schema_version: u8,
    project_id: String,
    #[serde(deserialize_with = "Option::deserialize")]
    before_revision: Option<u32>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevisionReadRequest {
    schema_version: u8,
    project_id: String,
    revision_id: String,
}
fn validate(version: u8, project_id: &str) -> Result<(), AppError> {
    if version != 1 {
        return Err(AppError::invalid());
    }
    validate_uuid(project_id)
}
#[tauri::command]
pub async fn list_score_revisions(
    request: RevisionPageRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    validate(request.schema_version, &request.project_id)?;
    if request.before_revision == Some(0) {
        return Err(AppError::invalid());
    }
    let store = store.inner().clone();
    super::storage_api::launch_idle(&jobs, &recording, move |cancel| {
        Ok(
            json!({"schemaVersion":1,"page":store.list_score_revisions(&request.project_id,request.before_revision,cancel)?}),
        )
    })
}
#[tauri::command]
pub async fn read_score_revision(
    request: RevisionReadRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    validate(request.schema_version, &request.project_id)?;
    validate_uuid(&request.revision_id)?;
    let store = store.inner().clone();
    super::storage_api::launch_idle(&jobs, &recording, move |cancel| {
        canceled(cancel)?;
        let revision = store.revision(&request.project_id, &request.revision_id)?;
        canceled(cancel)?;
        Ok(json!({"schemaVersion":1,"revision":revision}))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_reject_wrong_versions_paths_unknown_and_missing_fields() {
        let id = "00000000-0000-4000-8000-000000000001";
        assert!(validate(1, id).is_ok());
        assert!(validate(2, id).is_err());
        assert!(validate(1, "../private").is_err());
        let valid = json!({"schemaVersion":1,"projectId":id,"beforeRevision":null});
        assert!(serde_json::from_value::<RevisionPageRequest>(valid.clone()).is_ok());
        for key in ["beforeRevision", "projectId", "schemaVersion"] {
            let mut missing = valid.clone();
            missing.as_object_mut().expect("요청").remove(key);
            assert!(serde_json::from_value::<RevisionPageRequest>(missing).is_err());
        }
        for value in [json!(-1), json!(1.5), json!(4294967296_u64)] {
            let mut invalid = valid.clone();
            invalid["beforeRevision"] = value;
            assert!(serde_json::from_value::<RevisionPageRequest>(invalid).is_err());
        }
        assert!(serde_json::from_value::<RevisionReadRequest>(
            json!({"schemaVersion":1,"projectId":id,"revisionId":id})
        )
        .is_ok());
        assert!(serde_json::from_value::<RevisionReadRequest>(
            json!({"schemaVersion":1,"projectId":id,"revisionId":id,"path":"private"})
        )
        .is_err());
    }
}
