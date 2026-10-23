use super::{FinalOutcome, Matcher, Observation, Settings, Target};
use crate::{
    audio::{AudioService, PracticeCapture},
    ipc::AppError,
    storage::calibration::{DeviceProfile, MonitorEnvironment, ProfileDocument, ProfileStore},
    storage::{
        practice_records::{ArchiveBinding, PracticeArchiveRequest},
        projects::ProjectStore,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
};
use uuid::Uuid;

const MAX_SAFE: u64 = 9_007_199_254_740_991;
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PracticeTarget {
    #[serde(default)]
    pub unsupported: bool,
    pub id: String,
    pub song_time_ms: f64,
    pub pitch_midi: u8,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartAttemptRequest {
    pub schema_version: u8,
    pub expected_stream_generation: u64,
    pub playback_epoch: u64,
    pub rate: f64,
    pub score_revision: String,
    pub track_id: String,
    pub calibration_revision: u64,
    pub calibration_profile_id: String,
    pub monitor_environment: MonitorEnvironment,
    pub cool_ms: f64,
    pub good_ms: f64,
    pub pitch_tolerance_cents: f64,
    pub targets: Vec<PracticeTarget>,
    #[serde(default)]
    pub archive: Option<PracticeArchiveRequest>,
}
impl StartAttemptRequest {
    fn settings(&self, bias: f64) -> Settings {
        Settings {
            rate: self.rate,
            calibration_real_ms: bias,
            cool_ms: self.cool_ms,
            good_ms: self.good_ms,
            pitch_tolerance_cents: self.pitch_tolerance_cents,
        }
    }
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || !(1..=MAX_SAFE).contains(&self.expected_stream_generation)
            || !(1..=MAX_SAFE).contains(&self.playback_epoch)
            || self.calibration_revision > MAX_SAFE
            || Uuid::parse_str(&self.score_revision).is_err()
            || Uuid::parse_str(&self.calibration_profile_id).is_err()
            || self.track_id.is_empty()
            || self.track_id.len() > 128
            || self.targets.is_empty()
            || self.targets.len() > 100_000
            || self.targets.iter().any(|target| {
                !target.song_time_ms.is_finite()
                    || !(0.0..=86_400_000.0).contains(&target.song_time_ms)
            })
        {
            return Err(AppError::invalid());
        }
        self.settings(0.0).validate()
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttemptRequest {
    pub schema_version: u8,
    pub attempt_id: String,
}
impl AttemptRequest {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 || Uuid::parse_str(&self.attempt_id).is_err() {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeEvent {
    pub(crate) sequence: u64,
    pub(crate) note_id: String,
    expected_pitch_midi: u8,
    confidence: Option<f64>,
    final_outcome: Option<FinalOutcome>,
    feedback: Option<&'static str>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttemptSnapshot {
    pub schema_version: u8,
    pub attempt_id: String,
    pub state: &'static str,
    pub error_code: Option<&'static str>,
    pub(crate) playback_epoch: u64,
    pub(crate) score_revision: String,
    pub(crate) track_id: String,
    pub(crate) rate: f64,
    pub(crate) calibration_revision: u64,
    pub(crate) calibration_profile: DeviceProfile,
    pub(crate) cool_ms: f64,
    pub(crate) good_ms: f64,
    pub(crate) pitch_tolerance_cents: f64,
    score: u64,
    combo: u32,
    max_combo: u32,
    cool: u32,
    good: u32,
    miss: u32,
    excluded: u32,
    accuracy: Option<f64>,
    target_count: usize,
    pub(crate) event_sequence: u64,
    events: Vec<PracticeEvent>,
}
struct Attempt {
    id: String,
    request: StartAttemptRequest,
    profile: DeviceProfile,
    matcher: Matcher,
    pitches: HashMap<String, u8>,
    state: &'static str,
    error_code: Option<&'static str>,
    started_ns: u64,
    last_poll_ns: u64,
    last_sequence: u64,
    dropped_frames: u64,
    discontinuities: u64,
    max_combo: u32,
    event_sequence: u64,
    events: VecDeque<PracticeEvent>,
    archive_binding: Option<ArchiveBinding>,
    dirty_events: Vec<PracticeEvent>,
    archived_state: Option<&'static str>,
}
impl Attempt {
    #[cfg(test)]
    fn new(
        request: StartAttemptRequest,
        document: ProfileDocument,
        frame: PracticeCapture,
    ) -> Result<Self, AppError> {
        Self::new_with_archive(request, document, frame, None)
    }
    fn new_with_archive(
        request: StartAttemptRequest,
        document: ProfileDocument,
        frame: PracticeCapture,
        archive_binding: Option<ArchiveBinding>,
    ) -> Result<Self, AppError> {
        request.validate()?;
        if document.revision != request.calibration_revision {
            return Err(AppError::new(
                "REVISION_CONFLICT",
                "보정값을 다시 읽으세요.",
                true,
            ));
        }
        let profile = document
            .profiles
            .into_iter()
            .find(|profile| {
                profile.id == request.calibration_profile_id && profile.key == frame.key
            })
            .ok_or_else(|| {
                AppError::new(
                    "CALIBRATION_REQUIRED",
                    "현재 입력 구성의 보정값이 필요합니다.",
                    true,
                )
            })?;
        let targets = request
            .targets
            .iter()
            .map(|target| Target {
                unsupported: target.unsupported,
                id: target.id.clone(),
                song_time_ms: target.song_time_ms,
                pitch_midi: target.pitch_midi,
            })
            .collect();
        let matcher = Matcher::new(
            request.playback_epoch,
            request.settings(profile.bias_real_ms),
            targets,
        )?;
        let pitches = request
            .targets
            .iter()
            .map(|target| (target.id.clone(), target.pitch_midi))
            .collect();
        let mut attempt = Self {
            id: Uuid::new_v4().to_string(),
            request,
            profile,
            matcher,
            pitches,
            state: "RUNNING",
            error_code: None,
            started_ns: frame.now_ns,
            last_poll_ns: frame.now_ns,
            last_sequence: frame.onsets.last().map_or(0, |onset| onset.sequence),
            dropped_frames: frame.dropped_frames,
            discontinuities: frame.discontinuities,
            max_combo: 0,
            event_sequence: 0,
            events: VecDeque::new(),
            archive_binding,
            dirty_events: Vec::new(),
            archived_state: None,
        };
        let skipped = attempt.matcher.skip_incomplete_windows(frame.song_time_ms);
        for outcome in skipped {
            attempt.record_final(outcome, None);
        }
        attempt.complete_if_finished();
        Ok(attempt)
    }
    fn record(
        &mut self,
        note_id: String,
        final_outcome: Option<FinalOutcome>,
        confidence: Option<f64>,
        feedback: Option<&'static str>,
    ) {
        self.event_sequence += 1;
        let event = PracticeEvent {
            sequence: self.event_sequence,
            expected_pitch_midi: self.pitches.get(&note_id).copied().unwrap_or(0),
            note_id,
            confidence,
            final_outcome,
            feedback,
        };
        if self.archive_binding.is_some() {
            self.dirty_events.push(event.clone());
        }
        self.events.push_back(event);
        while self.events.len() > 128 {
            self.events.pop_front();
        }
    }
    fn record_final(&mut self, outcome: FinalOutcome, confidence: Option<f64>) {
        self.max_combo = self.max_combo.max(outcome.combo_after);
        self.record(outcome.note_id.clone(), Some(outcome), confidence, None);
    }
    fn flush_archive(&mut self, store: Option<&ProjectStore>) -> Result<(), AppError> {
        let Some(binding) = &self.archive_binding else {
            return Ok(());
        };
        if self.dirty_events.is_empty() && self.archived_state == Some(self.state) {
            return Ok(());
        }
        let store = store.ok_or_else(|| {
            AppError::new(
                "STORAGE_ERROR",
                "연습 기록 저장소를 사용할 수 없습니다.",
                true,
            )
        })?;
        if let Err(error) = store.archive_attempt(binding, &self.snapshot(), &self.dirty_events) {
            self.close("INVALIDATED", Some(error.code))?;
            return Err(error);
        }
        self.dirty_events.clear();
        self.archived_state = Some(self.state);
        Ok(())
    }
    fn complete_if_finished(&mut self) {
        if self.matcher.cool + self.matcher.good + self.matcher.miss + self.matcher.excluded
            == self.request.targets.len() as u32
        {
            self.state = "FINISHED";
        }
    }
    fn close(&mut self, state: &'static str, code: Option<&'static str>) -> Result<(), AppError> {
        if self.state != "RUNNING" {
            return Ok(());
        }
        for outcome in self.matcher.advance(0.0, false)? {
            self.record_final(outcome, None);
        }
        self.state = state;
        self.error_code = code;
        Ok(())
    }
    fn collect(&mut self, frame: Result<PracticeCapture, AppError>) -> Result<(), AppError> {
        if self.state != "RUNNING" {
            return Ok(());
        }
        let frame = match frame {
            Ok(frame) => frame,
            Err(error) => {
                return self.close("INVALIDATED", Some(error.code));
            }
        };
        if frame.key != self.profile.key
            || frame.dropped_frames != self.dropped_frames
            || frame.discontinuities != self.discontinuities
            || frame.now_ns < self.last_poll_ns
            || frame.now_ns.saturating_sub(self.last_poll_ns) > 1_500_000_000
        {
            return self.close("INVALIDATED", Some("INPUT_GAP"));
        }
        self.last_poll_ns = frame.now_ns;
        for onset in frame.onsets {
            if onset.sequence <= self.last_sequence {
                continue;
            }
            if onset.sequence != self.last_sequence + 1 {
                return self.close("INVALIDATED", Some("INPUT_GAP"));
            }
            self.last_sequence = onset.sequence;
            // 시작 전에 친 음이 DSP 지연으로 뒤늦게 도착해도 새 시도에 재사용하지 않습니다.
            if onset.captured_ns < self.started_ns {
                continue;
            }
            let Some(time) = onset.song_time_ms else {
                return self.close("INVALIDATED", Some("CLOCK_UNCERTAIN"));
            };
            let result = self.matcher.observe(Observation {
                sequence: onset.sequence,
                playback_epoch: self.request.playback_epoch,
                played_song_time_ms: time,
                pitch_midi: onset.pitch_midi,
                confidence: onset.confidence,
                onset: true,
            })?;
            if let Some(outcome) = result.final_outcome {
                self.record_final(outcome, Some(onset.confidence));
            }
            if let Some(feedback) = result.feedback {
                self.record(
                    feedback.note_id,
                    None,
                    Some(onset.confidence),
                    Some(feedback.detail),
                );
            }
        }
        if let Some(watermark) = frame.watermark_song_ms {
            for outcome in self.matcher.advance(watermark, true)? {
                self.record_final(outcome, None);
            }
        }
        self.complete_if_finished();
        Ok(())
    }
    fn snapshot(&self) -> AttemptSnapshot {
        AttemptSnapshot {
            schema_version: 1,
            attempt_id: self.id.clone(),
            state: self.state,
            error_code: self.error_code,
            playback_epoch: self.request.playback_epoch,
            score_revision: self.request.score_revision.clone(),
            track_id: self.request.track_id.clone(),
            rate: self.request.rate,
            calibration_revision: self.request.calibration_revision,
            calibration_profile: self.profile.clone(),
            cool_ms: self.request.cool_ms,
            good_ms: self.request.good_ms,
            pitch_tolerance_cents: self.request.pitch_tolerance_cents,
            score: self.matcher.score,
            combo: self.matcher.combo,
            max_combo: self.max_combo,
            cool: self.matcher.cool,
            good: self.matcher.good,
            miss: self.matcher.miss,
            excluded: self.matcher.excluded,
            accuracy: self.matcher.accuracy(),
            target_count: self.request.targets.len(),
            event_sequence: self.event_sequence,
            events: self.events.iter().cloned().collect(),
        }
    }
}
#[derive(Default)]
pub struct PracticeService {
    attempt: Mutex<Option<Attempt>>,
    archive_store: Option<Arc<ProjectStore>>,
}
impl PracticeService {
    pub fn with_archive(store: Arc<ProjectStore>) -> Self {
        Self {
            attempt: Mutex::new(None),
            archive_store: Some(store),
        }
    }
    pub fn start(
        &self,
        request: StartAttemptRequest,
        audio: &AudioService,
        store: &ProfileStore,
    ) -> Result<AttemptSnapshot, AppError> {
        request.validate()?;
        let mut active = self.attempt.lock().map_err(|_| AppError::internal())?;
        if let Some(previous) = active.as_mut() {
            previous.collect(audio.practice_capture(
                previous.request.expected_stream_generation,
                previous.request.playback_epoch,
                previous.request.rate,
                previous.request.monitor_environment,
            ))?;
            previous.flush_archive(self.archive_store.as_deref())?;
            if previous.state == "RUNNING" {
                return Err(AppError::new(
                    "ATTEMPT_ALREADY_ACTIVE",
                    "진행 중인 시도를 먼저 중단하세요.",
                    true,
                ));
            }
        }
        let document = store.list()?;
        let binding = request
            .archive
            .clone()
            .map(|context| {
                self.archive_store
                    .as_ref()
                    .ok_or_else(|| {
                        AppError::new(
                            "STORAGE_ERROR",
                            "연습 기록 저장소를 사용할 수 없습니다.",
                            true,
                        )
                    })?
                    .prepare_archive(
                        context,
                        &request.score_revision,
                        &request.track_id,
                        &request.targets,
                    )
            })
            .transpose()?;
        let frame = audio.practice_capture(
            request.expected_stream_generation,
            request.playback_epoch,
            request.rate,
            request.monitor_environment,
        )?;
        let mut attempt = Attempt::new_with_archive(request, document, frame, binding)?;
        let flushed = attempt.flush_archive(self.archive_store.as_deref());
        let snapshot = attempt.snapshot();
        *active = Some(attempt);
        flushed?;
        Ok(snapshot)
    }
    pub fn poll(
        &self,
        request: AttemptRequest,
        audio: &AudioService,
    ) -> Result<AttemptSnapshot, AppError> {
        request.validate()?;
        let mut active = self.attempt.lock().map_err(|_| AppError::internal())?;
        let attempt = active
            .as_mut()
            .filter(|attempt| attempt.id == request.attempt_id)
            .ok_or_else(AppError::invalid)?;
        if let Err(error) = attempt.collect(audio.practice_capture(
            attempt.request.expected_stream_generation,
            attempt.request.playback_epoch,
            attempt.request.rate,
            attempt.request.monitor_environment,
        )) {
            attempt.close("INVALIDATED", Some(error.code))?;
        }
        attempt.flush_archive(self.archive_store.as_deref())?;
        Ok(attempt.snapshot())
    }
    pub fn stop(&self, request: AttemptRequest) -> Result<AttemptSnapshot, AppError> {
        request.validate()?;
        let mut active = self.attempt.lock().map_err(|_| AppError::internal())?;
        let attempt = active
            .as_mut()
            .filter(|attempt| attempt.id == request.attempt_id)
            .ok_or_else(AppError::invalid)?;
        attempt.close("STOPPED", None)?;
        attempt.flush_archive(self.archive_store.as_deref())?;
        Ok(attempt.snapshot())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{audio::PracticeOnset, storage::calibration::ProfileKey};
    const ID: &str = "00000000-0000-4000-8000-000000000001";
    fn key() -> ProfileKey {
        ProfileKey {
            device_id: "fixture".into(),
            sample_rate: 48000,
            sample_format: "f32".into(),
            channels: 1,
            channel_index: 0,
            buffer_frames: 480,
            monitor_environment: MonitorEnvironment::Headphones,
        }
    }
    fn document(bias: f64) -> ProfileDocument {
        ProfileDocument {
            schema_version: 1,
            revision: 1,
            profiles: vec![DeviceProfile {
                id: ID.into(),
                key: key(),
                bias_real_ms: bias,
                method: "MANUAL".into(),
                jitter_real_ms: None,
                samples_used: None,
            }],
        }
    }
    fn request(rate: f64) -> StartAttemptRequest {
        StartAttemptRequest {
            schema_version: 1,
            expected_stream_generation: 1,
            playback_epoch: 2,
            rate,
            score_revision: ID.into(),
            track_id: "guitar".into(),
            calibration_revision: 1,
            calibration_profile_id: ID.into(),
            monitor_environment: MonitorEnvironment::Headphones,
            cool_ms: 50.0,
            good_ms: 120.0,
            pitch_tolerance_cents: 50.0,
            targets: vec![
                PracticeTarget {
                    unsupported: false,
                    id: "a".into(),
                    song_time_ms: 2000.0,
                    pitch_midi: 67,
                },
                PracticeTarget {
                    unsupported: false,
                    id: "b".into(),
                    song_time_ms: 3000.0,
                    pitch_midi: 64,
                },
            ],
            archive: None,
        }
    }
    fn frame(time: f64) -> PracticeCapture {
        PracticeCapture {
            key: key(),
            now_ns: 1_000_000_000,
            song_time_ms: time,
            watermark_song_ms: None,
            dropped_frames: 0,
            discontinuities: 0,
            onsets: vec![],
        }
    }
    fn onset(sequence: u64, time: f64, pitch: Option<f64>) -> PracticeOnset {
        PracticeOnset {
            sequence,
            captured_ns: 1_010_000_000,
            song_time_ms: Some(time),
            pitch_midi: pitch,
            confidence: if pitch.is_some() { 0.99 } else { 0.0 },
        }
    }
    fn archive_fixture(
        count: usize,
        unsupported_first: bool,
    ) -> (
        crate::storage::projects_tests::Fixture,
        crate::storage::practice_records::ArchiveBinding,
        StartAttemptRequest,
    ) {
        use crate::storage::{
            practice_records::PracticeArchiveRequest, project_model::AssetStorage, projects_tests,
        };
        use std::sync::atomic::AtomicBool;
        let fixture = projects_tests::Fixture::new();
        let project = fixture.project();
        let asset = fixture.asset(&project, AssetStorage::Managed);
        let mut score = projects_tests::score();
        score.tracks[0].id = "guitar".into();
        let base = score.tracks[0].notes[0].clone();
        score.tracks[0].notes.clear();
        let mut req = request(1.0);
        req.targets.clear();
        for i in 0..count {
            let id = format!("note-{i}");
            let time = 2000.0 + i as f64 * 50.0;
            let mut note = base.clone();
            note.id = id.clone();
            note.track_id = "guitar".into();
            note.start_tick = 3840 + i as u64 * 96;
            note.measure_index = i as u32 / 16;
            note.pitch_midi = 67;
            if unsupported_first && i == 0 {
                note.judgement_support =
                    Some(crate::storage::project_model::JudgementSupport::Unsupported);
            }
            score.tracks[0].notes.push(note);
            req.targets.push(PracticeTarget {
                unsupported: unsupported_first && i == 0,
                id,
                song_time_ms: time,
                pitch_midi: 67,
            });
        }
        let revision = fixture
            .store
            .save_revision(
                &project,
                0,
                &asset,
                score,
                projects_tests::workspace(),
                &AtomicBool::new(false),
            )
            .expect("연습 악보 저장");
        req.score_revision = revision.revision_id;
        let context = PracticeArchiveRequest {
            project_id: project,
            session_id: Uuid::new_v4().to_string(),
            range_start_ms: 0.0,
            range_end_ms: 2000.0 + count as f64 * 50.0,
        };
        let binding = fixture
            .store
            .prepare_archive(context, &req.score_revision, &req.track_id, &req.targets)
            .expect("native 저장 대상 검증");
        (fixture, binding, req)
    }
    #[test]
    fn unsupported_attempt_reopens_with_exclusion_and_v2_without_false_penalty() {
        let (fixture, binding, req) = archive_fixture(2, true);
        let project = fixture.store.list().expect("프로젝트")[0].id.clone();
        let mut attempt = Attempt::new(req, document(0.0), frame(1000.0)).expect("주법 시도");
        let mut input = frame(2300.0);
        input.onsets = vec![onset(1, 2000.0, Some(67.0)), onset(2, 2050.0, Some(67.0))];
        input.watermark_song_ms = Some(2300.0);
        attempt.collect(Ok(input)).expect("입력 마감");
        let snapshot = attempt.snapshot();
        assert_eq!(
            (
                snapshot.cool,
                snapshot.miss,
                snapshot.excluded,
                snapshot.score
            ),
            (1, 0, 1, 1000)
        );
        fixture
            .store
            .archive_attempt(&binding, &snapshot, &snapshot.events)
            .expect("주법 저장");
        let reopened = crate::storage::projects::ProjectStore::new(fixture.store.root.clone());
        reopened.initialize().expect("재실행");
        let records = reopened.attempts(&project).expect("기록");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].scoring_version, "monophonic-poc-v2");
        assert_eq!(records[0].snapshot["excluded"], 1);
        assert_eq!(records[0].snapshot["accuracy"], 100.0);
        let events = reopened
            .events(&project, &records[0].attempt_id, 0)
            .expect("이벤트");
        assert_eq!(events.len(), 2);
        assert!(events
            .iter()
            .any(|e| e.event["finalOutcome"]["outcome"]["reason"] == "UNSUPPORTED"));
    }
    #[test]
    fn ten_native_attempts_and_duplicate_flush_recover_without_fabricated_score() {
        let (fixture, binding, request) = archive_fixture(2, false);
        let project = fixture.store.list().expect("프로젝트")[0].id.clone();
        for _ in 0..10 {
            let req = StartAttemptRequest {
                targets: request.targets.clone(),
                score_revision: request.score_revision.clone(),
                ..self::request(1.0)
            };
            let mut attempt =
                Attempt::new(req, document(0.0), frame(1000.0)).expect("실제 matcher");
            fixture
                .store
                .archive_attempt(&binding, &attempt.snapshot(), &[])
                .expect("RUNNING 저장");
            let mut input = frame(2300.0);
            input.onsets = vec![onset(1, 2000.0, Some(67.0)), onset(2, 2050.0, Some(67.0))];
            input.watermark_song_ms = Some(2300.0);
            attempt.collect(Ok(input)).expect("합성 입력 판정");
            let snapshot = attempt.snapshot();
            assert_eq!(snapshot.state, "FINISHED");
            fixture
                .store
                .archive_attempt(&binding, &snapshot, &snapshot.events)
                .expect("최종 저장");
            fixture
                .store
                .archive_attempt(&binding, &snapshot, &snapshot.events)
                .expect("동일 flush 재시도");
        }
        let reopened = crate::storage::projects::ProjectStore::new(fixture.store.root.clone());
        reopened.initialize().expect("재실행");
        let stored = reopened.attempts(&project).expect("10회 복구");
        assert_eq!(stored.len(), 10);
        let mut completion_order: Vec<_> = stored
            .iter()
            .map(|record| record.completed_order.expect("완료 순서"))
            .collect();
        completion_order.sort_unstable();
        assert_eq!(completion_order, (1..=10).collect::<Vec<_>>());
        for record in stored {
            assert_eq!(record.state, "FINISHED");
            assert_eq!(record.snapshot["score"], 2000);
            assert_eq!(record.snapshot["cool"], 2);
            assert_eq!(
                reopened
                    .events(&project, &record.attempt_id, 0)
                    .expect("이벤트")
                    .len(),
                2
            );
        }
    }
    #[test]
    fn archive_keeps_all_events_beyond_snapshot_history_limit() {
        let (fixture, binding, req) = archive_fixture(300, false);
        let project = fixture.store.list().expect("프로젝트")[0].id.clone();
        let mut attempt = Attempt::new(req, document(0.0), frame(1000.0)).expect("시도");
        fixture
            .store
            .archive_attempt(&binding, &attempt.snapshot(), &[])
            .expect("시작");
        let mut last = 0;
        for group in 0..6 {
            let mut input = frame(2000.0 + (group * 50 + 49) as f64 * 50.0);
            input.onsets = (group * 50..(group + 1) * 50)
                .map(|i| onset(i as u64 + 1, 2000.0 + i as f64 * 50.0, Some(67.0)))
                .collect();
            input.watermark_song_ms = Some(input.song_time_ms);
            attempt.collect(Ok(input)).expect("합성 공격");
            let snapshot = attempt.snapshot();
            let delta: Vec<_> = snapshot
                .events
                .iter()
                .filter(|e| e.sequence > last)
                .cloned()
                .collect();
            fixture
                .store
                .archive_attempt(&binding, &snapshot, &delta)
                .expect("증분 저장");
            last = snapshot.event_sequence;
        }
        let snapshot = attempt.snapshot();
        assert_eq!(snapshot.events.len(), 128);
        assert_eq!(snapshot.cool, 300);
        let stored = fixture
            .store
            .events(&project, &snapshot.attempt_id, 0)
            .expect("전체 저장 이벤트");
        assert_eq!(stored.len(), 300);
        assert_eq!(stored.last().expect("끝").sequence, 300);
        assert_eq!(stored.last().expect("마디").measure_index, 18);
        let older = fixture
            .store
            .events_through(&project, &snapshot.attempt_id, 0, 150)
            .expect("조회 상한");
        assert_eq!(older.len(), 150);
        assert_eq!(older.last().expect("이전 snapshot").sequence, 150);
        assert_eq!(
            fixture
                .store
                .events_through(&project, &snapshot.attempt_id, 150, 300)
                .expect("다음 페이지")
                .len(),
            150
        );
    }
    #[test]
    fn archive_gap_rolls_back_and_interrupted_state_does_not_rejudge() {
        let (fixture, binding, req) = archive_fixture(2, false);
        let project = fixture.store.list().expect("프로젝트")[0].id.clone();
        let mut attempt = Attempt::new(req, document(0.0), frame(1000.0)).expect("시도");
        fixture
            .store
            .archive_attempt(&binding, &attempt.snapshot(), &[])
            .expect("시작 저장");
        let mut input = frame(2300.0);
        input.onsets = vec![onset(1, 2000.0, Some(67.0)), onset(2, 2050.0, Some(67.0))];
        attempt.collect(Ok(input)).expect("판정");
        let snapshot = attempt.snapshot();
        assert_eq!(
            fixture
                .store
                .archive_attempt(&binding, &snapshot, &snapshot.events[1..])
                .expect_err("유실 차단")
                .code,
            "ARCHIVE_EVENT_GAP"
        );
        assert!(fixture
            .store
            .events(&project, &snapshot.attempt_id, 0)
            .expect("부분 저장 없음")
            .is_empty());
        fixture.store.initialize().expect("비정상 종료 복구");
        let stored = fixture.store.attempts(&project).expect("복구");
        assert_eq!(stored[0].state, "INTERRUPTED");
        assert_eq!(stored[0].snapshot["state"], "RUNNING");
        assert_eq!(stored[0].snapshot["score"], 0);
        assert!(fixture
            .store
            .archive_attempt(&binding, &snapshot, &snapshot.events)
            .is_err());
    }
    #[test]
    fn archive_rejects_changed_targets_and_session_configuration() {
        use crate::storage::practice_records::PracticeArchiveRequest;
        let (fixture, binding, mut req) = archive_fixture(2, false);
        let project = fixture.store.list().expect("프로젝트")[0].id.clone();
        req.targets[0].pitch_midi = 64;
        let context = PracticeArchiveRequest {
            project_id: project,
            session_id: Uuid::new_v4().to_string(),
            range_start_ms: 0.0,
            range_end_ms: 2100.0,
        };
        assert_eq!(
            fixture
                .store
                .prepare_archive(context, &req.score_revision, &req.track_id, &req.targets)
                .err()
                .expect("악보 불일치")
                .code,
            "REVISION_CONFLICT"
        );
        req.targets[0].pitch_midi = 67;
        let first = Attempt::new(req, document(0.0), frame(1000.0)).expect("시도");
        fixture
            .store
            .archive_attempt(&binding, &first.snapshot(), &[])
            .expect("저장");
        let mut changed = first.snapshot();
        changed.rate = 0.5;
        assert_eq!(
            fixture
                .store
                .archive_attempt(&binding, &changed, &[])
                .expect_err("불변 설정")
                .code,
            "INVALID_INPUT"
        );
    }
    #[test]
    fn late_start_archive_flushes_all_skipped_events_not_just_last_128() {
        let (fixture, binding, req) = archive_fixture(300, false);
        let project = fixture.store.list().expect("프로젝트")[0].id.clone();
        let mut attempt =
            Attempt::new_with_archive(req, document(0.0), frame(50_000.0), Some(binding))
                .expect("늦은 시작");
        assert_eq!(attempt.snapshot().events.len(), 128);
        assert_eq!(attempt.dirty_events.len(), 300);
        attempt
            .flush_archive(Some(&fixture.store))
            .expect("전체 제외 저장");
        assert!(attempt.dirty_events.is_empty());
        assert_eq!(
            fixture
                .store
                .events(&project, &attempt.id, 0)
                .expect("전체 기록")
                .len(),
            300
        );
        assert_eq!(
            fixture.store.attempts(&project).expect("시도")[0].snapshot["excluded"],
            300
        );
    }
    #[test]
    fn native_archive_failure_stops_scoring_and_retries_same_pending_events() {
        let (fixture, binding, req) = archive_fixture(2, false);
        let project = fixture.store.list().expect("프로젝트")[0].id.clone();
        let mut attempt =
            Attempt::new_with_archive(req, document(0.0), frame(1000.0), Some(binding))
                .expect("저장 시도");
        attempt
            .flush_archive(Some(&fixture.store))
            .expect("시작 저장");
        let mut input = frame(2000.0);
        input.onsets = vec![onset(1, 2000.0, Some(67.0))];
        attempt.collect(Ok(input)).expect("native 판정");
        let db = crate::storage::database::connect(&fixture.store.root).expect("DB");
        db.execute_batch("CREATE TRIGGER fail_event BEFORE INSERT ON judgement_events BEGIN SELECT RAISE(ABORT,'storage failure'); END;").expect("저장 실패 주입");
        assert_eq!(
            attempt
                .flush_archive(Some(&fixture.store))
                .expect_err("실패")
                .code,
            "STORAGE_ERROR"
        );
        assert_eq!(attempt.snapshot().state, "INVALIDATED");
        assert_eq!(attempt.snapshot().excluded, 1);
        assert_eq!(attempt.snapshot().miss, 0);
        assert_eq!(attempt.dirty_events.len(), 2);
        assert!(fixture
            .store
            .events(&project, &attempt.id, 0)
            .expect("부분 commit 없음")
            .is_empty());
        db.execute_batch("DROP TRIGGER fail_event;")
            .expect("저장 복구");
        drop(db);
        attempt
            .flush_archive(Some(&fixture.store))
            .expect("같은 이벤트 재시도");
        attempt
            .flush_archive(Some(&fixture.store))
            .expect("중복 flush");
        assert_eq!(
            fixture
                .store
                .events(&project, &attempt.id, 0)
                .expect("복구 이벤트")
                .len(),
            2
        );
        assert!(attempt.dirty_events.is_empty());
    }
    #[test]
    fn calibrated_native_events_are_once_only_and_before_watermark() {
        for rate in [0.5, 0.75, 1.0, 1.5] {
            let mut attempt =
                Attempt::new(request(rate), document(30.0), frame(1000.0)).expect("시도");
            let mut input = frame(2200.0);
            input.onsets = vec![onset(1, 2000.0 + 30.0 * rate, Some(67.0))];
            input.watermark_song_ms = Some(2200.0);
            attempt.collect(Ok(input)).expect("수집");
            let mut duplicate = frame(2200.0);
            duplicate.onsets = vec![onset(1, 2000.0 + 30.0 * rate, Some(67.0))];
            attempt.collect(Ok(duplicate)).expect("중복");
            assert_eq!(attempt.snapshot().score, 1000);
            assert_eq!(attempt.snapshot().cool, 1);
            assert_eq!(attempt.snapshot().miss, 0);
            assert_eq!(attempt.snapshot().event_sequence, 1);
        }
    }
    #[test]
    fn unknown_pitch_waits_for_dsp_watermark_and_is_excluded() {
        let mut attempt = Attempt::new(request(1.0), document(0.0), frame(1000.0)).expect("시도");
        attempt.collect(Ok(frame(2400.0))).expect("DSP 대기");
        assert_eq!(attempt.snapshot().miss, 0);
        let mut input = frame(2400.0);
        input.onsets = vec![onset(1, 2000.0, None)];
        input.watermark_song_ms = Some(2200.0);
        attempt.collect(Ok(input)).expect("저신뢰");
        assert_eq!(attempt.snapshot().excluded, 1);
        assert_eq!(attempt.snapshot().accuracy, None);
    }
    #[test]
    fn wrong_note_can_retry_and_missing_input_is_finalized_once() {
        let mut attempt = Attempt::new(request(1.0), document(0.0), frame(1000.0)).expect("시도");
        let mut input = frame(2200.0);
        input.onsets = vec![onset(1, 2000.0, Some(65.0)), onset(2, 2080.0, Some(67.0))];
        input.watermark_song_ms = Some(3300.0);
        attempt.collect(Ok(input)).expect("재시도");
        attempt.collect(Ok(frame(3500.0))).expect("완료 후 폴링");
        let snapshot = attempt.snapshot();
        assert_eq!(snapshot.good, 1);
        assert_eq!(snapshot.miss, 1);
        assert_eq!(snapshot.max_combo, 1);
        assert_eq!(snapshot.combo, 0);
        assert_eq!(snapshot.events[0].feedback, Some("WRONG_NOTE"));
        assert_eq!(snapshot.state, "FINISHED");
    }
    #[test]
    fn late_start_and_pre_start_delayed_attacks_do_not_award_or_penalize() {
        let mut attempt = Attempt::new(request(1.0), document(0.0), frame(1950.0)).expect("시도");
        assert_eq!(attempt.snapshot().excluded, 1);
        let mut input = frame(3300.0);
        let mut old = onset(1, 3000.0, Some(64.0));
        old.captured_ns = 999_000_000;
        input.onsets = vec![old];
        attempt.collect(Ok(input)).expect("이전 공격 폐기");
        assert_eq!(attempt.snapshot().score, 0);
    }
    #[test]
    fn disconnect_epoch_or_rate_loss_skips_remaining_without_miss() {
        for code in ["INPUT_NOT_ACTIVE", "CLOCK_UNCERTAIN", "INPUT_CHANGED"] {
            let mut attempt =
                Attempt::new(request(1.0), document(0.0), frame(1000.0)).expect("시도");
            attempt
                .collect(Err(AppError::new(code, "fixture", true)))
                .expect("무효화");
            let snapshot = attempt.snapshot();
            assert_eq!(snapshot.state, "INVALIDATED");
            assert_eq!(snapshot.excluded, 2);
            assert_eq!(snapshot.miss, 0);
        }
    }
    #[test]
    fn gaps_stalled_poll_or_lost_onset_history_invalidate() {
        for condition in 0..5 {
            let mut attempt =
                Attempt::new(request(1.0), document(0.0), frame(1000.0)).expect("시도");
            let mut input = frame(3300.0);
            match condition {
                0 => input.dropped_frames = 1,
                1 => input.discontinuities = 1,
                2 => input.now_ns += 1_500_000_001,
                3 => input.onsets = vec![onset(2, 2000.0, Some(67.0))],
                _ => input.key.buffer_frames = 256,
            }
            input.watermark_song_ms = Some(3300.0);
            attempt.collect(Ok(input)).expect("무효화");
            assert_eq!(attempt.snapshot().excluded, 2);
            assert_eq!(attempt.snapshot().miss, 0);
        }
    }
    #[test]
    fn explicit_stop_is_idempotent_and_stale_id_does_not_stop_current() {
        let service = PracticeService::default();
        let attempt = Attempt::new(request(1.0), document(0.0), frame(1000.0)).expect("시도");
        let id = attempt.id.clone();
        *service.attempt.lock().expect("fixture 잠금") = Some(attempt);
        assert!(service
            .stop(AttemptRequest {
                schema_version: 1,
                attempt_id: ID.into()
            })
            .is_err());
        for _ in 0..2 {
            let snapshot = service
                .stop(AttemptRequest {
                    schema_version: 1,
                    attempt_id: id.clone(),
                })
                .expect("중지");
            assert_eq!(snapshot.state, "STOPPED");
            assert_eq!(snapshot.event_sequence, 2);
            assert_eq!(snapshot.miss, 0);
        }
    }
    #[test]
    fn contracts_and_calibration_provenance_are_checked() {
        let mut wrong_revision = request(1.0);
        wrong_revision.calibration_revision = 0;
        assert!(Attempt::new(wrong_revision, document(0.0), frame(1000.0)).is_err());
        let mut wrong_key = frame(1000.0);
        wrong_key.key.channel_index = 1;
        assert!(Attempt::new(request(1.0), document(0.0), wrong_key).is_err());
        let mut invalid = request(1.0);
        invalid.targets[1].id = "a".into();
        assert!(Attempt::new(invalid, document(0.0), frame(1000.0)).is_err());
        assert!(serde_json::from_str::<AttemptRequest>(
            r#"{"schemaVersion":1,"attemptId":"00000000-0000-4000-8000-000000000001","onsets":[]}"#
        )
        .is_err());
    }
    #[test]
    fn loop_attempts_have_distinct_identity_and_reset_score() {
        let mut first = Attempt::new(request(1.0), document(0.0), frame(1000.0)).expect("첫 시도");
        let mut input = frame(2200.0);
        input.onsets = vec![onset(1, 2000.0, Some(67.0))];
        first.collect(Ok(input)).expect("첫 판정");
        first.close("STOPPED", None).expect("반복 경계");
        let mut next_request = request(0.75);
        next_request.playback_epoch = 3;
        let next = Attempt::new(next_request, document(0.0), frame(1000.0)).expect("다음 반복");
        assert_ne!(first.id, next.id);
        assert_eq!(next.snapshot().score, 0);
        assert_eq!(next.snapshot().combo, 0);
        assert_eq!(next.snapshot().playback_epoch, 3);
    }
    #[test]
    fn recent_events_are_bounded_without_losing_score_totals() {
        let mut request = request(1.0);
        request.targets = (0..130)
            .map(|index| PracticeTarget {
                unsupported: false,
                id: format!("n{index}"),
                song_time_ms: 2000.0 + f64::from(index) * 100.0,
                pitch_midi: 67,
            })
            .collect();
        let mut attempt = Attempt::new(request, document(0.0), frame(1000.0)).expect("긴 시도");
        for index in 0..130 {
            let time = 2000.0 + f64::from(index) * 100.0;
            let mut input = frame(time);
            input.now_ns = 2_000_000_000 + (index as u64) * 100_000_000;
            let mut attack = onset(index as u64 + 1, time, Some(67.0));
            attack.captured_ns = input.now_ns;
            input.onsets = vec![attack];
            attempt.collect(Ok(input)).expect("순차 수집");
        }
        let snapshot = attempt.snapshot();
        assert_eq!(snapshot.events.len(), 128);
        assert_eq!(snapshot.event_sequence, 130);
        assert_eq!(snapshot.score, 130_000);
        assert_eq!(snapshot.combo, 130);
        assert_eq!(snapshot.state, "FINISHED");
    }
}
