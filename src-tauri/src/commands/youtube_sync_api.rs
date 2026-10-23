use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        projects::ProjectStore,
        youtube_sync::{ProjectYoutubeSync, YoutubeSyncKey},
    },
};
use std::sync::Arc;

#[tauri::command]
pub async fn get_youtube_sync(
    request: YoutubeSyncKey,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let snapshot = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        serde_json::to_value(store.youtube_sync(&request, &job.cancel)?)
            .map_err(|_| AppError::internal())
    });
    Ok(snapshot)
}

#[tauri::command]
pub async fn save_youtube_sync(
    request: ProjectYoutubeSync,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음 STOP과 저장 후 영상 맞춤을 저장하세요.",
            true,
        ));
    }
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let snapshot = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        store.save_youtube_sync(&request, &job.cancel)?;
        serde_json::to_value(request).map_err(|_| AppError::internal())
    });
    Ok(snapshot)
}
