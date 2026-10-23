use crate::ipc::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

pub const MAX_SCORE_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_SAFE: u64 = 9_007_199_254_740_991;

fn deserialize_present_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

pub fn storage_error() -> AppError {
    AppError::new(
        "STORAGE_ERROR",
        "프로젝트 데이터를 읽거나 저장하지 못했습니다. 기존 데이터를 보존했습니다.",
        true,
    )
}
pub fn validate_uuid(id: &str) -> Result<(), AppError> {
    if Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id) {
        Ok(())
    } else {
        Err(AppError::invalid())
    }
}
fn identifier(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && !id.chars().any(char::is_control)
}
pub fn title_valid(title: &str) -> bool {
    !title.trim().is_empty() && title.chars().count() <= 200 && !title.chars().any(char::is_control)
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectMode {
    Copy,
    Practice,
    Performance,
}
impl ProjectMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Copy => "copy",
            Self::Practice => "practice",
            Self::Performance => "performance",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreNote {
    #[serde(
        default,
        deserialize_with = "deserialize_present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub judgement_support: Option<JudgementSupport>,
    pub id: String,
    pub track_id: String,
    pub measure_index: u32,
    pub start_tick: u64,
    pub duration_ticks: u64,
    pub pitch_midi: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub string_index: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fret: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notation_note_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attack: Option<bool>,
    pub source: NoteSource,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JudgementSupport {
    Unsupported,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteSource {
    Manual,
    Import,
    Ai,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreTrack {
    pub id: String,
    pub name: String,
    pub tuning_midi: Vec<u8>,
    pub notes: Vec<ScoreNote>,
    #[serde(
        default,
        deserialize_with = "deserialize_present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub instrument: Option<ScoreInstrument>,
    #[serde(
        default,
        deserialize_with = "deserialize_present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub role: Option<GuitarPartRole>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScoreInstrument {
    Guitar,
    Other,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GuitarPartRole {
    Lead,
    Rhythm,
    Harmony,
    GuitarOther,
    Unknown,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tempo {
    pub tick: u64,
    pub bpm: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeSignature {
    pub tick: u64,
    pub numerator: u8,
    pub denominator: u8,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncAnchor {
    pub score_tick: u64,
    pub audio_time_ms: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreDocument {
    pub schema_version: u8,
    #[serde(
        default,
        deserialize_with = "deserialize_present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub render_source: Option<ScoreRenderSource>,
    pub id: String,
    pub title: String,
    pub ppq: u32,
    pub tempo_map: Vec<Tempo>,
    pub time_signatures: Vec<TimeSignature>,
    pub sync_anchors: Vec<SyncAnchor>,
    pub tracks: Vec<ScoreTrack>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ScoreRenderSource {
    #[serde(rename = "NORMALIZED")]
    Normalized,
}
impl ScoreDocument {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || !identifier(&self.id)
            || !title_valid(&self.title)
            || !(1..=1_000_000).contains(&self.ppq)
            || self.tracks.is_empty()
            || self.tracks.len() > 128
            || self.tempo_map.is_empty()
            || self.tempo_map.len() > 10_000
            || self.time_signatures.is_empty()
            || self.time_signatures.len() > 20_000
            || !(2..=10_000).contains(&self.sync_anchors.len())
        {
            return Err(AppError::invalid());
        }
        let mut tracks = HashSet::new();
        let mut notes = HashSet::new();
        for track in &self.tracks {
            if !identifier(&track.id)
                || !tracks.insert(&track.id)
                || !title_valid(&track.name)
                || track.tuning_midi.len() > 12
                || track.tuning_midi.iter().any(|p| *p > 127)
            {
                return Err(AppError::invalid());
            }
            for note in &track.notes {
                if !identifier(&note.id)
                    || !notes.insert(&note.id)
                    || notes.len() > 100_000
                    || note.track_id != track.id
                    || note.measure_index > 100_000
                    || note.duration_ticks == 0
                    || note.start_tick > MAX_SAFE
                    || note.duration_ticks > MAX_SAFE - note.start_tick
                    || note.pitch_midi > 127
                    || note
                        .string_index
                        .is_some_and(|s| s == 0 || usize::from(s) > track.tuning_midi.len())
                    || note.fret.is_some_and(|f| f > 36)
                    || note
                        .notation_note_id
                        .as_ref()
                        .is_some_and(|id| !identifier(id))
                {
                    return Err(AppError::invalid());
                }
            }
        }
        if self.tempo_map[0].tick != 0
            || self.time_signatures[0].tick != 0
            || self.tempo_map.iter().any(|t| {
                t.tick > MAX_SAFE || !t.bpm.is_finite() || !(10.0..=600.0).contains(&t.bpm)
            })
            || self
                .tempo_map
                .windows(2)
                .any(|pair| pair[0].tick >= pair[1].tick)
            || self.time_signatures.iter().any(|s| {
                s.tick > MAX_SAFE
                    || !(1..=32).contains(&s.numerator)
                    || ![1, 2, 4, 8, 16, 32].contains(&s.denominator)
            })
            || self
                .time_signatures
                .windows(2)
                .any(|pair| pair[0].tick >= pair[1].tick)
            || self.sync_anchors.iter().any(|a| {
                a.score_tick > MAX_SAFE
                    || !a.audio_time_ms.is_finite()
                    || !(0.0..=86_400_000.0).contains(&a.audio_time_ms)
            })
            || self.sync_anchors.windows(2).any(|pair| {
                pair[0].score_tick >= pair[1].score_tick
                    || pair[0].audio_time_ms >= pair[1].audio_time_ms
            })
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaybackLoop {
    pub enabled: bool,
    pub start_ms: f64,
    pub end_ms: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceState {
    pub active_track_index: usize,
    #[serde(
        default,
        deserialize_with = "deserialize_present_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub active_performance_track_id: Option<String>,
    pub audio_asset_id: Option<String>,
    pub position_ms: f64,
    pub rate: f64,
    pub playback_loop: PlaybackLoop,
}
impl WorkspaceState {
    pub fn validate(&self, score: &ScoreDocument) -> Result<(), AppError> {
        if self.active_track_index >= score.tracks.len()
            || self.active_performance_track_id.as_ref().is_some_and(|id| {
                score
                    .tracks
                    .get(self.active_track_index)
                    .is_none_or(|track| &track.id != id)
            })
            || !self.position_ms.is_finite()
            || !(0.0..=86_400_000.0).contains(&self.position_ms)
            || !self.rate.is_finite()
            || !(0.5..=1.5).contains(&self.rate)
            || !self.playback_loop.start_ms.is_finite()
            || !self.playback_loop.end_ms.is_finite()
            || self.playback_loop.start_ms < 0.0
            || self.playback_loop.end_ms > 86_400_000.0
            || self.playback_loop.end_ms < self.playback_loop.start_ms
            || (self.playback_loop.enabled
                && self.playback_loop.end_ms - self.playback_loop.start_ms < 250.0)
        {
            return Err(AppError::invalid());
        }
        if let Some(id) = &self.audio_asset_id {
            validate_uuid(id)?;
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevisionDocument {
    pub schema_version: u8,
    pub project_id: String,
    pub revision_id: String,
    pub revision: u32,
    pub score_asset_id: String,
    pub score: ScoreDocument,
    pub workspace: WorkspaceState,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub mode: ProjectMode,
    pub revision: u32,
    pub revision_id: Option<String>,
    pub updated_at_ms: u64,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    ScoreImport,
    Original,
}
impl AssetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ScoreImport => "SCORE_IMPORT",
            Self::Original => "ORIGINAL",
        }
    }
    pub fn max_bytes(self) -> u64 {
        match self {
            Self::ScoreImport => MAX_SCORE_BYTES as u64,
            Self::Original => 256 * 1024 * 1024,
        }
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetStorage {
    Managed,
    Reference,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub id: String,
    pub project_id: String,
    pub kind: AssetKind,
    pub storage: AssetStorage,
    pub name: String,
    pub sha256: String,
    pub bytes: u64,
    pub available: bool,
}
