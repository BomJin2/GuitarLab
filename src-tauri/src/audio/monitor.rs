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
}
impl MonitorReader {
    fn new(shared: Arc<MonitorBuffer>, session: u64, sample_rate: u32) -> Self {
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
        }
    }
    fn render<T: cpal::Sample + cpal::FromSample<f32>>(
        &mut self,
        output: &mut [T],
        channels: usize,
        input_failed: bool,
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
        for frame in output.chunks_exact_mut(channels) {
            let mut value = 0.0;
            if enabled && self.started {
                // 이전 세션에서 전송 중이던 샘플은 최대 ring 용량만큼만 버립니다.
                for _ in 0..self.shared.ring.capacity().get() {
                    match self.consumer.try_pop() {
                        Some(sample) if sample.session == self.session => {
                            if sample.value.is_finite() {
                                value = (sample.value * volume).clamp(-1.0, 1.0);
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
            frame.fill(T::from_sample(value));
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
}
impl MonitorService {
    pub fn start(
        &mut self,
        request: MonitorRequest,
        shared: Arc<MonitorBuffer>,
        input_failed: Arc<AtomicU8>,
        sample_rate: u32,
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
        if self.running.is_some() {
            return Err(AppError::new(
                "MONITOR_ALREADY_ACTIVE",
                "모니터를 먼저 끄세요.",
                true,
            ));
        }
        let device = cpal::default_host()
            .output_devices()
            .map_err(output_error)?
            .find(|device| {
                device
                    .id()
                    .is_ok_and(|id| id.to_string() == request.output_device_id)
            })
            .ok_or_else(|| {
                AppError::new(
                    "MONITOR_OUTPUT_UNAVAILABLE",
                    "선택한 출력 장치를 찾지 못했습니다.",
                    true,
                )
            })?;
        let default = device.default_output_config().map_err(output_error)?;
        let supported = if default.sample_rate() == sample_rate {
            default
        } else {
            device
                .supported_output_configs()
                .map_err(output_error)?
                .find(|config| {
                    (1..=2).contains(&config.channels())
                        && config.min_sample_rate() <= sample_rate
                        && config.max_sample_rate() >= sample_rate
                })
                .map(|config| config.with_sample_rate(sample_rate))
                .ok_or_else(|| {
                    AppError::new(
                        "MONITOR_RATE_UNSUPPORTED",
                        "입력과 출력의 샘플레이트를 같게 설정하세요.",
                        true,
                    )
                })?
        };
        let channels = supported.channels();
        let format = supported.sample_format();
        if !(1..=2).contains(&channels)
            || !matches!(
                format,
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
        let session = self
            .sequence
            .checked_add(1)
            .ok_or_else(AppError::internal)?;
        self.sequence = session;
        let mut reader = MonitorReader::new(shared.clone(), session, sample_rate);
        shared
            .volume
            .store(request.volume.to_bits(), Ordering::Relaxed);
        shared.underrun.store(0, Ordering::Relaxed);
        shared.dropped.store(0, Ordering::Relaxed);
        let failed = Arc::new(AtomicU8::new(0));
        let callback_failed = failed.clone();
        let error_failed = failed.clone();
        let callback_input_failed = input_failed.clone();
        let stream = device
            .build_output_stream_raw(
                supported.config(),
                format,
                move |data, _| {
                    let invalid = callback_input_failed.load(Ordering::Acquire) != 0
                        || callback_failed.load(Ordering::Acquire) != 0;
                    macro_rules! render {
                        ($t:ty) => {
                            if let Some(output) = data.as_slice_mut::<$t>() {
                                reader.render(output, usize::from(channels), invalid)
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
                    error_failed.store(1, Ordering::Release);
                },
                Some(Duration::from_secs(3)),
            )
            .map_err(output_error)?;
        let buffer_frames = stream.buffer_size().ok().filter(|frames| *frames > 0);
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
            ..MonitorSnapshot::default()
        };
        self.running = Some(running);
        self.status(Some(request.expected_stream_generation))
    }
    pub fn status(&mut self, input_generation: Option<u64>) -> Result<MonitorSnapshot, AppError> {
        if let Some(running) = &self.running {
            self.snapshot.queued_frames = running.shared.ring.occupied_len() as u64;
            self.snapshot.underrun_frames = running.shared.underrun.load(Ordering::Relaxed);
            self.snapshot.dropped_frames = running.shared.dropped.load(Ordering::Relaxed);
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
                self.running.take();
                self.snapshot.state = "ERROR";
                self.snapshot.error_code = Some(code);
                self.snapshot.queued_frames = 0;
            }
        }
        Ok(self.snapshot.clone())
    }
    pub fn stop(&mut self) -> MonitorSnapshot {
        self.running.take();
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
}

#[cfg(test)]
mod tests {
    use super::*;
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
            })
            .err()
            .expect("입력 없음");
        assert_eq!(error.code, "INPUT_NOT_ACTIVE");
        assert!(serde_json::from_str::<MonitorRequest>(r#"{"schemaVersion":1,"expectedStreamGeneration":1,"outputDeviceId":"out","volume":0.25,"source":"LOOPBACK"}"#).is_err());
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
                }),
                sequence: 1,
            };
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
        }
    }
}
