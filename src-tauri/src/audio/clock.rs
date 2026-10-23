use crate::ipc::AppError;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Clone, Copy, Debug)]
pub struct Anchor {
    pub stream_generation: u64,
    pub epoch: u64,
    pub monotonic_ns: u64,
    pub song_time_ms: f64,
    pub rate: f64,
    pub uncertainty_real_ms: f64,
}
#[derive(Default)]
pub struct CaptureMapping {
    anchors: VecDeque<Anchor>,
    start_ns: Option<u64>,
    pub maximum_residual_real_ms: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnchorRequest {
    pub monotonic_ns: String,
    pub song_time_ms: f64,
    pub rate: f64,
    pub uncertainty_real_ms: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClockRequest {
    pub schema_version: u8,
    pub stream_generation: u64,
    pub playback_epoch: u64,
    pub request_sequence: u64,
    pub anchor: Option<AnchorRequest>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockDiagnostic {
    pub schema_version: u8,
    pub ready: bool,
    pub anchor_count: usize,
    pub maximum_residual_real_ms: f64,
}
#[derive(Default)]
pub struct ClockSession {
    pub mapping: CaptureMapping,
    last_sequence: u64,
    epoch: u64,
}
impl ClockSession {
    pub fn last_request_sequence(&self) -> u64 {
        self.last_sequence
    }
    pub fn last_playback_epoch(&self) -> u64 {
        self.epoch
    }
    pub fn update(
        &mut self,
        request: ClockRequest,
        generation: u64,
        now_ns: u64,
    ) -> Result<ClockDiagnostic, AppError> {
        if request.schema_version != 1
            || request.stream_generation != generation
            || request.request_sequence <= self.last_sequence
            || request.playback_epoch < self.epoch
            || request.request_sequence > 9_007_199_254_740_991
            || request.playback_epoch > 9_007_199_254_740_991
        {
            return Err(AppError::invalid());
        }
        self.last_sequence = request.request_sequence;
        self.epoch = request.playback_epoch;
        if let Some(anchor) = request.anchor {
            if anchor.monotonic_ns.is_empty()
                || anchor.monotonic_ns.len() > 20
                || !anchor
                    .monotonic_ns
                    .bytes()
                    .all(|byte| byte.is_ascii_digit())
            {
                self.mapping.invalidate();
                return Err(AppError::invalid());
            }
            let ns = match anchor.monotonic_ns.parse::<u64>() {
                Ok(ns) => ns,
                Err(_) => {
                    self.mapping.invalidate();
                    return Err(AppError::invalid());
                }
            };
            if ns > now_ns || now_ns - ns > 100_000_000 {
                self.mapping.invalidate();
                return Err(AppError::new(
                    "CLOCK_UNCERTAIN",
                    "동기화 왕복 시간이 길어 다시 측정합니다.",
                    true,
                ));
            }
            let result = self.mapping.push(Anchor {
                stream_generation: generation,
                epoch: request.playback_epoch,
                monotonic_ns: ns,
                song_time_ms: anchor.song_time_ms,
                rate: anchor.rate,
                uncertainty_real_ms: anchor.uncertainty_real_ms,
            });
            if let Err(error) = result {
                self.mapping.invalidate();
                return Err(error);
            }
        } else {
            self.mapping.invalidate();
        }
        Ok(ClockDiagnostic {
            schema_version: 1,
            ready: self.mapping.ready(),
            anchor_count: self.mapping.anchors.len(),
            maximum_residual_real_ms: self.mapping.maximum_residual_real_ms,
        })
    }
}

impl CaptureMapping {
    pub fn matches(&self, generation: u64, epoch: u64, rate: f64, now_ns: u64) -> bool {
        self.anchors.back().is_some_and(|last| {
            last.rate == rate
                && self
                    .map(generation, epoch, last.monotonic_ns, now_ns)
                    .is_some()
        })
    }
    pub fn invalidate(&mut self) {
        self.anchors.clear();
        self.start_ns = None;
        self.maximum_residual_real_ms = 0.0;
    }
    pub fn ready(&self) -> bool {
        self.anchors.len() >= 3
            && self
                .anchors
                .back()
                .zip(self.start_ns)
                .is_some_and(|(last, start)| last.monotonic_ns.saturating_sub(start) >= 400_000_000)
    }
    pub fn push(&mut self, anchor: Anchor) -> Result<(), AppError> {
        if !anchor.song_time_ms.is_finite()
            || !(0.0..=86_400_000.0).contains(&anchor.song_time_ms)
            || !anchor.rate.is_finite()
            || !(0.5..=1.5).contains(&anchor.rate)
            || !anchor.uncertainty_real_ms.is_finite()
            || !(0.0..=15.0).contains(&anchor.uncertainty_real_ms)
        {
            self.invalidate();
            return Err(AppError::new(
                "CLOCK_UNCERTAIN",
                "재생과 입력 시간 동기화를 다시 확인하세요.",
                true,
            ));
        }
        if let Some(previous) = self.anchors.back() {
            if previous.stream_generation != anchor.stream_generation
                || previous.epoch != anchor.epoch
                || previous.rate != anchor.rate
            {
                self.invalidate();
            } else {
                if anchor.monotonic_ns <= previous.monotonic_ns {
                    return Err(AppError::invalid());
                }
                let elapsed_ms = (anchor.monotonic_ns - previous.monotonic_ns) as f64 / 1_000_000.0;
                let residual = ((anchor.song_time_ms - previous.song_time_ms) / anchor.rate
                    - elapsed_ms)
                    .abs();
                if elapsed_ms > 1000.0 || residual > 20.0 {
                    self.invalidate();
                    return Err(AppError::new(
                        "CLOCK_UNCERTAIN",
                        "재생과 입력 시간 동기화를 다시 확인하세요.",
                        true,
                    ));
                }
                self.maximum_residual_real_ms = self.maximum_residual_real_ms.max(residual);
            }
        }
        self.start_ns.get_or_insert(anchor.monotonic_ns);
        self.anchors.push_back(anchor);
        while self.anchors.len() > 12 {
            self.anchors.pop_front();
        }
        Ok(())
    }
    pub fn map(
        &self,
        stream_generation: u64,
        epoch: u64,
        captured_ns: u64,
        now_ns: u64,
    ) -> Option<f64> {
        if !self.ready() {
            return None;
        }
        let last = self.anchors.back()?;
        if last.stream_generation != stream_generation
            || last.epoch != epoch
            || now_ns < last.monotonic_ns
            || now_ns - last.monotonic_ns > 1_000_000_000
            || captured_ns < self.start_ns?
            || captured_ns > now_ns
            || now_ns - captured_ns > 2_000_000_000
        {
            return None;
        }
        let base = self
            .anchors
            .iter()
            .rev()
            .find(|anchor| anchor.monotonic_ns <= captured_ns)?;
        Some(base.song_time_ms + (captured_ns - base.monotonic_ns) as f64 / 1_000_000.0 * base.rate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_async_anchor_cannot_restore_clock_after_pause() {
        let mut session = ClockSession::default();
        let request = |sequence, epoch| ClockRequest {
            schema_version: 1,
            stream_generation: 1,
            playback_epoch: epoch,
            request_sequence: sequence,
            anchor: None,
        };
        session
            .update(request(2, 2), 1, 1000)
            .expect("일시정지 무효화");
        assert!(session.update(request(1, 1), 1, 1000).is_err());
        assert!(!session.mapping.ready());
        assert!(session.update(request(3, 1), 1, 1000).is_err());
        assert!(session.update(request(3, 2), 2, 1000).is_err());
    }
    #[test]
    fn resumed_bridge_uses_native_sequence_and_epoch_floor() {
        let mut session = ClockSession::default();
        let request = |sequence, epoch| ClockRequest {
            schema_version: 1,
            stream_generation: 1,
            playback_epoch: epoch,
            request_sequence: sequence,
            anchor: None,
        };
        session
            .update(request(10, 5), 1, 1000)
            .expect("이전 bridge");
        assert!(session.update(request(1, 1), 1, 1000).is_err());
        let next_sequence = session.last_request_sequence() + 1;
        let next_epoch = session.last_playback_epoch() + 1;
        session
            .update(request(next_sequence, next_epoch), 1, 1000)
            .expect("재연결 reset");
        assert_eq!(session.last_request_sequence(), 11);
        assert_eq!(session.last_playback_epoch(), 6);
    }
    #[test]
    fn malformed_latest_timestamp_clears_ready_mapping() {
        for timestamp in ["invalid", "18446744073709551616", "1400000000"] {
            let mut session = ClockSession {
                mapping: mapping(1.0),
                last_sequence: 3,
                epoch: 1,
            };
            assert!(session.mapping.ready());
            assert!(session
                .update(
                    ClockRequest {
                        schema_version: 1,
                        stream_generation: 1,
                        playback_epoch: 1,
                        request_sequence: 4,
                        anchor: Some(AnchorRequest {
                            monotonic_ns: timestamp.into(),
                            song_time_ms: 2600.0,
                            rate: 1.0,
                            uncertainty_real_ms: 1.0
                        }),
                    },
                    1,
                    1_400_000_000
                )
                .is_err());
            assert!(!session.mapping.ready());
        }
    }
    fn anchor(ms: u64, song: f64, epoch: u64, rate: f64) -> Anchor {
        Anchor {
            stream_generation: 1,
            epoch,
            monotonic_ns: ms * 1_000_000,
            song_time_ms: song,
            rate,
            uncertainty_real_ms: 3.0,
        }
    }
    fn mapping(rate: f64) -> CaptureMapping {
        let mut mapping = CaptureMapping::default();
        for ms in [1000, 1200, 1400] {
            mapping
                .push(anchor(ms, 2000.0 + (ms - 1000) as f64 * rate, 1, rate))
                .expect("anchor");
        }
        mapping
    }
    #[test]
    fn needs_multiple_anchors_before_mapping_capture() {
        let mut clock = CaptureMapping::default();
        clock.push(anchor(1000, 2000.0, 1, 1.0)).expect("anchor");
        assert!(!clock.ready());
        assert_eq!(clock.map(1, 1, 1_050_000_000, 1_400_000_000), None);
        clock = mapping(1.0);
        assert!(clock.ready());
        assert_eq!(clock.map(1, 1, 1_050_000_000, 1_400_000_000), Some(2050.0));
    }
    #[test]
    fn rate_maps_real_sample_elapsed_into_song_time() {
        for rate in [0.5, 0.75, 1.0, 1.5] {
            assert_eq!(
                mapping(rate).map(1, 1, 1_300_000_000, 1_400_000_000),
                Some(2000.0 + 300.0 * rate)
            );
        }
    }
    #[test]
    fn seek_loop_and_rate_changes_need_new_clock_warmup() {
        for (epoch, rate, song) in [(2, 1.0, 100.0), (1, 0.5, 2400.0)] {
            let mut clock = mapping(1.0);
            clock
                .push(anchor(1600, song, epoch, rate))
                .expect("new epoch");
            assert!(!clock.ready());
            assert_eq!(clock.map(1, epoch, 1_300_000_000, 1_600_000_000), None);
        }
    }
    #[test]
    fn stale_anchor_prior_epoch_and_wrong_stream_are_rejected() {
        let clock = mapping(1.0);
        for (stream, epoch, capture, now) in [
            (2, 1, 1_300_000_000, 1_400_000_000),
            (1, 0, 1_300_000_000, 1_400_000_000),
            (1, 1, 1_300_000_000, 2_500_000_000),
            (1, 1, 900_000_000, 1_400_000_000),
            (1, 1, 1_500_000_000, 1_400_000_000),
        ] {
            assert_eq!(clock.map(stream, epoch, capture, now), None);
        }
    }
    #[test]
    fn high_roundtrip_residual_and_invalid_numbers_invalidate_mapping() {
        for patch in [
            Anchor {
                uncertainty_real_ms: 16.0,
                ..anchor(1600, 2600.0, 1, 1.0)
            },
            anchor(1600, 2800.0, 1, 1.0),
            Anchor {
                song_time_ms: f64::NAN,
                ..anchor(1600, 2600.0, 1, 1.0)
            },
        ] {
            let mut clock = mapping(1.0);
            assert!(clock.push(patch).is_err());
            assert!(!clock.ready());
        }
        let mut clock = mapping(1.0);
        assert!(clock.push(anchor(1400, 2400.0, 1, 1.0)).is_err());
        clock.invalidate();
        assert!(!clock.ready());
    }
}
