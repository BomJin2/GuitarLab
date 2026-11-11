//! docs/12 "모니터 AmpliTube 삽입 v1": 사용자가 설치한 AmpliTube 5 VST3 인스턴스 하나를 앱 안에서 호스팅합니다.
//! COM 객체는 만든 스레드에서 해제해야 하므로 로드·해제·에디터 창은 오래 사는 플러그인 소유 스레드가 맡습니다.
pub mod dsp;
pub mod render;

use crate::{audio::monitor::MonitorInsert, ipc::AppError};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use vst3_host::{audio::SpeakerArrangement, Plugin, PluginWindow, Vst3Host};

type Shared = Arc<Mutex<Plugin>>;

#[derive(Clone, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MonitorPluginSnapshot {
    pub schema_version: u8,
    pub state: &'static str,
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub version: Option<String>,
    pub class_id: Option<String>,
    pub sample_rate: Option<u32>,
    pub latency_frames: Option<u32>,
    pub in_use: bool,
    pub editor_open: bool,
    pub error_code: Option<&'static str>,
}
impl Default for MonitorPluginSnapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            state: "NONE",
            name: None,
            vendor: None,
            version: None,
            class_id: None,
            sample_rate: None,
            latency_frames: None,
            in_use: false,
            editor_open: false,
            error_code: None,
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadPluginRequest {
    pub schema_version: u8,
    pub sample_rate: u32,
}
/// 해제·에디터 열기/닫기가 함께 쓰는 버전만 있는 요청.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnloadPluginRequest {
    pub schema_version: u8,
}

struct Loaded {
    snapshot: MonitorPluginSnapshot,
    plugin: Plugin,
}
type EditorReply = mpsc::Sender<Result<(), &'static str>>;
type StateReply = mpsc::Sender<Result<Vec<u8>, &'static str>>;
/// (렌더 결과, 플러그인 지연, 렌더에 쓴 상태 봉투)
type RenderReply = mpsc::Sender<Result<(render::Rendered, u32, Vec<u8>), &'static str>>;
/// docs/12 "테이크 Freeze v1": 소유 스레드에서 오프라인 렌더할 일.
struct RenderCommand {
    input: Vec<f32>,
    sample_rate: u32,
    cancel: Arc<AtomicBool>,
    progress: Arc<AtomicU64>,
    reply: RenderReply,
}
/// 렌더 결과와 렌더에 쓴 톤(상태 봉투)·플러그인 정보.
pub struct TakeRenderOutput {
    pub rendered: render::Rendered,
    pub latency_frames: u32,
    pub class_id: String,
    pub plugin_version: String,
    pub state: Vec<u8>,
}
enum OwnerCommand {
    Load(u32),
    OpenEditor(EditorReply),
    CloseEditor,
    SaveState(StateReply),
    LoadState(Vec<u8>, EditorReply),
    Render(Box<RenderCommand>),
    Teardown,
}
#[derive(Default)]
struct Inner {
    snapshot: MonitorPluginSnapshot,
    plugin: Option<Shared>,
    owner: Option<mpsc::Sender<OwnerCommand>>,
    /// 오프라인 렌더 중이면 모니터 시작·해제·다른 렌더를 막습니다.
    rendering: bool,
}

