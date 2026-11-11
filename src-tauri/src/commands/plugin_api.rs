use crate::{
    ipc::AppError,
    plugins::{
        LoadPluginRequest, MonitorPluginService, MonitorPluginSnapshot, UnloadPluginRequest,
    },
    storage::{
        plugin_states::{PluginStateRequest, ProjectPluginState, StoredPluginState},
        projects::ProjectStore,
    },
};
use std::sync::Arc;

// docs/12 "모니터 AmpliTube 삽입 v1"
#[tauri::command]
pub async fn get_monitor_plugin(
    state: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorPluginSnapshot, AppError> {
    state.inner().snapshot()
}
#[tauri::command]
pub async fn load_monitor_plugin(
    request: LoadPluginRequest,
    state: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorPluginSnapshot, AppError> {
    state.inner().load(request)
}
#[tauri::command]
pub async fn unload_monitor_plugin(
    request: UnloadPluginRequest,
    state: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorPluginSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.unload(request))
        .await
        .map_err(|_| AppError::internal())?
}
// docs/12 "AmpliTube 에디터 창 v1": 창이 열릴 때까지(약 3초) 기다리므로 blocking 스레드에서 처리합니다.
#[tauri::command]
pub async fn open_monitor_plugin_editor(
    request: UnloadPluginRequest,
    state: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorPluginSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.open_editor(request))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn close_monitor_plugin_editor(
    request: UnloadPluginRequest,
    state: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorPluginSnapshot, AppError> {
    state.inner().close_editor(request)
}
// docs/12 "프로젝트 AmpliTube 톤 v1": DB·플러그인 작업이라 blocking 스레드에서 처리합니다.
#[tauri::command]
pub async fn get_project_plugin_state(
    request: PluginStateRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<ProjectPluginState, AppError> {
    request.validate()?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let stored = store.plugin_state(&request.project_id)?;
        Ok(StoredPluginState::summary(
            &request.project_id,
            stored.as_ref(),
        ))
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn save_project_plugin_state(
    request: PluginStateRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    plugin: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<ProjectPluginState, AppError> {
    request.validate()?;
    let (store, plugin) = (store.inner().clone(), plugin.inner().clone());
    tauri::async_runtime::spawn_blocking(move || {
        // 프로젝트가 없거나 휴지통이면 플러그인을 건드리기 전에 거부합니다.
        store.plugin_state(&request.project_id)?;
        let (class_id, plugin_version, state) = plugin.save_state()?;
        let stored = StoredPluginState {
            class_id,
            plugin_version,
            state,
        };
        store.save_plugin_state(&request.project_id, &stored)?;
        Ok(StoredPluginState::summary(
            &request.project_id,
            Some(&stored),
        ))
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn restore_project_plugin_state(
    request: PluginStateRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    plugin: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorPluginSnapshot, AppError> {
    request.validate()?;
    let (store, plugin) = (store.inner().clone(), plugin.inner().clone());
    tauri::async_runtime::spawn_blocking(move || {
        let stored = store.plugin_state(&request.project_id)?.ok_or_else(|| {
            AppError::new(
                "PLUGIN_STATE_NOT_FOUND",
                "이 프로젝트에 저장한 AmpliTube 톤이 없습니다.",
                true,
            )
        })?;
        plugin.restore_state(&stored.class_id, stored.state)
    })
    .await
    .map_err(|_| AppError::internal())?
}
