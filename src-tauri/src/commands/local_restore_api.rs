use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::{storage_error, validate_uuid},
        projects::{canceled, ProjectStore},
        restore_requests,
    },
};
use serde::Deserialize;
use serde_json::Value;
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
pub struct RestoreRequest {
    schema_version: u8,
    consent_replace_local_data: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StatusRequest {
    schema_version: u8,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelRequest {
    schema_version: u8,
    recovery_id: String,
    confirm_cancel: bool,
}

#[tauri::command]
pub async fn get_local_restore_status(
    window: tauri::Window,
    request: StatusRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    main_window(window.label())?;
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || restore_requests::status(&store.root))
        .await
        .map_err(|_| storage_error())?
}

#[tauri::command]
pub async fn restore_local_backup(
    window: tauri::Window,
    app: tauri::AppHandle,
    request: RestoreRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    main_window(window.label())?;
    if request.schema_version != 1 || !request.consent_replace_local_data {
        return Err(AppError::invalid());
    }
    let store = store.inner().clone();
    let resources = app.path().resource_dir().map_err(|_| storage_error())?;
    super::storage_api::launch_idle_job(&jobs, &recording, "PICKING", move |job| {
        canceled(&job.cancel)?;
        let parent = app
            .get_webview_window("main")
            .ok_or_else(AppError::invalid)?;
        let archive = app
            .dialog()
            .file()
            .set_parent(&parent)
            .set_title("현재 데이터를 교체할 백업 ZIP 선택")
            .add_filter("GuitarLab ZIP 백업", &["zip"])
            .blocking_pick_file()
            .ok_or_else(|| AppError::new("CANCELED", "백업 선택을 취소했습니다.", false))?
            .into_path()
            .map_err(|_| AppError::invalid())?;
        if !archive.is_absolute()
            || archive
                .extension()
                .is_none_or(|v| !v.eq_ignore_ascii_case("zip"))
        {
            return Err(AppError::invalid());
        }
        let guard = app.state::<crate::instance::InstanceGuard>();
        let plan = restore_requests::run(
            &store.root,
            &resources,
            &guard,
            "prepare",
            &[archive.as_os_str()],
            Some(job),
        )?;
        canceled(&job.cancel)?;
        let accepted = app.dialog().message(format!("검사한 {}개 파일 · {}MiB로 다음 실행 때 현재 프로젝트·녹음·기록·보정값을 교체합니다. 종료 전 편집을 저장하세요. 다음 시작에서 최신 현재 자료를 별도 ZIP과 복구 폴더에 먼저 보존합니다. 외부 참조 {}개는 별도로 연결해야 하며 이전 백업은 보정값이 누락됐을 수 있습니다. AI 모델·외부 원본·다른 설정은 유지합니다. 준비본과 복구 폴더는 자동 삭제하지 않아 디스크 공간이 필요합니다. 예약할까요?", plan["files"], plan["bytes"].as_u64().ok_or_else(AppError::invalid)? / 1048576, plan["externalReferencesNotCopied"]))
            .title("현재 로컬 데이터 복원 예약 확인").buttons(MessageDialogButtons::OkCancelCustom("복원 예약".into(), "취소".into())).parent(&parent).blocking_show();
        canceled(&job.cancel)?;
        if !accepted {
            return Err(AppError::new(
                "CANCELED",
                "복원 예약을 취소했습니다. 현재 자료는 교체하지 않았습니다.",
                false,
            ));
        }
        let id = plan["recoveryId"].as_str().ok_or_else(AppError::invalid)?;
        let fingerprint = plan["fingerprint"].as_str().ok_or_else(AppError::invalid)?;
        restore_requests::run(
            &store.root,
            &resources,
            &guard,
            "schedule",
            &[id.as_ref(), fingerprint.as_ref()],
            Some(job),
        )
    })
}

#[tauri::command]
pub async fn cancel_local_restore(
    window: tauri::Window,
    app: tauri::AppHandle,
    request: CancelRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    main_window(window.label())?;
    if request.schema_version != 1 || !request.confirm_cancel {
        return Err(AppError::invalid());
    }
    validate_uuid(&request.recovery_id)?;
    let store = store.inner().clone();
    let resources = app.path().resource_dir().map_err(|_| storage_error())?;
    super::storage_api::launch_idle_job(&jobs, &recording, "RUNNING", move |job| {
        canceled(&job.cancel)?;
        restore_requests::run(
            &store.root,
            &resources,
            &app.state::<crate::instance::InstanceGuard>(),
            "cancel",
            &[request.recovery_id.as_ref()],
            Some(job),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn consent_main_window_and_path_free_requests_are_required() {
        assert!(main_window("youtube").is_err());
        main_window("main").expect("주 창");
        serde_json::from_value::<RestoreRequest>(
            serde_json::json!({"schemaVersion":1,"consentReplaceLocalData":true}),
        )
        .expect("명시적 동의");
        for value in [
            serde_json::json!({"schemaVersion":1,"path":"private"}),
            serde_json::json!({"schemaVersion":1,"consentReplaceLocalData":true,"command":"arbitrary"}),
        ] {
            assert!(serde_json::from_value::<RestoreRequest>(value).is_err());
        }
        assert!(serde_json::from_value::<CancelRequest>(serde_json::json!({"schemaVersion":1,"recoveryId":"id","confirmCancel":true,"path":"private"})).is_err());
    }
}
