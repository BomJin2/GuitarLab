use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::{validate_uuid, GuitarPartRole},
        projects::{canceled, ProjectStore},
    },
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportRequest {
    schema_version: u8,
    project_id: String,
    role: GuitarPartRole,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectRequest {
    schema_version: u8,
    project_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadRequest {
    schema_version: u8,
    project_id: String,
    stem_id: String,
}
fn validate(version: u8, project: &str) -> Result<(), AppError> {
    if version != 1 {
        return Err(AppError::invalid());
    }
    validate_uuid(project)
}
fn recording_guard(recording: &RecordingService) -> Result<(), AppError> {
    if recording.is_active() {
        Err(AppError::new(
            "RECORDING_BUSY",
            "녹음 STOP과 저장 후 기타 파일을 불러오세요.",
            true,
        ))
    } else {
        Ok(())
    }
}
#[tauri::command]
pub async fn import_guitar_stem(
    app: tauri::AppHandle,
    request: ImportRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    validate(request.schema_version, &request.project_id)?;
    recording_guard(recording.inner())?;
    let store = store.inner().clone();
    let recording = recording.inner().clone();
    let job = jobs.start("PICKING")?;
    let snapshot = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        canceled(&job.cancel)?;
        store.open(&request.project_id)?;
        let mut dialog = app
            .dialog()
            .file()
            .set_title("사용자 기타 WAV 선택")
            .add_filter("WAV", &["wav"]);
        if let Some(parent) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&parent);
        }
        let path = dialog
            .blocking_pick_file()
            .ok_or_else(|| AppError::new("CANCELED", "기타 파일 선택을 취소했습니다.", false))?
            .into_path()
            .map_err(|_| AppError::invalid())?;
        canceled(&job.cancel)?;
        recording_guard(&recording)?;
        let stem = store.import_guitar_stem(
            &request.project_id,
            request.role,
            &path,
            &job.cancel,
            |done, total| job.progress(done, total),
        )?;
        Ok(json!({"schemaVersion":1,"stem":stem}))
    });
    Ok(snapshot)
}
#[tauri::command]
pub async fn list_imported_guitar_stems(
    request: ProjectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    validate(request.schema_version, &request.project_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let snapshot = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        Ok(
            json!({"schemaVersion":1,"projectId":request.project_id,"stems":store.imported_guitar_stems(&request.project_id,&job.cancel)?}),
        )
    });
    Ok(snapshot)
}
#[tauri::command]
pub async fn read_imported_guitar_stem(
    request: ReadRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    validate(request.schema_version, &request.project_id)?;
    validate_uuid(&request.stem_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let snapshot = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let (stem, bytes) =
            store.read_imported_guitar_stem(&request.project_id, &request.stem_id, &job.cancel)?;
        job.set_binary(bytes)?;
        Ok(json!({"schemaVersion":1,"stem":stem}))
    });
    Ok(snapshot)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_request_rejects_arbitrary_paths_roles_and_versions() {
        let project = uuid::Uuid::new_v4().to_string();
        let valid = serde_json::json!({"schemaVersion":1,"projectId":project,"role":"LEAD"});
        let request: ImportRequest = serde_json::from_value(valid.clone()).expect("정상");
        validate(request.schema_version, &request.project_id).expect("정상 버전");
        let mut extra = valid.clone();
        extra["path"] = json!("../private");
        assert!(serde_json::from_value::<ImportRequest>(extra).is_err());
        let mut role = valid;
        role["role"] = json!("AI_LEAD");
        assert!(serde_json::from_value::<ImportRequest>(role).is_err());
        assert!(validate(2, &project).is_err());
        assert!(validate(1, "../escape").is_err());
    }
}
