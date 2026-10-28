use crate::{
    ipc::AppError,
    recording::{model::record_error, service::RecordingService},
    storage::{
        audio_upload::{receive_audio, AudioUploadRequest, AudioUploads},
        jobs::{JobSnapshot, StorageJob, StorageJobs},
        project_model::{
            storage_error, validate_uuid, AssetKind, AssetStorage, ProjectMode, ScoreDocument,
            WorkspaceState,
        },
        projects::{canceled, ProjectStore},
        score_upload::ScoreUpload,
    },
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionRequest {
    schema_version: u8,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRequest {
    schema_version: u8,
    title: String,
    artist: Option<String>,
    mode: ProjectMode,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectRequest {
    schema_version: u8,
    project_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlankScoreRequest {
    schema_version: u8,
    project_id: String,
    expected_revision: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportRequest {
    schema_version: u8,
    project_id: String,
    kind: AssetKind,
    storage: AssetStorage,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetRequest {
    schema_version: u8,
    project_id: String,
    asset_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveRequest {
    schema_version: u8,
    project_id: String,
    expected_revision: u32,
    score_asset_id: String,
    score: ScoreDocument,
    workspace: WorkspaceState,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobRequest {
    schema_version: u8,
    job_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventsRequest {
    schema_version: u8,
    project_id: String,
    attempt_id: String,
    after_sequence: u64,
    through_sequence: u64,
}
fn version(value: u8) -> Result<(), AppError> {
    if value == 1 {
        Ok(())
    } else {
        Err(AppError::invalid())
    }
}
pub(super) fn launch(
    job: Arc<StorageJob>,
    work: impl FnOnce(&StorageJob) -> Result<Value, AppError> + Send + 'static,
) {
    tauri::async_runtime::spawn(async move {
        let runner = job.clone();
        let result = tauri::async_runtime::spawn_blocking(move || work(&runner))
            .await
            .unwrap_or_else(|_| Err(storage_error()));
        if job.finish(result).is_err() {
            eprintln!("GuitarLab 저장 처리 실패: STORAGE_JOB_STATUS_FAILED");
        }
    });
}
fn pick(app: &tauri::AppHandle, kind: AssetKind) -> Result<PathBuf, AppError> {
    let extensions: &[&str] = match kind {
        AssetKind::ScoreImport => &["gp", "gp3", "gp4", "gp5", "gpx", "xml", "musicxml", "json"],
        AssetKind::Original => &["wav", "mp3"],
    };
    let title = if kind == AssetKind::ScoreImport {
        "프로젝트 악보 선택"
    } else {
        "프로젝트 음원 선택"
    };
    let mut dialog = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(title, extensions);
    if let Some(parent) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&parent);
    }
    dialog
        .blocking_pick_file()
        .ok_or_else(|| AppError::new("CANCELED", "파일 선택을 취소했습니다.", false))?
        .into_path()
        .map_err(|_| AppError::invalid())
}
pub(super) fn launch_idle(
    jobs: &StorageJobs,
    recording: &Arc<RecordingService>,
    work: impl FnOnce(&AtomicBool) -> Result<Value, AppError> + Send + 'static,
) -> Result<JobSnapshot, AppError> {
    if recording.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let recording = recording.clone();
    launch(job, move |job| recording.while_idle(|| work(&job.cancel)));
    Ok(initial)
}
#[tauri::command]
pub async fn create_project(
    request: CreateRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    version(request.schema_version)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move||Ok(json!({"schemaVersion":1,"project":store.create(request.title,request.artist,request.mode)?})))
        .await.map_err(|_|storage_error())?
}
#[tauri::command]
pub async fn list_projects(
    request: VersionRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    version(request.schema_version)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(json!({"schemaVersion":1,"projects":store.list()?}))
    })
    .await
    .map_err(|_| storage_error())?
}
#[tauri::command]
pub async fn open_project(
    request: ProjectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    launch(job, move |job| {
        canceled(&job.cancel)?;
        let (project, revision, assets) = store.open(&request.project_id)?;
        canceled(&job.cancel)?;
        Ok(json!({"schemaVersion":1,"project":project,"revision":revision,"assets":assets}))
    });
    Ok(initial)
}
#[tauri::command]
pub async fn save_project_revision(
    request: SaveRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    launch(job, move |job| {
        let revision = store.save_revision(
            &request.project_id,
            request.expected_revision,
            &request.score_asset_id,
            request.score,
            request.workspace,
            &job.cancel,
        )?;
        Ok(json!({"schemaVersion":1,"revision":revision}))
    });
    Ok(initial)
}
#[tauri::command]
pub async fn pick_project_asset(
    app: tauri::AppHandle,
    request: ImportRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    let store = store.inner().clone();
    let job = jobs.start("PICKING")?;
    let initial = job.snapshot()?;
    launch(job, move |job| {
        canceled(&job.cancel)?;
        store.open(&request.project_id)?;
        let path = pick(&app, request.kind)?;
        canceled(&job.cancel)?;
        let imported = store.import_asset(
            &request.project_id,
            &path,
            request.kind,
            request.storage,
            &job.cancel,
            |done, total| job.progress(done, total),
        )?;
        Ok(json!({"schemaVersion":1,"asset":imported.asset,"duplicate":imported.duplicate}))
    });
    Ok(initial)
}

#[tauri::command]
pub async fn import_project_score_bytes(
    request: tauri::ipc::Request<'_>,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    if recording.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err(AppError::invalid());
    };
    let (metadata, bytes) = ScoreUpload::decode(body)?;
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    let bytes = bytes.to_vec();
    let store = store.inner().clone();
    let recording = recording.inner().clone();
    launch(job, move |job| {
        recording.while_idle(|| {
            let imported =
                store.import_score_upload(&metadata, &bytes, &job.cancel, |done, total| {
                    job.progress(done, total)
                })?;
            Ok(json!({"schemaVersion":1,"asset":imported.asset,"duplicate":imported.duplicate}))
        })
    });
    Ok(initial)
}
#[tauri::command]
pub async fn begin_project_audio_upload(
    request: AudioUploadRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    uploads: tauri::State<'_, Arc<AudioUploads>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(record_error("RECORDING_BUSY"));
    }
    let (job, receiver) = uploads.reserve(&jobs)?;
    let initial = job.snapshot()?;
    let id = initial.job_id.clone();
    let uploads = uploads.inner().clone();
    let store = store.inner().clone();
    let recording = recording.inner().clone();
    launch(job, move |job| {
        let result = recording.while_idle(|| receive_audio(&store, request, job, receiver));
        uploads.release(&id)?;
        let imported = result?;
        Ok(json!({"schemaVersion":1,"asset":imported.asset,"duplicate":imported.duplicate}))
    });
    Ok(initial)
}

#[tauri::command]
pub async fn append_project_audio_upload(
    request: tauri::ipc::Request<'_>,
    uploads: tauri::State<'_, Arc<AudioUploads>>,
) -> Result<Value, AppError> {
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err(AppError::invalid());
    };
    if body.len() <= 44 || body.len() > 1048576 + 44 {
        return Err(AppError::invalid());
    }
    let body = body.clone();
    let uploads = uploads.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (id, done) = uploads.append(body)?;
        Ok(json!({"schemaVersion":1,"jobId":id,"receivedBytes":done}))
    })
    .await
    .map_err(|_| storage_error())?
}

