use super::{
    model::*,
    router::{RecordingMessage, RecordingRoute},
    wave,
};
use crate::{
    audio::{dsp::Sample, AudioService, RecordingCapture},
    ipc::AppError,
    storage::{
        calibration::ProfileStore,
        projects::{now_ms, ProjectStore},
    },
};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use uuid::Uuid;

struct RunningRecording {
    take: Arc<Mutex<RecordedTake>>,
    end_ns: Arc<AtomicU64>,
    worker: Option<JoinHandle<()>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSnapshot {
    pub schema_version: u8,
    pub take: Option<RecordedTake>,
}
pub struct RecordingService {
    audio: Arc<AudioService>,
    store: Arc<ProjectStore>,
    profiles: Arc<ProfileStore>,
    active: Mutex<Option<RunningRecording>>,
    storage_busy: AtomicBool,
}
impl RecordingService {
    pub fn new(
        audio: Arc<AudioService>,
        store: Arc<ProjectStore>,
        profiles: Arc<ProfileStore>,
    ) -> Self {
        Self {
            audio,
            store,
            profiles,
            active: Mutex::new(None),
            storage_busy: AtomicBool::new(false),
        }
    }
    pub fn snapshot(&self) -> Result<RecordingSnapshot, AppError> {
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        Ok(RecordingSnapshot {
            schema_version: 1,
            take: active
                .as_ref()
                .map(|a| {
                    a.take
                        .lock()
                        .map(|t| t.clone())
                        .map_err(|_| AppError::internal())
                })
                .transpose()?,
        })
    }
    pub fn is_active(&self) -> bool {
        self.active.lock().map_or(true, |a| {
            a.as_ref()
                .is_some_and(|a| a.take.lock().map_or(true, |t| t.state.active()))
        })
    }
    pub(crate) fn storage_busy(&self) -> bool {
        self.storage_busy.load(Ordering::Acquire)
    }
    pub(crate) fn while_idle<T>(
        &self,
        work: impl FnOnce() -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let active = self.active.lock().map_err(|_| AppError::internal())?;
        if self.storage_busy()
            || active
                .as_ref()
                .is_some_and(|a| a.take.lock().map_or(true, |t| t.state.active()))
        {
            return Err(record_error("RECORDING_BUSY"));
        }
        self.storage_busy.store(true, Ordering::Release);
        drop(active);
        struct Release<'a>(&'a AtomicBool);
        impl Drop for Release<'_> {
            fn drop(&mut self) {
                self.0.store(false, Ordering::Release);
            }
        }
        let _release = Release(&self.storage_busy);
        work()
    }
    pub fn start(&self, request: StartRecordingRequest) -> Result<RecordingSnapshot, AppError> {
        request.validate()?;
        let mut active = self.active.lock().map_err(|_| AppError::internal())?;
        if self.storage_busy() {
            return Err(record_error("RECORDING_BUSY"));
        }
        if active
            .as_ref()
            .is_some_and(|a| a.take.lock().map_or(true, |t| t.state.active()))
        {
            return Err(record_error("RECORDING_BUSY"));
        }
        if let Some(mut old) = active.take() {
            if let Some(worker) = old.worker.take() {
                worker
                    .join()
                    .map_err(|_| record_error("RECORDING_WORKER_FAILED"))?;
            }
        }
        let capture = self.audio.recording_capture(
            request.expected_stream_generation,
            request.monitor_environment,
            if request.defer_transport {
                None
            } else {
                request.transport.as_ref()
            },
        )?;
        let document = self.profiles.list()?;
        let calibration = document
            .profiles
            .into_iter()
            .find(|p| p.key == capture.key)
            .ok_or_else(|| {
                AppError::new(
                    "CALIBRATION_REQUIRED",
                    "현재 입력·모니터 환경의 보정값을 저장한 뒤 REC를 누르세요.",
                    true,
                )
            })?;
        let mut take = RecordedTake {
            schema_version: 1,
            id: Uuid::new_v4().to_string(),
            project_id: request.project_id,
            score_revision_id: request.score_revision_id,
            target_score_track_id: request.target_score_track_id,
            name: "새 테이크".into(),
            memo: String::new(),
            created_at_ms: now_ms()? as u64,
            origin: TakeOrigin::UserInput,
            source: request.source,
            state: RecordingState::Arming,
            sample_rate: capture.key.sample_rate,
            channels: 1,
            frames: 0,
            peak: 0.0,
            dropped_frames: 0,
            warning_intervals: vec![],
            error_code: None,
            capture_start_sample_index: None,
            capture_start_monotonic_ns: None,
            stream_generation: request.expected_stream_generation,
            calibration_revision: document.revision,
            calibration,
            transport: request.transport,
            song_start_ms: None,
            alignment_offset_ms: 0.0,
            recovered_from: None,
            sha256: None,
            reference_take_ids: request.reference_take_ids,
        };
        let path = self.store.prepare_recording(&take)?;
        let writer = match wave::create(&path, take.sample_rate) {
            Ok(w) => w,
            Err(_) => {
                take.state = RecordingState::RecoverableError;
                take.error_code = Some("RECORDING_IO_ERROR".into());
                self.store.save_take(&take)?;
                return Err(record_error("RECORDING_IO_ERROR"));
            }
        };
        let (sender, receiver) = mpsc::sync_channel((take.sample_rate * 2) as usize);
        let end_ns = Arc::new(AtomicU64::new(u64::MAX));
        let dropped = Arc::new(AtomicU64::new(0));
        let route = RecordingRoute {
            sender,
            start_ns: capture.now_ns,
            started: Arc::new(AtomicBool::new(false)),
            end_ns: end_ns.clone(),
            dropped: dropped.clone(),
        };
        if let Err(error) = self.audio.recording_router.attach(route) {
            take.state = RecordingState::RecoverableError;
            take.error_code = Some(error.code.into());
            self.store.save_take(&take)?;
            return Err(error);
        }
        let shared = Arc::new(Mutex::new(take.clone()));
        let worker_take = shared.clone();
        let audio = self.audio.clone();
        let store = self.store.clone();
        let worker_end = end_ns.clone();
        let worker = match thread::Builder::new()
            .name("guitarlab-recorder-writer".into())
            .spawn(move || {
                let generation = take.stream_generation;
                let environment = take.calibration.key.monitor_environment;
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    write_input(
                        writer,
                        receiver,
                        &mut take,
                        &capture,
                        &audio.recording_router,
                        |transport| audio.recording_capture(generation, environment, transport),
                        &store,
                        &worker_take,
                        &worker_end,
                        &dropped,
                    )
                }));
                if result.is_err() {
                    if audio.recording_router.detach().is_err() {
                        eprintln!("GuitarLab 녹음 분기 해제 실패: RECORDING_ROUTER_FAILED");
                    }
                    take.state = RecordingState::RecoverableError;
                    take.error_code = Some("RECORDING_WORKER_FAILED".into());
                    if store.save_take(&take).is_err() {
                        eprintln!("GuitarLab 녹음 복구 상태 저장 실패: RECORDING_STORAGE_ERROR");
                    }
                    if let Ok(mut state) = worker_take.lock() {
                        *state = take;
                    }
                }
            }) {
            Ok(w) => w,
            Err(_) => {
                self.audio.recording_router.detach()?;
                let mut failed = shared.lock().map_err(|_| AppError::internal())?;
                failed.state = RecordingState::RecoverableError;
                failed.error_code = Some("RECORDING_WORKER_FAILED".into());
                self.store.save_take(&failed)?;
                return Err(record_error("RECORDING_WORKER_FAILED"));
            }
        };
        let initial = shared.lock().map_err(|_| AppError::internal())?.clone();
        *active = Some(RunningRecording {
            take: shared,
            end_ns,
            worker: Some(worker),
        });
        Ok(RecordingSnapshot {
            schema_version: 1,
            take: Some(initial),
        })
    }
    pub fn stop(&self, take_id: &str) -> Result<RecordingSnapshot, AppError> {
        crate::storage::project_model::validate_uuid(take_id)?;
        let mut active = self.active.lock().map_err(|_| AppError::internal())?;
        let running = active
            .as_mut()
            .ok_or_else(|| record_error("TAKE_NOT_FOUND"))?;
        let current = running
            .take
            .lock()
            .map_err(|_| AppError::internal())?
            .clone();
        if current.id != take_id {
            return Err(record_error("TAKE_CHANGED"));
        }
        if current.state.active() {
            match self.audio.recording_capture(
                current.stream_generation,
                current.calibration.key.monitor_environment,
                None,
            ) {
                Ok(capture) => running.end_ns.store(capture.now_ns, Ordering::Release),
                Err(_) => {
                    self.audio.recording_router.detach()?;
                }
            }
        }
        if let Some(worker) = running.worker.take() {
            worker
                .join()
                .map_err(|_| record_error("RECORDING_WORKER_FAILED"))?;
        }
        let take = running
            .take
            .lock()
            .map_err(|_| AppError::internal())?
            .clone();
        Ok(RecordingSnapshot {
            schema_version: 1,
            take: Some(take),
        })
    }
}

