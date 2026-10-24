use crate::{
    audio::{
        pitch_track::{analyze_pitch_track, Oscillation, PitchMotion},
        polyphonic::{analyze_window, PitchWindow},
    },
    ipc::AppError,
    recording::{
        model::{RecordedTake, RecordingState},
        wave,
    },
    storage::{
        project_model::validate_uuid,
        projects::{canceled, ProjectStore},
    },
};
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordedPitchesRequest {
    pub schema_version: u8,
    pub project_id: String,
    pub take_id: String,
    pub start_ms: f64,
}
impl RecordedPitchesRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.take_id)?;
        if self.schema_version != 1
            || !self.start_ms.is_finite()
            || !(0.0..=600_000.0).contains(&self.start_ms)
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordedPitches {
    schema_version: u8,
    project_id: String,
    take_id: String,
    start_ms: f64,
    duration_ms: f64,
    frames: u32,
    sample_rate: u32,
    method: &'static str,
    #[serde(flatten)]
    pub window: PitchWindow,
}

pub fn analyze_recording(
    store: &ProjectStore,
    request: RecordedPitchesRequest,
    cancel: &AtomicBool,
    progress: impl Fn(u64, u64) -> Result<(), AppError>,
) -> Result<RecordedPitches, AppError> {
    let (take, start, pcm) = read_window(store, &request, 400, cancel, progress)?;
    let frames = pcm.len();
    let window = analyze_window(&pcm, take.sample_rate, cancel)?;
    canceled(cancel)?;
    Ok(RecordedPitches {
        schema_version: 1,
        project_id: take.project_id,
        take_id: take.id,
        start_ms: start as f64 * 1000.0 / f64::from(take.sample_rate),
        duration_ms: frames as f64 * 1000.0 / f64::from(take.sample_rate),
        frames: frames as u32,
        sample_rate: take.sample_rate,
        method: "SPECTRAL_PEAK_EXPERIMENTAL",
        window,
    })
}

fn read_window(
    store: &ProjectStore,
    request: &RecordedPitchesRequest,
    duration_ms: u32,
    cancel: &AtomicBool,
    progress: impl Fn(u64, u64) -> Result<(), AppError>,
) -> Result<(RecordedTake, usize, Vec<f32>), AppError> {
    request.validate()?;
    canceled(cancel)?;
    let take = store.take(&request.project_id, &request.take_id)?;
    if take.state != RecordingState::Ready
        || take.dropped_frames > 0
        || !take.warning_intervals.is_empty()
    {
        return Err(AppError::new(
            "CHORD_TAKE_UNVERIFIED",
            "누락 없는 READY 테이크만 분석할 수 있습니다.",
            true,
        ));
    }
    let size = wave::HEADER_BYTES + take.frames * 4;
    if take.frames > wave::frame_limit(take.sample_rate) || size > wave::MAX_BYTES {
        return Err(AppError::new(
            "CHORD_TAKE_LIMIT",
            "녹음 한도10분/256MiB 이하 테이크만 지원합니다.",
            false,
        ));
    }
    let start = (request.start_ms * f64::from(take.sample_rate) / 1000.0).floor() as usize;
    let frames = take.sample_rate as usize * duration_ms as usize / 1000;
    if start as u64 + frames as u64 > take.frames {
        return Err(AppError::new(
            if duration_ms == 1000 {
                "PITCH_TRACK_WINDOW_INVALID"
            } else {
                "CHORD_WINDOW_INVALID"
            },
            if duration_ms == 1000 {
                "시작 지점 뒤에1초 이상 남아 있어야 합니다."
            } else {
                "시작 지점 뒤에400ms 이상 남아 있어야 합니다."
            },
            false,
        ));
    }
    let pcm = store.recording_window(&take, start as u64, frames as u32, cancel, progress)?;
    Ok((take, start, pcm))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordedPitchTrack {
    schema_version: u8,
    project_id: String,
    take_id: String,
    start_ms: f64,
    duration_ms: f64,
    frames: u32,
    sample_rate: u32,
    method: &'static str,
    motion: &'static str,
    coverage: f64,
    delta_cents: Option<f64>,
    min_confidence: Option<f64>,
    rms_dbfs: f64,
    points: Vec<RecordedTrackPoint>,
    warnings: Vec<&'static str>,
    oscillation: Option<Oscillation>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordedTrackPoint {
    time_ms: f64,
    pitch_midi: Option<f64>,
    confidence: Option<f64>,
}
pub fn analyze_recording_track(
    store: &ProjectStore,
    request: RecordedPitchesRequest,
    cancel: &AtomicBool,
    progress: impl Fn(u64, u64) -> Result<(), AppError>,
) -> Result<RecordedPitchTrack, AppError> {
    let (take, start, pcm) = read_window(store, &request, 1000, cancel, progress)?;
    let track = analyze_pitch_track(&pcm, take.sample_rate, cancel)?;
    canceled(cancel)?;
    Ok(RecordedPitchTrack {
        schema_version: 2,
        project_id: take.project_id,
        take_id: take.id,
        start_ms: start as f64 * 1000.0 / f64::from(take.sample_rate),
        duration_ms: 1000.0,
        frames: take.sample_rate,
        sample_rate: take.sample_rate,
        method: "MONOPHONIC_TRACK_EXPERIMENTAL",
        motion: match track.motion {
            PitchMotion::Steady => "STEADY",
            PitchMotion::Rising => "RISING",
            PitchMotion::Falling => "FALLING",
            PitchMotion::Oscillating => "OSCILLATING",
            PitchMotion::Unverified => "UNVERIFIED",
        },
        coverage: track.coverage,
        delta_cents: track.delta_cents,
        min_confidence: track.min_confidence,
        rms_dbfs: track.rms_dbfs,
        oscillation: track.oscillation,
        points: track
            .points
            .into_iter()
            .map(|p| RecordedTrackPoint {
                time_ms: p.time_ms,
                pitch_midi: p.pitch.map(|pitch| pitch.midi),
                confidence: p.pitch.map(|pitch| pitch.confidence),
            })
            .collect(),
        warnings: track.warnings,
    })
}

#[cfg(test)]
mod tests;