#[derive(Default)]
pub struct MonitorPluginService {
    inner: Arc<Mutex<Inner>>,
}
fn plugin_error(code: &'static str, message: &'static str) -> AppError {
    AppError::new(code, message, true)
}
fn not_ready() -> AppError {
    plugin_error("PLUGIN_NOT_READY", "AmpliTube를 먼저 불러오세요.")
}
/// 소유 스레드의 상태 저장·복원 답을 기다립니다(로드 중이면 그 뒤에 처리됨).
fn answer_of<T>(answer: mpsc::Receiver<Result<T, &'static str>>) -> Result<T, AppError> {
    match answer.recv_timeout(Duration::from_secs(60)) {
        Ok(Ok(value)) => Ok(value),
        Ok(Err("PLUGIN_NOT_READY")) => Err(not_ready()),
        _ => Err(plugin_error(
            "PLUGIN_STATE_FAILED",
            "AmpliTube 톤을 저장하거나 불러오지 못했습니다.",
        )),
    }
}
impl MonitorPluginService {
    pub fn snapshot(&self) -> Result<MonitorPluginSnapshot, AppError> {
        Ok(self
            .inner
            .lock()
            .map_err(|_| AppError::internal())?
            .snapshot
            .clone())
    }
    pub fn load(&self, request: LoadPluginRequest) -> Result<MonitorPluginSnapshot, AppError> {
        if request.schema_version != 1 || !(8000..=192_000).contains(&request.sample_rate) {
            return Err(AppError::invalid());
        }
        let mut inner = self.inner.lock().map_err(|_| AppError::internal())?;
        if matches!(inner.snapshot.state, "LOADING" | "READY") {
            return Ok(inner.snapshot.clone());
        }
        if inner.owner.is_none() {
            inner.owner = Some(spawn_owner(self.inner.clone()));
        }
        inner
            .owner
            .as_ref()
            .ok_or_else(AppError::internal)?
            .send(OwnerCommand::Load(request.sample_rate))
            .map_err(|_| AppError::internal())?;
        inner.snapshot = MonitorPluginSnapshot {
            state: "LOADING",
            sample_rate: Some(request.sample_rate),
            ..MonitorPluginSnapshot::default()
        };
        Ok(inner.snapshot.clone())
    }
    pub fn unload(&self, request: UnloadPluginRequest) -> Result<MonitorPluginSnapshot, AppError> {
        if request.schema_version != 1 {
            return Err(AppError::invalid());
        }
        let mut inner = self.inner.lock().map_err(|_| AppError::internal())?;
        if inner.snapshot.in_use {
            return Err(plugin_error(
                "PLUGIN_IN_USE",
                "모니터를 끈 뒤 AmpliTube를 해제하세요.",
            ));
        }
        if inner.snapshot.state == "LOADING" || inner.rendering {
            return Err(plugin_error(
                "PLUGIN_BUSY",
                "AmpliTube가 다른 작업 중입니다. 끝난 뒤 해제하세요.",
            ));
        }
        // 소유 스레드도 참조를 들고 있으므로 여기서 놓아도 해제는 소유 스레드에서 일어납니다.
        drop(inner.plugin.take());
        inner.snapshot.editor_open = false;
        if let Some(owner) = &inner.owner {
            let _ = owner.send(OwnerCommand::Teardown);
        }
        inner.snapshot = MonitorPluginSnapshot::default();
        Ok(inner.snapshot.clone())
    }
    /// docs/12 "AmpliTube 에디터 창 v1": 소유 스레드가 창을 만들 때까지 기다립니다(약 3초).
    pub fn open_editor(
        &self,
        request: UnloadPluginRequest,
    ) -> Result<MonitorPluginSnapshot, AppError> {
        if request.schema_version != 1 {
            return Err(AppError::invalid());
        }
        let (reply, answer) = mpsc::channel();
        {
            let inner = self.inner.lock().map_err(|_| AppError::internal())?;
            if inner.snapshot.state != "READY" || inner.plugin.is_none() {
                return Err(not_ready());
            }
            if inner.snapshot.editor_open {
                return Ok(inner.snapshot.clone());
            }
            inner
                .owner
                .as_ref()
                .ok_or_else(AppError::internal)?
                .send(OwnerCommand::OpenEditor(reply))
                .map_err(|_| AppError::internal())?;
        }
        match answer.recv_timeout(Duration::from_secs(60)) {
            Ok(Ok(())) => self.snapshot(),
            Ok(Err("PLUGIN_EDITOR_UNSUPPORTED")) => Err(plugin_error(
                "PLUGIN_EDITOR_UNSUPPORTED",
                "이 플러그인은 자체 편집 화면을 제공하지 않습니다.",
            )),
            Ok(Err("PLUGIN_NOT_READY")) => Err(not_ready()),
            _ => Err(plugin_error(
                "PLUGIN_EDITOR_FAILED",
                "AmpliTube 편집 창을 열지 못했습니다.",
            )),
        }
    }
    /// docs/12 "프로젝트 AmpliTube 톤 v1": 소유 스레드에서 상태 봉투를 꺼냅니다. (class ID, 버전, blob)
    pub fn save_state(&self) -> Result<(String, String, Vec<u8>), AppError> {
        let (reply, answer) = mpsc::channel();
        let (class_id, version) = {
            let inner = self.inner.lock().map_err(|_| AppError::internal())?;
            let (Some(class_id), Some(version), true, true) = (
                inner.snapshot.class_id.clone(),
                inner.snapshot.version.clone(),
                inner.snapshot.state == "READY",
                inner.plugin.is_some(),
            ) else {
                return Err(not_ready());
            };
            self.send(&inner, OwnerCommand::SaveState(reply))?;
            (class_id, version)
        };
        Ok((class_id, version, answer_of(answer)?))
    }
    /// 저장한 class ID가 지금 불러온 플러그인과 같을 때만 소유 스레드에서 넣습니다.
    pub fn restore_state(
        &self,
        class_id: &str,
        state: Vec<u8>,
    ) -> Result<MonitorPluginSnapshot, AppError> {
        let (reply, answer) = mpsc::channel();
        {
            let inner = self.inner.lock().map_err(|_| AppError::internal())?;
            if inner.snapshot.state != "READY" || inner.plugin.is_none() {
                return Err(not_ready());
            }
            if inner.snapshot.class_id.as_deref() != Some(class_id) {
                return Err(plugin_error(
                    "PLUGIN_STATE_MISMATCH",
                    "다른 플러그인에서 저장한 톤이라 불러오지 않았습니다.",
                ));
            }
            self.send(&inner, OwnerCommand::LoadState(state, reply))?;
        }
        answer_of(answer)?;
        self.snapshot()
    }
    /// docs/12 "테이크 Freeze v1": 모니터가 쓰지 않을 때 테이크 DI를 오프라인 처리합니다.
    /// 취소되면 소유 스레드가 렌더를 멈추고 잠금을 놓을 때까지 기다린 뒤 CANCELED를 돌려줍니다.
    pub fn render_take(
        &self,
        input: Vec<f32>,
        sample_rate: u32,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64),
    ) -> Result<TakeRenderOutput, AppError> {
        let total = input.len() as u64;
        let (reply, answer) = mpsc::channel();
        let (stop, done) = (
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicU64::new(0)),
        );
        let (class_id, plugin_version) = {
            let mut inner = self.inner.lock().map_err(|_| AppError::internal())?;
            let (Some(class_id), Some(version), true, true) = (
                inner.snapshot.class_id.clone(),
                inner.snapshot.version.clone(),
                inner.snapshot.state == "READY",
                inner.plugin.is_some(),
            ) else {
                return Err(not_ready());
            };
            if inner.snapshot.in_use {
                return Err(plugin_error(
                    "PLUGIN_IN_USE",
                    "모니터를 끈 뒤 Freeze하세요(AmpliTube는 하나뿐입니다).",
                ));
            }
            if inner.rendering {
                return Err(plugin_error(
                    "PLUGIN_BUSY",
                    "다른 테이크를 Freeze하는 중입니다.",
                ));
            }
            if inner.snapshot.sample_rate != Some(sample_rate) {
                return Err(plugin_error(
                    "PLUGIN_RATE_MISMATCH",
                    "테이크와 AmpliTube의 샘플레이트가 다릅니다. AmpliTube를 테이크 샘플레이트로 다시 불러오세요.",
                ));
            }
            self.send(
                &inner,
                OwnerCommand::Render(Box::new(RenderCommand {
                    input,
                    sample_rate,
                    cancel: stop.clone(),
                    progress: done.clone(),
                    reply,
                })),
            )?;
            inner.rendering = true;
            (class_id, version)
        };
        let result = loop {
            match answer.recv_timeout(Duration::from_millis(100)) {
                Ok(result) => break Ok(result),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if cancel.load(Ordering::Acquire) {
                        stop.store(true, Ordering::Release);
                    }
                    progress(done.load(Ordering::Relaxed), total);
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break Err(AppError::internal()),
            }
        };
        if let Ok(mut inner) = self.inner.lock() {
            inner.rendering = false;
        }
        match result? {
            Ok((rendered, latency_frames, state)) => Ok(TakeRenderOutput {
                rendered,
                latency_frames,
                class_id,
                plugin_version,
                state,
            }),
            Err("CANCELED") => Err(AppError::new("CANCELED", "Freeze를 취소했습니다.", false)),
            Err("PLUGIN_NOT_READY") => Err(not_ready()),
            Err(_) => Err(plugin_error(
                "RENDER_FAILED",
                "AmpliTube로 테이크를 처리하지 못했습니다. 원본 DI는 그대로입니다.",
            )),
        }
    }
    fn send(&self, inner: &Inner, command: OwnerCommand) -> Result<(), AppError> {
        inner
            .owner
            .as_ref()
            .ok_or_else(AppError::internal)?
            .send(command)
            .map_err(|_| AppError::internal())
    }
    pub fn close_editor(
        &self,
        request: UnloadPluginRequest,
    ) -> Result<MonitorPluginSnapshot, AppError> {
        if request.schema_version != 1 {
            return Err(AppError::invalid());
        }
        let mut inner = self.inner.lock().map_err(|_| AppError::internal())?;
        if inner.snapshot.editor_open {
            if let Some(owner) = &inner.owner {
                let _ = owner.send(OwnerCommand::CloseEditor);
            }
            inner.snapshot.editor_open = false;
        }
        Ok(inner.snapshot.clone())
    }
    /// 모니터 시작 때 AmpliTube 삽입을 만듭니다. 모니터를 끄면 DSP 스레드가 참조를 놓습니다.
    pub fn take_insert(&self, sample_rate: u32) -> Result<Box<dyn MonitorInsert>, AppError> {
        let mut inner = self.inner.lock().map_err(|_| AppError::internal())?;
        if inner.rendering {
            return Err(plugin_error(
                "PLUGIN_BUSY",
                "AmpliTube가 테이크를 Freeze하는 중입니다. 끝난 뒤 모니터를 켜세요.",
            ));
        }
        if inner.snapshot.state != "READY" || inner.snapshot.in_use || inner.plugin.is_none() {
            return Err(not_ready());
        }
        if inner.snapshot.sample_rate != Some(sample_rate) {
            return Err(plugin_error(
                "PLUGIN_RATE_MISMATCH",
                "AmpliTube를 현재 입력 샘플레이트로 다시 불러오세요.",
            ));
        }
        let plugin = inner.plugin.clone().ok_or_else(AppError::internal)?;
        let back = self.inner.clone();
        let finished: dsp::Finished = Box::new(move || {
            if let Ok(mut inner) = back.lock() {
                inner.snapshot.in_use = false;
            }
        });
        // 처리 시작은 플러그인 잠금을 기다립니다(에디터를 여는 중이면 그 몇 초만큼).
        let insert =
            dsp::ThreadedInsert::start(plugin, sample_rate, finished).ok_or_else(|| {
                plugin_error(
                    "PLUGIN_LOAD_FAILED",
                    "AmpliTube 처리를 시작하지 못했습니다.",
                )
            })?;
        inner.snapshot.in_use = true;
        Ok(Box::new(insert))
    }
}

