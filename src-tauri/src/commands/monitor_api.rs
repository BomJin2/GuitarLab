use crate::{
    audio::{
        monitor::{
            list_outputs, MonitorBypassRequest, MonitorRequest, MonitorSnapshot,
            MonitorVolumeRequest,
        },
        monitor_playback::{LoadPlaybackRequest, MonitorPlaybackSnapshot, SetPlaybackRequest},
        AudioService, DeviceList, StopRequest,
    },
    ipc::AppError,
    plugins::MonitorPluginService,
    storage::{project_model::validate_uuid, projects::ProjectStore},
};
use std::sync::{atomic::AtomicBool, Arc};

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
    plugins: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorSnapshot, AppError> {
    let service = state.inner().clone();
    let plugins = plugins.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let amplitube = request.insert == Some(crate::audio::monitor::InsertKind::Amplitube);
        service.start_monitor_with(request, |rate| {
            if amplitube {
                plugins.take_insert(rate)
            } else {
                Ok(Box::new(crate::audio::monitor::DryInsert))
            }
        })
    })
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
/// docs/12 "AmpliTube FX 랙·실시간 Bypass v1"
#[tauri::command]
pub async fn set_input_monitor_bypass(
    request: MonitorBypassRequest,
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<MonitorSnapshot, AppError> {
    state.inner().set_monitor_bypass(request)
}
/// docs/12 "모니터 테이크 재생 v1": 테이크 DI를 읽기만 해 AmpliTube 모니터에 올립니다.
#[tauri::command]
pub async fn load_monitor_playback(
    request: LoadPlaybackRequest,
    state: tauri::State<'_, Arc<AudioService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<MonitorPlaybackSnapshot, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    validate_uuid(&request.project_id)?;
    if let Some(take_id) = &request.take_id {
        validate_uuid(take_id)?;
    }
    let service = state.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(take_id) = request.take_id else {
            return service.load_monitor_playback(None, None);
        };
        // 파일을 읽기 전에 모니터 세션·샘플레이트를 잡아 두고, 올릴 때 같은 잠금 안에서 다시 확인합니다.
        let target = service.with_monitor(|m| m.playback_target())??;
        let rate = target.0;
        let cancel = AtomicBool::new(false);
        let bytes = store.recording_bytes(&request.project_id, &take_id, &cancel)?;
        let mut budget = PLAYBACK_BUDGET;
        let pcm = crate::mixer::pcm::decode(&bytes, &mut budget, &cancel)?;
        if pcm.rate != rate {
            return Err(AppError::new(
                "PLAYBACK_RATE_MISMATCH",
                "테이크와 모니터의 샘플레이트가 다릅니다.",
                false,
            ));
        }
        service.with_monitor(|m| m.load_playback_for(target, take_id, pcm.samples))?
    })
    .await
    .map_err(|_| AppError::internal())?
}
/// 10분·192kHz mono float(약 442MB)보다 작게 둡니다. 실제 길이 제한은 decode의 10분입니다.
const PLAYBACK_BUDGET: usize = 600 * 192_000 * 4;
#[tauri::command]
pub async fn set_monitor_playback(
    request: SetPlaybackRequest,
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<MonitorPlaybackSnapshot, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.set_monitor_playback(request.playing, request.position_ms)
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn get_monitor_playback(
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<MonitorPlaybackSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.monitor_playback())
        .await
        .map_err(|_| AppError::internal())?
}