#[derive(Default)]
pub struct SampleSequence {
    first: Option<Sample>,
    previous: Option<Sample>,
}
impl SampleSequence {
    pub fn check(&mut self, sample: Sample, sample_rate: u32) -> Result<(), (&'static str, u64)> {
        if !sample.value.is_finite() {
            return Err(("NONFINITE_INPUT", 1));
        }
        if !(8000..=192000).contains(&sample_rate) {
            return Err(("CAPTURE_CLOCK_GAP", 0));
        }
        if let Some(previous) = self.previous {
            let next_index = previous.index.checked_add(1).ok_or(("INPUT_GAP", 0))?;
            if sample.index != next_index {
                return Err(("INPUT_GAP", sample.index.saturating_sub(next_index)));
            }
        }
        let first = *self.first.get_or_insert(sample);
        let elapsed_ns =
            u128::from(sample.index - first.index) * 1_000_000_000 / u128::from(sample_rate);
        let expected_ns = u128::from(first.captured_ns) + elapsed_ns;
        // callback 경계의 작은 시각 겹침은 PCM 누락이 아니므로 누적 sample clock과 비교합니다.
        if u128::from(sample.captured_ns).abs_diff(expected_ns) > 100_000_000 {
            return Err(("CAPTURE_CLOCK_GAP", 0));
        }
        self.previous = Some(sample);
        Ok(())
    }
}
#[allow(clippy::too_many_arguments)]
pub(crate) fn write_input(
    mut writer: wave::WaveWriter<std::io::BufWriter<std::fs::File>>,
    receiver: Receiver<RecordingMessage>,
    take: &mut RecordedTake,
    origin: &RecordingCapture,
    router: &crate::recording::router::RecordingRouter,
    capture: impl Fn(Option<&RecordingTransport>) -> Result<RecordingCapture, AppError>,
    store: &ProjectStore,
    shared: &Mutex<RecordedTake>,
    end_ns: &AtomicU64,
    dropped: &AtomicU64,
) {
    let mut sequence = SampleSequence::default();
    let mut timing = RecordingTiming::new(origin, take.transport.is_some());
    let mut last_publish = Instant::now();
    let result = (|| {
        loop {
            if last_publish.elapsed() >= Duration::from_millis(200) {
                let input = capture(None)?;
                if end_ns.load(Ordering::Acquire) == u64::MAX
                    && timing.observe(input.now_ns, capture(take.transport.as_ref()), take)?
                {
                    take.frames = writer.frames;
                    take.peak = writer.peak;
                    store.save_take(take)?;
                }
                writer
                    .flush()
                    .map_err(|_| record_error("RECORDING_IO_ERROR"))?;
                take.frames = writer.frames;
                take.peak = writer.peak;
                if let Ok(mut state) = shared.lock() {
                    let state_kind = state.state;
                    *state = take.clone();
                    if state_kind == RecordingState::Finalizing {
                        state.state = state_kind;
                    }
                }
                last_publish = Instant::now();
            }
            let sample = match receiver.recv_timeout(Duration::from_millis(20)) {
                Ok(RecordingMessage::Sample(s)) => s,
                Ok(RecordingMessage::Boundary) => break,
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(record_error("INPUT_NOT_ACTIVE"))
                }
            };
            if sample.captured_ns >= end_ns.load(Ordering::Acquire) {
                continue;
            }
            if let Err((code, missing)) = sequence.check(sample, take.sample_rate) {
                take.dropped_frames += missing;
                take.warning_intervals.push(WarningInterval {
                    frame_start: writer.frames,
                    missing_frames: missing,
                    error_code: code.into(),
                });
                return Err(record_error(code));
            }
            if take.capture_start_sample_index.is_none() {
                take.capture_start_sample_index = Some(sample.index.to_string());
                take.capture_start_monotonic_ns = Some(sample.captured_ns.to_string());
                take.song_start_ms = timing.song_at(sample.captured_ns, take);
                take.state = if timing.pending {
                    RecordingState::Arming
                } else {
                    RecordingState::Recording
                };
                store.save_take(take)?;
            }
            writer
                .push(sample.value)
                .map_err(|_| record_error("RECORDING_IO_ERROR"))?;
            if writer.frames >= wave::frame_limit(take.sample_rate) {
                take.error_code = Some("RECORDING_LIMIT_REACHED".into());
                break;
            }
        }
        if dropped.load(Ordering::Acquire) > 0 {
            return Err(record_error("RECORDING_QUEUE_FULL"));
        }
        if writer.frames == 0 {
            return Err(record_error("NO_INPUT_FRAMES"));
        }
        if timing.pending {
            return Err(record_error("CLOCK_UNCERTAIN"));
        }
        Ok(())
    })();
    if router.detach().is_err() {
        eprintln!("GuitarLab 녹음 입력 해제 실패: RECORDING_ROUTER_FAILED");
    }
    take.frames = writer.frames;
    take.peak = writer.peak;
    let dropped_count = dropped.load(Ordering::Acquire);
    if dropped_count > 0 {
        take.dropped_frames = take.dropped_frames.max(dropped_count);
        take.warning_intervals.push(WarningInterval {
            frame_start: take.frames,
            missing_frames: dropped_count,
            error_code: "RECORDING_QUEUE_FULL".into(),
        });
    }
    take.state = RecordingState::Finalizing;
    if let Ok(mut state) = shared.lock() {
        *state = take.clone();
    }
    let result = result
        .and_then(|()| wave::finish(writer).map_err(|_| record_error("RECORDING_IO_ERROR")))
        .and_then(|()| store.finalize_take(take));
    if let Err(error) = result {
        take.state = RecordingState::RecoverableError;
        take.error_code = Some(error.code.into());
        if store.save_take(take).is_err() {
            take.error_code = Some("RECORDING_STORAGE_ERROR".into());
            eprintln!("GuitarLab 녹음 상태 저장 실패: RECORDING_STORAGE_ERROR");
        }
    }
    if let Ok(mut state) = shared.lock() {
        *state = take.clone();
    }
}