fn spawn_owner(shared: Arc<Mutex<Inner>>) -> mpsc::Sender<OwnerCommand> {
    let (tx, rx) = mpsc::channel::<OwnerCommand>();
    std::thread::Builder::new()
        .name("guitarlab-plugin-owner".into())
        .spawn(move || {
            ole_initialize();
            // 이 스레드에서 만든 플러그인은 마지막 참조도 이 스레드에서 놓습니다.
            let mut held: Vec<Shared> = Vec::new();
            let mut window: Option<PluginWindow> = None;
            loop {
                // 에디터가 열려 있으면 약 60Hz로 창 메시지를 돌리고, 아니면 명령만 기다립니다.
                let command = if window.is_some() {
                    match rx.recv_timeout(Duration::from_millis(16)) {
                        Ok(command) => Some(command),
                        Err(mpsc::RecvTimeoutError::Timeout) => None,
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                } else {
                    match rx.recv() {
                        Ok(command) => Some(command),
                        Err(_) => break,
                    }
                };
                match command {
                    None => {}
                    Some(OwnerCommand::Load(sample_rate)) => {
                        let result = load_amplitube(sample_rate);
                        let Ok(mut inner) = shared.lock() else { return };
                        match result {
                            Ok(loaded) => {
                                let plugin = Arc::new(Mutex::new(loaded.plugin));
                                held.push(plugin.clone());
                                inner.plugin = Some(plugin);
                                inner.snapshot = loaded.snapshot;
                            }
                            Err(code) => {
                                inner.snapshot = MonitorPluginSnapshot {
                                    state: "FAILED",
                                    error_code: Some(code),
                                    ..MonitorPluginSnapshot::default()
                                };
                            }
                        }
                    }
                    Some(OwnerCommand::OpenEditor(reply)) => {
                        let _ = reply.send(open_editor(&shared, &mut window));
                    }
                    Some(OwnerCommand::CloseEditor) => window = None,
                    Some(OwnerCommand::SaveState(reply)) => {
                        let _ = reply.send(with_plugin(&shared, |p| p.save_state()));
                    }
                    Some(OwnerCommand::LoadState(state, reply)) => {
                        let _ = reply.send(with_plugin(&shared, |p| p.load_state(&state)));
                    }
                    Some(OwnerCommand::Render(job)) => {
                        let RenderCommand {
                            input,
                            sample_rate,
                            cancel,
                            progress,
                            reply,
                        } = *job;
                        let result = with_plugin_raw(&shared, |p| {
                            render_with(p, &input, sample_rate, &cancel, &progress)
                        });
                        let _ = reply.send(result);
                    }
                    Some(OwnerCommand::Teardown) => {
                        // 창을 먼저 닫아 에디터가 해제될 플러그인에 붙어 있지 않게 합니다.
                        window = None;
                        held.retain(|plugin| Arc::strong_count(plugin) > 1);
                    }
                }
                if let Some(open) = &window {
                    pump_messages();
                    let _ = open.service_platform_events();
                    if open.closed_by_user() {
                        window = None;
                        if let Ok(mut inner) = shared.lock() {
                            inner.snapshot.editor_open = false;
                        }
                    }
                }
            }
        })
        .expect("플러그인 소유 스레드");
    tx
}

/// 현재 플러그인 잠금을 잡고 실행합니다(DSP는 그동안 무음 블록). 실패는 STATE_FAILED로 바꿉니다.
fn with_plugin<T>(
    shared: &Arc<Mutex<Inner>>,
    run: impl FnOnce(&mut Plugin) -> vst3_host::Result<T>,
) -> Result<T, &'static str> {
    with_plugin_raw(shared, |p| run(p).map_err(|_| "PLUGIN_STATE_FAILED"))
}
fn with_plugin_raw<T>(
    shared: &Arc<Mutex<Inner>>,
    run: impl FnOnce(&mut Plugin) -> Result<T, &'static str>,
) -> Result<T, &'static str> {
    let plugin = shared
        .lock()
        .ok()
        .and_then(|inner| inner.plugin.clone())
        .ok_or("PLUGIN_NOT_READY")?;
    let mut guard = plugin.lock().map_err(|_| "PLUGIN_STATE_FAILED")?;
    run(&mut guard)
}
/// 소유 스레드에서 플러그인 잠금을 쥔 채 오프라인 렌더하고, 쓴 톤을 함께 꺼냅니다.
fn render_with(
    plugin: &mut Plugin,
    input: &[f32],
    sample_rate: u32,
    cancel: &AtomicBool,
    progress: &AtomicU64,
) -> Result<(render::Rendered, u32, Vec<u8>), &'static str> {
    let latency = plugin.latency_samples();
    plugin.start_processing().map_err(|_| "RENDER_FAILED")?;
    let mut buffers = vst3_host::AudioBuffers::new(1, 2, dsp::DSP_BLOCK, f64::from(sample_rate));
    let mut blocks = 0u32;
    let mut process = |block: &[f32], left: &mut [f32], right: &mut [f32]| {
        blocks += 1;
        // 편집 창이 열려 있어도 굳지 않게 가끔 창 메시지를 돌립니다(이 잠금은 쓰지 않음).
        if blocks.is_multiple_of(256) {
            pump_messages();
        }
        buffers.inputs[0].copy_from_slice(block);
        // 실시간 DSP 경로와 같게 매 블록 출력 버퍼를 비웁니다(남은 값이 섞이지 않게).
        for output in &mut buffers.outputs {
            output.fill(0.0);
        }
        let ok = plugin.process_audio(&mut buffers).is_ok();
        left.copy_from_slice(&buffers.outputs[0]);
        right.copy_from_slice(&buffers.outputs[1]);
        ok
    };
    // 불러온 직후·톤을 바꾼 직후의 비동기 로드가 끝날 때까지 기다립니다(최대 약 8초).
    let settled = render::settle(
        &mut process,
        sample_rate,
        cancel,
        || {
            pump_messages();
            std::thread::sleep(Duration::from_millis(250));
        },
        32,
    );
    let rendered = settled.and_then(|_| {
        render::render_offline(
            &mut process,
            input,
            sample_rate,
            latency as usize,
            cancel,
            progress,
        )
    });
    let _ = plugin.stop_processing();
    let rendered = rendered?;
    let state = plugin.save_state().map_err(|_| "RENDER_FAILED")?;
    Ok((rendered, latency, state))
}
/// 소유 스레드에서 에디터 창을 엽니다. 여는 동안 플러그인 잠금을 쥐므로 DSP는 무음 블록을 냅니다.
fn open_editor(
    shared: &Arc<Mutex<Inner>>,
    window: &mut Option<PluginWindow>,
) -> Result<(), &'static str> {
    if window.is_some() {
        return Ok(());
    }
    let plugin = shared
        .lock()
        .ok()
        .and_then(|inner| inner.plugin.clone())
        .ok_or("PLUGIN_NOT_READY")?;
    if !plugin
        .lock()
        .map_err(|_| "PLUGIN_EDITOR_FAILED")?
        .has_editor()
    {
        return Err("PLUGIN_EDITOR_UNSUPPORTED");
    }
    let mut opened = PluginWindow::new(plugin);
    opened.open().map_err(|_| "PLUGIN_EDITOR_FAILED")?;
    *window = Some(opened);
    if let Ok(mut inner) = shared.lock() {
        inner.snapshot.editor_open = true;
    }
    Ok(())
}
#[cfg(windows)]
fn ole_initialize() {
    // 에디터의 끌어놓기·파일 대화상자를 위해 UI 스레드로 초기화합니다(실패해도 창은 시도).
    unsafe {
        windows_sys::Win32::System::Ole::OleInitialize(std::ptr::null_mut());
    }
}
#[cfg(not(windows))]
fn ole_initialize() {}
#[cfg(windows)]
fn pump_messages() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
    };
    unsafe {
        let mut msg: MSG = std::mem::zeroed();
        while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}
