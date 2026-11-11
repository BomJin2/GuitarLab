//! docs/12 "테이크 Freeze v1"
use crate::{
    ipc::AppError,
    plugins::{render::stereo_wav, MonitorPluginService, MonitorPluginSnapshot},
    storage::{
        jobs::{JobSnapshot, StorageJobs},
        project_model::validate_uuid,
        projects::{now_ms, ProjectStore},
        take_renders::TakeRender,
    },
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

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
impl TakeRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.take_id)
    }
}
/// 테이크 DI 디코딩 상한(10분·192kHz mono float).
const DECODE_BUDGET: usize = 600 * 192_000 * 4;

#[tauri::command]
pub async fn list_take_freezes(
    request: ProjectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let freezes = store.take_freezes(&request.project_id)?;
        Ok(json!({"schemaVersion":1,"projectId":request.project_id,"freezes":freezes}))
    })
    .await
    .map_err(|_| AppError::internal())?
}
/// 테이크 DI를 지금 AmpliTube 톤으로 오프라인 처리해 (메타데이터, WAV, 톤)을 만듭니다(Freeze·Bounce 공통).
fn render_take_now(
    store: &ProjectStore,
    plugin: &MonitorPluginService,
    project_id: &str,
    take_id: &str,
    kind: &str,
    job: &crate::storage::jobs::StorageJob,
) -> Result<(TakeRender, Vec<u8>, Vec<u8>), AppError> {
    let take_sha256 = store.ready_take_sha(project_id, take_id)?;
    let bytes = store.recording_bytes(project_id, take_id, &job.cancel)?;
    let mut budget = DECODE_BUDGET;
    let pcm = crate::mixer::pcm::decode(&bytes, &mut budget, &job.cancel)?;
    drop(bytes);
    let rate = pcm.rate;
    let out = plugin.render_take(pcm.samples, rate, &job.cancel, |done, total| {
        let _ = job.progress(done, total);
    })?;
    // 다시 읽고 내보낼 수 있는 크기만 만듭니다(작업 전송 한도 256MiB).
    if 44 + out.rendered.left.len() * 8 > crate::storage::take_renders::MAX_RENDER_BYTES {
        return Err(crate::storage::take_renders::too_large());
    }
    let wav = stereo_wav(&out.rendered.left, &out.rendered.right, rate);
    let frames = out.rendered.left.len() as u64;
    let meta = TakeRender {
        schema_version: 1,
        id: Uuid::new_v4().to_string(),
        project_id: project_id.into(),
        take_id: take_id.into(),
        kind: kind.into(),
        sample_rate: rate,
        channels: 2,
        frames,
        duration_ms: frames as f64 * 1000.0 / f64::from(rate),
        bytes: wav.len(),
        sha256: crate::storage::projects::hash(&wav),
        take_sha256,
        plugin_class_id: out.class_id,
        plugin_version: out.plugin_version,
        latency_frames: out.latency_frames,
        tail_frames: out.rendered.tail_frames,
        created_at_ms: now_ms()? as u64,
    };
    Ok((meta, wav, out.state))
}
#[tauri::command]
pub async fn freeze_take(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    plugin: tauri::State<'_, Arc<MonitorPluginService>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    let (store, plugin) = (store.inner().clone(), plugin.inner().clone());
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let (meta, wav, state) = render_take_now(
            &store,
            &plugin,
            &request.project_id,
            &request.take_id,
            "FREEZE",
            job,
        )?;
        store.save_take_freeze(&meta, &wav, &state, &job.cancel)?;
        serde_json::to_value(&meta).map_err(|_| AppError::internal())
    });
    Ok(initial)
}
/// docs/12 "Bounce to New Track v1": Freeze돼 있으면 들리는 그대로(캐시·톤) 복사, 아니면 지금 톤으로 렌더합니다.
#[tauri::command]
pub async fn bounce_take(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    plugin: tauri::State<'_, Arc<MonitorPluginService>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    let (store, plugin) = (store.inner().clone(), plugin.inner().clone());
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let frozen = store
            .take_freezes(&request.project_id)?
            .into_iter()
            .any(|f| f.take_id == request.take_id);
        let (meta, wav, state) = if frozen {
            let (mut meta, wav) =
                store.read_take_freeze(&request.project_id, &request.take_id, &job.cancel)?;
            let (_, state) = store.take_freeze_state(&request.project_id, &request.take_id)?;
            meta.id = Uuid::new_v4().to_string();
            meta.kind = "BOUNCE".into();
            meta.created_at_ms = now_ms()? as u64;
            (meta, wav, state)
        } else {
            render_take_now(
                &store,
                &plugin,
                &request.project_id,
                &request.take_id,
                "BOUNCE",
                job,
            )?
        };
        store.save_take_bounce(&meta, &wav, &state, &job.cancel)?;
        serde_json::to_value(&meta).map_err(|_| AppError::internal())
    });
    Ok(initial)
}
#[tauri::command]
pub async fn list_take_bounces(
    request: ProjectRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let bounces = store.take_bounces(&request.project_id)?;
        Ok(json!({"schemaVersion":1,"projectId":request.project_id,"bounces":bounces}))
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderRequest {
    schema_version: u8,
    project_id: String,
    render_id: String,
}
#[tauri::command]
pub async fn read_take_bounce(
    request: RenderRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    validate_uuid(&request.project_id)?;
    validate_uuid(&request.render_id)?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let (_, bytes) =
            store.read_take_bounce(&request.project_id, &request.render_id, &job.cancel)?;
        let length = bytes.len();
        job.progress(length as u64, length as u64)?;
        job.set_binary(bytes)?;
        Ok(
            json!({"schemaVersion":1,"projectId":request.project_id,"renderId":request.render_id,"bytes":length}),
        )
    });
    Ok(initial)
}
#[tauri::command]
pub async fn read_take_freeze(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    let store = store.inner().clone();
    let job = jobs.start("RUNNING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        let (_, bytes) =
            store.read_take_freeze(&request.project_id, &request.take_id, &job.cancel)?;
        let length = bytes.len();
        job.progress(length as u64, length as u64)?;
        job.set_binary(bytes)?;
        Ok(
            json!({"schemaVersion":1,"projectId":request.project_id,"takeId":request.take_id,"bytes":length}),
        )
    });
    Ok(initial)
}
/// docs/12 "처리된 소리 내보내기 v1"
#[tauri::command]
pub async fn export_take_freeze(
    app: tauri::AppHandle,
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    service: tauri::State<'_, Arc<crate::recording::service::RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    request.validate()?;
    let busy = || crate::recording::model::record_error("RECORDING_BUSY");
    if service.is_active() {
        return Err(busy());
    }
    let (store, service) = (store.inner().clone(), service.inner().clone());
    let job = jobs.start("PICKING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        crate::storage::projects::canceled(&job.cancel)?;
        let mut picker = app
            .dialog()
            .file()
            .set_title("처리된 소리(AmpliTube Freeze) WAV를 새 파일로 저장")
            .add_filter("WAV", &["wav"])
            .set_file_name("GuitarLab-take-processed.wav");
        if let Some(parent) = app.get_webview_window("main") {
            picker = picker.set_parent(&parent);
        }
        let path = picker
            .blocking_save_file()
            .ok_or_else(|| AppError::new("CANCELED", "내보내기를 취소했습니다.", false))?
            .into_path()
            .map_err(|_| AppError::invalid())?;
        crate::storage::projects::canceled(&job.cancel)?;
        if service.is_active() {
            return Err(busy());
        }
        let result = store.export_take_freeze(
            &request.project_id,
            &request.take_id,
            &path,
            &job.cancel,
            |n, total| job.progress(n, total),
        )?;
        serde_json::to_value(result).map_err(|_| AppError::internal())
    });
    Ok(initial)
}
/// docs/12 "Bounce 삭제·관리 v1"
#[tauri::command]
pub async fn delete_take_bounce(
    request: RenderRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let removed = store.delete_take_bounce(&request.project_id, &request.render_id)?;
        Ok(json!({"schemaVersion":1,"projectId":request.project_id,"renderId":request.render_id,"removed":removed}))
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn unfreeze_take(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
) -> Result<Value, AppError> {
    request.validate()?;
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let removed = store.unfreeze_take(&request.project_id, &request.take_id)?;
        Ok(json!({"schemaVersion":1,"projectId":request.project_id,"takeId":request.take_id,"removed":removed}))
    })
    .await
    .map_err(|_| AppError::internal())?
}
#[tauri::command]
pub async fn restore_take_freeze_tone(
    request: TakeRequest,
    store: tauri::State<'_, Arc<ProjectStore>>,
    plugin: tauri::State<'_, Arc<MonitorPluginService>>,
) -> Result<MonitorPluginSnapshot, AppError> {
    request.validate()?;
    let (store, plugin) = (store.inner().clone(), plugin.inner().clone());
    tauri::async_runtime::spawn_blocking(move || {
        let (class_id, state) = store.take_freeze_state(&request.project_id, &request.take_id)?;
        plugin.restore_state(&class_id, state)
    })
    .await
    .map_err(|_| AppError::internal())?
}
