use crate::audio::clock::{ClockDiagnostic, ClockRequest};
use crate::judgement::calibration_measurement::{
    MeasurementRequest, MeasurementService, MeasurementSnapshot, SaveMeasurementRequest,
    StartMeasurementRequest,
};
use crate::judgement::practice::{
    AttemptRequest, AttemptSnapshot, PracticeService, StartAttemptRequest,
};
use crate::storage::calibration::{ProfileDocument, ProfileStore, SaveManualRequest};
use crate::{
    audio::{self, AudioService, AudioSnapshot, DeviceList, InputClock, InputRequest, StopRequest},
    ipc::AppError,
};
use std::sync::Arc;
pub mod ai_api;
pub mod backup_api;
pub mod cache_cleanup_api;
pub mod close_api;
pub mod diagnostics_api;
pub mod mixer_api;
pub mod project_metadata_api;
pub mod project_purge_api;
pub mod project_trash_api;
pub mod recording_api;
pub mod score_api;
pub mod score_history_api;
pub mod youtube_api;

#[tauri::command]
pub async fn start_practice_attempt(
    request: StartAttemptRequest,
    state: tauri::State<'_, Arc<PracticeService>>,
    audio: tauri::State<'_, Arc<AudioService>>,
    store: tauri::State<'_, Arc<ProfileStore>>,
) -> Result<AttemptSnapshot, AppError> {
    let service = state.inner().clone();
    let audio = audio.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.start(request, &audio, &store))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn get_practice_attempt(
    request: AttemptRequest,
    state: tauri::State<'_, Arc<PracticeService>>,
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<AttemptSnapshot, AppError> {
    let service = state.inner().clone();
    let audio = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.poll(request, &audio))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn stop_practice_attempt(
    request: AttemptRequest,
    state: tauri::State<'_, Arc<PracticeService>>,
) -> Result<AttemptSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.stop(request))
        .await
        .map_err(|_| AppError::internal())?
}

#[tauri::command]
pub async fn start_calibration_measurement(
    request: StartMeasurementRequest,
    state: tauri::State<'_, Arc<MeasurementService>>,
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<MeasurementSnapshot, AppError> {
    let service = state.inner().clone();
    let audio = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.start(request, &audio))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn get_calibration_measurement(
    request: MeasurementRequest,
    state: tauri::State<'_, Arc<MeasurementService>>,
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<MeasurementSnapshot, AppError> {
    let service = state.inner().clone();
    let audio = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.poll(request, &audio))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn cancel_calibration_measurement(
    request: MeasurementRequest,
    state: tauri::State<'_, Arc<MeasurementService>>,
) -> Result<MeasurementSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.cancel(request))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn save_measured_calibration(
    request: SaveMeasurementRequest,
    state: tauri::State<'_, Arc<MeasurementService>>,
    audio: tauri::State<'_, Arc<AudioService>>,
    store: tauri::State<'_, Arc<ProfileStore>>,
) -> Result<ProfileDocument, AppError> {
    let service = state.inner().clone();
    let audio = audio.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.save(request, &audio, &store))
        .await
        .map_err(|_| AppError::internal())?
}

#[tauri::command]
pub async fn list_input_calibrations(
    store: tauri::State<'_, Arc<ProfileStore>>,
) -> Result<ProfileDocument, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.list())
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn save_input_calibration(
    request: SaveManualRequest,
    state: tauri::State<'_, Arc<AudioService>>,
    store: tauri::State<'_, Arc<ProfileStore>>,
) -> Result<ProfileDocument, AppError> {
    let service = state.inner().clone();
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let key = service.profile_key(
            request.monitor_environment,
            request.expected_stream_generation,
        )?;
        store.save_manual(key, request)
    })
    .await
    .map_err(|_| AppError::internal())?
}

#[tauri::command]
pub async fn list_audio_devices() -> Result<DeviceList, AppError> {
    tauri::async_runtime::spawn_blocking(audio::list_devices)
        .await
        .map_err(|_| AppError::internal())?
}

#[tauri::command]
pub async fn update_capture_clock(
    request: ClockRequest,
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<ClockDiagnostic, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.update_clock(request))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn start_audio_input(
    request: InputRequest,
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<AudioSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.start(request))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn stop_audio_input(
    request: StopRequest,
    state: tauri::State<'_, Arc<AudioService>>,
    recording: tauri::State<'_, Arc<crate::recording::service::RecordingService>>,
) -> Result<AudioSnapshot, AppError> {
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음 STOP과 저장을 마친 뒤 입력을 중단하세요.",
            true,
        ));
    }
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.stop(request))
        .await
        .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn get_audio_snapshot(
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<AudioSnapshot, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.snapshot())
        .await
        .map_err(|_| AppError::internal())?
}

#[tauri::command]
pub async fn get_audio_clock(
    state: tauri::State<'_, Arc<AudioService>>,
) -> Result<InputClock, AppError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.clock())
        .await
        .map_err(|_| AppError::internal())?
}
pub mod backing_api;
pub mod imported_stem_api;
pub mod monitor_api;
pub mod storage_api;
pub mod youtube_sync_api;
