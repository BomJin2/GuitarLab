use crate::{
    backing::{CloseRequest, OpenRequest, PlayerService, Session},
    ipc::AppError,
    recording::service::RecordingService,
};
use std::sync::Arc;

#[tauri::command]
pub async fn open_youtube_player(
    request: OpenRequest,
    player: tauri::State<'_, Arc<PlayerService>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<Session, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음 STOP과 저장을 마친 뒤 온라인 플레이어를 여세요.",
            true,
        ));
    }
    let player = player.inner().clone();
    tauri::async_runtime::spawn_blocking(move || player.open(request))
        .await
        .map_err(|_| {
            AppError::new(
                "YOUTUBE_SESSION_FAILED",
                "온라인 연결 작업을 완료하지 못했습니다.",
                true,
            )
        })?
}
#[tauri::command]
pub async fn close_youtube_player(
    request: CloseRequest,
    player: tauri::State<'_, Arc<PlayerService>>,
) -> Result<serde_json::Value, AppError> {
    request.validate()?;
    let player = player.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        player.close(&request)?;
        Ok(serde_json::json!({"schemaVersion":1,"sessionId":request.session_id}))
    })
    .await
    .map_err(|_| {
        AppError::new(
            "YOUTUBE_SESSION_FAILED",
            "온라인 연결 종료를 완료하지 못했습니다.",
            true,
        )
    })?
}
