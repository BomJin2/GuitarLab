use crate::judgement::recorded_pitches::{
    analyze_recording, analyze_recording_track, RecordedPitchesRequest,
};
use crate::{
    ipc::AppError,
    recording::{
        model::{record_error, RecordedTake, StartRecordingRequest},
        service::{RecordingService, RecordingSnapshot},
    },
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::{storage_error, validate_uuid},
        projects::ProjectStore,
    },
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

#[tauri::command]
pub async fn analyze_recording_pitches(
    request: RecordedPitchesRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    service: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if service.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let result = analyze_recording(&store, request, &job.cancel, |done, total| {
            job.progress(done, total)
        })?;
        serde_json::to_value(result).map_err(|_| storage_error())
    });
    Ok(initial)
}

#[tauri::command]
pub async fn analyze_recording_pitch_track(
    request: RecordedPitchesRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    service: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if service.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let result = analyze_recording_track(&store, request, &job.cancel, |done, total| {
            job.progress(done, total)
        })?;
        serde_json::to_value(result).map_err(|_| storage_error())
    });
    Ok(initial)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionRequest {
    schema_version: u8,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StopRequest {
    schema_version: u8,
    take_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectRequest {
    schema_version: u8,
    project_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TakeRequest {
    schema_version: u8,
    project_id: String,
    take_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateRequest {
    schema_version: u8,
    project_id: String,
    take_id: String,
    name: String,
    memo: String,
    alignment_offset_ms: f64,
}
fn version(version: u8) -> Result<(), AppError> {
    if version == 1 {
        Ok(())
    } else {
        Err(AppError::invalid())
    }
}

#[tauri::command]
pub async fn start_recording(
    request: StartRecordingRequest,
    service: tauri::State<'_, Arc<RecordingService>>,
) -> Result<RecordingSnapshot, AppError> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.start(request))
        .await
        .map_err(|_| record_error("RECORDING_WORKER_FAILED"))?
}
#[tauri::command]
pub async fn get_recording(
    request: VersionRequest,
    service: tauri::State<'_, Arc<RecordingService>>,
) -> Result<RecordingSnapshot, AppError> {
    version(request.schema_version)?;
    service.snapshot()
}
#[tauri::command]
pub async fn stop_recording(
    request: StopRequest,
    service: tauri::State<'_, Arc<RecordingService>>,
) -> Result<RecordingSnapshot, AppError> {
    version(request.schema_version)?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.stop(&request.take_id))
        .await
        .map_err(|_| record_error("RECORDING_WORKER_FAILED"))?
}
#[tauri::command]
pub async fn list_recordings(
    request: ProjectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    version(request.schema_version)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(json!({"schemaVersion":1,"takes":store.recordings(&request.project_id)?}))
    })
    .await
    .map_err(|_| storage_error())?
}
#[tauri::command]
pub async fn read_recording(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    validate_uuid(&request.take_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let bytes = store.recording_bytes(&request.project_id, &request.take_id, &job.cancel)?;
        let length = bytes.len();
        job.progress(length as u64, length as u64)?;
        job.set_binary(bytes)?;
        Ok(
            json!({"schemaVersion":1,"projectId":request.project_id,"takeId":request.take_id,"bytes":length}),
        )
    });
    Ok(initial)
}
#[tauri::command]
pub async fn recover_recording(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    service: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    validate_uuid(&request.take_id)?;
    if service.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let take = store.recover_recording(
            &request.project_id,
            &request.take_id,
            &job.cancel,
            |n, total| job.progress(n * 4, total * 4),
        )?;
        Ok(json!({"schemaVersion":1,"take":take}))
    });
    Ok(initial)
}
#[tauri::command]
pub async fn get_recording_revision(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    version(request.schema_version)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move|| {
        let take=store.take(&request.project_id,&request.take_id)?;
        Ok(json!({"schemaVersion":1,"revision":store.revision(&take.project_id,&take.score_revision_id)?}))
    }).await.map_err(|_|storage_error())?
}
#[tauri::command]
pub async fn update_recording(
    request: UpdateRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<RecordedTake, AppError> {
    version(request.schema_version)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.update_recording(
            &request.project_id,
            &request.take_id,
            request.name,
            request.memo,
            request.alignment_offset_ms,
        )
    })
    .await
    .map_err(|_| storage_error())?
}
