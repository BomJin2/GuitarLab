use std::collections::VecDeque;

#[derive(Clone, Copy, Debug)]
pub struct Pitch {
    pub midi: f64,
    pub confidence: f64,
}

// 차분 함수의 누적 정규화로 기본음을 찾으며 단일 FFT peak에 의존하지 않습니다.
pub fn estimate_pitch(samples: &[f32], sample_rate: f64) -> Option<Pitch> {
    if samples.len() < 512 || !(2_000.0..=48_000.0).contains(&sample_rate) {
        return None;
    }
    let min_lag = (sample_rate / 1_500.0).floor().max(2.0) as usize;
    let max_lag = (sample_rate / 70.0).ceil() as usize;
    let length = samples.len().checked_sub(max_lag)?;
    let energy = samples.iter().map(|x| f64::from(*x).powi(2)).sum::<f64>() / samples.len() as f64;
    if !energy.is_finite() || energy < 1e-10 {
        return None;
    }
    let mut difference = vec![1.0; max_lag + 1];
    let mut cumulative = 0.0;
    for lag in 1..=max_lag {
        let sum = (0..length)
            .map(|i| f64::from(samples[i] - samples[i + lag]).powi(2))
            .sum::<f64>();
        cumulative += sum;
        difference[lag] = if cumulative > 0.0 {
            sum * lag as f64 / cumulative
        } else {
            1.0
        };
    }
    let mut lag = min_lag;
    while lag < max_lag {
        if difference[lag] < 0.15 {
            while lag + 1 < max_lag && difference[lag + 1] < difference[lag] {
                lag += 1;
            }
            // 강한 2차 배음의 반주기를 택했다면 실제 1주기의 잔차를 비교합니다.
            let minimum = |index: usize| {
                let left = difference[index - 1];
                let center = difference[index];
                let right = difference[index + 1];
                let curvature = left - 2.0 * center + right;
                if curvature > 1e-12 {
                    (center - (left - right).powi(2) / (8.0 * curvature)).max(0.0)
                } else {
                    center
                }
            };
            if minimum(lag) > 0.02 && 2 * lag + 2 < max_lag {
                if let Some(double) = (2 * lag - 2..=2 * lag + 2)
                    .min_by(|a, b| difference[*a].total_cmp(&difference[*b]))
                {
                    if minimum(double) < minimum(lag) * 0.15 {
                        lag = double;
                    }
                }
            }
            let left = difference[lag - 1];
            let center = difference[lag];
            let right = difference[lag + 1];
            let denominator = left - 2.0 * center + right;
            let correction = if denominator.abs() > 1e-12 {
                (0.5 * (left - right) / denominator).clamp(-1.0, 1.0)
            } else {
                0.0
            };
            let hz = sample_rate / (lag as f64 + correction);
            return Some(Pitch {
                midi: 69.0 + 12.0 * (hz / 440.0).log2(),
                confidence: (1.0 - center).clamp(0.0, 1.0),
            });
        }
        lag += 1;
    }
    None
}

#[derive(Clone, Copy)]
pub struct Sample {
    pub value: f32,
    pub index: u64,
    pub captured_ns: u64,
}

pub struct DspOutput {
    pub level_dbfs: f64,
    pub pitch: Option<Pitch>,
    pub onset: Option<(Sample, Option<Pitch>)>,
}

pub struct Detector {
    sample_rate: u32,
    decimation: usize,
    gate: f64,
    samples: VecDeque<f32>,
    bucket_sum: f32,
    bucket_size: usize,
    hop: usize,
    energy: f64,
    energy_count: usize,
    previous_rms: f64,
    armed: bool,
    last_onset: u64,
    pending: Option<Sample>,
    unverified: VecDeque<Sample>,
    previous_index: Option<u64>,
    pub discontinuities: u64,
    pub full_scale_frames: u64,
}

impl Detector {
    pub fn new(sample_rate: u32, gate_dbfs: f64) -> Self {
        Self {
            sample_rate,
            decimation: (sample_rate / 12_000).max(1) as usize,
            gate: 10.0_f64.powf(gate_dbfs / 20.0),
            samples: VecDeque::with_capacity(1024),
            bucket_sum: 0.0,
            bucket_size: 0,
            hop: 0,
            energy: 0.0,
            energy_count: 0,
            previous_rms: 0.0,
            armed: true,
            last_onset: 0,
            pending: None,
            unverified: VecDeque::with_capacity(8),
            previous_index: None,
            discontinuities: 0,
            full_scale_frames: 0,
        }
    }