#[tauri::command]
pub async fn create_blank_project_score(
    request: BlankScoreRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    launch(job, move |job| {
        let asset = store.create_blank_score(
            &request.project_id,
            request.expected_revision,
            &job.cancel,
            |done, total| job.progress(done, total),
        )?;
        Ok(json!({"schemaVersion":1,"asset":asset}))
    });
    Ok(initial)
}
#[tauri::command]
pub async fn relink_project_asset(
    app: tauri::AppHandle,
    request: AssetRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    validate_uuid(&request.asset_id)?;
    let store = store.inner().clone();
    let job = jobs.start("PICKING")?;
    let initial = job.snapshot()?;
    launch(job, move |job| {
        canceled(&job.cancel)?;
        let asset = store
            .assets(&request.project_id)?
            .into_iter()
            .find(|asset| asset.id == request.asset_id)
            .ok_or_else(AppError::invalid)?;
        let path = pick(&app, asset.kind)?;
        job.progress(0, asset.bytes)?;
        let relinked = store.relink(
            &request.project_id,
            &request.asset_id,
            &path,
            &job.cancel,
            |done, total| job.progress(done, total),
        )?;
        job.progress(asset.bytes, asset.bytes)?;
        Ok(json!({"schemaVersion":1,"asset":relinked}))
    });
    Ok(initial)
}
#[tauri::command]
pub async fn read_project_asset(
    request: AssetRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    validate_uuid(&request.asset_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    launch(job, move |job| {
        canceled(&job.cancel)?;
        let asset = store
            .assets(&request.project_id)?
            .into_iter()
            .find(|asset| asset.id == request.asset_id)
            .ok_or_else(AppError::invalid)?;
        let bytes = store.read_asset(
            &request.project_id,
            &request.asset_id,
            &job.cancel,
            |done, total| job.progress(done, total),
        )?;
        job.set_binary(bytes)?;
        Ok(json!({"schemaVersion":1,"name":asset.name,"bytes":asset.bytes}))
    });
    Ok(initial)
}
#[tauri::command]
pub fn get_storage_job(
    request: JobRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    jobs.snapshot(&request.job_id)
}
#[tauri::command]
pub fn cancel_storage_job(
    request: JobRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    version(request.schema_version)?;
    jobs.cancel(&request.job_id)
}
#[tauri::command]
pub fn take_storage_bytes(
    request: JobRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<tauri::ipc::Response, AppError> {
    version(request.schema_version)?;
    Ok(tauri::ipc::Response::new(
        jobs.take_binary(&request.job_id)?,
    ))
}
#[tauri::command]
pub async fn list_practice_records(
    request: ProjectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(json!({"schemaVersion":1,"attempts":store.attempts(&request.project_id)?}))
    })
    .await
    .map_err(|_| storage_error())?
}
#[tauri::command]
pub async fn list_practice_events(
    request: EventsRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    version(request.schema_version)?;
    validate_uuid(&request.project_id)?;
    validate_uuid(&request.attempt_id)?;
    if request.after_sequence > super::super::storage::project_model::MAX_SAFE {
        return Err(AppError::invalid());
    }
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move||Ok(json!({"schemaVersion":1,"events":store.events_through(&request.project_id,&request.attempt_id,request.after_sequence,request.through_sequence)?}))).await.map_err(|_|storage_error())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contract_rejects_paths_unknown_fields_wrong_types_and_versions() {
        for value in [
            json!({"schemaVersion":1,"projectId":"../escape","kind":"ORIGINAL","storage":"MANAGED","sourcePath":"C:/private.wav"}),
            json!({"schemaVersion":1,"projectId":"p","kind":["ORIGINAL"],"storage":"MANAGED"}),
            json!({"schemaVersion":1,"projectId":"p","kind":"ORIGINAL","storage":"UNKNOWN"}),
        ] {
            assert!(serde_json::from_value::<ImportRequest>(value).is_err());
        }
        assert!(version(2).is_err());
        assert!(validate_uuid("../../private").is_err());
        let request: JobRequest = serde_json::from_value(
            json!({"schemaVersion":1,"jobId":uuid::Uuid::new_v4().to_string()}),
        )
        .expect("정상 계약");
        assert!(version(request.schema_version).is_ok());
        assert!(validate_uuid(&request.job_id).is_ok());
        let blank = json!({"schemaVersion":1,"projectId":uuid::Uuid::new_v4().to_string(),"expectedRevision":0});
        assert!(serde_json::from_value::<BlankScoreRequest>(blank.clone()).is_ok());
        for (field, value) in [
            ("sourcePath", json!("C:/private.musicxml")),
            ("xml", json!("<score/>")),
            ("expectedRevision", json!(-1)),
            ("expectedRevision", json!(0.5)),
            ("expectedRevision", json!("0")),
        ] {
            let mut invalid = blank.clone();
            invalid[field] = value;
            assert!(serde_json::from_value::<BlankScoreRequest>(invalid).is_err());
        }
    }
}