#[cfg(not(windows))]
fn pump_messages() {}

/// AmpliTube 5를 찾아 mono 입력·stereo 출력으로 엽니다. 파일 경로는 snapshot에 넣지 않습니다.
fn load_amplitube(sample_rate: u32) -> Result<Loaded, &'static str> {
    let mut host = Vst3Host::builder()
        .sample_rate(f64::from(sample_rate))
        .block_size(dsp::DSP_BLOCK)
        .scan_default_paths()
        .build()
        .map_err(|_| "PLUGIN_LOAD_FAILED")?;
    let plugins = host.discover_plugins().map_err(|_| "PLUGIN_LOAD_FAILED")?;
    let info = plugins
        .into_iter()
        .find(|p| is_amplitube(&p.name, &p.vendor, &p.category))
        .ok_or("PLUGIN_NOT_FOUND")?;
    let mut plugin = host
        .load_plugin_class(&info.path, &info.uid)
        .map_err(|_| "PLUGIN_LOAD_FAILED")?;
    let _ = plugin.set_bus_arrangements(&[SpeakerArrangement::MONO], &[SpeakerArrangement::STEREO]);
    let buses = plugin
        .bus_arrangements()
        .map_err(|_| "PLUGIN_BUS_UNSUPPORTED")?;
    if !mono_to_stereo(&buses.inputs, &buses.outputs) {
        return Err("PLUGIN_BUS_UNSUPPORTED");
    }
    let latency = plugin.latency_samples();
    Ok(Loaded {
        snapshot: MonitorPluginSnapshot {
            state: "READY",
            name: Some(info.name),
            vendor: Some(info.vendor),
            version: Some(info.version),
            class_id: Some(info.uid),
            sample_rate: Some(sample_rate),
            latency_frames: Some(latency),
            ..MonitorPluginSnapshot::default()
        },
        plugin,
    })
}
fn is_amplitube(name: &str, vendor: &str, category: &str) -> bool {
    name == "AmpliTube 5" && vendor == "IK Multimedia" && category.contains("Fx")
}
fn mono_to_stereo(inputs: &[SpeakerArrangement], outputs: &[SpeakerArrangement]) -> bool {
    inputs.first().map(|a| a.channel_count()) == Some(1)
        && outputs.first().map(|a| a.channel_count()) == Some(2)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_and_bus_rules_match_contract() {
        assert!(is_amplitube(
            "AmpliTube 5",
            "IK Multimedia",
            "Fx|Distortion"
        ));
        for (name, vendor, category) in [
            ("AmpliTube 4", "IK Multimedia", "Fx"),
            ("AmpliTube 5", "Other", "Fx"),
            ("AmpliTube 5", "IK Multimedia", "Instrument|Synth"),
            ("TONEX", "IK Multimedia", "Fx|Distortion"),
        ] {
            assert!(!is_amplitube(name, vendor, category), "{name}/{vendor}");
        }
        let (mono, stereo) = (SpeakerArrangement::MONO, SpeakerArrangement::STEREO);
        assert!(mono_to_stereo(&[mono], &[stereo]));
        assert!(!mono_to_stereo(&[stereo], &[stereo]));
        assert!(!mono_to_stereo(&[mono], &[mono]));
        assert!(!mono_to_stereo(&[], &[stereo]));
    }
    #[test]
    fn requests_are_versioned_and_state_guards_do_not_touch_plugins() {
        let service = MonitorPluginService::default();
        assert_eq!(service.snapshot().expect("상태").state, "NONE");
        for (version, rate) in [(2, 48000), (1, 7999), (1, 192_001)] {
            assert_eq!(
                service
                    .load(LoadPluginRequest {
                        schema_version: version,
                        sample_rate: rate,
                    })
                    .expect_err("잘못된 요청")
                    .code,
                "INVALID_INPUT"
            );
        }
        assert!(serde_json::from_str::<LoadPluginRequest>(
            r#"{"schemaVersion":1,"sampleRate":48000,"path":"C:\\x.vst3"}"#
        )
        .is_err());
        assert_eq!(
            service.take_insert(48000).err().expect("없음").code,
            "PLUGIN_NOT_READY"
        );
        let request = |schema_version| UnloadPluginRequest { schema_version };
        assert_eq!(
            service.open_editor(request(1)).expect_err("없음").code,
            "PLUGIN_NOT_READY"
        );
        assert_eq!(
            service.open_editor(request(2)).expect_err("버전").code,
            "INVALID_INPUT"
        );
        assert!(!service.close_editor(request(1)).expect("멱등").editor_open);
        assert_eq!(
            service.save_state().expect_err("없음").code,
            "PLUGIN_NOT_READY"
        );
        assert_eq!(
            service
                .restore_state("56535441746235616D706C6974756265", vec![1])
                .expect_err("없음")
                .code,
            "PLUGIN_NOT_READY"
        );
        // 불러온 것이 없어도 해제는 멱등입니다.
        assert_eq!(
            service
                .unload(UnloadPluginRequest { schema_version: 1 })
                .expect("해제")
                .state,
            "NONE"
        );
        let snapshot = serde_json::to_value(MonitorPluginSnapshot::default()).expect("직렬화");
        assert_eq!(snapshot["inUse"], false);
        assert_eq!(snapshot["editorOpen"], false);
        assert!(snapshot.get("path").is_none());
    }
    #[test]
    #[ignore = "설치된 AmpliTube 5를 실제로 로드·처리하고 에디터 창을 엽니다(약 15초, 메모리 약 1GB)"]
    fn installed_amplitube_loads_and_processes_through_dsp_thread() {
        let service = MonitorPluginService::default();
        service
            .load(LoadPluginRequest {
                schema_version: 1,
                sample_rate: 48000,
            })
            .expect("로드 시작");
        let started = std::time::Instant::now();
        while service.snapshot().expect("상태").state == "LOADING" {
            assert!(started.elapsed().as_secs() < 120, "로드 시간 초과");
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        let snapshot = service.snapshot().expect("상태");
        assert_eq!(snapshot.state, "READY", "{snapshot:?}");
        assert_eq!(
            service.take_insert(44100).err().expect("샘플레이트").code,
            "PLUGIN_RATE_MISMATCH"
        );
        let mut insert = service.take_insert(48000).expect("삽입");
        assert!(service.snapshot().expect("상태").in_use);
        assert_eq!(
            service
                .unload(UnloadPluginRequest { schema_version: 1 })
                .expect_err("사용 중")
                .code,
            "PLUGIN_IN_USE"
        );
        // 처리 중에 에디터 창을 엽니다(화면에 약 3초 뜸). 여는 동안 처리 블록은 무음입니다.
        let opened = service
            .open_editor(UnloadPluginRequest { schema_version: 1 })
            .expect("에디터");
        assert!(opened.editor_open && opened.in_use);
        // 처리·에디터가 도는 중에 톤을 꺼내고 다시 넣습니다(docs/12 "프로젝트 AmpliTube 톤 v1").
        let (class_id, version, state) = service.save_state().expect("상태 저장");
        println!("상태 {}바이트 · {class_id} · {version}", state.len());
        assert!(!state.is_empty());
        assert_eq!(
            service
                .restore_state("00000000000000000000000000000000", state.clone())
                .expect_err("다른 플러그인")
                .code,
            "PLUGIN_STATE_MISMATCH"
        );
        assert!(
            service
                .restore_state(&class_id, state)
                .expect("복원")
                .in_use
        );
        // 실제 callback처럼 480프레임씩 넣고 받습니다(10ms 간격, 2초).
        let mut energy = 0.0f64;
        let (mut left, mut right) = (vec![0.0f32; 480], vec![0.0f32; 480]);
        let mut phase = 0.0f32;
        for _ in 0..200 {
            let input: Vec<f32> = (0..480)
                .map(|_| {
                    phase += 110.0 / 48000.0;
                    (phase * std::f32::consts::TAU).sin() * 0.1
                })
                .collect();
            insert.process(&input, &mut left, &mut right);
            energy += left
                .iter()
                .chain(&right)
                .map(|v| f64::from(*v).powi(2))
                .sum::<f64>();
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let underrun = insert
            .stats()
            .expect("계수")
            .underrun
            .load(std::sync::atomic::Ordering::Relaxed);
        let stats = insert.stats().expect("계수");
        assert_eq!(
            (
                stats.dropped.load(std::sync::atomic::Ordering::Relaxed),
                stats.errors.load(std::sync::atomic::Ordering::Relaxed)
            ),
            (0, 0),
            "유실·처리 오류 없음"
        );
        println!(
            "에너지 {energy:.2} · 부족 {underrun}프레임 · 지연 {}프레임",
            insert.latency_frames()
        );
        assert!(energy > 1.0, "처리 출력 없음");
        assert!(service.snapshot().expect("상태").editor_open, "창 유지");
        // 실시간 Bypass: 플러그인은 계속 돌고 출력은 늦춘 원음(사인 0.1 → 좌우 RMS 약 0.07)이 됩니다.
        insert
            .bypass_flag()
            .expect("Bypass 스위치")
            .store(true, std::sync::atomic::Ordering::Relaxed);
        let mut bypassed = Vec::new();
        for block in 0..100 {
            let input: Vec<f32> = (0..480)
                .map(|_| {
                    phase += 110.0 / 48000.0;
                    (phase * std::f32::consts::TAU).sin() * 0.1
                })
                .collect();
            insert.process(&input, &mut left, &mut right);
            if block >= 20 {
                assert_eq!(left, right, "원음은 좌우가 같음");
                bypassed.extend_from_slice(&left);
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let rms = (bypassed.iter().map(|v| f64::from(*v).powi(2)).sum::<f64>()
            / bypassed.len() as f64)
            .sqrt();
        println!("Bypass RMS {rms:.4}");
        assert!((0.06..0.08).contains(&rms), "Bypass 출력 {rms}");
        drop(insert);
        assert!(!service.snapshot().expect("상태").in_use, "러너 반환");
        assert_eq!(
            service
                .unload(UnloadPluginRequest { schema_version: 1 })
                .expect("해제")
                .state,
            "NONE"
        );
    }
    #[test]
    #[ignore = "설치된 AmpliTube 5로 같은 DI를 오프라인 렌더와 실시간 DSP 경로로 처리해 비교합니다(약 15초, 메모리 약 1GB)"]
    fn installed_amplitube_offline_render_matches_realtime_path() {
        let service = MonitorPluginService::default();
        service
            .load(LoadPluginRequest {
                schema_version: 1,
                sample_rate: 48000,
            })
            .expect("로드 시작");
        let started = std::time::Instant::now();
        while service.snapshot().expect("상태").state == "LOADING" {
            assert!(started.elapsed().as_secs() < 120, "로드 시간 초과");
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        // 합성 기타 DI: 0.25초마다 감쇠하는 110/165Hz 음 2초
        let di: Vec<f32> = (0..96000)
            .map(|i| {
                let t = (i % 12000) as f32 / 48000.0;
                let f = if (i / 12000) % 2 == 0 { 110.0 } else { 165.0 };
                (t * f * std::f32::consts::TAU).sin() * 0.3 * (-t * 6.0).exp()
            })
            .collect();
        let no = AtomicBool::new(false);
        let offline = service
            .render_take(di.clone(), 48000, &no, |_, _| {})
            .expect("오프라인 렌더");
        assert_eq!(
            service
                .render_take(di.clone(), 44100, &no, |_, _| {})
                .err()
                .expect("샘플레이트")
                .code,
            "PLUGIN_RATE_MISMATCH"
        );
        let again = service
            .render_take(di.clone(), 48000, &no, |_, _| {})
            .expect("다시 렌더");
        println!(
            "오프라인 {}프레임(tail {}) · 지연 {} · 상태 {}바이트",
            offline.rendered.left.len(),
            offline.rendered.tail_frames,
            offline.latency_frames,
            offline.state.len()
        );
        assert!(offline.rendered.left.len() >= di.len());
        // 실시간 경로: 모니터처럼 480프레임씩 넣고 받습니다.
        let mut insert = service.take_insert(48000).expect("삽입");
        assert_eq!(
            service
                .render_take(di.clone(), 48000, &no, |_, _| {})
                .err()
                .expect("사용 중")
                .code,
            "PLUGIN_IN_USE"
        );
        let mut live = Vec::new();
        let (mut left, mut right) = (vec![0.0f32; 480], vec![0.0f32; 480]);
        let padded: Vec<f32> = di
            .iter()
            .copied()
            .chain(std::iter::repeat_n(0.0, 48000))
            .collect();
        for chunk in padded.chunks(480) {
            insert.process(chunk, &mut left, &mut right);
            live.extend_from_slice(&left);
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let underrun = insert
            .stats()
            .expect("계수")
            .underrun
            .load(std::sync::atomic::Ordering::Relaxed);
        drop(insert);
        println!("실시간 부족 {underrun}프레임");
        let rms = |x: &[f32]| {
            (x.iter().map(|v| f64::from(*v).powi(2)).sum::<f64>() / x.len() as f64).sqrt()
        };
        let corr = |a: &[f32], b: &[f32]| {
            let dot: f64 = a
                .iter()
                .zip(b)
                .map(|(x, y)| f64::from(*x) * f64::from(*y))
                .sum();
            dot / (rms(a) * rms(b) * a.len() as f64)
        };
        let n = di.len();
        let reference = &offline.rendered.left[..n];
        // 실시간 출력은 prime·지연만큼 늦으므로 가장 잘 맞는 위치를 찾습니다.
        let (lag, best) = (0..4096)
            .map(|lag| (lag, corr(reference, &live[lag..lag + n])))
            .fold((0, f64::MIN), |a, b| if b.1 > a.1 { b } else { a });
        let ratio_db = 20.0 * (rms(&live[lag..lag + n]) / rms(reference)).log10();
        let repeat = corr(reference, &again.rendered.left[..n]);
        let zeros = live[lag..lag + n].iter().filter(|v| **v == 0.0).count();
        let seg = |x: &[f32]| {
            (0..8)
                .map(|k| format!("{:.3}", rms(&x[k * n / 8..(k + 1) * n / 8])))
                .collect::<Vec<_>>()
                .join(" ")
        };
        println!(
            "구간 RMS 오프라인 [{}] / 실시간 [{}] · 실시간 0 샘플 {zeros}",
            seg(reference),
            seg(&live[lag..lag + n])
        );
        println!("실시간 맞춤 {lag}프레임 · 상관 {best:.4} · 레벨 차 {ratio_db:.2}dB · 오프라인 반복 상관 {repeat:.4}");
        assert!(repeat > 0.99, "오프라인 렌더가 매번 다름 {repeat}");
        assert!(best > 0.9, "실시간과 오프라인 결과가 다름 {best}");
        assert!(ratio_db.abs() < 1.0, "레벨 차 {ratio_db}");
        service
            .unload(UnloadPluginRequest { schema_version: 1 })
            .expect("해제");
    }
    #[test]
    #[ignore = "설치된 AmpliTube 5의 128프레임 블록 처리 시간을 잽니다(약 30초, 메모리 약 1GB). 결과는 docs/progress에 기록"]
    fn installed_amplitube_block_timing_at_48k() {
        let service = MonitorPluginService::default();
        service
            .load(LoadPluginRequest {
                schema_version: 1,
                sample_rate: 48000,
            })
            .expect("로드 시작");
        let started = std::time::Instant::now();
        while service.snapshot().expect("상태").state == "LOADING" {
            assert!(started.elapsed().as_secs() < 120, "로드 시간 초과");
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        // 비동기 로드가 끝나도록 오프라인 렌더(정착 확인 포함)를 한 번 거칩니다.
        let no = AtomicBool::new(false);
        let warm: Vec<f32> = (0..48000)
            .map(|i| ((i as f32) * 0.0144).sin() * 0.3)
            .collect();
        let first = std::time::Instant::now();
        service
            .render_take(warm.clone(), 48000, &no, |_, _| {})
            .expect("렌더");
        let offline = first.elapsed();
        let plugin = service
            .inner
            .lock()
            .expect("상태")
            .plugin
            .clone()
            .expect("플러그인");
        let mut p = plugin.lock().expect("잠금");
        p.start_processing().expect("시작");
        let mut buffers = vst3_host::AudioBuffers::new(1, 2, dsp::DSP_BLOCK, 48000.0);
        let mut times = Vec::new();
        let mut phase = 0.0f32;
        for _ in 0..(48000 * 20 / dsp::DSP_BLOCK) {
            for v in &mut buffers.inputs[0] {
                phase += 110.0 / 48000.0;
                *v = (phase * std::f32::consts::TAU).sin() * 0.3;
            }
            let t = std::time::Instant::now();
            p.process_audio(&mut buffers).expect("처리");
            times.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        let _ = p.stop_processing();
        drop(p);
        drop(plugin);
        times.sort_by(f64::total_cmp);
        let at = |q: f64| times[((times.len() - 1) as f64 * q) as usize];
        let period = dsp::DSP_BLOCK as f64 / 48.0;
        let mean = times.iter().sum::<f64>() / times.len() as f64;
        println!(
            "블록 {}개 · 주기 {period:.3}ms · 평균 {mean:.3} · p50 {:.3} · p99 {:.3} · p99.9 {:.3} · 최대 {:.3}ms · 평균 부하 {:.1}% · 1초 오프라인 렌더(정착 포함) {:?}",
            times.len(),
            at(0.5),
            at(0.99),
            at(0.999),
            times[times.len() - 1],
            mean / period * 100.0,
            offline
        );
        assert!(mean < period, "평균 처리 시간이 실시간보다 느림");
        service
            .unload(UnloadPluginRequest { schema_version: 1 })
            .expect("해제");
    }
}
