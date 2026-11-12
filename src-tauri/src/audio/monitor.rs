use super::monitor_playback::{self, MonitorPlaybackSnapshot, PlaybackControl, PlaybackVoice};
use super::playback_bus::{self, Bus, BusControl};
use crate::ipc::AppError;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::{
    traits::{Consumer, Observer, Producer},
    HeapCons, HeapProd, HeapRb,
};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering},
        Arc,
    },
    time::Duration,
};

/// 모니터 출력 직전의 삽입 처리(docs/12 "모니터 삽입 처리 v1"). 출력 callback에서 불리므로 할당·잠금·I/O를 하지 않습니다.
pub trait MonitorInsert: Send {
    /// mono DI 블록을 받아 같은 길이의 좌우 블록을 채웁니다.
    fn process(&mut self, input: &[f32], left: &mut [f32], right: &mut [f32]);
    /// 처리 지연(프레임). 화면의 지연 구성 추정에만 씁니다.
    fn latency_frames(&self) -> u32 {
        0
    }
    fn kind(&self) -> &'static str;
    /// 삽입 진단 계수(DSP 스레드를 쓰는 삽입만).
    fn stats(&self) -> Option<Arc<InsertStats>> {
        None
    }
    /// 실시간 Bypass 스위치(DSP 스레드가 읽음). AmpliTube 삽입만 있습니다.
    fn bypass_flag(&self) -> Option<Arc<AtomicBool>> {
        None
    }
    /// 첫 처리 조각 길이를 알려 받을 자리(DSP 스레드 삽입만). 보고 지연과 실제 시작 무음을 맞춥니다.
    fn prime_hint(&self) -> Option<Arc<AtomicU32>> {
        None
    }
}
/// docs/12 "모니터 AmpliTube 삽입 v1": 무음으로 바뀐 이유별 계수.
#[derive(Default)]
pub struct InsertStats {
    /// 결과가 늦어 무음이 된 프레임
    pub underrun: AtomicU64,
    /// DSP 입출력 링이 넘쳐 버린 프레임
    pub dropped: AtomicU64,
    /// 플러그인 처리 오류로 무음이 된 블록
    pub errors: AtomicU64,
}
/// 아무 처리 없이 원음을 좌우로 보냅니다(기존 모니터 출력과 같음).
pub struct DryInsert;
impl MonitorInsert for DryInsert {
    fn process(&mut self, input: &[f32], left: &mut [f32], right: &mut [f32]) {
        left.copy_from_slice(input);
        right.copy_from_slice(input);
    }
    fn kind(&self) -> &'static str {
        "DRY"
    }
}
const INSERT_BLOCK: usize = 1024;

#[derive(Clone, Copy, Debug)]
pub struct MonitorFrame {
    value: f32,
    session: u64,
}
pub struct MonitorBuffer {
    ring: Arc<HeapRb<MonitorFrame>>,
    session: AtomicU64,
    volume: AtomicU32,
    underrun: AtomicU64,
    dropped: AtomicU64,
    input_alive: AtomicBool,
}
impl MonitorBuffer {
    pub fn new(sample_rate: u32) -> (Arc<Self>, HeapProd<MonitorFrame>) {
        let ring = Arc::new(HeapRb::new((sample_rate / 10) as usize));
        let producer = HeapProd::new(ring.clone());
        (
            Arc::new(Self {
                ring,
                session: AtomicU64::new(0),
                volume: AtomicU32::new(0.25f32.to_bits()),
                underrun: AtomicU64::new(0),
                dropped: AtomicU64::new(0),
                input_alive: AtomicBool::new(true),
            }),
            producer,
        )
    }
    pub fn push(&self, producer: &mut HeapProd<MonitorFrame>, value: f32) {
        let session = self.session.load(Ordering::Acquire);
        if session != 0 && producer.try_push(MonitorFrame { value, session }).is_err() {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
    pub fn disable(&self) {
        self.session.store(0, Ordering::Release);
    }
    pub fn close_input(&self) {
        self.input_alive.store(false, Ordering::Release);
        self.disable();
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonitorRequest {
    pub schema_version: u8,
    pub expected_stream_generation: u64,
    pub output_device_id: String,
    pub volume: f32,
    /// docs/12 "모니터 AmpliTube 삽입 v1". 없으면 DRY입니다.
    #[serde(default)]
    pub insert: Option<InsertKind>,
}
#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InsertKind {
    Dry,
    Amplitube,
}
impl MonitorRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || self.expected_stream_generation == 0
            || self.expected_stream_generation > 9_007_199_254_740_991
            || self.output_device_id.is_empty()
            || self.output_device_id.len() > 512
        {
            return Err(AppError::invalid());
        }
        validate_volume(self.volume)
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonitorVolumeRequest {
    pub schema_version: u8,
    pub session_id: u64,
    pub volume: f32,
}
/// docs/12 "AmpliTube FX 랙·실시간 Bypass v1"
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonitorBypassRequest {
    pub schema_version: u8,
    pub session_id: u64,
    pub bypassed: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSnapshot {
    pub schema_version: u8,
    pub state: &'static str,
    pub session_id: u64,
    pub input_generation: u64,
    pub output_device_id: Option<String>,
    pub output_name: Option<String>,
    pub sample_rate: u32,
    pub channels: u16,
    pub buffer_frames: Option<u32>,
    pub volume: f32,
    pub queued_frames: u64,
    pub underrun_frames: u64,
    pub dropped_frames: u64,
    pub error_code: Option<&'static str>,
    pub insert: &'static str,
    pub queue_target_frames: u32,
    pub insert_latency_frames: u32,
    pub insert_underrun_frames: u64,
    pub insert_dropped_frames: u64,
    pub insert_error_blocks: u64,
    pub insert_bypassed: bool,
}
impl Default for MonitorSnapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            state: "STOPPED",
            session_id: 0,
            input_generation: 0,
            output_device_id: None,
            output_name: None,
            sample_rate: 0,
            channels: 0,
            buffer_frames: None,
            volume: 0.25,
            queued_frames: 0,
            underrun_frames: 0,
            dropped_frames: 0,
            error_code: None,
            insert: "DRY",
            queue_target_frames: 0,
            insert_latency_frames: 0,
            insert_underrun_frames: 0,
            insert_dropped_frames: 0,
            insert_error_blocks: 0,
            insert_bypassed: false,
        }
    }
}
fn validate_volume(volume: f32) -> Result<(), AppError> {
    if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
        return Err(AppError::invalid());
    }
    Ok(())
}
fn output_error(_: cpal::Error) -> AppError {
    AppError::new(
        "MONITOR_OUTPUT_UNAVAILABLE",
        "모니터 출력 장치를 사용할 수 없습니다. 연결과 출력 설정을 확인하세요.",
        true,
    )
}
pub fn list_outputs() -> Result<super::DeviceList, AppError> {
    let host = cpal::default_host();
    let default_id = host
        .default_output_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());
    let mut devices = Vec::new();
    for device in host.output_devices().map_err(output_error)? {
        let (Ok(id), Ok(description), Ok(config)) = (
            device.id(),
            device.description(),
            device.default_output_config(),
        ) else {
            continue;
        };
        if !(1..=2).contains(&config.channels()) || !(8000..=192000).contains(&config.sample_rate())
        {
            continue;
        }
        let id = id.to_string();
        devices.push(super::input::DeviceInfo {
            is_default: Some(default_id.as_deref() == Some(id.as_str())),
            id,
            name: description.name().to_owned(),
            channels: config.channels(),
            sample_rate: config.sample_rate(),
            sample_format: config.sample_format().to_string(),
        });
    }
    Ok(super::DeviceList {
        schema_version: 1,
        devices,
    })
}

