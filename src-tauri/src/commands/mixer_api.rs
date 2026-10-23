use crate::{
    ipc::AppError,
    mixer::{
        export,
        model::{mix_error, MixDocument},
        render,
    },
    recording::service::RecordingService,
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::{storage_error, validate_uuid},
        projects::{canceled, ProjectStore},
    },
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectRequest {
    schema_version: u8,
    project_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportRequest {
    schema_version: u8,
    mix: MixDocument,
    local_rights_confirmed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StemRequest {
    schema_version: u8,
    project_id: String,
    asset_id: String,
    stem_id: String,
}
impl StemRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.asset_id)?;
        validate_uuid(&self.stem_id)
    }
}

#[tauri::command]
pub async fn read_project_stem(
    request: StemRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(mix_error("RECORDING_BUSY"));
    }
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let bytes = crate::ai::stem_store::read_stem(
            &store,
            &request.project_id,
            &request.stem_id,
            Some(&request.asset_id),
            &job.cancel,
        )?;
        canceled(&job.cancel)?;
        let length = bytes.len();
        job.progress(length as u64, length as u64)?;
        job.set_binary(bytes)?;
        Ok(
            json!({"schemaVersion":1,"projectId":request.project_id,"assetId":request.asset_id,"stemId":request.stem_id,"bytes":length}),
        )
    });
    Ok(initial)
}

#[tauri::command]
pub async fn get_project_mix(
    request: ProjectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    validate_uuid(&request.project_id)?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(json!({"schemaVersion":1,"mix":store.mix(&request.project_id)?}))
    })
    .await
    .map_err(|_| storage_error())?
}
#[tauri::command]
pub async fn save_project_mix(
    request: MixDocument,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    request.validate()?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.save_mix(&request)?;
        Ok(json!({"schemaVersion":1,"mix":request}))
    })
    .await
    .map_err(|_| storage_error())?
}
#[tauri::command]
pub async fn render_project_mix(
    request: MixDocument,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    if recording.is_active() {
        return Err(mix_error("RECORDING_BUSY"));
    }
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let (bytes, stats) = render::render(&store, &request, &job.cancel, |n, total| {
            job.progress(n, total)
        })?;
        canceled(&job.cancel)?;
        job.set_binary(bytes)?;
        serde_json::to_value(stats).map_err(|_| storage_error())
    });
    Ok(initial)
}
#[tauri::command]
pub async fn export_project_mix(
    app: tauri::AppHandle,
    request: ExportRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.mix.validate()?;
    if request.schema_version != 1 || !request.local_rights_confirmed {
        return Err(AppError::invalid());
    }
    if recording.is_active() {
        return Err(mix_error("RECORDING_BUSY"));
    }
    let store = store.inner().clone();
    let job = jobs.start("PICKING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        canceled(&job.cancel)?;
        render::validate_sources(&store, &request.mix, &job.cancel)?;
        let mut picker = app
            .dialog()
            .file()
            .set_title("새 로컬 믹스 WAV 저장")
            .add_filter("WAV", &["wav"])
            .set_file_name("GuitarLab-mix.wav");
        if let Some(parent) = app.get_webview_window("main") {
            picker = picker.set_parent(&parent);
        }
        let path = picker
            .blocking_save_file()
            .ok_or_else(|| AppError::new("CANCELED", "믹스 내보내기를 취소했습니다.", false))?
            .into_path()
            .map_err(|_| AppError::invalid())?;
        canceled(&job.cancel)?;
        let (bytes, stats) = render::render(&store, &request.mix, &job.cancel, |n, total| {
            job.progress(n, total)
        })?;
        export::save_new_wav(&path, &bytes, &job.cancel)?;
        serde_json::to_value(stats).map_err(|_| storage_error())
    });
    Ok(initial)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stem_request_rejects_versions_paths_unknown_fields_and_bad_ids() {
        let id = uuid::Uuid::new_v4().to_string();
        let value = json!({"schemaVersion":1,"projectId":id,"assetId":id,"stemId":id});
        serde_json::from_value::<StemRequest>(value.clone())
            .expect("계약")
            .validate()
            .expect("UUID");
        for (key, replacement) in [
            ("schemaVersion", json!(2)),
            ("projectId", json!("../project")),
            ("assetId", json!("bad")),
            ("stemId", json!("C:/arbitrary.wav")),
        ] {
            let mut invalid = value.clone();
            invalid[key] = replacement;
            let request: StemRequest = serde_json::from_value(invalid).expect("타입");
            assert!(request.validate().is_err());
        }
        let mut unknown = value;
        unknown["path"] = json!("arbitrary");
        assert!(serde_json::from_value::<StemRequest>(unknown).is_err());
    }
}
