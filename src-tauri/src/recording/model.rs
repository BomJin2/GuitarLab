use crate::{
    ipc::AppError,
    storage::{
        calibration::{DeviceProfile, MonitorEnvironment},
        project_model::{validate_uuid, MAX_SAFE},
    },
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecordSource {
    InputOnly,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TakeOrigin {
    UserInput,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecordingState {
    Arming,
    Recording,
    Finalizing,
    Ready,
    RecoverableError,
    Cancelled,
}
impl RecordingState {
    pub fn active(self) -> bool {
        matches!(self, Self::Arming | Self::Recording | Self::Finalizing)
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Arming => "ARMING",
            Self::Recording => "RECORDING",
            Self::Finalizing => "FINALIZING",
            Self::Ready => "READY",
            Self::RecoverableError => "RECOVERABLE_ERROR",
            Self::Cancelled => "CANCELLED",
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordingTransport {
    pub playback_epoch: u64,
    pub rate: f64,
    pub backing_asset_id: String,
}
impl RecordingTransport {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.backing_asset_id)?;
        if self.playback_epoch > MAX_SAFE
            || !self.rate.is_finite()
            || !(0.5..=1.5).contains(&self.rate)
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRecordingRequest {
    pub schema_version: u8,
    pub project_id: String,
    pub score_revision_id: String,
    pub target_score_track_id: String,
    pub expected_stream_generation: u64,
    pub monitor_environment: MonitorEnvironment,
    pub source: RecordSource,
    pub transport: Option<RecordingTransport>,
    #[serde(default)]
    pub reference_take_ids: Vec<String>,
    #[serde(default)]
    pub defer_transport: bool,
}
impl StartRecordingRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.score_revision_id)?;
        if self.schema_version != 1
            || self.expected_stream_generation == 0
            || self.expected_stream_generation > MAX_SAFE
            || self.target_score_track_id.is_empty()
            || self.target_score_track_id.len() > 128
        {
            return Err(AppError::invalid());
        }
        if let Some(transport) = &self.transport {
            transport.validate()?;
        }
        validate_references(&self.reference_take_ids, None)?;
        if self.defer_transport && self.transport.is_none() {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WarningInterval {
    pub frame_start: u64,
    pub missing_frames: u64,
    pub error_code: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordedTake {
    pub schema_version: u8,
    pub id: String,
    pub project_id: String,
    pub score_revision_id: String,
    pub target_score_track_id: String,
    pub name: String,
    pub memo: String,
    pub created_at_ms: u64,
    pub origin: TakeOrigin,
    pub source: RecordSource,
    pub state: RecordingState,
    pub sample_rate: u32,
    pub channels: u16,
    pub frames: u64,
    pub peak: f32,
    pub dropped_frames: u64,
    pub warning_intervals: Vec<WarningInterval>,
    pub error_code: Option<String>,
    pub capture_start_sample_index: Option<String>,
    pub capture_start_monotonic_ns: Option<String>,
    pub stream_generation: u64,
    pub calibration_revision: u64,
    pub calibration: DeviceProfile,
    pub transport: Option<RecordingTransport>,
    pub song_start_ms: Option<f64>,
    pub alignment_offset_ms: f64,
    pub recovered_from: Option<String>,
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reference_take_ids: Vec<String>,
}
impl RecordedTake {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_references(&self.reference_take_ids, Some(&self.id))?;
        for id in [
            &self.id,
            &self.project_id,
            &self.score_revision_id,
            &self.calibration.id,
        ] {
            validate_uuid(id)?;
        }
        if let Some(id) = &self.recovered_from {
            validate_uuid(id)?;
        }
        self.calibration.key.validate()?;
        crate::storage::calibration::ProfileDocument {
            schema_version: 1,
            revision: self.calibration_revision,
            profiles: vec![self.calibration.clone()],
        }
        .validate()
        .map_err(|_| AppError::invalid())?;
        if let Some(t) = &self.transport {
            t.validate()?;
        }
        if self.schema_version != 1
            || self.target_score_track_id.is_empty()
            || self.target_score_track_id.len() > 128
            || !valid_edits(&self.name, &self.memo, self.alignment_offset_ms)
            || self.created_at_ms > MAX_SAFE
            || self.stream_generation == 0
            || self.stream_generation > MAX_SAFE
            || self.calibration_revision > MAX_SAFE
            || self.channels != 1
            || !(8000..=192000).contains(&self.sample_rate)
            || self.sample_rate != self.calibration.key.sample_rate
            || self.frames > super::wave::frame_limit(self.sample_rate)
            || !self.peak.is_finite()
            || self.peak < 0.0
            || self.dropped_frames > MAX_SAFE
            || self.warning_intervals.len() > 32
            || self.warning_intervals.iter().any(|w| {
                w.frame_start > self.frames
                    || w.missing_frames > MAX_SAFE
                    || w.error_code.len() > 100
            })
            || !self.calibration.bias_real_ms.is_finite()
            || self.calibration.bias_real_ms.abs() > 500.0
            || self
                .song_start_ms
                .is_some_and(|v| !v.is_finite() || !(-60_000.0..=86_401_000.0).contains(&v))
            || (self.transport.is_none() && self.song_start_ms.is_some())
            || self.error_code.as_ref().is_some_and(|s| s.len() > 100)
            || self
                .sha256
                .as_ref()
                .is_some_and(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
            || self
                .capture_start_monotonic_ns
                .as_ref()
                .is_some_and(|s| s.parse::<u64>().is_err())
            || self
                .capture_start_sample_index
                .as_ref()
                .is_some_and(|s| s.parse::<u64>().is_err())
            || (self.capture_start_monotonic_ns.is_some()
                != self.capture_start_sample_index.is_some())
            || (self.state == RecordingState::Ready && (self.frames == 0 || self.sha256.is_none()))
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
fn validate_references(ids: &[String], own_id: Option<&str>) -> Result<(), AppError> {
    let mut seen = std::collections::HashSet::new();
    if ids.len() > 7 {
        return Err(AppError::invalid());
    }
    for id in ids {
        validate_uuid(id)?;
        if Some(id.as_str()) == own_id || !seen.insert(id) {
            return Err(AppError::invalid());
        }
    }
    Ok(())
}
pub fn valid_edits(name: &str, memo: &str, offset: f64) -> bool {
    !name.trim().is_empty()
        && name.chars().count() <= 200
        && memo.chars().count() <= 2000
        && !name.chars().any(char::is_control)
        && !memo
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
        && offset.is_finite()
        && offset.abs() <= 60000.0
}
pub fn record_error(code: &'static str) -> AppError {
    AppError::new(
        code,
        "녹음을 완료하지 못했습니다. 저장된 원본을 보존했으니 테이크 상태와 복구를 확인하세요.",
        true,
    )
}
