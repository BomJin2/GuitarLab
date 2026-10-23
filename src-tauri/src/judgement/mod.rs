use crate::ipc::AppError;
pub mod calibration;
pub mod calibration_measurement;
pub mod calibration_sampler;
pub mod chord;
pub mod practice;
pub mod recorded_pitches;
use serde::Serialize;
use std::collections::HashSet;

#[derive(Clone)]
pub struct Target {
    pub unsupported: bool,
    pub id: String,
    pub song_time_ms: f64,
    pub pitch_midi: u8,
}
#[derive(Clone, Copy)]
pub struct Settings {
    pub rate: f64,
    pub calibration_real_ms: f64,
    pub cool_ms: f64,
    pub good_ms: f64,
    pub pitch_tolerance_cents: f64,
}
impl Settings {
    pub fn normal(rate: f64, calibration_real_ms: f64) -> Self {
        Self {
            rate,
            calibration_real_ms,
            cool_ms: 50.0,
            good_ms: 120.0,
            pitch_tolerance_cents: 50.0,
        }
    }
    pub fn validate(&self) -> Result<(), AppError> {
        if !self.rate.is_finite()
            || !(0.5..=1.5).contains(&self.rate)
            || !self.calibration_real_ms.is_finite()
            || self.calibration_real_ms.abs() > 500.0
            || !self.cool_ms.is_finite()
            || !(5.0..=250.0).contains(&self.cool_ms)
            || !self.good_ms.is_finite()
            || !(self.cool_ms..=500.0).contains(&self.good_ms)
            || !self.pitch_tolerance_cents.is_finite()
            || !(10.0..=100.0).contains(&self.pitch_tolerance_cents)
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
pub struct Observation {
    pub sequence: u64,
    pub playback_epoch: u64,
    pub played_song_time_ms: f64,
    pub pitch_midi: Option<f64>,
    pub confidence: f64,
    pub onset: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Outcome {
    #[serde(rename_all = "camelCase")]
    Judged {
        judgement: &'static str,
        detail: &'static str,
        score_awarded: u32,
    },
    #[serde(rename_all = "camelCase")]
    NotScored {
        reason: &'static str,
        score_awarded: u32,
    },
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalOutcome {
    pub note_id: String,
    pub playback_epoch: u64,
    pub outcome: Outcome,
    pub delta_real_ms: Option<f64>,
    pub detected_pitch_midi: Option<f64>,
    pub combo_after: u32,
}
pub struct Feedback {
    pub note_id: String,
    pub detail: &'static str,
}
pub struct MatchResult {
    pub final_outcome: Option<FinalOutcome>,
    pub feedback: Option<Feedback>,
}
struct Pending {
    target: Target,
    finalized: bool,
    unverified: bool,
    wrong_note: bool,
    unsupported: bool,
}
pub struct Matcher {
    epoch: u64,
    settings: Settings,
    targets: Vec<Pending>,
    seen_sequences: HashSet<u64>,
    pub score: u64,
    pub combo: u32,
    pub cool: u32,
    pub good: u32,
    pub miss: u32,
    pub excluded: u32,
}
impl Matcher {
    pub fn skip_incomplete_windows(&mut self, started_song_ms: f64) -> Vec<FinalOutcome> {
        let mut outcomes = Vec::new();
        for index in 0..self.targets.len() {
            let beginning = self.targets[index].target.song_time_ms
                + (self.settings.calibration_real_ms - self.settings.good_ms) * self.settings.rate;
            if beginning < started_song_ms && !self.targets[index].finalized {
                outcomes.push(self.finalize(
                    index,
                    Outcome::NotScored {
                        reason: "SKIPPED",
                        score_awarded: 0,
                    },
                    None,
                    None,
                ));
            }
        }
        outcomes
    }
    pub fn new(epoch: u64, settings: Settings, targets: Vec<Target>) -> Result<Self, AppError> {
        settings.validate()?;
        let mut ids = HashSet::new();
        let mut previous = -1.0;
        if targets.len() > 100_000 {
            return Err(AppError::invalid());
        }
        for target in &targets {
            if target.id.is_empty()
                || target.id.len() > 128
                || !ids.insert(&target.id)
                || !target.song_time_ms.is_finite()
                || target.song_time_ms < 0.0
                || target.song_time_ms < previous
                || target.pitch_midi > 127
            {
                return Err(AppError::invalid());
            }
            previous = target.song_time_ms;
        }
        let pending = targets
            .iter()
            .enumerate()
            .map(|(i, target)| Pending {
                target: target.clone(),
                finalized: false,
                unverified: false,
                wrong_note: false,
                unsupported: target.unsupported
                    || i > 0 && (target.song_time_ms - targets[i - 1].song_time_ms).abs() < 2.0
                    || i + 1 < targets.len()
                        && (target.song_time_ms - targets[i + 1].song_time_ms).abs() < 2.0,
            })
            .collect();
        Ok(Self {
            epoch,
            settings,
            targets: pending,
            seen_sequences: HashSet::new(),
            score: 0,
            combo: 0,
            cool: 0,
            good: 0,
            miss: 0,
            excluded: 0,
        })
    }
    fn finalize(
        &mut self,
        index: usize,
        outcome: Outcome,
        delta_real_ms: Option<f64>,
        detected_pitch_midi: Option<f64>,
    ) -> FinalOutcome {
        let pending = &mut self.targets[index];
        pending.finalized = true;
        match &outcome {
            Outcome::Judged {
                judgement,
                score_awarded,
                ..
            } => {
                self.score += u64::from(*score_awarded);
                match *judgement {
                    "COOL" => {
                        self.cool += 1;
                        self.combo += 1;
                    }
                    "GOOD" => {
                        self.good += 1;
                        self.combo += 1;
                    }
                    _ => {
                        self.miss += 1;
                        self.combo = 0;
                    }
                }
            }
            Outcome::NotScored { .. } => {
                self.excluded += 1;
            }
        }
        FinalOutcome {
            note_id: pending.target.id.clone(),
            playback_epoch: self.epoch,
            outcome,
            delta_real_ms,
            detected_pitch_midi,
            combo_after: self.combo,
        }
    }
    pub fn observe(&mut self, observation: Observation) -> Result<MatchResult, AppError> {
        let empty = || MatchResult {
            final_outcome: None,
            feedback: None,
        };
        if !observation.played_song_time_ms.is_finite()
            || observation
                .pitch_midi
                .is_some_and(|pitch| !pitch.is_finite() || !(0.0..=127.0).contains(&pitch))
            || !observation.confidence.is_finite()
            || !(0.0..=1.0).contains(&observation.confidence)
            || observation.sequence == 0
        {
            return Err(AppError::invalid());
        }
        if observation.playback_epoch != self.epoch || !observation.onset {
            return Ok(empty());
        }
        if self.seen_sequences.len() >= 200_000 {
            return Err(AppError::new(
                "INPUT_LIMIT_REACHED",
                "연습 입력이 상한에 도달했습니다. 새 시도를 시작하세요.",
                false,
            ));
        }
        if !self.seen_sequences.insert(observation.sequence) {
            return Ok(empty());
        }
        let corrected = observation.played_song_time_ms
            - self.settings.calibration_real_ms * self.settings.rate;
        let mut candidates: Vec<(usize, f64)> = self
            .targets
            .iter()
            .enumerate()
            .filter(|(_, target)| !target.finalized)
            .map(|(index, target)| {
                (
                    index,
                    (corrected - target.target.song_time_ms) / self.settings.rate,
                )
            })
            .filter(|(_, delta)| delta.abs() <= self.settings.good_ms)
            .collect();
        let nearest_supported = candidates
            .iter()
            .filter(|(index, _)| !self.targets[*index].unsupported)
            .map(|(_, delta)| delta.abs())
            .fold(f64::INFINITY, f64::min);
        if candidates.iter().any(|(index, delta)| {
            self.targets[*index].unsupported && delta.abs() <= nearest_supported
        }) {
            return Ok(empty());
        }
        candidates.retain(|(index, _)| !self.targets[*index].unsupported);
        if observation.confidence < 0.85 || observation.pitch_midi.is_none() {
            for (index, _) in candidates {
                self.targets[index].unverified = true;
            }
            return Ok(empty());
        }
        let detected_pitch = observation.pitch_midi.ok_or_else(AppError::invalid)?;
        let correct = candidates
            .iter()
            .filter(|(i, _)| {
                (detected_pitch - f64::from(self.targets[*i].target.pitch_midi)).abs() * 100.0
                    <= self.settings.pitch_tolerance_cents
            })
            .min_by(|a, b| a.1.abs().total_cmp(&b.1.abs()).then(a.0.cmp(&b.0)));
        if let Some(&(index, delta)) = correct {
            let cool = delta.abs() <= self.settings.cool_ms;
            let detail = if delta.abs() < 0.5 {
                "ON_TIME"
            } else if delta < 0.0 {
                "EARLY"
            } else {
                "LATE"
            };
            return Ok(MatchResult {
                final_outcome: Some(self.finalize(
                    index,
                    Outcome::Judged {
                        judgement: if cool { "COOL" } else { "GOOD" },
                        detail,
                        score_awarded: if cool { 1000 } else { 500 },
                    },
                    Some(delta),
                    Some(detected_pitch),
                )),
                feedback: None,
            });
        }
        let wrong = candidates
            .into_iter()
            .min_by(|a, b| a.1.abs().total_cmp(&b.1.abs()).then(a.0.cmp(&b.0)));
        if let Some((index, _)) = wrong {
            self.targets[index].wrong_note = true;
            return Ok(MatchResult {
                final_outcome: None,
                feedback: Some(Feedback {
                    note_id: self.targets[index].target.id.clone(),
                    detail: "WRONG_NOTE",
                }),
            });
        }
        Ok(empty())
    }
    pub fn advance(
        &mut self,
        song_time_ms: f64,
        healthy: bool,
    ) -> Result<Vec<FinalOutcome>, AppError> {
        if !song_time_ms.is_finite() {
            return Err(AppError::invalid());
        }
        let mut outcomes = Vec::new();
        for index in 0..self.targets.len() {
            let pending = &self.targets[index];
            if pending.finalized {
                continue;
            }
            if healthy
                && (song_time_ms - pending.target.song_time_ms) / self.settings.rate
                    <= self.settings.good_ms + self.settings.calibration_real_ms
            {
                continue;
            }
            let outcome = if !healthy {
                Outcome::NotScored {
                    reason: "SKIPPED",
                    score_awarded: 0,
                }
            } else if pending.unsupported {
                Outcome::NotScored {
                    reason: "UNSUPPORTED",
                    score_awarded: 0,
                }
            } else if pending.unverified {
                Outcome::NotScored {
                    reason: "UNVERIFIED",
                    score_awarded: 0,
                }
            } else {
                Outcome::Judged {
                    judgement: "MISS",
                    detail: if pending.wrong_note {
                        "WRONG_NOTE"
                    } else {
                        "LATE"
                    },
                    score_awarded: 0,
                }
            };
            outcomes.push(self.finalize(index, outcome, None, None));
        }
        Ok(outcomes)
    }
    pub fn accuracy(&self) -> Option<f64> {
        let total = self.cool + self.good + self.miss;
        (total > 0)
            .then(|| 100.0 * (f64::from(self.cool) + f64::from(self.good) * 0.5) / f64::from(total))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn matcher(rate: f64, bias: f64) -> Matcher {
        Matcher::new(
            1,
            Settings::normal(rate, bias),
            vec![Target {
                unsupported: false,
                id: "note".into(),
                song_time_ms: 2000.0,
                pitch_midi: 67,
            }],
        )
        .expect("초기화")
    }
    fn input(sequence: u64, epoch: u64, time: f64, pitch: f64) -> Observation {
        Observation {
            sequence,
            playback_epoch: epoch,
            played_song_time_ms: time,
            pitch_midi: Some(pitch),
            confidence: 0.99,
            onset: true,
        }
    }
    fn judgement(outcome: &FinalOutcome) -> &str {
        match &outcome.outcome {
            Outcome::Judged { judgement, .. } => judgement,
            _ => "NOT_SCORED",
        }
    }
    #[test]
    fn missing_pitch_onset_excludes_target_without_invented_note() {
        let mut matcher = matcher(1.0, 0.0);
        let mut unknown = input(1, 1, 2000.0, 67.0);
        unknown.pitch_midi = None;
        unknown.confidence = 0.0;
        assert!(matcher
            .observe(unknown)
            .expect("피치 미확정 입력")
            .final_outcome
            .is_none());
        let outcomes = matcher.advance(2200.0, true).expect("윈도 마감");
        assert!(matches!(
            outcomes[0].outcome,
            Outcome::NotScored {
                reason: "UNVERIFIED",
                ..
            }
        ));
        assert_eq!(matcher.miss, 0);
        assert_eq!(matcher.accuracy(), None);
    }
    #[test]
    fn early_cool_and_late_good_match_fixture() {
        let early = matcher(1.0, 0.0)
            .observe(input(1, 1, 1975.0, 67.0))
            .expect("판정")
            .final_outcome
            .expect("확정");
        assert_eq!(judgement(&early), "COOL");
        assert_eq!(early.delta_real_ms, Some(-25.0));
        let late = matcher(1.0, 0.0)
            .observe(input(1, 1, 2090.0, 67.0))
            .expect("판정")
            .final_outcome
            .expect("확정");
        assert_eq!(judgement(&late), "GOOD");
        assert_eq!(late.delta_real_ms, Some(90.0));
    }
    #[test]
    fn wrong_note_can_retry_without_breaking_combo() {
        let mut engine = matcher(1.0, 0.0);
        assert_eq!(
            engine
                .observe(input(1, 1, 2000.0, 65.0))
                .expect("오음")
                .feedback
                .expect("피드백")
                .detail,
            "WRONG_NOTE"
        );
        assert_eq!(engine.combo, 0);
        let result = engine
            .observe(input(2, 1, 2080.0, 67.0))
            .expect("재시도")
            .final_outcome
            .expect("확정");
        assert_eq!(judgement(&result), "GOOD");
        assert_eq!(engine.score, 500);
        assert_eq!(engine.combo, 1);
    }
    #[test]
    fn no_input_has_exactly_one_miss() {
        let mut engine = matcher(1.0, 0.0);
        assert!(engine.advance(2120.0, true).expect("경계").is_empty());
        assert_eq!(engine.advance(2120.1, true).expect("확정").len(), 1);
        assert!(engine.advance(9000.0, true).expect("중복 방지").is_empty());
        assert_eq!(engine.miss, 1);
    }
    #[test]
    fn low_confidence_is_excluded_from_accuracy() {
        let mut engine = matcher(1.0, 0.0);
        let mut low = input(1, 1, 2000.0, 67.0);
        low.confidence = 0.2;
        engine.observe(low).expect("저신뢰");
        assert_eq!(
            engine.advance(2300.0, true).expect("확정")[0].outcome,
            Outcome::NotScored {
                reason: "UNVERIFIED",
                score_awarded: 0
            }
        );
        assert_eq!(engine.accuracy(), None);
        assert_eq!(engine.miss, 0);
    }
    #[test]
    fn seek_epoch_and_sustained_pitch_are_ignored() {
        let mut engine = matcher(1.0, 0.0);
        assert!(engine
            .observe(input(1, 0, 2000.0, 67.0))
            .expect("이전 epoch")
            .final_outcome
            .is_none());
        let mut sustained = input(2, 1, 2000.0, 67.0);
        sustained.onset = false;
        assert!(engine
            .observe(sustained)
            .expect("지속음")
            .final_outcome
            .is_none());
        assert_eq!(engine.score, 0);
    }
    #[test]
    fn disconnected_targets_are_skipped_not_missed() {
        let mut engine = matcher(1.0, 0.0);
        assert_eq!(
            engine.advance(2000.0, false).expect("끊김")[0].outcome,
            Outcome::NotScored {
                reason: "SKIPPED",
                score_awarded: 0
            }
        );
        assert_eq!(engine.miss, 0);
    }
    #[test]
    fn speed_and_calibration_preserve_real_timing() {
        for rate in [0.5, 0.75, 1.0, 1.5] {
            let mut engine = matcher(rate, 30.0);
            let outcome = engine
                .observe(input(1, 1, 2000.0 + 110.0 * rate, 67.0))
                .expect("보정")
                .final_outcome
                .expect("확정");
            assert_eq!(judgement(&outcome), "GOOD");
            assert!((outcome.delta_real_ms.expect("시간") - 80.0).abs() < 1e-6);
        }
    }
    #[test]
    fn double_onset_has_one_final_and_loop_creates_new_attempt() {
        let mut engine = matcher(1.0, 0.0);
        engine.observe(input(1, 1, 2000.0, 67.0)).expect("입력");
        assert!(engine
            .observe(input(1, 1, 2000.0, 67.0))
            .expect("중복 sequence")
            .final_outcome
            .is_none());
        assert!(engine
            .observe(input(2, 1, 2010.0, 67.0))
            .expect("중복 onset")
            .final_outcome
            .is_none());
        assert_eq!(engine.score, 1000);
        let mut loop_attempt = matcher(1.0, 0.0);
        loop_attempt.epoch = 2;
        loop_attempt
            .observe(input(1, 2, 2000.0, 67.0))
            .expect("새 loop");
        assert_eq!(loop_attempt.score, 1000);
    }
    #[test]
    fn simultaneous_notes_are_unsupported() {
        let mut engine = Matcher::new(
            1,
            Settings::normal(1.0, 0.0),
            vec![
                Target {
                    unsupported: false,
                    id: "a".into(),
                    song_time_ms: 2000.0,
                    pitch_midi: 64,
                },
                Target {
                    unsupported: false,
                    id: "b".into(),
                    song_time_ms: 2000.0,
                    pitch_midi: 67,
                },
            ],
        )
        .expect("코드");
        assert!(engine
            .observe(input(1, 1, 2000.0, 64.0))
            .expect("입력")
            .final_outcome
            .is_none());
        let outcomes = engine.advance(2300.0, true).expect("종료");
        assert!(outcomes.iter().all(|o| matches!(
            o.outcome,
            Outcome::NotScored {
                reason: "UNSUPPORTED",
                ..
            }
        )));
        assert_eq!(engine.accuracy(), None);
    }
    #[test]
    fn unsupported_techniques_never_match_or_penalize_and_keep_skip_priority() {
        for rate in [0.5, 1.0, 1.5] {
            let targets = vec![
                Target {
                    unsupported: true,
                    id: "bend".into(),
                    song_time_ms: 2000.0,
                    pitch_midi: 67,
                },
                Target {
                    unsupported: false,
                    id: "plain".into(),
                    song_time_ms: 3000.0,
                    pitch_midi: 64,
                },
            ];
            let mut engine =
                Matcher::new(1, Settings::normal(rate, 0.0), targets.clone()).expect("초기화");
            for (sequence, pitch) in [(1, 67.0), (2, 65.0)] {
                let result = engine
                    .observe(input(sequence, 1, 2000.0, pitch))
                    .expect("미지원 입력");
                assert!(result.final_outcome.is_none());
                assert!(result.feedback.is_none());
            }
            let excluded = engine.advance(2300.0, true).expect("마감");
            assert_eq!(excluded.len(), 1);
            assert_eq!(
                excluded[0].outcome,
                Outcome::NotScored {
                    reason: "UNSUPPORTED",
                    score_awarded: 0
                }
            );
            assert!(engine.advance(2300.0, true).expect("중복 방지").is_empty());
            engine
                .observe(input(3, 1, 3000.0, 64.0))
                .expect("일반 피킹");
            assert_eq!(
                (
                    engine.score,
                    engine.combo,
                    engine.cool,
                    engine.miss,
                    engine.excluded
                ),
                (1000, 1, 1, 0, 1)
            );
            assert_eq!(engine.accuracy(), Some(100.0));
            let mut interrupted =
                Matcher::new(1, Settings::normal(rate, 0.0), targets).expect("중단");
            assert!(interrupted
                .advance(2000.0, false)
                .expect("끊김")
                .iter()
                .all(|o| matches!(
                    o.outcome,
                    Outcome::NotScored {
                        reason: "SKIPPED",
                        ..
                    }
                )));
        }
    }
    #[test]
    fn unsupported_onset_does_not_leak_into_nearby_supported_note() {
        let mut engine = Matcher::new(
            1,
            Settings::normal(1.0, 0.0),
            vec![
                Target {
                    unsupported: true,
                    id: "slide".into(),
                    song_time_ms: 2000.0,
                    pitch_midi: 67,
                },
                Target {
                    unsupported: false,
                    id: "next".into(),
                    song_time_ms: 2100.0,
                    pitch_midi: 64,
                },
            ],
        )
        .expect("인접 목표");
        for (sequence, pitch) in [(1, 64.0), (2, 65.0)] {
            let result = engine
                .observe(input(sequence, 1, 2000.0, pitch))
                .expect("미지원 근접 입력");
            assert!(result.final_outcome.is_none());
            assert!(result.feedback.is_none());
        }
        let normal = engine
            .observe(input(3, 1, 2100.0, 64.0))
            .expect("정상 입력")
            .final_outcome
            .expect("확정");
        assert_eq!(judgement(&normal), "COOL");
        assert_eq!(engine.combo, 1);
        assert_eq!(engine.advance(2300.0, true).expect("마감").len(), 1);
        assert_eq!((engine.cool, engine.miss, engine.excluded), (1, 0, 1));
    }
    #[test]
    fn invalid_settings_targets_and_observations_are_rejected() {
        assert!(Matcher::new(1, Settings::normal(0.0, 0.0), vec![]).is_err());
        let duplicate = Target {
            unsupported: false,
            id: "a".into(),
            song_time_ms: 2000.0,
            pitch_midi: 64,
        };
        assert!(Matcher::new(
            1,
            Settings::normal(1.0, 0.0),
            vec![duplicate.clone(), duplicate]
        )
        .is_err());
        assert!(matcher(1.0, 0.0)
            .observe(input(1, 1, f64::NAN, 67.0))
            .is_err());
    }
}
