use crate::{
    audio::{
        monitor::{list_outputs, MonitorRequest, MonitorSnapshot, MonitorVolumeRequest},
        AudioService, DeviceList, StopRequest,
    },
    ipc::AppError,
};
use std::sync::Arc;

#[tauri::command]
pub async fn list_monitor_outputs() -> Result<DeviceList, AppError> {
    tauri::async_runtime::spawn_blocking(list_outputs)
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn start_input_monitor(
    request: MonitorRequest,
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<MonitorSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.start_monitor(request))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn stop_input_monitor(
    request: StopRequest,
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<MonitorSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.stop_monitor(request))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn get_input_monitor(
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<MonitorSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.monitor_snapshot())
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn set_input_monitor_volume(
    request: MonitorVolumeRequest,
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<MonitorSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.set_monitor_volume(request))
        .await
        .map_err(|_| AppError::internal())?
}