    pub fn push(&mut self, sample: Sample) -> Option<DspOutput> {
        if sample.value.is_finite() && sample.value.abs() >= 1.0 {
            self.full_scale_frames = self.full_scale_frames.saturating_add(1);
        }
        if self
            .previous_index
            .is_some_and(|index| sample.index != index + 1)
        {
            self.discontinuities += 1;
            self.samples.clear();
            self.pending = None;
            self.unverified.clear();
            self.energy = 0.0;
            self.energy_count = 0;
            self.bucket_sum = 0.0;
            self.bucket_size = 0;
            self.previous_rms = 0.0;
            self.armed = true;
        }
        self.previous_index = Some(sample.index);
        self.energy += f64::from(sample.value).powi(2);
        self.energy_count += 1;
        if self.energy_count >= (self.sample_rate / 100).max(1) as usize {
            let rms = (self.energy / self.energy_count as f64).sqrt();
            let since_last = sample.index.saturating_sub(self.last_onset);
            if rms < self.gate * 0.6 {
                self.armed = true;
            }
            if rms >= self.gate
                && (self.armed || rms > self.previous_rms * 2.0)
                && (self.last_onset == 0 || since_last > u64::from(self.sample_rate) / 25)
            {
                if let Some(previous) = self.pending.take() {
                    if self.unverified.len() < 8 {
                        self.unverified.push_back(previous);
                    } else {
                        self.discontinuities += 1;
                    }
                }
                self.pending = Some(Sample {
                    index: sample.index.saturating_sub(self.energy_count as u64 - 1),
                    captured_ns: sample.captured_ns.saturating_sub(
                        (self.energy_count as u64 - 1) * 1_000_000_000
                            / u64::from(self.sample_rate),
                    ),
                    ..sample
                });
                self.last_onset = sample.index;
                self.armed = false;
            }
            self.previous_rms = rms;
            self.energy = 0.0;
            self.energy_count = 0;
        }
        self.bucket_sum += sample.value;
        self.bucket_size += 1;
        if self.bucket_size < self.decimation {
            return None;
        }
        let downsampled = self.bucket_sum / self.decimation as f32;
        self.bucket_sum = 0.0;
        self.bucket_size = 0;
        if self.samples.len() == 1024 {
            self.samples.pop_front();
        }
        self.samples.push_back(downsampled);
        self.hop += 1;
        if self.samples.len() < 1024 || self.hop < 256 {
            return None;
        }
        self.hop = 0;
        let level_dbfs = (20.0 * self.previous_rms.max(1e-6).log10()).clamp(-120.0, 0.0);
        let pitch = if self.previous_rms >= self.gate {
            estimate_pitch(
                self.samples.make_contiguous(),
                f64::from(self.sample_rate) / self.decimation as f64,
            )
        } else {
            None
        };
        let onset = if let Some(attack) = self.unverified.pop_front() {
            Some((attack, None))
        } else if let Some(attack) = self.pending {
            let age = sample.index.saturating_sub(attack.index);
            if age >= 1024 * self.decimation as u64 && pitch.is_some() {
                self.pending = None;
                Some((attack, pitch))
            } else if age >= u64::from(self.sample_rate) / 5 {
                self.pending = None;
                Some((attack, None))
            } else {
                None
            }
        } else {
            None
        };
        Some(DspOutput {
            level_dbfs,
            pitch,
            onset,
        })
    }
    pub fn judgement_watermark_ns(&self, processed_ns: u64) -> u64 {
        let mut watermark = processed_ns.saturating_sub(210_000_000);
        for attack in self.pending.iter().chain(self.unverified.iter()) {
            watermark = watermark.min(attack.captured_ns.saturating_sub(1));
        }
        watermark
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn full_scale_sine_is_counted_even_when_rms_warning_would_not_trigger() {
        let mut detector = super::Detector::new(48_000, -50.0);
        let mut expected = 0;
        let mut energy = 0.0;
        let mut latest_rms_dbfs = -120.0;
        for index in 0..48_000 {
            let value = (std::f64::consts::TAU * 1_000.0 * index as f64 / 48_000.0).sin() as f32;
            expected += u64::from(value.abs() >= 1.0);
            energy += f64::from(value).powi(2);
            if let Some(output) = detector.push(super::Sample {
                value,
                index,
                captured_ns: index * 1_000_000_000 / 48_000,
            }) {
                latest_rms_dbfs = output.level_dbfs;
            }
        }
        assert!(20.0 * (energy / 48_000.0).sqrt().log10() < -3.0);
        assert!(latest_rms_dbfs < -3.0);
        assert!(expected > 0);
        assert_eq!(detector.full_scale_frames, expected);
    }

    #[test]
    fn full_scale_count_survives_gaps_but_new_detector_starts_empty() {
        let mut detector = super::Detector::new(48_000, -50.0);
        for (index, value) in [
            0.0,
            0.9996,
            -0.9996,
            1.0,
            -1.0,
            1.2,
            -1.2,
            f32::NAN,
            f32::INFINITY,
        ]
        .into_iter()
        .enumerate()
        {
            detector.push(super::Sample {
                value,
                index: index as u64,
                captured_ns: 0,
            });
        }
        assert_eq!(detector.full_scale_frames, 4);
        detector.push(super::Sample {
            value: 1.0,
            index: 20,
            captured_ns: 0,
        });
        assert_eq!(detector.full_scale_frames, 5);
        assert_eq!(detector.discontinuities, 1);
        assert_eq!(super::Detector::new(48_000, -50.0).full_scale_frames, 0);
    }
    use super::*;

    #[test]
    fn six_open_strings_and_high_frets_have_small_pitch_error() {
        for midi in [40.0, 45.0, 50.0, 55.0, 59.0, 64.0, 67.0, 76.0] {
            let hz = 440.0 * 2.0_f64.powf((midi - 69.0) / 12.0);
            let samples: Vec<f32> = (0..1024)
                .map(|i| (0.4 * (std::f64::consts::TAU * hz * i as f64 / 12000.0).sin()) as f32)
                .collect();
            let pitch = estimate_pitch(&samples, 12000.0).expect("합성 단음 검출");
            assert!((pitch.midi - midi).abs() * 100.0 < 10.0, "MIDI {midi}");
            assert!(pitch.confidence > 0.9);
        }
    }

    #[test]
    fn silence_and_aperiodic_noise_do_not_claim_pitch() {
        assert!(estimate_pitch(&[0.0; 1024], 12000.0).is_none());
        let mut seed = 7u32;
        let noise: Vec<f32> = (0..1024)
            .map(|_| {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                (seed as f64 / u32::MAX as f64 - 0.5) as f32
            })
            .collect();
        assert!(estimate_pitch(&noise, 12000.0).is_none());
    }

    #[test]
    fn dominant_second_harmonic_does_not_replace_the_fundamental() {
        let hz = 440.0 * 2.0_f64.powf((40.0 - 69.0) / 12.0);
        let samples: Vec<f32> = (0..1024)
            .map(|i| {
                let phase = std::f64::consts::TAU * hz * i as f64 / 12000.0;
                (0.1 * phase.sin() + 0.4 * (2.0 * phase).sin()) as f32
            })
            .collect();
        let pitch = estimate_pitch(&samples, 12000.0).expect("배음이 있는 단음");
        assert!(
            (pitch.midi - 40.0).abs() * 100.0 < 10.0,
            "검출 MIDI {}",
            pitch.midi
        );
    }

    #[test]
    fn full_guitar_range_sine_does_not_get_false_octave_correction() {
        for sample_rate in [12000.0, 14700.0] {
            for midi in 40..=88 {
                let hz = 440.0 * 2.0_f64.powf((f64::from(midi) - 69.0) / 12.0);
                let samples: Vec<f32> = (0..1024)
                    .map(|i| {
                        (0.3 * (std::f64::consts::TAU * hz * i as f64 / sample_rate).sin()) as f32
                    })
                    .collect();
                let pitch = estimate_pitch(&samples, sample_rate).expect("전 음역 합성 단음");
                assert!(
                    (pitch.midi - f64::from(midi)).abs() * 100.0 < 15.0,
                    "MIDI {midi} @ {sample_rate}: {}",
                    pitch.midi
                );
            }
        }
    }

    #[test]
    fn cable_tones_pass_confidence_without_accepting_short_reference_clicks() {
        for scale in [0.1, 0.3, 1.0] {
            for cable in [false, true] {
                let mut detector = Detector::new(48000, -50.0);
                let mut onsets = 0;
                let mut qualified = 0;
                for index in 0..14 * 48000u64 {
                    let since = index as i64 - 48000;
                    let beat = since.div_euclid(36000);
                    let within = since.rem_euclid(36000) as f64 / 48000.0;
                    let duration = if cable { 0.2 } else { 0.04 };
                    let value = if (0..16).contains(&beat) && within < duration {
                        let frequency = if beat % 4 == 0 { 1200.0 } else { 800.0 };
                        let gain = if !cable {
                            0.15 * (f64::ln(0.001 / 0.15) * within.min(0.035) / 0.035).exp()
                        } else if within < 0.002 {
                            0.001 * (f64::ln(150.0) * within / 0.002).exp()
                        } else if within < 0.18 {
                            0.15
                        } else {
                            0.15 * (f64::ln(0.001 / 0.15) * (within - 0.18) / 0.02).exp()
                        };
                        (scale * gain * (std::f64::consts::TAU * frequency * within).sin()) as f32
                    } else {
                        0.0
                    };
                    if let Some(output) = detector.push(Sample {
                        index,
                        captured_ns: index * 1_000_000_000 / 48000,
                        value,
                    }) {
                        if let Some((_, pitch)) = output.onset {
                            onsets += 1;
                            qualified +=
                                usize::from(pitch.is_some_and(|pitch| pitch.confidence >= 0.85));
                        }
                    }
                }
                assert_eq!(onsets, 16);
                assert_eq!(qualified, if cable { 16 } else { 0 });
                assert_eq!(detector.discontinuities, 0);
                assert_eq!(detector.full_scale_frames, 0);
            }
        }
    }
    #[test]
    fn sustained_tone_has_one_onset_and_gap_invalidates_window() {
        let mut detector = Detector::new(48000, -50.0);
        let mut onsets = Vec::new();
        for index in 0..24000u64 {
            let value = if index < 4800 {
                0.0
            } else {
                (0.3 * (std::f64::consts::TAU * 330.0 * index as f64 / 48000.0).sin()) as f32
            };
            if let Some(output) = detector.push(Sample {
                value,
                index,
                captured_ns: index * 1_000_000_000 / 48000,
            }) {
                if let Some(onset) = output.onset {
                    onsets.push(onset);
                }
            }
        }
        assert_eq!(onsets.len(), 1);
        assert!((onsets[0].0.index as i64 - 4800).abs() <= 240);
        assert!((onsets[0].1.expect("검출된 단음").midi - 64.0).abs() < 0.1);
        assert!(detector
            .push(Sample {
                value: 0.0,
                index: 25000,
                captured_ns: 1_000_000_000
            })
            .is_none());
        assert_eq!(detector.discontinuities, 1);
    }

    #[test]
    fn nonperiodic_attack_emits_unverified_instead_of_disappearing() {
        let mut detector = Detector::new(48000, -50.0);
        let mut random = 12345u32;
        let mut onsets = Vec::new();
        for index in 0..24000u64 {
            random = random.wrapping_mul(1664525).wrapping_add(1013904223);
            let value = if index < 4800 {
                0.0
            } else {
                (f64::from(random) / f64::from(u32::MAX) - 0.5) as f32 * 0.6
            };
            if let Some(output) = detector.push(Sample {
                value,
                index,
                captured_ns: index * 1_000_000_000 / 48000,
            }) {
                if let Some(onset) = output.onset {
                    onsets.push(onset);
                }
            }
        }
        assert_eq!(onsets.len(), 1);
        assert!(onsets[0].1.is_none());
        assert!(detector.judgement_watermark_ns(500_000_000) >= onsets[0].0.captured_ns);
    }
    #[test]
    fn delayed_unknown_attack_is_not_missed_before_dsp_finishes_at_any_rate() {
        use crate::judgement::{Matcher, Observation, Settings, Target};
        for rate in [0.5, 0.75, 1.0, 1.5] {
            let mut detector = Detector::new(48000, -50.0);
            let mut matcher = Matcher::new(
                1,
                Settings::normal(rate, 0.0),
                vec![Target {
                    unsupported: false,
                    id: "unknown-attack".into(),
                    song_time_ms: 100.0 * rate,
                    pitch_midi: 64,
                }],
            )
            .expect("미확정 입력 대상");
            let mut random = 12345u32;
            let mut sequence = 0;
            for index in 0..24000u64 {
                random = random.wrapping_mul(1664525).wrapping_add(1013904223);
                let sample = Sample {
                    index,
                    captured_ns: index * 1_000_000_000 / 48000,
                    value: if index < 4800 {
                        0.0
                    } else {
                        (f64::from(random) / f64::from(u32::MAX) - 0.5) as f32 * 0.6
                    },
                };
                if let Some(output) = detector.push(sample) {
                    if let Some((attack, pitch)) = output.onset {
                        sequence += 1;
                        matcher
                            .observe(Observation {
                                sequence,
                                playback_epoch: 1,
                                played_song_time_ms: attack.captured_ns as f64 / 1_000_000.0 * rate,
                                pitch_midi: pitch.map(|pitch| pitch.midi),
                                confidence: pitch.map_or(0.0, |pitch| pitch.confidence),
                                onset: true,
                            })
                            .expect("실제 DSP fixture 출력");
                    }
                    matcher
                        .advance(
                            detector.judgement_watermark_ns(sample.captured_ns) as f64
                                / 1_000_000.0
                                * rate,
                            true,
                        )
                        .expect("분석 마감 시각으로 판정");
                }
            }
            assert_eq!(sequence, 1);
            assert_eq!(matcher.miss, 0);
            assert_eq!(matcher.excluded, 1);
            assert_eq!(matcher.accuracy(), None);
        }
    }
    #[test]
    fn quick_second_attack_does_not_discard_unresolved_first() {
        let mut detector = Detector::new(48000, -50.0);
        let mut onsets = Vec::new();
        for index in 0..24000u64 {
            let sounding = (4800..5760).contains(&index) || (7680..8640).contains(&index);
            let value = if sounding {
                (0.3 * (std::f64::consts::TAU * 330.0 * index as f64 / 48000.0).sin()) as f32
            } else {
                0.0
            };
            if let Some(output) = detector.push(Sample {
                value,
                index,
                captured_ns: index * 1_000_000_000 / 48000,
            }) {
                if let Some(onset) = output.onset {
                    onsets.push(onset);
                }
            }
        }
        assert_eq!(onsets.len(), 2);
        assert_eq!(onsets[0].0.index, 4800);
        assert_eq!(onsets[1].0.index, 7680);
        assert!(onsets[0].1.is_none());
    }
    #[test]
    fn pending_onset_holds_watermark_until_resolved() {
        let mut detector = Detector::new(48000, -50.0);
        let first = Sample {
            value: 0.2,
            index: 4800,
            captured_ns: 100_000_000,
        };
        detector.pending = Some(first);
        detector.unverified.push_back(Sample {
            captured_ns: 90_000_000,
            ..first
        });
        assert_eq!(detector.judgement_watermark_ns(400_000_000), 89_999_999);
        detector.unverified.clear();
        assert_eq!(detector.judgement_watermark_ns(400_000_000), 99_999_999);
        detector.pending = None;
        assert_eq!(detector.judgement_watermark_ns(400_000_000), 190_000_000);
        assert_eq!(detector.judgement_watermark_ns(0), 0);
    }
    #[test]
    fn open_e2_sustained_tone_is_not_retriggered_by_rms_periods() {
        let mut detector = Detector::new(44100, -50.0);
        let hz = 440.0 * 2.0_f64.powf((40.0 - 69.0) / 12.0);
        let mut onsets = 0;
        for index in 0..44100u64 {
            let value = if index < 4410 {
                0.0
            } else {
                (0.3 * (std::f64::consts::TAU * hz * index as f64 / 44100.0).sin()) as f32
            };
            if detector
                .push(Sample {
                    value,
                    index,
                    captured_ns: index * 1_000_000_000 / 44100,
                })
                .is_some_and(|output| output.onset.is_some())
            {
                onsets += 1;
            }
        }
        assert_eq!(onsets, 1);
    }
}
