use super::calibration::{estimate, CalibrationEstimate};
use crate::ipc::AppError;
use std::collections::HashSet;

pub struct MeasurementInput {
    pub stream_generation: u64,
    pub epoch: u64,
    pub sequence: u64,
    pub song_time_ms: Option<f64>,
    pub confidence: f64,
}
pub struct CalibrationSampler {
    generation: u64,
    origin_song_ms: f64,
    beat_duration_song_ms: f64,
    rate: f64,
    last_sequence: u64,
    beats: HashSet<(u64, i64)>,
    deltas_real_ms: Vec<f64>,
    canceled: bool,
}
impl CalibrationSampler {
    pub fn new(
        generation: u64,
        origin_song_ms: f64,
        beat_duration_song_ms: f64,
        rate: f64,
    ) -> Result<Self, AppError> {
        if generation == 0
            || !origin_song_ms.is_finite()
            || origin_song_ms.abs() > 86_400_000.0
            || !beat_duration_song_ms.is_finite()
            || !(300.0..=2000.0).contains(&beat_duration_song_ms)
            || !rate.is_finite()
            || !(0.5..=1.5).contains(&rate)
        {
            return Err(AppError::invalid());
        }
        Ok(Self {
            generation,
            origin_song_ms,
            beat_duration_song_ms,
            rate,
            last_sequence: 0,
            beats: HashSet::new(),
            deltas_real_ms: Vec::with_capacity(16),
            canceled: false,
        })
    }
    pub fn sample_count(&self) -> usize {
        self.deltas_real_ms.len()
    }
    pub fn cancel(&mut self) {
        self.canceled = true;
    }
    pub fn observe(&mut self, input: MeasurementInput, healthy: bool) -> Result<bool, AppError> {
        if !healthy || input.stream_generation != self.generation {
            self.cancel();
        }
        if self.canceled {
            return Err(AppError::new(
                "CANCELED",
                "입력 설정 또는 상태가 변경되어 보정 측정을 취소했습니다.",
                true,
            ));
        }
        if !input.confidence.is_finite()
            || !(0.0..=1.0).contains(&input.confidence)
            || input.sequence == 0
            || input
                .song_time_ms
                .is_some_and(|time| !time.is_finite() || time.abs() > 86_400_000.0)
        {
            return Err(AppError::invalid());
        }
        if input.sequence <= self.last_sequence || self.sample_count() >= 16 {
            return Ok(false);
        }
        self.last_sequence = input.sequence;
        let Some(song_time) = input.song_time_ms.filter(|_| input.confidence >= 0.85) else {
            return Ok(false);
        };
        let beat = ((song_time - self.origin_song_ms) / self.beat_duration_song_ms).round() as i64;
        let target = self.origin_song_ms + beat as f64 * self.beat_duration_song_ms;
        let delta = (song_time - target) / self.rate;
        if !(0..16).contains(&beat)
            || target < 0.0
            || delta.abs() > 500.0
            || !self.beats.insert((input.epoch, beat))
        {
            return Ok(false);
        }
        self.deltas_real_ms.push(delta);
        Ok(true)
    }
    pub fn finish(&self) -> Result<CalibrationEstimate, AppError> {
        if self.canceled {
            return Err(AppError::new(
                "CANCELED",
                "취소된 측정은 저장할 수 없습니다.",
                false,
            ));
        }
        if self.sample_count() < 8 {
            return Err(AppError::new(
                "CALIBRATION_REQUIRED",
                "8회 이상 단음으로 박자를 맞춰주세요.",
                true,
            ));
        }
        estimate(&self.deltas_real_ms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(sequence: u64, epoch: u64, time: Option<f64>) -> MeasurementInput {
        MeasurementInput {
            stream_generation: 1,
            epoch,
            sequence,
            song_time_ms: time,
            confidence: 0.99,
        }
    }
    #[test]
    fn samples_actual_onsets_at_multiple_rates_in_real_ms() {
        for rate in [0.5, 0.75, 1.0, 1.5] {
            let mut sampler = CalibrationSampler::new(1, 0.0, 500.0, rate).expect("측정 시작");
            for index in 0..16 {
                assert!(sampler
                    .observe(
                        input(index + 1, 1, Some(index as f64 * 500.0 + 30.0 * rate)),
                        true
                    )
                    .expect("실제 표본"));
            }
            assert_eq!(sampler.sample_count(), 16);
            assert!((sampler.finish().expect("추정").bias_real_ms - 30.0).abs() < 1e-6);
        }
    }
    #[test]
    fn duplicate_onsets_and_same_beat_do_not_create_fake_samples() {
        let mut sampler = CalibrationSampler::new(1, 0.0, 500.0, 1.0).expect("측정 시작");
        assert!(sampler
            .observe(input(1, 1, Some(30.0)), true)
            .expect("첫 표본"));
        assert!(!sampler
            .observe(input(1, 1, Some(30.0)), true)
            .expect("중복 sequence"));
        assert!(!sampler
            .observe(input(2, 1, Some(50.0)), true)
            .expect("같은 박자"));
        assert!(sampler
            .observe(input(3, 2, Some(30.0)), true)
            .expect("새 loop 박자"));
        assert_eq!(sampler.sample_count(), 2);
        assert!(sampler.finish().is_err());
    }
    #[test]
    fn uncertain_mapping_or_pitch_is_not_measurement() {
        let mut sampler = CalibrationSampler::new(1, 0.0, 500.0, 1.0).expect("측정 시작");
        assert!(!sampler
            .observe(input(1, 1, None), true)
            .expect("clock 미확정"));
        let mut low = input(2, 1, Some(30.0));
        low.confidence = 0.2;
        assert!(!sampler.observe(low, true).expect("저신뢰"));
        assert_eq!(sampler.sample_count(), 0);
    }
    #[test]
    fn device_change_disconnect_and_explicit_cancel_block_finish() {
        for generation in [1, 2] {
            let mut sampler = CalibrationSampler::new(1, 0.0, 500.0, 1.0).expect("측정 시작");
            let mut observed = input(1, 1, Some(30.0));
            observed.stream_generation = generation;
            assert!(sampler.observe(observed, generation == 2).is_err());
            assert!(sampler.finish().is_err());
        }
        let mut sampler = CalibrationSampler::new(1, 0.0, 500.0, 1.0).expect("측정 시작");
        sampler.cancel();
        assert!(sampler.finish().is_err());
    }
    #[test]
    fn invalid_grid_or_nonfinite_input_is_rejected() {
        assert!(CalibrationSampler::new(0, 0.0, 500.0, 1.0).is_err());
        assert!(CalibrationSampler::new(1, 0.0, 100.0, 1.0).is_err());
        let mut sampler = CalibrationSampler::new(1, 0.0, 500.0, 1.0).expect("측정 시작");
        assert!(sampler.observe(input(1, 1, Some(f64::NAN)), true).is_err());
    }
}
