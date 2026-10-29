use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::{validate_uuid, MAX_SAFE},
        project_purge::PurgeConfirmation,
        projects::{canceled, ProjectStore},
    },
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

fn main_window(label: &str) -> Result<(), AppError> {
    if label != "main" {
        return Err(AppError::invalid());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareRequest {
    schema_version: u8,
    project_id: String,
    trash_id: String,
}
impl PrepareRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.trash_id)
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PurgeRequest {
    schema_version: u8,
    project_id: String,
    trash_id: String,
    fingerprint: String,
    confirmed_title: String,
    confirm_permanent_delete: bool,
}
impl PurgeRequest {
    fn validate(&self) -> Result<(), AppError> {
        PrepareRequest {
            schema_version: self.schema_version,
            project_id: self.project_id.clone(),
            trash_id: self.trash_id.clone(),
        }
        .validate()?;
        if !self.confirm_permanent_delete
            || self.fingerprint.len() != 64
            || !self
                .fingerprint
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            || self.confirmed_title.is_empty()
            || self.confirmed_title.chars().count() > 200
            || self.confirmed_title.chars().any(char::is_control)
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn prepare_trashed_project_purge(
    window: tauri::Window,
    request: PrepareRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    main_window(window.label())?;
    let store = store.inner().clone();
    super::storage_api::launch_idle_job(&jobs, &recording, "RUNNING", move |job| {
        let plan = store.prepare_project_purge(
            &request.project_id,
            &request.trash_id,
            &job.cancel,
            |done, total| job.progress_with_limit(done, total, MAX_SAFE),
        )?;
        Ok(json!({"schemaVersion":1,"state":"PROJECT_PURGE_PREPARED","plan":plan}))
    })
}
#[tauri::command]
pub async fn purge_trashed_project(
    app: tauri::AppHandle,
    window: tauri::Window,
    request: PurgeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    main_window(window.label())?;
    let store = store.inner().clone();
    super::storage_api::launch_idle_job(&jobs, &recording, "PICKING", move |job| {
        canceled(&job.cancel)?;
        let parent = app
            .get_webview_window("main")
            .ok_or_else(AppError::invalid)?;
        let accepted = app.dialog().message(format!("‘{}’의 관리 파일·악보·녹음·연습 기록을 영구 삭제합니다. 이미 지운 파일은 취소/복원할 수 없습니다. 외부 원본은 삭제하지 않습니다. 계속할까요?", request.confirmed_title))
            .title("보관 프로젝트 영구 삭제 확인")
            .buttons(MessageDialogButtons::OkCancelCustom("영구 삭제".into(), "취소".into()))
            .parent(&parent).blocking_show();
        canceled(&job.cancel)?;
        if !accepted {
            return Err(AppError::new(
                "CANCELED",
                "영구 삭제 확인을 취소했습니다. 새 삭제는 시작하지 않았습니다.",
                false,
            ));
        }
        let result = store.purge_project(
            PurgeConfirmation {
                project_id: &request.project_id,
                trash_id: &request.trash_id,
                fingerprint: &request.fingerprint,
                confirmed_title: &request.confirmed_title,
                consent: request.confirm_permanent_delete,
            },
            &job.cancel,
            |done, total| job.progress_with_limit(done, total, MAX_SAFE),
        )?;
        Ok(
            json!({"schemaVersion":1,"state":"PROJECT_PURGED","projectId":result.project_id,"trashId":result.trash_id,"files":result.files,"logicalBytes":result.logical_bytes,"externalReferences":result.external_references}),
        )
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn purge_requests_require_exact_version_ids_fingerprint_title_and_explicit_consent() {
        main_window("main").expect("로컬 주 창");
        assert!(main_window("youtube").is_err());
        assert!(main_window("main-other").is_err());
        let id = "00000000-0000-4000-8000-000000000001";
        let valid = json!({"schemaVersion":1,"projectId":id,"trashId":id,"fingerprint":"a".repeat(64),"confirmedTitle":"테스트","confirmPermanentDelete":true});
        serde_json::from_value::<PurgeRequest>(valid.clone())
            .expect("요청")
            .validate()
            .expect("검증");
        for (key, value) in [
            ("schemaVersion", json!(2)),
            ("projectId", json!("../outside")),
            ("trashId", json!("bad")),
            ("fingerprint", json!("A".repeat(64))),
            ("confirmedTitle", json!("")),
            ("confirmedTitle", json!("제목\n")),
            ("confirmPermanentDelete", json!(false)),
            ("path", json!("private")),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(
                serde_json::from_value::<PurgeRequest>(bad).map_or(true, |r| r.validate().is_err())
            );
        }
        assert!(serde_json::from_value::<PrepareRequest>(
            json!({"schemaVersion":1,"projectId":id,"trashId":id,"delete":true})
        )
        .is_err());
    }
}