struct RecordingTiming {
    origin_ns: u64,
    song_ms: Option<f64>,
    pending: bool,
}
impl RecordingTiming {
    fn new(origin: &RecordingCapture, aligned: bool) -> Self {
        Self {
            origin_ns: origin.now_ns,
            song_ms: origin.song_time_ms,
            pending: aligned && origin.song_time_ms.is_none(),
        }
    }
    fn song_at(&self, ns: u64, take: &RecordedTake) -> Option<f64> {
        self.song_ms.zip(take.transport.as_ref()).map(|(song, t)| {
            song + (i128::from(ns) - i128::from(self.origin_ns)) as f64 / 1_000_000.0 * t.rate
                - take.calibration.bias_real_ms * t.rate
        })
    }
    fn observe(
        &mut self,
        now_ns: u64,
        current: Result<RecordingCapture, AppError>,
        take: &mut RecordedTake,
    ) -> Result<bool, AppError> {
        if self.pending && now_ns.saturating_sub(self.origin_ns) > 5_000_000_000 {
            return Err(record_error("CLOCK_UNCERTAIN"));
        }
        let current = match current {
            Err(error) if self.pending && error.code == "CLOCK_UNCERTAIN" => return Ok(false),
            other => other?,
        };
        if self.pending {
            if current.song_time_ms.is_none() {
                return Err(record_error("CLOCK_UNCERTAIN"));
            }
            self.origin_ns = current.now_ns;
            self.song_ms = current.song_time_ms;
            self.pending = false;
            if let Some(ns) = take.capture_start_monotonic_ns.as_ref() {
                let ns = ns
                    .parse::<u64>()
                    .map_err(|_| record_error("CAPTURE_CLOCK_GAP"))?;
                take.song_start_ms = self.song_at(ns, take);
                take.state = RecordingState::Recording;
            }
            return Ok(true);
        }
        if let (Some(actual), Some(start), Some(transport)) =
            (current.song_time_ms, self.song_ms, &take.transport)
        {
            let expected = start
                + (i128::from(current.now_ns) - i128::from(self.origin_ns)) as f64 / 1_000_000.0
                    * transport.rate;
            if ((actual - expected) / transport.rate).abs() > 20.0 {
                return Err(record_error("CLOCK_DRIFT"));
            }
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deferred_clock_maps_the_first_sample_and_still_rejects_timeout_input_loss_and_drift() {
        use crate::storage::{projects_tests::Fixture, recordings_tests::prepared};
        let f = Fixture::new();
        let mut take = prepared(&f);
        take.transport = Some(RecordingTransport {
            playback_epoch: 1,
            rate: 0.5,
            backing_asset_id: Uuid::new_v4().to_string(),
        });
        take.capture_start_monotonic_ns = Some("1000000000".into());
        take.capture_start_sample_index = Some("0".into());
        let origin = RecordingCapture {
            key: take.calibration.key.clone(),
            now_ns: 1_000_000_000,
            song_time_ms: None,
        };
        let mut timing = RecordingTiming::new(&origin, true);
        assert!(!timing
            .observe(
                1_200_000_000,
                Err(record_error("CLOCK_UNCERTAIN")),
                &mut take
            )
            .expect("동기화 대기"));
        assert!(timing.pending);
        assert!(timing
            .observe(
                1_500_000_000,
                Ok(RecordingCapture {
                    key: origin.key.clone(),
                    now_ns: 1_500_000_000,
                    song_time_ms: Some(200.0)
                }),
                &mut take
            )
            .expect("후속 시각 연결"));
        assert_eq!(take.song_start_ms, Some(-65.0));
        assert!(take.state == RecordingState::Recording);
        assert_eq!(timing.song_at(1_100_000_000, &take), Some(-15.0));
        assert!(timing
            .observe(
                1_600_000_000,
                Err(record_error("CLOCK_UNCERTAIN")),
                &mut take
            )
            .is_err());
        assert!(timing
            .observe(
                1_600_000_000,
                Ok(RecordingCapture {
                    key: origin.key.clone(),
                    now_ns: 1_600_000_000,
                    song_time_ms: Some(300.0)
                }),
                &mut take
            )
            .is_err_and(|e| e.code == "CLOCK_DRIFT"));
        let mut pending = RecordingTiming::new(&origin, true);
        assert!(pending
            .observe(
                1_200_000_000,
                Err(record_error("INPUT_NOT_ACTIVE")),
                &mut take
            )
            .is_err_and(|e| e.code == "INPUT_NOT_ACTIVE"));
        assert!(pending
            .observe(
                6_000_000_001,
                Err(record_error("CLOCK_UNCERTAIN")),
                &mut take
            )
            .is_err_and(|e| e.code == "CLOCK_UNCERTAIN"));
    }
    #[test]
    fn callback_timestamp_overlap_does_not_drop_contiguous_pcm_frames() {
        let mut sequence = SampleSequence::default();
        for index in 0..192000u64 {
            let block = index / 480;
            let nominal = 1_000_000_000 + index * 1_000_000_000 / 48000;
            let captured_ns = match block {
                0 => nominal,
                b if b % 2 == 0 => nominal + 200_000,
                _ => nominal - 200_000,
            };
            assert!(
                sequence
                    .check(
                        Sample {
                            value: 0.25,
                            index,
                            captured_ns
                        },
                        48000
                    )
                    .is_ok(),
                "연속된 PCM의 callback 경계: {index}"
            );
        }
    }
    #[test]
    fn cumulative_clock_drift_and_large_backward_jumps_are_not_hidden() {
        let start = 1_000_000_000u64;
        for direction in [-1i64, 1] {
            let mut sequence = SampleSequence::default();
            let mut failure = None;
            for index in 0..20000 {
                let nominal = start + index * 1_000_000_000 / 48000;
                let ns = (nominal as i64 + direction * index as i64 * 10000) as u64;
                if let Err(error) = sequence.check(
                    Sample {
                        value: 0.5,
                        index,
                        captured_ns: ns,
                    },
                    48000,
                ) {
                    failure = Some((index, error));
                    break;
                }
            }
            assert_eq!(failure, Some((10001, ("CAPTURE_CLOCK_GAP", 0))));
        }
        let mut sequence = SampleSequence::default();
        assert!(sequence
            .check(
                Sample {
                    value: 0.0,
                    index: 0,
                    captured_ns: start
                },
                48000
            )
            .is_ok());
        assert_eq!(
            sequence.check(
                Sample {
                    value: 0.0,
                    index: 1,
                    captured_ns: start - 200_000_000
                },
                48000
            ),
            Err(("CAPTURE_CLOCK_GAP", 0))
        );
    }
    #[test]
    fn sequence_rejects_missing_duplicate_nonfinite_and_timestamp_gaps() {
        let a = Sample {
            value: 0.25,
            index: 123,
            captured_ns: 1_000_000_000,
        };
        for (bad, code) in [
            (
                Sample {
                    index: 125,
                    captured_ns: a.captured_ns + 41666,
                    ..a
                },
                "INPUT_GAP",
            ),
            (a, "INPUT_GAP"),
            (
                Sample {
                    value: f32::NAN,
                    index: 124,
                    captured_ns: a.captured_ns + 20833,
                },
                "NONFINITE_INPUT",
            ),
            (
                Sample {
                    index: 124,
                    captured_ns: a.captured_ns + 200_000_000,
                    ..a
                },
                "CAPTURE_CLOCK_GAP",
            ),
        ] {
            let mut sequence = SampleSequence::default();
            assert!(sequence.check(a, 48000).is_ok());
            assert_eq!(sequence.check(bad, 48000).expect_err("불연속").0, code);
        }
    }
    #[test]
    fn router_is_bounded_and_filters_samples_before_rec_and_after_stop() {
        let (sender, receiver) = mpsc::sync_channel(1);
        let dropped = Arc::new(AtomicU64::new(0));
        let route = RecordingRoute {
            sender,
            start_ns: 100,
            started: Arc::new(AtomicBool::new(false)),
            end_ns: Arc::new(AtomicU64::new(200)),
            dropped: dropped.clone(),
        };
        for ns in [99, 100, 101, 200] {
            route.push(Sample {
                value: 0.5,
                index: ns,
                captured_ns: ns,
            });
        }
        assert!(
            matches!(receiver.try_recv().expect("선택한 입력"), RecordingMessage::Sample(sample) if sample.captured_ns == 100)
        );
        route.push(Sample {
            value: 0.5,
            index: 200,
            captured_ns: 200,
        });
        assert!(matches!(
            receiver.try_recv().expect("STOP 경계"),
            RecordingMessage::Boundary
        ));
        assert_eq!(dropped.load(Ordering::Relaxed), 1);
    }
}
