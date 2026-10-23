use super::calibration::CalibrationEstimate;
use super::calibration_sampler::CalibrationSampler;
use crate::audio::{AudioService, CalibrationCapture};
use crate::ipc::AppError;
use crate::storage::calibration::{MonitorEnvironment, ProfileDocument, ProfileKey, ProfileStore};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartMeasurementRequest {
    pub schema_version: u8,
    pub expected_stream_generation: u64,
    pub playback_epoch: u64,
    pub rate: f64,
    pub origin_song_ms: f64,
    pub beat_duration_song_ms: f64,
    pub monitor_environment: MonitorEnvironment,
}
impl StartMeasurementRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || self.expected_stream_generation == 0
            || self.expected_stream_generation > 9_007_199_254_740_991
            || self.playback_epoch == 0
            || self.playback_epoch > 9_007_199_254_740_991
            || self.rate != 1.0
            || self.origin_song_ms != 1000.0
            || self.beat_duration_song_ms != 750.0
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasurementRequest {
    pub schema_version: u8,
    pub measurement_id: String,
}
impl MeasurementRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || self.measurement_id.len() != 36
            || Uuid::parse_str(&self.measurement_id).is_err()
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveMeasurementRequest {
    pub schema_version: u8,
    pub measurement_id: String,
    pub expected_revision: u64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum MeasurementState {
    Collecting,
    Ready,
    Canceled,
    Saved,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasurementSnapshot {
    schema_version: u8,
    measurement_id: String,
    state: MeasurementState,
    sample_count: usize,
    estimate: Option<CalibrationEstimate>,
    estimate_error_code: Option<&'static str>,
}
struct Session {
    id: String,
    request: StartMeasurementRequest,
    key: ProfileKey,
    dropped_frames: u64,
    discontinuities: u64,
    last_sequence: u64,
    sampler: CalibrationSampler,
    state: MeasurementState,
    started: Instant,
}
impl Session {
    fn new(
        request: StartMeasurementRequest,
        capture: CalibrationCapture,
    ) -> Result<Self, AppError> {
        request.validate()?;
        let sampler = CalibrationSampler::new(
            request.expected_stream_generation,
            request.origin_song_ms,
            request.beat_duration_song_ms,
            request.rate,
        )?;
        Ok(Self {
            id: Uuid::new_v4().to_string(),
            request,
            key: capture.key,
            dropped_frames: capture.dropped_frames,
            discontinuities: capture.discontinuities,
            last_sequence: capture.onsets.last().map_or(0, |onset| onset.sequence),
            sampler,
            state: MeasurementState::Collecting,
            started: Instant::now(),
        })
    }
    fn cancel(&mut self) {
        if self.state != MeasurementState::Saved {
            self.sampler.cancel();
            self.state = MeasurementState::Canceled;
        }
    }
    fn collect(&mut self, capture: Result<CalibrationCapture, AppError>) -> Result<(), AppError> {
        if matches!(
            self.state,
            MeasurementState::Canceled | MeasurementState::Saved
        ) {
            return Ok(());
        }
        if self.started.elapsed() > Duration::from_secs(90) {
            self.cancel();
            return Ok(());
        }
        let capture = match capture {
            Ok(capture) => capture,
            Err(_) => {
                self.cancel();
                return Ok(());
            }
        };
        if capture.key != self.key
            || capture.dropped_frames != self.dropped_frames
            || capture.discontinuities != self.discontinuities
        {
            self.cancel();
            return Ok(());
        }
        for onset in capture.onsets {
            if onset.sequence <= self.last_sequence {
                continue;
            }
            self.last_sequence = onset.sequence;
            if onset.epoch != self.request.playback_epoch {
                self.cancel();
                return Ok(());
            }
            if let Err(error) = self.sampler.observe(onset, true) {
                self.cancel();
                return Err(error);
            }
        }
        if self.sampler.sample_count() == 16 {
            self.state = MeasurementState::Ready;
        }
        Ok(())
    }
    fn snapshot(&self) -> MeasurementSnapshot {
        let (estimate, estimate_error_code) = if self.sampler.sample_count() >= 8
            && matches!(
                self.state,
                MeasurementState::Collecting | MeasurementState::Ready
            ) {
            match self.sampler.finish() {
                Ok(estimate) => (Some(estimate), None),
                Err(error) => (None, Some(error.code)),
            }
        } else {
            (None, None)
        };
        MeasurementSnapshot {
            schema_version: 1,
            measurement_id: self.id.clone(),
            state: self.state,
            sample_count: self.sampler.sample_count(),
            estimate,
            estimate_error_code,
        }
    }
    fn estimate(&self) -> Result<CalibrationEstimate, AppError> {
        if matches!(
            self.state,
            MeasurementState::Canceled | MeasurementState::Saved
        ) {
            return Err(AppError::new(
                "CANCELED",
                "종료된 측정은 다시 저장할 수 없습니다.",
                false,
            ));
        }
        self.sampler.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::judgement::calibration_sampler::MeasurementInput;
    fn request() -> StartMeasurementRequest {
        StartMeasurementRequest {
            schema_version: 1,
            expected_stream_generation: 1,
            playback_epoch: 20,
            rate: 1.0,
            origin_song_ms: 1000.0,
            beat_duration_song_ms: 750.0,
            monitor_environment: MonitorEnvironment::Headphones,
        }
    }
    fn capture(onsets: Vec<MeasurementInput>) -> CalibrationCapture {
        CalibrationCapture {
            key: ProfileKey {
                device_id: "synthetic-input".into(),
                sample_rate: 48000,
                sample_format: "f32".into(),
                channels: 1,
                channel_index: 0,
                buffer_frames: 480,
                monitor_environment: MonitorEnvironment::Headphones,
            },
            dropped_frames: 0,
            discontinuities: 0,
            onsets,
        }
    }
    fn onset(sequence: u64, time: f64) -> MeasurementInput {
        MeasurementInput {
            stream_generation: 1,
            epoch: 20,
            sequence,
            song_time_ms: Some(time),
            confidence: 0.99,
        }
    }
    #[test]
    fn measures_only_new_native_fixture_onsets_and_never_resamples() {
        let mut session =
            Session::new(request(), capture(vec![onset(30, 1000.0)])).expect("측정 시작");
        session
            .collect(Ok(capture(vec![onset(30, 1000.0)])))
            .expect("과거 표본 무시");
        assert_eq!(session.snapshot().sample_count, 0);
        for index in 0..16 {
            session
                .collect(Ok(capture(vec![onset(
                    index + 31,
                    1030.0 + index as f64 * 750.0,
                )])))
                .expect("합성 입력 fixture");
        }
        assert_eq!(session.state, MeasurementState::Ready);
        assert_eq!(session.snapshot().sample_count, 16);
        assert_eq!(session.estimate().expect("추정").bias_real_ms, 30.0);
        session
            .collect(Ok(capture(vec![onset(31, 1030.0)])))
            .expect("반복 폴링");
        assert_eq!(session.snapshot().sample_count, 16);
    }
    #[test]
    fn changed_device_gap_clock_failure_timeout_and_cancel_cannot_save() {
        let mut frames = vec![capture(vec![]), capture(vec![]), capture(vec![])];
        frames[0].key.device_id = "another-input".into();
        frames[1].dropped_frames = 1;
        frames[2].discontinuities = 1;
        for frame in frames {
            let mut session = Session::new(request(), capture(vec![])).expect("시작");
            session.collect(Ok(frame)).expect("취소 처리");
            assert_eq!(session.state, MeasurementState::Canceled);
            assert!(session.estimate().is_err());
        }
        let mut session = Session::new(request(), capture(vec![])).expect("시작");
        session
            .collect(Err(AppError::new(
                "CLOCK_UNCERTAIN",
                "fixture clock 오류",
                true,
            )))
            .expect("clock 취소");
        assert!(session.estimate().is_err());
        let mut session = Session::new(request(), capture(vec![])).expect("시작");
        session.started -= Duration::from_secs(91);
        session.collect(Ok(capture(vec![]))).expect("시간 초과");
        assert!(session.estimate().is_err());
        let mut session = Session::new(request(), capture(vec![])).expect("시작");
        session.cancel();
        session.cancel();
        assert!(session.estimate().is_err());
    }
    #[test]
    fn wrong_epoch_unscheduled_beats_and_low_confidence_are_not_measurements() {
        let mut session = Session::new(request(), capture(vec![])).expect("시작");
        let mut low = onset(1, 1030.0);
        low.confidence = 0.0;
        session
            .collect(Ok(capture(vec![low, onset(2, 280.0), onset(3, 13030.0)])))
            .expect("미유효 표본");
        assert_eq!(session.snapshot().sample_count, 0);
        let mut old = onset(4, 1030.0);
        old.epoch = 19;
        session
            .collect(Ok(capture(vec![old])))
            .expect("이전 epoch 취소");
        assert_eq!(session.state, MeasurementState::Canceled);
    }
    #[test]
    fn request_contract_rejects_extra_fields_and_invalid_grid() {
        let mut invalid = request();
        invalid.rate = 0.75;
        assert!(invalid.validate().is_err());
        let mut invalid = request();
        invalid.origin_song_ms = f64::NAN;
        assert!(invalid.validate().is_err());
        assert!(serde_json::from_str::<MeasurementRequest>(r#"{"schemaVersion":1,"measurementId":"00000000-0000-4000-8000-000000000001","samples":[30,30]}"#).is_err());
        let service = MeasurementService::default();
        assert!(service
            .cancel(MeasurementRequest {
                schema_version: 1,
                measurement_id: Uuid::new_v4().to_string()
            })
            .is_err());
    }
}
#[derive(Default)]
pub struct MeasurementService {
    session: Mutex<Option<Session>>,
}
impl MeasurementService {
    fn session<'a>(
        session: &'a mut Option<Session>,
        request: &MeasurementRequest,
    ) -> Result<&'a mut Session, AppError> {
        request.validate()?;
        session
            .as_mut()
            .filter(|session| session.id == request.measurement_id)
            .ok_or_else(AppError::invalid)
    }
    fn refresh(session: &mut Session, audio: &AudioService) -> Result<(), AppError> {
        let capture = audio.calibration_capture(
            session.request.expected_stream_generation,
            session.request.playback_epoch,
            session.request.monitor_environment,
        );
        session.collect(capture)
    }
    pub fn start(
        &self,
        request: StartMeasurementRequest,
        audio: &AudioService,
    ) -> Result<MeasurementSnapshot, AppError> {
        request.validate()?;
        let mut state = self.session.lock().map_err(|_| AppError::internal())?;
        if let Some(previous) = state.as_mut() {
            Self::refresh(previous, audio)?;
        }
        if state.as_ref().is_some_and(|session| {
            matches!(
                session.state,
                MeasurementState::Collecting | MeasurementState::Ready
            )
        }) {
            return Err(AppError::new(
                "MEASUREMENT_ACTIVE",
                "기존 측정을 저장하거나 취소하세요.",
                true,
            ));
        }
        let capture = audio.calibration_capture(
            request.expected_stream_generation,
            request.playback_epoch,
            request.monitor_environment,
        )?;
        let session = Session::new(request, capture)?;
        let result = session.snapshot();
        *state = Some(session);
        Ok(result)
    }
    pub fn poll(
        &self,
        request: MeasurementRequest,
        audio: &AudioService,
    ) -> Result<MeasurementSnapshot, AppError> {
        let mut state = self.session.lock().map_err(|_| AppError::internal())?;
        let session = Self::session(&mut state, &request)?;
        Self::refresh(session, audio)?;
        Ok(session.snapshot())
    }
    pub fn cancel(&self, request: MeasurementRequest) -> Result<MeasurementSnapshot, AppError> {
        let mut state = self.session.lock().map_err(|_| AppError::internal())?;
        let session = Self::session(&mut state, &request)?;
        session.cancel();
        Ok(session.snapshot())
    }
    pub fn save(
        &self,
        request: SaveMeasurementRequest,
        audio: &AudioService,
        store: &ProfileStore,
    ) -> Result<ProfileDocument, AppError> {
        if request.expected_revision > 9_007_199_254_740_991 {
            return Err(AppError::invalid());
        }
        let mut state = self.session.lock().map_err(|_| AppError::internal())?;
        let session = Self::session(
            &mut state,
            &MeasurementRequest {
                schema_version: request.schema_version,
                measurement_id: request.measurement_id,
            },
        )?;
        Self::refresh(session, audio)?;
        let document = store.save_measured(
            session.key.clone(),
            session.estimate()?,
            request.expected_revision,
        )?;
        session.state = MeasurementState::Saved;
        Ok(document)
    }
}
