use crate::{
    ipc::AppError,
    recording::{model::record_error, service::RecordingService},
    storage::{
        backup,
        jobs::{JobSnapshot, StorageJobs},
        project_model::storage_error,
        projects::{canceled, ProjectStore},
    },
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupRequest {
    schema_version: u8,
    consent_local_data: bool,
}
impl BackupRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 || !self.consent_local_data {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn backup_local_data(
    request: BackupRequest,
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    launch(
        app,
        store.inner().clone(),
        jobs.inner(),
        recording.inner().clone(),
        Action::Create,
    )
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifyRequest {
    schema_version: u8,
}
impl VerifyRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version == 1 {
            Ok(())
        } else {
            Err(AppError::invalid())
        }
    }
}
#[tauri::command]
pub async fn verify_local_backup(
    request: VerifyRequest,
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    launch(
        app,
        store.inner().clone(),
        jobs.inner(),
        recording.inner().clone(),
        Action::Verify,
    )
}
#[tauri::command]
pub async fn preview_local_backup(
    request: BackupRequest,
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    launch(
        app,
        store.inner().clone(),
        jobs.inner(),
        recording.inner().clone(),
        Action::Preview,
    )
}
#[derive(Clone, Copy)]
enum Action {
    Create,
    Verify,
    Preview,
}
fn launch(
    app: tauri::AppHandle,
    store: Arc<ProjectStore>,
    jobs: &StorageJobs,
    recording: Arc<RecordingService>,
    action: Action,
) -> Result<JobSnapshot, AppError> {
    if recording.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let resources = app.path().resource_dir().map_err(|_| storage_error())?;
    let job = jobs.start("PICKING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        canceled(&job.cancel)?;
        let mut dialog = app
            .dialog()
            .file()
            .set_title(match action {
                Action::Verify => "백업 ZIP 검사",
                Action::Create => "새 로컬 백업 ZIP 저장",
                Action::Preview => "복원 미리보기할 백업 ZIP 선택",
            })
            .add_filter("ZIP 백업", &["zip"]);
        if let Some(parent) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&parent);
        }
        let selection = match action {
            Action::Verify | Action::Preview => dialog.blocking_pick_file(),
            Action::Create => dialog
                .set_file_name("GuitarLab-backup.zip")
                .blocking_save_file(),
        };
        let destination = selection
            .ok_or_else(|| AppError::new("CANCELED", "백업 위치 선택을 취소했습니다.", false))?
            .into_path()
            .map_err(|_| AppError::invalid())?;
        canceled(&job.cancel)?;
        let preview_target = if matches!(action, Action::Preview) {
            let mut folders = app
                .dialog()
                .file()
                .set_title("새 GuitarLab-backup-preview 폴더를 만들 상위 폴더 선택");
            if let Some(parent) = app.get_webview_window("main") {
                folders = folders.set_parent(&parent);
            }
            let parent = folders
                .blocking_pick_folder()
                .ok_or_else(|| {
                    AppError::new("CANCELED", "복원 미리보기 위치 선택을 취소했습니다.", false)
                })?
                .into_path()
                .map_err(|_| AppError::invalid())?;
            Some(parent.join("GuitarLab-backup-preview"))
        } else {
            None
        };
        canceled(&job.cancel)?;
        job.progress(0, 0)?;
        let result = match action {
            Action::Verify => backup::verify(&store, &recording, &resources, &destination, job),
            Action::Create => backup::create(&store, &recording, &resources, &destination, job),
            Action::Preview => backup::preview(
                &store,
                &recording,
                &resources,
                &destination,
                preview_target.as_deref().ok_or_else(AppError::invalid)?,
                job,
            ),
        };
        serde_json::to_value(result?).map_err(|_| storage_error())
    });
    Ok(initial)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn verification_request_is_version_only_and_rejects_paths() {
        serde_json::from_value::<VerifyRequest>(serde_json::json!({"schemaVersion":1}))
            .expect("검사 요청")
            .validate()
            .expect("버전");
        assert!(
            serde_json::from_value::<VerifyRequest>(serde_json::json!({"schemaVersion":2}))
                .expect("숫자 버전")
                .validate()
                .is_err()
        );
        assert!(serde_json::from_value::<VerifyRequest>(
            serde_json::json!({"schemaVersion":1,"path":"arbitrary"})
        )
        .is_err());
    }
    #[test]
    fn backup_request_requires_explicit_consent_and_never_accepts_paths_or_commands() {
        let valid = serde_json::json!({"schemaVersion":1,"consentLocalData":true});
        serde_json::from_value::<BackupRequest>(valid.clone())
            .expect("요청")
            .validate()
            .expect("동의");
        for (key, value) in [
            ("schemaVersion", serde_json::json!(2)),
            ("consentLocalData", serde_json::json!(false)),
            ("path", serde_json::json!("arbitrary")),
            ("command", serde_json::json!("arbitrary")),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(serde_json::from_value::<BackupRequest>(bad)
                .map_or(true, |r| r.validate().is_err()));
        }
    }
}
