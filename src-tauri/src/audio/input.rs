use super::clock::{ClockDiagnostic, ClockRequest, ClockSession};
use super::dsp::{Detector, Sample};
use crate::ipc::AppError;
use crate::storage::calibration::{MonitorEnvironment, ProfileKey};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapRb,
};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) channels: u16,
    pub(super) sample_rate: u32,
    pub(super) sample_format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) is_default: Option<bool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceList {
    pub(super) schema_version: u8,
    pub(super) devices: Vec<DeviceInfo>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InputRequest {
    pub schema_version: u8,
    pub device_id: String,
    pub channel_index: u16,
    pub noise_gate_dbfs: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StopRequest {
    pub schema_version: u8,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Onset {
    sequence: u64,
    capture_sample_index: u64,
    captured_monotonic_ns: String,
    pitch_midi: Option<f64>,
    confidence: f64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSnapshot {
    pub schema_version: u8,
    pub state: &'static str,
    pub stream_generation: u64,
    pub device_id: Option<String>,
    pub sample_rate: u32,
    pub channels: u16,
    pub channel_index: u16,
    pub sample_format: String,
    pub noise_gate_dbfs: f64,
    pub callback_frames: u64,
    pub buffer_frames: Option<u32>,
    pub captured_frames: u64,
    pub dropped_frames: u64,
    pub discontinuities: u64,
    pub level_dbfs: f64,
    pub full_scale_frames: u64,
    pub pitch_midi: Option<f64>,
    pub confidence: Option<f64>,
    pub captured_monotonic_ns: String,
    pub judgement_watermark_ns: String,
    pub onsets: Vec<Onset>,
    pub error_code: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputClock {
    schema_version: u8,
    stream_generation: u64,
    monotonic_ns: String,
    last_request_sequence: u64,
    last_playback_epoch: u64,
}
impl Default for AudioSnapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            state: "STOPPED",
            stream_generation: 0,
            device_id: None,
            sample_rate: 0,
            channels: 0,
            channel_index: 0,
            sample_format: String::new(),
            noise_gate_dbfs: -50.0,
            callback_frames: 0,
            buffer_frames: None,
            captured_frames: 0,
            dropped_frames: 0,
            discontinuities: 0,
            level_dbfs: -120.0,
            full_scale_frames: 0,
            pitch_midi: None,
            confidence: None,
            captured_monotonic_ns: "0".into(),
            judgement_watermark_ns: "0".into(),
            onsets: Vec::new(),
            error_code: None,
        }
    }
}

fn device_error(error: cpal::Error) -> AppError {
    if error.kind() == cpal::ErrorKind::PermissionDenied {
        AppError::new(
            "AUDIO_PERMISSION_DENIED",
            "Windows의 마이크 입력 권한을 확인하세요.",
            false,
        )
    } else {
        AppError::new(
            "AUDIO_DEVICE_UNAVAILABLE",
            "입력 장치 또는 설정을 사용할 수 없습니다.",
            true,
        )
    }
}

fn is_loopback(name: &str) -> bool {
    let name = name.to_lowercase();
    [
        "loopback",
        "stereo mix",
        "스테레오 믹스",
        "what u hear",
        "what you hear",
    ]
    .iter()
    .any(|token| name.contains(token))
}

pub fn list_devices() -> Result<DeviceList, AppError> {
    let host = cpal::default_host();
    let mut devices = Vec::new();
    for device in host.input_devices().map_err(device_error)? {
        let (Ok(id), Ok(description), Ok(config)) = (
            device.id(),
            device.description(),
            device.default_input_config(),
        ) else {
            continue;
        };
        if is_loopback(description.name()) {
            continue;
        }
        devices.push(DeviceInfo {
            id: id.to_string(),
            name: description.name().to_owned(),
            channels: config.channels(),
            sample_rate: config.sample_rate(),
            sample_format: format!("{}", config.sample_format()),
            is_default: None,
        });
    }
    Ok(DeviceList {
        schema_version: 1,
        devices,
    })
}

struct RunningInput {
    stream: Option<cpal::Stream>,
    stop: Arc<AtomicBool>,
    failed: Arc<AtomicU8>,
    worker: Option<JoinHandle<()>>,
    monitor: Arc<super::monitor::MonitorBuffer>,
}
impl Drop for RunningInput {
    fn drop(&mut self) {
        self.monitor.close_input();
        self.stop.store(true, Ordering::Release);
        self.stream.take();
        if let Some(worker) = self.worker.take() {
            if worker.join().is_err() {
                eprintln!("GuitarLab 입력 처리 실패: AUDIO_WORKER_FAILED");
            }
        }
    }
}

pub struct AudioService {
    active: Mutex<Option<RunningInput>>,
    snapshot: Arc<Mutex<AudioSnapshot>>,
    generation: AtomicU64,
    clock_session: Mutex<ClockSession>,
    pub recording_router: Arc<crate::recording::router::RecordingRouter>,
    monitor: Mutex<super::monitor::MonitorService>,
}
pub struct CalibrationCapture {
    pub key: ProfileKey,
    pub dropped_frames: u64,
    pub discontinuities: u64,
    pub onsets: Vec<crate::judgement::calibration_sampler::MeasurementInput>,
}
pub struct PracticeOnset {
    pub sequence: u64,
    pub captured_ns: u64,
    pub song_time_ms: Option<f64>,
    pub pitch_midi: Option<f64>,
    pub confidence: f64,
}
pub struct PracticeCapture {
    pub key: ProfileKey,
    pub now_ns: u64,
    pub song_time_ms: f64,
    pub watermark_song_ms: Option<f64>,
    pub dropped_frames: u64,
    pub discontinuities: u64,
    pub onsets: Vec<PracticeOnset>,
}
pub struct RecordingCapture {
    pub key: ProfileKey,
    pub now_ns: u64,
    pub song_time_ms: Option<f64>,
}
impl Default for AudioService {
    fn default() -> Self {
        Self {
            active: Mutex::new(None),
            snapshot: Arc::new(Mutex::new(AudioSnapshot::default())),
            generation: AtomicU64::new(0),
            clock_session: Mutex::new(ClockSession::default()),
            recording_router: Arc::new(crate::recording::router::RecordingRouter::default()),
            monitor: Mutex::new(super::monitor::MonitorService::default()),
        }
    }
}
impl AudioService {
    pub fn start_monitor(
        &self,
        request: super::monitor::MonitorRequest,
    ) -> Result<super::monitor::MonitorSnapshot, AppError> {
        request.validate()?;
        let (buffer, failed, sample_rate, generation) = {
            let active = self.active.lock().map_err(|_| AppError::internal())?;
            let input = active
                .as_ref()
                .filter(|input| input.failed.load(Ordering::Acquire) == 0)
                .ok_or_else(|| {
                    AppError::new("INPUT_NOT_ACTIVE", "기타 입력을 먼저 시작하세요.", true)
                })?;
            let snapshot = self.snapshot.lock().map_err(|_| AppError::internal())?;
            if snapshot.state != "RUNNING"
                || request.expected_stream_generation != snapshot.stream_generation
            {
                return Err(AppError::new(
                    "INPUT_CHANGED",
                    "현재 입력이 준비된 뒤 다시 시작하세요.",
                    true,
                ));
            }
            (
                input.monitor.clone(),
                input.failed.clone(),
                snapshot.sample_rate,
                snapshot.stream_generation,
            )
        };
        // 출력 장치를 여는 동안 입력 상태 잠금을 잡아 DSP/녹음 검사를 지연시키지 않습니다.
        let mut monitor = self.monitor.lock().map_err(|_| AppError::internal())?;
        monitor.status(Some(generation))?;
        monitor.start(request, buffer, failed, sample_rate)
    }
    pub fn monitor_snapshot(&self) -> Result<super::monitor::MonitorSnapshot, AppError> {
        self.monitor
            .lock()
            .map_err(|_| AppError::internal())?
            .status(Some(self.generation.load(Ordering::Relaxed)))
    }
    pub fn stop_monitor(
        &self,
        request: StopRequest,
    ) -> Result<super::monitor::MonitorSnapshot, AppError> {
        if request.schema_version != 1 {
            return Err(AppError::invalid());
        }
        Ok(self
            .monitor
            .lock()
            .map_err(|_| AppError::internal())?
            .stop())
    }
    pub fn set_monitor_volume(
        &self,
        request: super::monitor::MonitorVolumeRequest,
    ) -> Result<super::monitor::MonitorSnapshot, AppError> {
        self.monitor
            .lock()
            .map_err(|_| AppError::internal())?
            .set_volume(request)
    }
    pub fn recording_capture(
        &self,
        generation: u64,
        environment: MonitorEnvironment,
        transport: Option<&crate::recording::model::RecordingTransport>,
    ) -> Result<RecordingCapture, AppError> {
        let key = self.profile_key(environment, generation)?;
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        let input = active
            .as_ref()
            .filter(|v| v.failed.load(Ordering::Acquire) == 0)
            .ok_or_else(|| AppError::new("INPUT_NOT_ACTIVE", "입력이 중단되었습니다.", true))?;
        if self.generation.load(Ordering::Relaxed) != generation {
            return Err(AppError::new(
                "INPUT_CHANGED",
                "입력 설정이 변경되었습니다.",
                true,
            ));
        }
        let now_ns = u64::try_from(
            input
                .stream
                .as_ref()
                .ok_or_else(AppError::internal)?
                .now()
                .as_nanos(),
        )
        .map_err(|_| AppError::internal())?;
        let captured_ns = self
            .snapshot
            .lock()
            .map_err(|_| AppError::internal())?
            .captured_monotonic_ns
            .parse::<u64>()
            .map_err(|_| AppError::internal())?;
        if captured_ns > now_ns || now_ns.saturating_sub(captured_ns) > 500_000_000 {
            return Err(AppError::new(
                "INPUT_STALLED",
                "입력이 지연되어 녹음을 중단했습니다.",
                true,
            ));
        }
        let song_time_ms = if let Some(t) = transport {
            let clock = self
                .clock_session
                .lock()
                .map_err(|_| AppError::internal())?;
            if !clock
                .mapping
                .matches(generation, t.playback_epoch, t.rate, now_ns)
            {
                return Err(AppError::new(
                    "CLOCK_UNCERTAIN",
                    "동기화가 안정된 로컬 반주 재생 중에 REC를 눌러주세요.",
                    true,
                ));
            }
            Some(
                clock
                    .mapping
                    .map(generation, t.playback_epoch, now_ns, now_ns)
                    .ok_or_else(AppError::internal)?,
            )
        } else {
            None
        };
        Ok(RecordingCapture {
            key,
            now_ns,
            song_time_ms,
        })
    }
    pub fn practice_capture(
        &self,
        generation: u64,
        epoch: u64,
        rate: f64,
        environment: MonitorEnvironment,
    ) -> Result<PracticeCapture, AppError> {
        let key = self.profile_key(environment, generation)?;
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        let input = active
            .as_ref()
            .filter(|input| input.failed.load(Ordering::Acquire) == 0)
            .ok_or_else(|| AppError::new("INPUT_NOT_ACTIVE", "입력이 중단되었습니다.", true))?;
        if self.generation.load(Ordering::Relaxed) != generation {
            return Err(AppError::new(
                "INPUT_CHANGED",
                "입력 구성이 변경되었습니다.",
                true,
            ));
        }
        let now_ns = u64::try_from(
            input
                .stream
                .as_ref()
                .ok_or_else(AppError::internal)?
                .now()
                .as_nanos(),
        )
        .map_err(|_| AppError::internal())?;
        let snapshot = self.snapshot.lock().map_err(|_| AppError::internal())?;
        let clock = self
            .clock_session
            .lock()
            .map_err(|_| AppError::internal())?;
        if !clock.mapping.matches(generation, epoch, rate, now_ns) {
            return Err(AppError::new(
                "CLOCK_UNCERTAIN",
                "입력과 재생 동기화를 기다립니다.",
                true,
            ));
        }
        let captured_ns = snapshot
            .captured_monotonic_ns
            .parse::<u64>()
            .map_err(|_| AppError::internal())?;
        if now_ns.saturating_sub(captured_ns) > 500_000_000 {
            return Err(AppError::new(
                "INPUT_STALLED",
                "입력 처리가 지연되어 채점을 중단했습니다.",
                true,
            ));
        }
        let watermark = snapshot
            .judgement_watermark_ns
            .parse::<u64>()
            .map_err(|_| AppError::internal())?;
        let onsets = snapshot
            .onsets
            .iter()
            .map(|onset| {
                let ns = onset
                    .captured_monotonic_ns
                    .parse::<u64>()
                    .map_err(|_| AppError::internal())?;
                Ok(PracticeOnset {
                    sequence: onset.sequence,
                    captured_ns: ns,
                    song_time_ms: clock.mapping.map(generation, epoch, ns, now_ns),
                    pitch_midi: onset.pitch_midi,
                    confidence: onset.confidence,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        Ok(PracticeCapture {
            key,
            now_ns,
            song_time_ms: clock
                .mapping
                .map(generation, epoch, now_ns, now_ns)
                .ok_or_else(AppError::internal)?,
            watermark_song_ms: clock.mapping.map(generation, epoch, watermark, now_ns),
            dropped_frames: snapshot.dropped_frames,
            discontinuities: snapshot.discontinuities,
            onsets,
        })
    }
    pub fn calibration_capture(
        &self,
        generation: u64,
        epoch: u64,
        environment: MonitorEnvironment,
    ) -> Result<CalibrationCapture, AppError> {
        let key = self.profile_key(environment, generation)?;
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        let input = active
            .as_ref()
            .filter(|input| input.failed.load(Ordering::Acquire) == 0)
            .ok_or_else(|| {
                AppError::new("INPUT_NOT_ACTIVE", "기타 입력을 먼저 시작하세요.", true)
            })?;
        if self.generation.load(Ordering::Relaxed) != generation {
            return Err(AppError::new(
                "INPUT_CHANGED",
                "입력 설정이 변경되었습니다.",
                true,
            ));
        }
        let now_ns = u64::try_from(
            input
                .stream
                .as_ref()
                .ok_or_else(AppError::internal)?
                .now()
                .as_nanos(),
        )
        .map_err(|_| AppError::internal())?;
        let snapshot = self.snapshot.lock().map_err(|_| AppError::internal())?;
        let clock = self
            .clock_session
            .lock()
            .map_err(|_| AppError::internal())?;
        if !clock.mapping.matches(generation, epoch, 1.0, now_ns) {
            return Err(AppError::new(
                "CLOCK_UNCERTAIN",
                "보정 시간 동기화가 준비되지 않았습니다.",
                true,
            ));
        }
        let mut onsets = Vec::with_capacity(snapshot.onsets.len());
        for onset in &snapshot.onsets {
            let ns = onset
                .captured_monotonic_ns
                .parse::<u64>()
                .map_err(|_| AppError::internal())?;
            onsets.push(crate::judgement::calibration_sampler::MeasurementInput {
                stream_generation: generation,
                epoch,
                sequence: onset.sequence,
                song_time_ms: clock.mapping.map(generation, epoch, ns, now_ns),
                confidence: onset.confidence,
            });
        }
        Ok(CalibrationCapture {
            key,
            dropped_frames: snapshot.dropped_frames,
            discontinuities: snapshot.discontinuities,
            onsets,
        })
    }
    pub fn profile_key(
        &self,
        environment: MonitorEnvironment,
        expected_generation: u64,
    ) -> Result<ProfileKey, AppError> {
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        if self.generation.load(Ordering::Relaxed) != expected_generation {
            return Err(AppError::new(
                "INPUT_CHANGED",
                "입력 설정이 변경되었습니다. 현재 장치를 확인한 뒤 다시 저장하세요.",
                true,
            ));
        }
        if !active
            .as_ref()
            .is_some_and(|input| input.failed.load(Ordering::Acquire) == 0)
        {
            return Err(AppError::new(
                "INPUT_NOT_ACTIVE",
                "정상 기타 입력을 먼저 시작하세요.",
                true,
            ));
        }
        let snapshot = self.snapshot.lock().map_err(|_| AppError::internal())?;
        if snapshot.state != "RUNNING" || snapshot.callback_frames == 0 {
            return Err(AppError::new(
                "INPUT_NOT_ACTIVE",
                "입력 설정을 확인한 뒤 다시 저장하세요.",
                true,
            ));
        }
        let key = ProfileKey {
            device_id: snapshot.device_id.clone().ok_or_else(AppError::internal)?,
            sample_rate: snapshot.sample_rate,
            sample_format: snapshot.sample_format.clone(),
            channels: snapshot.channels,
            channel_index: snapshot.channel_index,
            buffer_frames: u64::from(snapshot.buffer_frames.ok_or_else(|| {
                AppError::new(
                    "CALIBRATION_REQUIRED",
                    "장치 버퍼 구성을 확인할 수 없어 보정값을 저장하지 않습니다.",
                    true,
                )
            })?),
            monitor_environment: environment,
        };
        key.validate()?;
        Ok(key)
    }
    pub fn update_clock(&self, request: ClockRequest) -> Result<ClockDiagnostic, AppError> {
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        let input = active
            .as_ref()
            .filter(|input| input.failed.load(Ordering::Acquire) == 0)
            .ok_or_else(|| {
                AppError::new("INPUT_NOT_ACTIVE", "기타 입력을 먼저 시작하세요.", true)
            })?;
        let now_ns = u64::try_from(
            input
                .stream
                .as_ref()
                .ok_or_else(AppError::internal)?
                .now()
                .as_nanos(),
        )
        .map_err(|_| AppError::internal())?;
        self.clock_session
            .lock()
            .map_err(|_| AppError::internal())?
            .update(request, self.generation.load(Ordering::Relaxed), now_ns)
    }
    pub fn clock(&self) -> Result<InputClock, AppError> {
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        let input = active
            .as_ref()
            .filter(|input| input.failed.load(Ordering::Acquire) == 0)
            .ok_or_else(|| {
                AppError::new("INPUT_NOT_ACTIVE", "기타 입력을 먼저 시작하세요.", true)
            })?;
        let stream = input.stream.as_ref().ok_or_else(AppError::internal)?;
        let clock = self
            .clock_session
            .lock()
            .map_err(|_| AppError::internal())?;
        Ok(InputClock {
            schema_version: 1,
            stream_generation: self.generation.load(Ordering::Relaxed),
            monotonic_ns: u64::try_from(stream.now().as_nanos())
                .map_err(|_| AppError::internal())?
                .to_string(),
            last_request_sequence: clock.last_request_sequence(),
            last_playback_epoch: clock.last_playback_epoch(),
        })
    }
    pub fn snapshot(&self) -> Result<AudioSnapshot, AppError> {
        let mut active = self.active.lock().map_err(|_| AppError::internal())?;
        if active
            .as_ref()
            .is_some_and(|input| input.failed.load(Ordering::Acquire) != 0)
        {
            active.take();
            let mut snapshot = self.snapshot.lock().map_err(|_| AppError::internal())?;
            snapshot.state = "ERROR";
            snapshot.error_code = Some("AUDIO_DEVICE_UNAVAILABLE");
            snapshot.pitch_midi = None;
            snapshot.confidence = None;
        }
        self.snapshot
            .lock()
            .map(|snapshot| snapshot.clone())
            .map_err(|_| AppError::internal())
    }
    pub fn stop(&self, request: StopRequest) -> Result<AudioSnapshot, AppError> {
        if request.schema_version != 1 {
            return Err(AppError::invalid());
        }
        let mut active = self.active.lock().map_err(|_| AppError::internal())?;
        active.take();
        self.monitor
            .lock()
            .map_err(|_| AppError::internal())?
            .stop();
        let mut snapshot = self.snapshot.lock().map_err(|_| AppError::internal())?;
        snapshot.state = "STOPPED";
        snapshot.pitch_midi = None;
        snapshot.confidence = None;
        snapshot.level_dbfs = -120.0;
        snapshot.error_code = None;
        Ok(snapshot.clone())
    }
    pub fn start(&self, request: InputRequest) -> Result<AudioSnapshot, AppError> {
        if request.schema_version != 1
            || request.device_id.is_empty()
            || request.device_id.len() > 512
            || !request.noise_gate_dbfs.is_finite()
            || !(-80.0..=-10.0).contains(&request.noise_gate_dbfs)
        {
            return Err(AppError::invalid());
        }
        let mut active = self.active.lock().map_err(|_| AppError::internal())?;
        if active.is_some() {
            return Err(AppError::new(
                "INPUT_ALREADY_ACTIVE",
                "입력을 먼저 중단하세요.",
                false,
            ));
        }
        let host = cpal::default_host();
        let device = host
            .input_devices()
            .map_err(device_error)?
            .find(|device| {
                device
                    .id()
                    .is_ok_and(|id| id.to_string() == request.device_id)
            })
            .ok_or_else(|| {
                AppError::new(
                    "AUDIO_DEVICE_UNAVAILABLE",
                    "선택한 입력 장치가 연결되지 않았습니다.",
                    true,
                )
            })?;
        let supported = device.default_input_config().map_err(device_error)?;
        if is_loopback(device.description().map_err(device_error)?.name()) {
            return Err(AppError::new(
                "INVALID_INPUT",
                "시스템 출력 루프백은 기타 입력으로 사용할 수 없습니다.",
                false,
            ));
        }
        let config = supported.config();
        let sample_rate = config.sample_rate;
        let channels = config.channels;
        if !(8_000..=192_000).contains(&sample_rate)
            || !(1..=32).contains(&channels)
            || request.channel_index >= channels
        {
            return Err(AppError::invalid());
        }
        let sample_format = supported.sample_format();
        let generation = self.generation.fetch_add(1, Ordering::Relaxed) + 1;
        *self
            .clock_session
            .lock()
            .map_err(|_| AppError::internal())? = ClockSession::default();
        let (mut producer, mut consumer) = HeapRb::<Sample>::new(sample_rate as usize).split();
        let (monitor, mut monitor_producer) = super::monitor::MonitorBuffer::new(sample_rate);
        let callback_monitor = monitor.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let failed = Arc::new(AtomicU8::new(0));
        let captured = Arc::new(AtomicU64::new(0));
        let dropped = Arc::new(AtomicU64::new(0));
        let callback_frames = Arc::new(AtomicU64::new(0));
        let mut sample_index = 0u64;
        let capture_count = captured.clone();
        let drop_count = dropped.clone();
        let block_count = callback_frames.clone();
        let channel_index = request.channel_index;
        let error_flag = failed.clone();
        // callback에서는 sample 변환·복사·원자적 진단만 수행합니다.
        let stream = device
            .build_input_stream_raw(
                config,
                sample_format,
                move |data, info| {
                    let base_ns =
                        u64::try_from(info.timestamp().capture.as_nanos()).unwrap_or(u64::MAX);
                    macro_rules! transfer {
                        ($sample_type:ty) => {
                            if let Some(samples) = data.as_slice::<$sample_type>() {
                                let frame_count = samples.len() / usize::from(channels);
                                block_count.store(frame_count as u64, Ordering::Relaxed);
                                for (offset, frame) in
                                    samples.chunks_exact(usize::from(channels)).enumerate()
                                {
                                    let value = cpal::Sample::to_sample::<f32>(
                                        frame[usize::from(channel_index)],
                                    );
                                    let sample = Sample {
                                        value,
                                        index: sample_index,
                                        captured_ns: base_ns.saturating_add(
                                            offset as u64 * 1_000_000_000 / u64::from(sample_rate),
                                        ),
                                    };
                                    callback_monitor.push(&mut monitor_producer, value);
                                    if producer.try_push(sample).is_err() {
                                        drop_count.fetch_add(1, Ordering::Relaxed);
                                    }
                                    sample_index += 1;
                                }
                                capture_count.store(sample_index, Ordering::Relaxed);
                            }
                        };
                    }
                    match sample_format {
                        cpal::SampleFormat::F32 => transfer!(f32),
                        cpal::SampleFormat::I16 => transfer!(i16),
                        cpal::SampleFormat::I32 => transfer!(i32),
                        cpal::SampleFormat::U16 => transfer!(u16),
                        _ => {}
                    }
                },
                move |_| {
                    error_flag.store(1, Ordering::Release);
                },
                Some(Duration::from_secs(3)),
            )
            .map_err(device_error)?;
        if !matches!(
            sample_format,
            cpal::SampleFormat::F32
                | cpal::SampleFormat::I16
                | cpal::SampleFormat::I32
                | cpal::SampleFormat::U16
        ) {
            return Err(AppError::new(
                "UNSUPPORTED_FORMAT",
                "이 입력 샘플 포맷은 지원하지 않습니다.",
                false,
            ));
        }
        let initial = AudioSnapshot {
            state: "STARTING",
            stream_generation: generation,
            device_id: Some(request.device_id),
            sample_rate,
            channels,
            channel_index,
            sample_format: sample_format.to_string(),
            noise_gate_dbfs: request.noise_gate_dbfs,
            buffer_frames: stream.buffer_size().ok().filter(|frames| *frames > 0),
            ..AudioSnapshot::default()
        };
        *self.snapshot.lock().map_err(|_| AppError::internal())? = initial;
        let worker_stop = stop.clone();
        let worker_failed = failed.clone();
        let status = self.snapshot.clone();
        let recording_router = self.recording_router.clone();
        let worker = thread::Builder::new()
            .name("guitarlab-input-dsp".into())
            .spawn(move || {
                let mut detector = Detector::new(sample_rate, request.noise_gate_dbfs);
                let mut sequence = 0;
                let mut last_sample = Instant::now();
                let mut last_publish = Instant::now();
                let mut latest = None;
                let mut latest_ns = 0;
                let mut onsets = Vec::with_capacity(128);
                while !worker_stop.load(Ordering::Acquire) {
                    // 녹음 분기는 비실시간 worker에서만 실행하고 callback은 기존 ring만 사용합니다.
                    let route = match recording_router.route() {
                        Ok(route) => route,
                        Err(_) => {
                            worker_failed.store(1, Ordering::Release);
                            break;
                        }
                    };
                    let mut processed = 0;
                    while processed < 8192 {
                        let Some(sample) = consumer.try_pop() else {
                            break;
                        };
                        last_sample = Instant::now();
                        latest_ns = sample.captured_ns;
                        if let Some(route) = &route {
                            route.push(sample);
                        }
                        if let Some(output) = detector.push(Sample {
                            value: if sample.value.is_finite() {
                                sample.value
                            } else {
                                0.0
                            },
                            ..sample
                        }) {
                            if let Some((attack, pitch)) = output.onset {
                                sequence += 1;
                                if onsets.len() == 128 {
                                    onsets.remove(0);
                                }
                                onsets.push(Onset {
                                    sequence,
                                    capture_sample_index: attack.index,
                                    captured_monotonic_ns: attack.captured_ns.to_string(),
                                    pitch_midi: pitch.map(|pitch| pitch.midi),
                                    confidence: pitch.map_or(0.0, |pitch| pitch.confidence),
                                });
                            }
                            latest = Some(output);
                        }
                        processed += 1;
                    }
                    if last_sample.elapsed() > Duration::from_secs(2) {
                        worker_failed.store(1, Ordering::Release);
                    }
                    let error = worker_failed.load(Ordering::Acquire) != 0;
                    if last_publish.elapsed() >= Duration::from_millis(100) || error {
                        if let Ok(mut snapshot) = status.lock() {
                            snapshot.state = if error {
                                "ERROR"
                            } else if captured.load(Ordering::Relaxed) > 0 {
                                "RUNNING"
                            } else {
                                "STARTING"
                            };
                            snapshot.error_code = if error {
                                Some("AUDIO_DEVICE_UNAVAILABLE")
                            } else {
                                None
                            };
                            snapshot.callback_frames = callback_frames.load(Ordering::Relaxed);
                            snapshot.captured_frames = captured.load(Ordering::Relaxed);
                            snapshot.dropped_frames = dropped.load(Ordering::Relaxed);
                            snapshot.discontinuities = detector.discontinuities;
                            // callback 종료 전에는 captured 카운터가 worker보다 늦을 수 있습니다.
                            snapshot.full_scale_frames =
                                detector.full_scale_frames.min(snapshot.captured_frames);
                            snapshot.captured_monotonic_ns = latest_ns.to_string();
                            snapshot.judgement_watermark_ns =
                                detector.judgement_watermark_ns(latest_ns).to_string();
                            snapshot.onsets.clone_from(&onsets);
                            snapshot.level_dbfs =
                                latest.as_ref().map_or(-120.0, |output| output.level_dbfs);
                            snapshot.pitch_midi = latest
                                .as_ref()
                                .and_then(|output| output.pitch.map(|pitch| pitch.midi));
                            snapshot.confidence = latest
                                .as_ref()
                                .and_then(|output| output.pitch.map(|pitch| pitch.confidence));
                            if error {
                                snapshot.pitch_midi = None;
                                snapshot.confidence = None;
                            }
                        }
                        last_publish = Instant::now();
                    }
                    if error {
                        break;
                    }
                    if processed == 0 {
                        thread::sleep(Duration::from_millis(2));
                    }
                }
            })
            .map_err(|_| AppError::internal())?;
        let running = RunningInput {
            stream: Some(stream),
            stop,
            failed,
            worker: Some(worker),
            monitor,
        };
        if let Err(error) = running
            .stream
            .as_ref()
            .ok_or_else(AppError::internal)?
            .play()
        {
            drop(running);
            let mut snapshot = self.snapshot.lock().map_err(|_| AppError::internal())?;
            snapshot.state = "ERROR";
            snapshot.error_code = Some("AUDIO_DEVICE_UNAVAILABLE");
            return Err(device_error(error));
        }
        *active = Some(running);
        self.snapshot
            .lock()
            .map(|snapshot| snapshot.clone())
            .map_err(|_| AppError::internal())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loopback_endpoints_are_excluded_from_input_selection() {
        assert!(is_loopback("Loopback L/R(SSL 2 MKII USB Audio Device)"));
        assert!(is_loopback("Stereo Mix"));
        assert!(!is_loopback("Input 1(SSL 2 MKII USB Audio Device)"));
    }
    #[test]
    fn failure_before_worker_publish_is_visible_and_stop_recovers() {
        let service = AudioService::default();
        let initial = service.snapshot().expect("초기 상태");
        let value = serde_json::to_value(initial).expect("상태 직렬화");
        assert_eq!(value["schemaVersion"], 1);
        assert_eq!(value["fullScaleFrames"], 0);
        service
            .snapshot
            .lock()
            .expect("테스트 상태")
            .full_scale_frames = 12;
        *service.active.lock().expect("테스트 상태") = Some(RunningInput {
            stream: None,
            stop: Arc::new(AtomicBool::new(false)),
            failed: Arc::new(AtomicU8::new(1)),
            worker: None,
            monitor: super::super::monitor::MonitorBuffer::new(48000).0,
        });
        let status = service.snapshot().expect("실패 조회");
        assert_eq!(status.state, "ERROR");
        assert_eq!(status.error_code, Some("AUDIO_DEVICE_UNAVAILABLE"));
        assert_eq!(status.full_scale_frames, 12);
        assert!(service.active.lock().expect("테스트 상태").is_none());
        let stopped = service
            .stop(StopRequest { schema_version: 1 })
            .expect("중단 복구");
        assert_eq!(stopped.state, "STOPPED");
        assert_eq!(stopped.error_code, None);
        assert_eq!(stopped.full_scale_frames, 12);
    }
    #[test]
    #[ignore = "실제 Windows 장치 열거용; 캡처하지 않음"]
    fn enumerate_connected_input_devices() {
        let list = list_devices().expect("장치 열거");
        println!("입력 장치 수: {}", list.devices.len());
        for device in list.devices {
            println!(
                "{}: {} Hz / {}채널 / {}",
                device.name, device.sample_rate, device.channels, device.sample_format
            );
        }
    }
    #[test]
    fn invalid_request_does_not_touch_hardware() {
        let service = AudioService::default();
        assert_eq!(
            service
                .profile_key(MonitorEnvironment::Headphones, 1)
                .expect_err("장치 세대 변경")
                .code,
            "INPUT_CHANGED"
        );
        assert_eq!(
            service
                .profile_key(MonitorEnvironment::Headphones, 0)
                .expect_err("미입력")
                .code,
            "INPUT_NOT_ACTIVE"
        );
        for (version, gate, id) in [
            (2, -50.0, "test"),
            (1, f64::NAN, "test"),
            (1, -90.0, "test"),
            (1, -50.0, ""),
        ] {
            assert!(service
                .start(InputRequest {
                    schema_version: version,
                    device_id: id.into(),
                    channel_index: 0,
                    noise_gate_dbfs: gate
                })
                .is_err());
        }
        assert!(service.stop(StopRequest { schema_version: 2 }).is_err());
        assert_eq!(
            service
                .stop(StopRequest { schema_version: 1 })
                .expect("정지")
                .state,
            "STOPPED"
        );
        assert_eq!(
            service
                .stop(StopRequest { schema_version: 1 })
                .expect("재정지")
                .state,
            "STOPPED"
        );
    }
}