struct MonitorReader {
    consumer: HeapCons<MonitorFrame>,
    shared: Arc<MonitorBuffer>,
    session: u64,
    prefill: usize,
    started: bool,
    insert: Box<dyn MonitorInsert>,
    playback: Option<PlaybackVoice>,
    /// docs/plugin/PLAYBACK-RUST-DESIGN.md R1: 삽입 뒤에 더하는 재생 버스(모니터 음량·입력 상태와 무관).
    bus: Option<Bus>,
    mono: Vec<f32>,
    left: Vec<f32>,
    right: Vec<f32>,
    bus_left: Vec<f32>,
    bus_right: Vec<f32>,
    sample_rate: u32,
}
impl MonitorReader {
    #[cfg(test)]
    fn new(shared: Arc<MonitorBuffer>, session: u64, sample_rate: u32) -> Self {
        Self::with_insert(shared, session, sample_rate, Box::new(DryInsert))
    }
    fn with_insert(
        shared: Arc<MonitorBuffer>,
        session: u64,
        sample_rate: u32,
        insert: Box<dyn MonitorInsert>,
    ) -> Self {
        // 시작/중단은 모니터 잠금으로 직렬화하고 이전 CPAL stream을 먼저 drop합니다.
        let mut consumer = HeapCons::new(shared.ring.clone());
        let queued = consumer.occupied_len();
        consumer.skip(queued);
        Self {
            consumer,
            shared,
            session,
            prefill: (sample_rate / 50) as usize,
            started: false,
            insert,
            playback: None,
            bus: None,
            // callback에서 할당하지 않도록 블록 버퍼를 미리 잡습니다.
            mono: vec![0.0; INSERT_BLOCK],
            left: vec![0.0; INSERT_BLOCK],
            right: vec![0.0; INSERT_BLOCK],
            bus_left: vec![0.0; INSERT_BLOCK],
            bus_right: vec![0.0; INSERT_BLOCK],
            sample_rate,
        }
    }
    #[cfg(test)]
    fn render<T: cpal::Sample + cpal::FromSample<f32>>(
        &mut self,
        output: &mut [T],
        channels: usize,
        input_failed: bool,
    ) {
        self.render_timed(output, channels, input_failed, None);
    }
    /// `playback_ns`: 이 callback 첫 프레임이 장치에서 소리 나는 시각(QPC ns, R3 녹음 정렬).
    fn render_timed<T: cpal::Sample + cpal::FromSample<f32>>(
        &mut self,
        output: &mut [T],
        channels: usize,
        input_failed: bool,
        playback_ns: Option<u64>,
    ) {
        let enabled = !input_failed
            && self.shared.input_alive.load(Ordering::Acquire)
            && self.shared.session.load(Ordering::Acquire) == self.session;
        let volume = f32::from_bits(self.shared.volume.load(Ordering::Relaxed));
        let queued = self.consumer.occupied_len();
        if queued > self.prefill * 3 {
            let skipped = self.consumer.skip(queued - self.prefill);
            self.shared
                .dropped
                .fetch_add(skipped as u64, Ordering::Relaxed);
        }
        if !self.started && queued >= self.prefill {
            self.started = true;
        }
        let mut missing = 0;
        let total = output.len() / channels;
        let mut done = 0;
        while done < total {
            let count = (total - done).min(INSERT_BLOCK);
            for value in &mut self.mono[..count] {
                *value = 0.0;
                if enabled && self.started {
                    // 이전 세션에서 전송 중이던 샘플은 최대 ring 용량만큼만 버립니다.
                    for _ in 0..self.shared.ring.capacity().get() {
                        match self.consumer.try_pop() {
                            Some(sample) if sample.session == self.session => {
                                if sample.value.is_finite() {
                                    *value = sample.value;
                                }
                                break;
                            }
                            Some(_) => continue,
                            None => {
                                missing += 1;
                                break;
                            }
                        }
                    }
                }
            }
            if enabled {
                // docs/12 "모니터 테이크 재생 v1": 테이크 DI를 삽입 앞에서 더합니다.
                if let Some(playback) = &mut self.playback {
                    playback.mix(&mut self.mono[..count]);
                }
            }
            self.insert.process(
                &self.mono[..count],
                &mut self.left[..count],
                &mut self.right[..count],
            );
            // 모니터 음량은 삽입 뒤의 출력 음량입니다. 유한하지 않은 삽입 결과는 무음으로 둡니다.
            let level = |sample: f32| {
                if sample.is_finite() {
                    (sample * volume).clamp(-1.0, 1.0)
                } else {
                    0.0
                }
            };
            self.bus_left[..count].fill(0.0);
            self.bus_right[..count].fill(0.0);
            if let Some(bus) = &mut self.bus {
                let ns = playback_ns.map(|ns| {
                    ns + (done as u64).saturating_mul(1_000_000_000)
                        / u64::from(self.sample_rate.max(1))
                });
                bus.render_at(
                    &mut self.bus_left[..count],
                    &mut self.bus_right[..count],
                    ns,
                );
            }
            for (i, frame) in output[done * channels..(done + count) * channels]
                .chunks_exact_mut(channels)
                .enumerate()
            {
                // 입력이 끊기거나 세션이 바뀌면 남은 큐·잔향을 내보내지 않고 바로 무음입니다.
                let (left, right) = if enabled {
                    (level(self.left[i]), level(self.right[i]))
                } else {
                    (0.0, 0.0)
                };
                let mix = |monitor: f32, bus: f32| {
                    if bus.is_finite() {
                        (monitor + bus).clamp(-1.0, 1.0)
                    } else {
                        monitor
                    }
                };
                let (left, right) = (mix(left, self.bus_left[i]), mix(right, self.bus_right[i]));
                if channels == 1 {
                    frame[0] = T::from_sample((left + right) * 0.5);
                } else {
                    frame[0] = T::from_sample(left);
                    frame[1] = T::from_sample(right);
                    for extra in &mut frame[2..] {
                        *extra = T::from_sample(0.0);
                    }
                }
            }
            done += count;
        }
        self.shared.underrun.fetch_add(missing, Ordering::Relaxed);
        if missing > 0 {
            self.started = false;
        }
    }
}
struct RunningMonitor {
    stream: Option<cpal::Stream>,
    shared: Arc<MonitorBuffer>,
    failed: Arc<AtomicU8>,
    input_failed: Arc<AtomicU8>,
    insert_stats: Option<Arc<InsertStats>>,
    insert_bypass: Option<Arc<AtomicBool>>,
    playback: PlaybackControl,
    /// 입력 없이 재생 버스만 내보내는 stream(R1).
    output_only: bool,
    output_device_id: String,
}
impl Drop for RunningMonitor {
    fn drop(&mut self) {
        self.shared.disable();
        self.stream.take();
    }
}
#[derive(Default)]
pub struct MonitorService {
    running: Option<RunningMonitor>,
    snapshot: MonitorSnapshot,
    sequence: u64,
    bus: Option<BusControl>,
    /// 재생 출력을 켜 둔 장치. 모니터를 꺼도 이 장치로 재생 출력을 이어 갑니다.
    output_device_id: Option<String>,
    output_error: Option<&'static str>,
    /// 검사용: 모니터 stream 만들기 실패를 흉내 냅니다.
    #[cfg(test)]
    fail_monitor_build: bool,
}
/// 장치·형식 선택 결과.
struct OutputTarget {
    device: cpal::Device,
    config: cpal::SupportedStreamConfig,
}
fn find_output(device_id: &str, sample_rate: Option<u32>) -> Result<OutputTarget, AppError> {
    let device = cpal::default_host()
        .output_devices()
        .map_err(output_error)?
        .find(|device| device.id().is_ok_and(|id| id.to_string() == device_id))
        .ok_or_else(|| {
            AppError::new(
                "MONITOR_OUTPUT_UNAVAILABLE",
                "선택한 출력 장치를 찾지 못했습니다.",
                true,
            )
        })?;
    let default = device.default_output_config().map_err(output_error)?;
    let config = match sample_rate {
        None => default,
        Some(rate) if default.sample_rate() == rate => default,
        Some(rate) => device
            .supported_output_configs()
            .map_err(output_error)?
            .find(|config| {
                (1..=2).contains(&config.channels())
                    && config.min_sample_rate() <= rate
                    && config.max_sample_rate() >= rate
            })
            .map(|config| config.with_sample_rate(rate))
            .ok_or_else(|| {
                AppError::new(
                    "MONITOR_RATE_UNSUPPORTED",
                    "입력과 출력의 샘플레이트를 같게 설정하세요.",
                    true,
                )
            })?,
    };
    if !(1..=2).contains(&config.channels())
        || !matches!(
            config.sample_format(),
            cpal::SampleFormat::F32
                | cpal::SampleFormat::F64
                | cpal::SampleFormat::I16
                | cpal::SampleFormat::I32
                | cpal::SampleFormat::U16
        )
    {
        return Err(AppError::new(
            "UNSUPPORTED_FORMAT",
            "모니터는 mono/stereo 출력을 지원합니다.",
            false,
        ));
    }
    Ok(OutputTarget { device, config })
}
fn build_stream(
    target: &OutputTarget,
    mut reader: MonitorReader,
    failed: Arc<AtomicU8>,
    input_failed: Arc<AtomicU8>,
) -> Result<cpal::Stream, AppError> {
    let channels = target.config.channels();
    let format = target.config.sample_format();
    let callback_failed = failed.clone();
    target
        .device
        .build_output_stream_raw(
            target.config.config(),
            format,
            move |data, info: &cpal::OutputCallbackInfo| {
                let invalid = input_failed.load(Ordering::Acquire) != 0
                    || callback_failed.load(Ordering::Acquire) != 0;
                let playback_ns = u64::try_from(info.timestamp().playback.as_nanos()).ok();
                macro_rules! render {
                    ($t:ty) => {
                        if let Some(output) = data.as_slice_mut::<$t>() {
                            reader.render_timed(output, usize::from(channels), invalid, playback_ns)
                        }
                    };
                }
                match format {
                    cpal::SampleFormat::F32 => render!(f32),
                    cpal::SampleFormat::F64 => render!(f64),
                    cpal::SampleFormat::I16 => render!(i16),
                    cpal::SampleFormat::I32 => render!(i32),
                    cpal::SampleFormat::U16 => render!(u16),
                    _ => {}
                }
            },
            move |_| {
                failed.store(1, Ordering::Release);
            },
            Some(Duration::from_secs(3)),
        )
        .map_err(output_error)
}
impl MonitorService {
    pub fn start(
        &mut self,
        request: MonitorRequest,
        shared: Arc<MonitorBuffer>,
        input_failed: Arc<AtomicU8>,
        sample_rate: u32,
        insert: Box<dyn MonitorInsert>,
    ) -> Result<MonitorSnapshot, AppError> {
        let result = self.start_monitor(request, shared, input_failed, sample_rate, insert);
        // 재생만 하던 stream을 버린 뒤 모니터 stream을 열지 못했으면 재생 출력을 다시 엽니다
        // (실패하면 output_error가 남아 네이티브 재생이 prepared:false가 됨).
        if result.is_err() && self.running.is_none() {
            if let Some(device) = self.output_device_id.clone() {
                self.resume_output(&device);
            }
        }
        result
    }
    fn start_monitor(
        &mut self,
        request: MonitorRequest,
        shared: Arc<MonitorBuffer>,
        input_failed: Arc<AtomicU8>,
        sample_rate: u32,
        insert: Box<dyn MonitorInsert>,
    ) -> Result<MonitorSnapshot, AppError> {
        request.validate()?;
        if !shared.input_alive.load(Ordering::Acquire) || input_failed.load(Ordering::Acquire) != 0
        {
            return Err(AppError::new(
                "INPUT_NOT_ACTIVE",
                "기타 입력이 중단되었습니다.",
                true,
            ));
        }
        if self.running.as_ref().is_some_and(|r| !r.output_only) {
            return Err(AppError::new(
                "MONITOR_ALREADY_ACTIVE",
                "모니터를 먼저 끄세요.",
                true,
            ));
        }
        let target = find_output(&request.output_device_id, Some(sample_rate))?;
        // 재생만 하던 stream은 같은 버스 상태로 모니터 stream에 합칩니다(R1).
        self.running.take();
        let channels = target.config.channels();
        let session = self
            .sequence
            .checked_add(1)
            .ok_or_else(AppError::internal)?;
        self.sequence = session;
        let mut reader = MonitorReader::with_insert(shared.clone(), session, sample_rate, insert);
        let (mut playback, voice) = monitor_playback::pair(sample_rate);
        reader.playback = Some(voice);
        reader.bus = Some(self.respawn_bus(sample_rate));
        let (insert, queue_target_frames, mut insert_latency_frames, insert_stats) = (
            reader.insert.kind(),
            reader.prefill as u32,
            reader.insert.latency_frames(),
            reader.insert.stats(),
        );
        let insert_bypass = reader.insert.bypass_flag();
        let prime_hint = reader.insert.prime_hint();
        shared
            .volume
            .store(request.volume.to_bits(), Ordering::Relaxed);
        shared.underrun.store(0, Ordering::Relaxed);
        shared.dropped.store(0, Ordering::Relaxed);
        let failed = Arc::new(AtomicU8::new(0));
        #[cfg(test)]
        if self.fail_monitor_build {
            return Err(AppError::new(
                "MONITOR_OUTPUT_UNAVAILABLE",
                "검사용 실패",
                true,
            ));
        }
        let stream = build_stream(&target, reader, failed.clone(), input_failed.clone())?;
        let device = &target.device;
        let buffer_frames = stream.buffer_size().ok().filter(|frames| *frames > 0);
        if let Some(hint) = &prime_hint {
            // DSP 스레드 삽입은 첫 처리 조각(최대 INSERT_BLOCK) 길이만큼 무음으로 시작합니다(docs/12).
            // 재생 전에 그 길이를 알려 보고 지연·테이크 선행 보정과 실제 무음을 같게 합니다.
            let first = buffer_frames.map_or(INSERT_BLOCK as u32, |b| b.min(INSERT_BLOCK as u32));
            hint.store(first, Ordering::Release);
            insert_latency_frames += first;
        }
        playback.set_lead(u64::from(insert_latency_frames));
        let name = device
            .description()
            .map_err(output_error)?
            .name()
            .to_owned();
        let running = RunningMonitor {
            stream: Some(stream),
            shared,
            failed,
            input_failed,
            insert_stats,
            insert_bypass,
            playback,
            output_only: false,
            output_device_id: request.output_device_id.clone(),
        };
        running.shared.session.store(session, Ordering::Release);
        running
            .stream
            .as_ref()
            .ok_or_else(AppError::internal)?
            .play()
            .map_err(output_error)?;
        self.snapshot = MonitorSnapshot {
            state: "RUNNING",
            session_id: session,
            input_generation: request.expected_stream_generation,
            output_device_id: Some(request.output_device_id),
            output_name: Some(name),
            sample_rate,
            channels,
            buffer_frames,
            volume: request.volume,
            insert,
            queue_target_frames,
            insert_latency_frames,
            ..MonitorSnapshot::default()
        };
        self.follow_monitor_device(&running.output_device_id);
        self.running = Some(running);
        // 새 출력 stream이 열렸으니 이전 출력 실패 기록은 지웁니다(네이티브 재생 복구).
        self.output_error = None;
        self.status(Some(request.expected_stream_generation))
    }
    pub fn status(&mut self, input_generation: Option<u64>) -> Result<MonitorSnapshot, AppError> {
        // 모니터 상태 조회(화면이 주기적으로 부름)마다 callback이 놓은 이전 재생 PCM을 해제합니다.
        if let Some(bus) = &mut self.bus {
            bus.release();
        }
        if let Some(running) = &mut self.running {
            running.playback.release();
        }
        if let Some(running) = self.running.as_ref().filter(|r| r.output_only) {
            // 재생만 하는 stream은 모니터 상태를 바꾸지 않고 출력 실패만 기록합니다.
            if running.failed.load(Ordering::Acquire) != 0 {
                self.running.take();
                self.output_error = Some("MONITOR_OUTPUT_UNAVAILABLE");
            }
            return Ok(self.snapshot.clone());
        }
        if let Some(running) = &self.running {
            self.snapshot.queued_frames = running.shared.ring.occupied_len() as u64;
            self.snapshot.underrun_frames = running.shared.underrun.load(Ordering::Relaxed);
            self.snapshot.dropped_frames = running.shared.dropped.load(Ordering::Relaxed);
            if let Some(stats) = &running.insert_stats {
                self.snapshot.insert_underrun_frames = stats.underrun.load(Ordering::Relaxed);
                self.snapshot.insert_dropped_frames = stats.dropped.load(Ordering::Relaxed);
                self.snapshot.insert_error_blocks = stats.errors.load(Ordering::Relaxed);
            }
            let code = if input_generation != Some(self.snapshot.input_generation)
                || !running.shared.input_alive.load(Ordering::Acquire)
                || running.input_failed.load(Ordering::Acquire) != 0
            {
                Some("INPUT_NOT_ACTIVE")
            } else if running.failed.load(Ordering::Acquire) != 0 {
                Some("MONITOR_OUTPUT_UNAVAILABLE")
            } else {
                None
            };
            if let Some(code) = code {
                let device = running.output_device_id.clone();
                self.running.take();
                if code == "MONITOR_OUTPUT_UNAVAILABLE" {
                    self.output_error = Some(code);
                } else {
                    self.resume_output(&device);
                }
                self.snapshot.state = "ERROR";
                self.snapshot.error_code = Some(code);
                self.snapshot.queued_frames = 0;
            }
        }
        Ok(self.snapshot.clone())
    }
    pub fn stop(&mut self) -> MonitorSnapshot {
        // 재생만 하는 stream은 그대로 두고, 모니터 stream을 끄면 재생 출력을 이어 갑니다.
        if let Some(device) = self
            .running
            .as_ref()
            .filter(|r| !r.output_only)
            .map(|r| r.output_device_id.clone())
        {
            self.running.take();
            self.resume_output(&device);
        }
        self.snapshot.state = "STOPPED";
        self.snapshot.error_code = None;
        self.snapshot.queued_frames = 0;
        self.snapshot.clone()
    }
    pub fn set_volume(
        &mut self,
        request: MonitorVolumeRequest,
    ) -> Result<MonitorSnapshot, AppError> {
        if request.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_volume(request.volume)?;
        let running = self
            .running
            .as_ref()
            .filter(|_| request.session_id == self.snapshot.session_id)
            .ok_or_else(|| {
                AppError::new("MONITOR_CHANGED", "모니터 상태가 변경되었습니다.", true)
            })?;
        running
            .shared
            .volume
            .store(request.volume.to_bits(), Ordering::Relaxed);
        self.snapshot.volume = request.volume;
        Ok(self.snapshot.clone())
    }
    pub fn set_bypass(
        &mut self,
        request: MonitorBypassRequest,
    ) -> Result<MonitorSnapshot, AppError> {
        if request.schema_version != 1 {
            return Err(AppError::invalid());
        }
        let running = self
            .running
            .as_ref()
            .filter(|_| request.session_id == self.snapshot.session_id)
            .ok_or_else(|| {
                AppError::new("MONITOR_CHANGED", "모니터 상태가 변경되었습니다.", true)
            })?;
        let flag = running.insert_bypass.as_ref().ok_or_else(|| {
            AppError::new(
                "MONITOR_NOT_AMPLITUBE",
                "모니터를 AmpliTube로 켠 뒤 Bypass를 쓰세요.",
                true,
            )
        })?;
        flag.store(request.bypassed, Ordering::Relaxed);
        self.snapshot.insert_bypassed = request.bypassed;
        Ok(self.snapshot.clone())
    }
    /// AmpliTube 모니터가 실행 중일 때 그 샘플레이트(테이크 재생은 이 모니터에서만 합니다).
    pub fn playback_rate(&self) -> Result<u32, AppError> {
        self.running
            .as_ref()
            .filter(|r| !r.output_only && self.snapshot.insert == "AMPLITUBE")
            .map(|running| running.playback.sample_rate())
            .ok_or_else(|| {
                AppError::new(
                    "MONITOR_NOT_AMPLITUBE",
                    "모니터를 AmpliTube로 켠 뒤 테이크를 선택하세요.",
                    true,
                )
            })
    }
    /// docs/12 "모니터 테이크 재생 v1": 테이크 재생을 올릴 대상(샘플레이트, 모니터 세션).
    pub fn playback_target(&self) -> Result<(u32, u64), AppError> {
        Ok((self.playback_rate()?, self.snapshot.session_id))
    }
    /// 읽는 동안 모니터가 바뀌었으면(다른 세션·샘플레이트) 올리지 않습니다.
    pub fn load_playback_for(
        &mut self,
        target: (u32, u64),
        take_id: String,
        clip: Vec<f32>,
    ) -> Result<MonitorPlaybackSnapshot, AppError> {
        if self.playback_target()? != target {
            return Err(AppError::new(
                "MONITOR_CHANGED",
                "테이크를 읽는 동안 모니터가 바뀌었습니다. 다시 선택하세요.",
                true,
            ));
        }
        self.load_playback(Some(take_id), Some(clip))
    }
    pub fn load_playback(
        &mut self,
        take_id: Option<String>,
        clip: Option<Vec<f32>>,
    ) -> Result<MonitorPlaybackSnapshot, AppError> {
        if take_id.is_some() {
            self.playback_rate()?;
        }
        match &mut self.running {
            Some(running) => {
                running.playback.load(take_id, clip)?;
                Ok(running.playback.snapshot())
            }
            None => Ok(MonitorPlaybackSnapshot::empty(0)),
        }
    }
    pub fn set_playback(
        &mut self,
        playing: bool,
        position_ms: f64,
    ) -> Result<MonitorPlaybackSnapshot, AppError> {
        let running = self.running.as_mut().ok_or_else(|| {
            AppError::new(
                "PLAYBACK_NOT_LOADED",
                "AmpliTube로 재생할 테이크가 없습니다. 모니터를 켠 뒤 다시 선택하세요.",
                true,
            )
        })?;
        running.playback.set(playing, position_ms)?;
        Ok(running.playback.snapshot())
    }
    /// 버스 제어를 이 샘플레이트로 이어 받을 callback 쪽을 만듭니다.
    fn respawn_bus(&mut self, sample_rate: u32) -> Bus {
        match &mut self.bus {
            Some(control) => control.respawn(sample_rate),
            None => {
                let (control, bus) = playback_bus::pair(sample_rate);
                self.bus = Some(control);
                bus
            }
        }
    }
    /// 재생 출력이 켜져 있으면 모니터 장치로 옮겨 기록합니다. 모니터를 꺼도 이전 장치로 돌아가지 않게 합니다(리뷰 R11-2).
    fn follow_monitor_device(&mut self, device_id: &str) {
        if let Some(device) = &mut self.output_device_id {
            device_id.clone_into(device);
        }
    }
    /// 모니터가 꺼졌을 때 재생 출력을 켜 둔 상태면 재생만 하는 stream을 다시 엽니다.
    fn resume_output(&mut self, fallback_device: &str) {
        let Some(device) = self.output_device_id.clone() else {
            return;
        };
        let device = if device.is_empty() {
            fallback_device.to_owned()
        } else {
            device
        };
        if let Err(error) = self.open_output_only(&device) {
            self.output_error = Some(error.code);
        }
    }
    fn open_output_only(&mut self, device_id: &str) -> Result<(), AppError> {
        self.running.take();
        // 재생만 할 때는 장치 기본 샘플레이트를 쓰되, 이미 불러온 음원이 있으면 그 샘플레이트를 유지합니다.
        let keep = self
            .bus
            .as_ref()
            .filter(|b| b.has_voices())
            .map(|b| b.sample_rate());
        let target = find_output(device_id, keep)?;
        let sample_rate = target.config.sample_rate();
        let (shared, _producer) = MonitorBuffer::new(sample_rate);
        shared.close_input();
        let mut reader =
            MonitorReader::with_insert(shared.clone(), 0, sample_rate, Box::new(DryInsert));
        reader.bus = Some(self.respawn_bus(sample_rate));
        let (playback, _voice) = monitor_playback::pair(sample_rate);
        let failed = Arc::new(AtomicU8::new(0));
        let input_failed = Arc::new(AtomicU8::new(0));
        let stream = build_stream(&target, reader, failed.clone(), input_failed.clone())?;
        stream.play().map_err(output_error)?;
        self.running = Some(RunningMonitor {
            stream: Some(stream),
            shared,
            failed,
            input_failed,
            insert_stats: None,
            insert_bypass: None,
            playback,
            output_only: true,
            output_device_id: device_id.to_owned(),
        });
        self.output_error = None;
        Ok(())
    }
    /// R1: 재생 출력 켜기. 모니터가 켜져 있으면 그 stream의 버스를 그대로 씁니다(같은 장치 원칙).
    pub fn start_output(&mut self, device_id: &str) -> Result<u32, AppError> {
        if device_id.is_empty() || device_id.len() > 512 {
            return Err(AppError::invalid());
        }
        self.output_device_id = Some(device_id.to_owned());
        match &self.running {
            Some(running) if !running.output_only => {}
            Some(running) if running.output_device_id == device_id => {}
            _ => self.open_output_only(device_id)?,
        }
        self.bus
            .as_ref()
            .map(BusControl::sample_rate)
            .ok_or_else(AppError::internal)
    }
    /// R1: 재생 출력 끄기. 모니터 stream은 그대로 두고 버스만 멈춥니다.
    pub fn stop_output(&mut self) -> Result<(), AppError> {
        self.output_device_id = None;
        if let Some(bus) = &mut self.bus {
            bus.pause()?;
        }
        if self.running.as_ref().is_some_and(|r| r.output_only) {
            self.running.take();
        }
        Ok(())
    }
    /// 재생만 하는 출력 stream이 열려 있는지(검사·진단용).
    pub fn output_only_open(&self) -> bool {
        self.running.as_ref().is_some_and(|r| r.output_only)
    }
    pub fn bus(&mut self) -> Option<&mut BusControl> {
        self.bus.as_mut()
    }
    /// 재생 출력 상태만 확인합니다(모니터 상태는 건드리지 않음). 재생만 하는 stream의 출력 실패를 기록합니다.
    pub fn check_output(&mut self) {
        if self
            .running
            .as_ref()
            .is_some_and(|r| r.output_only && r.failed.load(Ordering::Acquire) != 0)
        {
            self.running.take();
            self.output_error = Some("MONITOR_OUTPUT_UNAVAILABLE");
        }
    }
    pub fn output_error(&self) -> Option<&'static str> {
        self.output_error
    }
    pub fn playback(&self) -> MonitorPlaybackSnapshot {
        self.running.as_ref().map_or_else(
            || MonitorPlaybackSnapshot::empty(0),
            |r| r.playback.snapshot(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn monitor_on_another_device_moves_native_playback_output_there() {
        // 리뷰 R11-2: A로 재생 준비 → B로 모니터 시작 → 모니터 끄면 B로 재생을 이어 갑니다.
        let mut service = MonitorService {
            output_device_id: Some("A".into()),
            ..MonitorService::default()
        };
        service.follow_monitor_device("B");
        assert_eq!(service.output_device_id.as_deref(), Some("B"));
        // 재생 출력을 켜지 않았으면 모니터만으로 재생 출력을 켜지 않습니다.
        let mut idle = MonitorService::default();
        idle.follow_monitor_device("B");
        assert_eq!(idle.output_device_id, None);
    }
    #[test]
    fn output_default_flag_is_optional_in_version_one_device_contract() {
        let mut device = super::super::input::DeviceInfo {
            id: "fixture-output".into(),
            name: "DEMO 출력".into(),
            channels: 2,
            sample_rate: 48000,
            sample_format: "f32".into(),
            is_default: None,
        };
        assert!(serde_json::to_value(&device)
            .expect("기존 계약")
            .get("isDefault")
            .is_none());
        device.is_default = Some(true);
        assert_eq!(
            serde_json::to_value(&device).expect("기본 출력 계약")["isDefault"],
            true
        );
    }
    #[test]
    #[ignore = "실제 출력 장치 열거용; 입력 캡처나 출력 스트림을 시작하지 않음"]
    fn enumerate_connected_monitor_outputs() {
        let list = list_outputs().expect("출력 열거");
        for device in list.devices {
            println!(
                "모니터 출력: {} / {} Hz / {}채널 / {}",
                device.name, device.sample_rate, device.channels, device.sample_format
            );
        }
    }
    #[test]
    #[ignore = "실제 출력 장치를 엶(음원 없이 무음). 이름에 \"3/4\"가 든 출력이 있을 때만"]
    fn output_only_stream_opens_runs_and_closes_silently() {
        let Some(device) = list_outputs()
            .expect("출력 열거")
            .devices
            .into_iter()
            .find(|d| d.name.contains("3/4"))
        else {
            return;
        };
        let mut service = MonitorService::default();
        let rate = service.start_output(&device.id).expect("재생 출력");
        assert!(service.running.as_ref().is_some_and(|r| r.output_only));
        std::thread::sleep(Duration::from_millis(300));
        let (position, playing) = service.bus().expect("버스").position();
        assert_eq!(
            (position, playing),
            (0, false),
            "재생 명령 전에는 위치 그대로"
        );
        service.bus().expect("버스").play(0).expect("play");
        std::thread::sleep(Duration::from_millis(300));
        let (position, playing) = service.bus().expect("버스").position();
        assert!(
            playing && position > u64::from(rate) / 10,
            "callback이 위치를 진행: {position}"
        );
        assert_eq!(
            service.status(None).expect("상태").state,
            "STOPPED",
            "모니터 상태는 그대로"
        );
        assert!(service.output_error().is_none());
        service.stop_output().expect("끄기");
        assert!(service.running.is_none());
        println!("재생 출력 {} Hz, 0.3초 동안 {position}프레임", rate);
    }
    #[test]
    #[ignore = "실제 출력 장치를 엶(음원 없이 무음). 이름에 \"3/4\"가 든 출력이 있을 때만"]
    fn failed_prepare_cleanup_closes_the_output_it_opened() {
        // 리뷰 R5-4: 준비 실패 정리(release_output)가 재생만 하던 stream을 닫습니다.
        let Some(device) = list_outputs()
            .expect("출력 열거")
            .devices
            .into_iter()
            .find(|d| d.name.contains("3/4"))
        else {
            return;
        };
        let mut m = MonitorService::default();
        m.start_output(&device.id).expect("재생 출력");
        assert!(m.output_only_open());
        crate::commands::native_playback_api::release_output(&mut m).expect("정리");
        assert!(!m.output_only_open());
        assert!(!m.bus().expect("버스").has_voices());
    }
    #[test]
    #[ignore = "실제 출력 장치를 엶(입력 없이 음량 0, 무음). 이름에 \"3/4\"가 든 출력이 있을 때만"]
    fn restarted_monitor_clears_previous_output_error() {
        // 리뷰 R6-1: 출력 실패 기록이 있어도 모니터 stream이 새로 열리면 지워 네이티브 재생이 복구됩니다.
        let Some(device) = list_outputs()
            .expect("출력 열거")
            .devices
            .into_iter()
            .find(|d| d.name.contains("3/4"))
        else {
            return;
        };
        let mut service = MonitorService {
            output_error: Some("MONITOR_OUTPUT_UNAVAILABLE"),
            ..MonitorService::default()
        };
        let (shared, _producer) = MonitorBuffer::new(device.sample_rate);
        let request = MonitorRequest {
            schema_version: 1,
            expected_stream_generation: 1,
            output_device_id: device.id.clone(),
            volume: 0.0,
            insert: None,
        };
        service
            .start(
                request,
                shared,
                Arc::new(AtomicU8::new(0)),
                device.sample_rate,
                Box::new(DryInsert),
            )
            .expect("모니터");
        assert!(service.output_error().is_none());
        service.stop();
    }
    #[test]
    #[ignore = "실제 출력 장치를 엶(음량 0, 무음). 이름에 \"3/4\"가 든 출력이 있을 때만"]
    fn failed_monitor_start_reopens_native_playback_output() {
        // 리뷰 R7-1: 재생만 하던 stream을 버린 뒤 모니터 stream이 실패하면 재생 출력을 다시 엽니다.
        let Some(device) = list_outputs()
            .expect("출력 열거")
            .devices
            .into_iter()
            .find(|d| d.name.contains("3/4"))
        else {
            return;
        };
        let mut service = MonitorService::default();
        let rate = service.start_output(&device.id).expect("재생 출력");
        service
            .bus()
            .expect("버스")
            .set_voices(playback_bus::VoiceSet {
                sample_rate: rate,
                voices: vec![playback_bus::BusVoice {
                    left: vec![0.0; 4].into(),
                    right: vec![0.0; 4].into(),
                    start_frame: 0,
                    gain: 0.0,
                    recorded_rate: 1.0,
                }],
            })
            .expect("보이스");
        service.fail_monitor_build = true;
        let (shared, _producer) = MonitorBuffer::new(rate);
        let request = MonitorRequest {
            schema_version: 1,
            expected_stream_generation: 1,
            output_device_id: device.id.clone(),
            volume: 0.0,
            insert: None,
        };
        assert!(service
            .start(
                request,
                shared,
                Arc::new(AtomicU8::new(0)),
                rate,
                Box::new(DryInsert)
            )
            .is_err());
        assert!(service.output_only_open(), "재생 출력을 다시 엶");
        assert!(service.output_error().is_none());
        assert!(
            service.bus().expect("버스").has_voices(),
            "같은 샘플레이트라 보이스 유지"
        );
        service.stop_output().expect("끄기");
    }
    #[test]
    fn take_playback_is_not_loaded_into_a_restarted_monitor() {
        // 리뷰 R5-3: 읽는 동안 모니터가 다시 켜지면(세션·샘플레이트 변경) 이전 PCM을 올리지 않습니다.
        let (shared, _producer) = MonitorBuffer::new(48000);
        let mut service = MonitorService {
            snapshot: MonitorSnapshot {
                state: "RUNNING",
                session_id: 1,
                insert: "AMPLITUBE",
                ..MonitorSnapshot::default()
            },
            running: Some(RunningMonitor {
                stream: None,
                shared,
                failed: Arc::new(AtomicU8::new(0)),
                input_failed: Arc::new(AtomicU8::new(0)),
                insert_stats: None,
                insert_bypass: None,
                playback: monitor_playback::pair(48000).0,
                output_only: false,
                output_device_id: "fixture-output".into(),
            }),
            sequence: 1,
            ..MonitorService::default()
        };
        let target = service.playback_target().expect("대상");
        assert_eq!(target, (48000, 1));
        let take = "00000000-0000-4000-8000-000000000001".to_owned();
        assert_eq!(
            service
                .load_playback_for((48000, 2), take.clone(), vec![0.0; 4])
                .map(|_| ())
                .map_err(|e| e.code),
            Err("MONITOR_CHANGED")
        );
        assert_eq!(
            service
                .load_playback_for((96000, 1), take.clone(), vec![0.0; 4])
                .map(|_| ())
                .map_err(|e| e.code),
            Err("MONITOR_CHANGED")
        );
        assert!(service
            .load_playback_for(target, take, vec![0.0; 4])
            .is_ok());
    }
    #[test]
    fn bus_plays_after_insert_without_input_and_ignores_monitor_volume() {
        // R1: 입력이 닫힌(재생만 하는) reader에서도 버스 소리는 나오고, 모니터 음량을 쓰지 않습니다.
        let (shared, _producer) = MonitorBuffer::new(1000);
        shared.close_input();
        shared.volume.store(0.0f32.to_bits(), Ordering::Relaxed);
        let mut reader = MonitorReader::new(shared, 0, 1000);
        let (mut control, bus) = playback_bus::pair(1000);
        reader.bus = Some(bus);
        control
            .set_voices(playback_bus::VoiceSet {
                sample_rate: 1000,
                voices: vec![playback_bus::BusVoice {
                    left: vec![0.25, 3.0, 1.0].into(),
                    right: vec![-0.5, 0.5, f32::NAN].into(),
                    start_frame: 0,
                    gain: 1.0,
                    recorded_rate: 1.0,
                }],
            })
            .expect("voices");
        let mut output = vec![9.0f32; 4];
        reader.render(&mut output, 2, false);
        assert_eq!(output, vec![0.0; 4], "재생 전에는 무음");
        control.play(0).expect("play");
        let mut output = vec![9.0f32; 6];
        reader.render(&mut output, 2, false);
        // 3.0은 1.0으로 제한, NaN이 든 프레임은 좌우 모두 건너뜀
        assert_eq!(output, vec![0.25, -0.5, 1.0, 0.5, 0.0, 0.0]);
        let mut mono = vec![9.0f32; 1];
        control.seek(0).expect("seek");
        reader.render(&mut mono, 1, false);
        assert_eq!(mono, vec![-0.125]);
    }
    #[test]
    fn callback_scales_selected_mono_to_both_channels_without_changing_input() {
        let (shared, mut producer) = MonitorBuffer::new(48000);
        let mut reader = MonitorReader::new(shared.clone(), 1, 48000);
        shared.session.store(1, Ordering::Release);
        shared.volume.store(0.5f32.to_bits(), Ordering::Relaxed);
        let input = [0.5, -0.5, 3.0, f32::NAN];
        for i in 0..960 {
            shared.push(&mut producer, input[i % 4]);
        }
        let mut output = vec![9.0f32; 1920];
        reader.render(&mut output, 2, false);
        for (i, frame) in output.as_chunks::<2>().0.iter().enumerate() {
            let expected = [0.25, -0.25, 1.0, 0.0][i % 4];
            assert_eq!(*frame, [expected, expected]);
        }
        assert_eq!(input[2], 3.0);
        assert!(input[3].is_nan());
        assert_eq!(shared.underrun.load(Ordering::Relaxed), 0);
        shared.disable();
        reader.render(&mut output, 2, false);
        assert!(output.iter().all(|sample| *sample == 0.0));
    }
    /// 좌우를 바꾸고 왼쪽만 두 배로 하는 검사용 삽입(지연 3프레임 보고).
    struct SwapInsert;
    impl MonitorInsert for SwapInsert {
        fn process(&mut self, input: &[f32], left: &mut [f32], right: &mut [f32]) {
            for i in 0..input.len() {
                left[i] = input[i] * 2.0;
                right[i] = if i % 2 == 0 { f32::INFINITY } else { -input[i] };
            }
        }
        fn latency_frames(&self) -> u32 {
            3
        }
        fn kind(&self) -> &'static str {
            "TEST"
        }
    }
    /// 입력과 상관없이 잔향(0.4)을 계속 내는 검사용 삽입.
    struct RingingInsert;
    impl MonitorInsert for RingingInsert {
        fn process(&mut self, _input: &[f32], left: &mut [f32], right: &mut [f32]) {
            left.fill(0.4);
            right.fill(0.4);
        }
        fn kind(&self) -> &'static str {
            "TEST"
        }
    }
    #[test]
    fn inactive_input_or_session_silences_insert_tail_immediately() {
        // 입력이 끊기거나 세션이 바뀌면 삽입이 내는 잔향·남은 큐도 바로 무음입니다(2026-11-08 리뷰).
        let (shared, _producer) = MonitorBuffer::new(48000);
        let mut reader =
            MonitorReader::with_insert(shared.clone(), 1, 48000, Box::new(RingingInsert));
        shared.session.store(1, Ordering::Release);
        shared.volume.store(1.0f32.to_bits(), Ordering::Relaxed);
        let mut output = [0.0f32; 8];
        reader.render(&mut output, 2, false);
        assert_eq!(output, [0.4; 8], "활성이면 삽입 결과가 들림");
        let mut output = [1.0f32; 8];
        reader.render(&mut output, 2, true);
        assert_eq!(output, [0.0; 8], "입력 실패");
        shared.input_alive.store(false, Ordering::Release);
        let mut output = [1.0f32; 8];
        reader.render(&mut output, 2, false);
        assert_eq!(output, [0.0; 8], "입력 종료");
        shared.input_alive.store(true, Ordering::Release);
        shared.session.store(2, Ordering::Release);
        let mut output = [1.0f32; 8];
        reader.render(&mut output, 2, false);
        assert_eq!(output, [0.0; 8], "다른 세션");
    }
    #[test]
    fn insert_runs_in_blocks_after_volume_split_and_keeps_input_untouched() {
        let (shared, mut producer) = MonitorBuffer::new(48000);
        let mut reader = MonitorReader::with_insert(shared.clone(), 1, 48000, Box::new(SwapInsert));
        assert_eq!(reader.insert.latency_frames(), 3);
        shared.session.store(1, Ordering::Release);
        shared.volume.store(0.5f32.to_bits(), Ordering::Relaxed);
        // 블록(1024)보다 긴 출력도 이어서 처리합니다(큐 상한 2880 안에서).
        for i in 0..2800 {
            shared.push(&mut producer, if i % 3 == 0 { 0.8 } else { 0.2 });
        }
        let mut stereo = vec![9.0f32; 2000 * 2];
        reader.render(&mut stereo, 2, false);
        for (i, frame) in stereo.as_chunks::<2>().0.iter().enumerate() {
            let input = if i % 3 == 0 { 0.8 } else { 0.2 };
            // 블록마다 i는 0부터 다시 셉니다(1024 단위).
            let local = i % 1024;
            let right = if local % 2 == 0 { 0.0 } else { -input * 0.5 };
            assert_eq!(
                *frame,
                [(input * 2.0 * 0.5f32).clamp(-1.0, 1.0), right],
                "프레임 {i}"
            );
        }
        assert_eq!(shared.underrun.load(Ordering::Relaxed), 0);
        // mono 장치는 좌우 평균을 씁니다.
        let mut mono = vec![9.0f32; 400];
        reader.render(&mut mono, 1, false);
        for (i, value) in mono.iter().enumerate() {
            let input = if (2000 + i) % 3 == 0 { 0.8 } else { 0.2 };
            let right = if i % 2 == 0 { 0.0 } else { -input * 0.5 };
            assert!(
                (value - ((input * 2.0 * 0.5f32).min(1.0) + right) * 0.5).abs() < 1e-6,
                "mono {i}"
            );
        }
    }
    #[test]
    fn dry_insert_snapshot_fields_default_to_version_one_contract() {
        let snapshot = serde_json::to_value(MonitorSnapshot::default()).expect("직렬화");
        assert_eq!(snapshot["insert"], "DRY");
        assert_eq!(snapshot["queueTargetFrames"], 0);
        assert_eq!(snapshot["insertLatencyFrames"], 0);
        assert_eq!(snapshot["schemaVersion"], 1);
    }
    #[test]
    fn bounded_queue_trims_latency_and_counts_underrun_separately() {
        let (shared, mut producer) = MonitorBuffer::new(48000);
        let mut reader = MonitorReader::new(shared.clone(), 1, 48000);
        shared.session.store(1, Ordering::Release);
        for _ in 0..5000 {
            shared.push(&mut producer, 0.5);
        }
        assert_eq!(shared.ring.occupied_len(), 4800);
        assert_eq!(shared.dropped.load(Ordering::Relaxed), 200);
        let mut output = vec![0.0f32; 960];
        reader.render(&mut output, 1, false);
        assert_eq!(shared.dropped.load(Ordering::Relaxed), 4040);
        assert_eq!(shared.ring.occupied_len(), 0);
        assert!(output.iter().all(|v| *v == 0.125));
        reader.render(&mut output, 1, false);
        assert_eq!(shared.underrun.load(Ordering::Relaxed), 960);
        assert!(output.iter().all(|v| *v == 0.0));
        for _ in 0..100 {
            shared.push(&mut producer, 0.5);
        }
        reader.render(&mut output, 1, false);
        assert!(output.iter().all(|v| *v == 0.0));
        assert_eq!(shared.ring.occupied_len(), 100);
    }
    #[test]
    fn restart_discards_previous_session_and_failure_or_zero_volume_is_silent() {
        let (shared, mut producer) = MonitorBuffer::new(48000);
        shared.session.store(1, Ordering::Release);
        for _ in 0..960 {
            shared.push(&mut producer, 0.9);
        }
        shared.disable();
        let mut reader = MonitorReader::new(shared.clone(), 2, 48000);
        assert_eq!(shared.ring.occupied_len(), 0);
        producer
            .try_push(MonitorFrame {
                value: 0.9,
                session: 1,
            })
            .expect("이전 콜백 잔여");
        shared.session.store(2, Ordering::Release);
        for _ in 0..960 {
            shared.push(&mut producer, 0.5);
        }
        let mut output = vec![0.0f32; 960];
        reader.render(&mut output, 1, false);
        assert!(output.iter().all(|v| *v == 0.125));
        for _ in 0..960 {
            shared.push(&mut producer, 0.5);
        }
        reader.render(&mut output, 1, true);
        assert!(output.iter().all(|v| *v == 0.0));
        shared.volume.store(0.0f32.to_bits(), Ordering::Relaxed);
        reader.render(&mut output, 1, false);
        assert!(output.iter().all(|v| *v == 0.0));
        let mut unsigned = vec![0u16; 4];
        reader.render(&mut unsigned, 2, false);
        assert_eq!(unsigned, vec![32768; 4]);
    }
    #[test]
    fn invalid_contract_missing_input_and_idempotent_stop_do_not_open_devices() {
        let service = crate::audio::AudioService::default();
        for (version, generation, id, volume) in [
            (2, 1, "out", 0.25),
            (1, 0, "out", 0.25),
            (1, 1, "", 0.25),
            (1, 1, "out", f32::NAN),
            (1, 1, "out", 1.1),
        ] {
            let error = service
                .start_monitor(MonitorRequest {
                    schema_version: version,
                    expected_stream_generation: generation,
                    output_device_id: id.into(),
                    volume,
                    insert: None,
                })
                .err()
                .expect("잘못된 입력");
            assert_eq!(error.code, "INVALID_INPUT");
        }
        let error = service
            .start_monitor(MonitorRequest {
                schema_version: 1,
                expected_stream_generation: 1,
                output_device_id: "out".into(),
                volume: 0.25,
                insert: None,
            })
            .err()
            .expect("입력 없음");
        assert_eq!(error.code, "INPUT_NOT_ACTIVE");
        assert!(serde_json::from_str::<MonitorRequest>(r#"{"schemaVersion":1,"expectedStreamGeneration":1,"outputDeviceId":"out","volume":0.25,"source":"LOOPBACK"}"#).is_err());
        // 삽입 선택은 정해진 두 값만 받습니다(없으면 DRY).
        for (insert, ok) in [
            ("", true),
            (r#","insert":"DRY""#, true),
            (r#","insert":"AMPLITUBE""#, true),
            (r#","insert":"VST3""#, false),
            (r#","insert":null"#, true),
        ] {
            let json = format!(
                r#"{{"schemaVersion":1,"expectedStreamGeneration":1,"outputDeviceId":"out","volume":0.25{insert}}}"#
            );
            assert_eq!(
                serde_json::from_str::<MonitorRequest>(&json).is_ok(),
                ok,
                "{json}"
            );
        }
        assert!(serde_json::from_str::<MonitorVolumeRequest>(
            r#"{"schemaVersion":1,"sessionId":1,"volume":null}"#
        )
        .is_err());
        for _ in 0..2 {
            assert_eq!(
                service
                    .stop_monitor(crate::audio::StopRequest { schema_version: 1 })
                    .expect("중단")
                    .state,
                "STOPPED"
            );
        }
        assert!(service
            .stop_monitor(crate::audio::StopRequest { schema_version: 2 })
            .is_err());
    }
    #[test]
    fn input_generation_loss_and_output_error_disable_monitor_without_recording() {
        for (input_generation, output_failed, input_failed, closed) in [
            (Some(2), false, false, false),
            (Some(1), true, false, false),
            (Some(1), false, true, false),
            (Some(1), false, false, true),
        ] {
            let (shared, _producer) = MonitorBuffer::new(48000);
            shared.session.store(1, Ordering::Release);
            if closed {
                shared.close_input();
            }
            let mut service = MonitorService {
                snapshot: MonitorSnapshot {
                    state: "RUNNING",
                    input_generation: 1,
                    session_id: 1,
                    ..MonitorSnapshot::default()
                },
                running: Some(RunningMonitor {
                    stream: None,
                    shared: shared.clone(),
                    failed: Arc::new(AtomicU8::new(u8::from(output_failed))),
                    input_failed: Arc::new(AtomicU8::new(u8::from(input_failed))),
                    insert_stats: None,
                    insert_bypass: None,
                    playback: monitor_playback::pair(48000).0,
                    output_only: false,
                    output_device_id: "fixture-output".into(),
                }),
                sequence: 1,
                ..MonitorService::default()
            };
            // DRY 모니터에는 Bypass가 없고, 이전 세션·다른 버전은 거부합니다(docs/12 "실시간 Bypass v1").
            let bypass = |schema_version, session_id| MonitorBypassRequest {
                schema_version,
                session_id,
                bypassed: true,
            };
            for (request, code) in [
                (bypass(1, 1), "MONITOR_NOT_AMPLITUBE"),
                (bypass(1, 2), "MONITOR_CHANGED"),
                (bypass(2, 1), "INVALID_INPUT"),
            ] {
                assert_eq!(
                    service.set_bypass(request).map(|_| ()).map_err(|e| e.code),
                    Err(code)
                );
            }
            let flag = Arc::new(AtomicBool::new(false));
            if let Some(running) = service.running.as_mut() {
                running.insert_bypass = Some(flag.clone());
            }
            assert!(
                service
                    .set_bypass(bypass(1, 1))
                    .expect("Bypass")
                    .insert_bypassed
            );
            assert!(flag.load(Ordering::Relaxed));
            // DRY 모니터에는 테이크를 올리지 않습니다(docs/12 "모니터 테이크 재생 v1").
            assert_eq!(
                service
                    .load_playback(Some("t".into()), Some(vec![0.0; 4]))
                    .map_err(|e| e.code),
                Err("MONITOR_NOT_AMPLITUBE")
            );
            assert!(service.load_playback(None, None).is_ok());
            assert_eq!(
                service
                    .set_volume(MonitorVolumeRequest {
                        schema_version: 1,
                        session_id: 2,
                        volume: 0.5
                    })
                    .err()
                    .expect("이전 세션")
                    .code,
                "MONITOR_CHANGED"
            );
            service
                .set_volume(MonitorVolumeRequest {
                    schema_version: 1,
                    session_id: 1,
                    volume: 0.5,
                })
                .expect("음량");
            assert_eq!(f32::from_bits(shared.volume.load(Ordering::Relaxed)), 0.5);
            let status = service.status(input_generation).expect("상태");
            assert_eq!(status.state, "ERROR");
            assert_eq!(
                status.error_code,
                Some(if output_failed {
                    "MONITOR_OUTPUT_UNAVAILABLE"
                } else {
                    "INPUT_NOT_ACTIVE"
                })
            );
            assert_eq!(shared.session.load(Ordering::Acquire), 0);
            assert!(service.running.is_none());
            assert_eq!(service.stop().state, "STOPPED");
            assert_eq!(service.playback(), MonitorPlaybackSnapshot::empty(0));
            assert_eq!(
                service.set_playback(true, 0.0).map_err(|e| e.code),
                Err("PLAYBACK_NOT_LOADED")
            );
        }
    }
    #[test]
    fn take_playback_is_added_before_insert_even_during_prefill() {
        let (shared, _producer) = MonitorBuffer::new(48000);
        shared.session.store(1, Ordering::Release);
        let mut reader = MonitorReader::new(shared.clone(), 1, 48000);
        let (mut control, voice) = monitor_playback::pair(48000);
        reader.playback = Some(voice);
        control
            .load(Some("t".into()), Some(vec![0.5; 8]))
            .expect("load");
        control.set(true, 0.0).expect("play");
        shared.volume.store(1.0f32.to_bits(), Ordering::Relaxed);
        let mut output = [0.0f32; 8];
        reader.render(&mut output, 2, false);
        // 입력은 아직 prefill 전(무음)이지만 테이크 DI는 들립니다.
        assert_eq!(output, [0.5; 8]);
        // 입력 실패면 테이크도 내보내지 않습니다.
        let mut output = [1.0f32; 4];
        reader.render(&mut output, 2, true);
        assert_eq!(output, [0.0; 4]);
    }
    #[test]
    #[ignore = "실제 출력 장치를 엶(음량 0, 무음). 이름에 \"3/4\"가 든 출력이 있을 때만"]
    fn stretched_playback_keeps_up_on_a_real_output_device() {
        // R5: 작업 스레드가 실제 출력 속도를 따라가는지(곡 위치가 경과 × 배속만큼 나아감).
        let Some(device) = list_outputs()
            .expect("출력 열거")
            .devices
            .into_iter()
            .find(|d| d.name.contains("3/4"))
        else {
            return;
        };
        let mut service = MonitorService::default();
        let rate = service.start_output(&device.id).expect("재생 출력");
        let bus = service.bus().expect("버스");
        let len = rate as usize * 10;
        let noise: Vec<f32> = (0..len)
            .map(|i| ((i * 7919 % 1000) as f32 / 1000.0 - 0.5) * 0.1)
            .collect();
        bus.set_voices(playback_bus::VoiceSet {
            sample_rate: rate,
            voices: vec![playback_bus::BusVoice {
                left: noise.clone().into(),
                right: noise.into(),
                start_frame: 0,
                gain: 1.0,
                recorded_rate: 1.0,
            }],
        })
        .expect("보이스");
        bus.set_master(0.0).expect("무음");
        bus.set_rate(0.75).expect("0.75배");
        bus.play(0).expect("재생");
        std::thread::sleep(Duration::from_millis(300));
        let start = service.bus().expect("버스").position().0;
        std::thread::sleep(Duration::from_secs(2));
        let moved = service.bus().expect("버스").position().0 - start;
        let expected = f64::from(rate) * 2.0 * 0.75;
        eprintln!("2초 동안 곡 {moved}프레임, 기대 {expected:.0}");
        assert!(
            (moved as f64 - expected).abs() < expected * 0.05,
            "작업 스레드가 따라가지 못함"
        );
        service.stop_output().expect("끄기");
    }
}
