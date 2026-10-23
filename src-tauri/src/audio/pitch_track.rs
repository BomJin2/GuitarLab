//! 단음의 음정 변화만 관측하는 오프라인 실험입니다. 주법 분류·점수에는 사용하지 않습니다.

use super::dsp::{estimate_pitch, Pitch};
use crate::{ipc::AppError, storage::projects::canceled};
use std::sync::atomic::AtomicBool;

mod oscillation;
pub use oscillation::Oscillation;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PitchMotion {
    Steady,
    Rising,
    Falling,
    Oscillating,
    Unverified,
}

#[derive(Debug)]
pub struct TrackPoint {
    pub time_ms: f64,
    pub pitch: Option<Pitch>,
}

#[derive(Debug)]
pub struct PitchTrack {
    pub motion: PitchMotion,
    pub points: Vec<TrackPoint>,
    pub coverage: f64,
    pub delta_cents: Option<f64>,
    pub min_confidence: Option<f64>,
    pub rms_dbfs: f64,
    pub oscillation: Option<Oscillation>,
    pub warnings: Vec<&'static str>,
}

fn median_three(values: impl Iterator<Item = f64>) -> f64 {
    let mut values: Vec<_> = values.take(3).collect();
    values.sort_by(f64::total_cmp);
    values[values.len() / 2]
}

pub fn analyze_pitch_track(
    samples: &[f32],
    sample_rate: u32,
    cancel: &AtomicBool,
) -> Result<PitchTrack, AppError> {
    if !(8000..=192000).contains(&sample_rate) || samples.len() != sample_rate as usize {
        return Err(AppError::invalid());
    }
    canceled(cancel)?;
    let mut mean = 0.0;
    let mut clipped = 0;
    for (index, sample) in samples.iter().enumerate() {
        if index % 1024 == 0 {
            canceled(cancel)?;
        }
        if !sample.is_finite() {
            return Err(AppError::invalid());
        }
        mean += f64::from(*sample);
        clipped += usize::from(sample.abs() >= 0.9999);
    }
    mean /= samples.len() as f64;
    let energy = samples
        .iter()
        .map(|sample| (f64::from(*sample) - mean).powi(2))
        .sum::<f64>()
        / samples.len() as f64;
    let rms_dbfs = (10.0 * energy.max(1e-12).log10()).clamp(-120.0, 120.0);
    let mut report = PitchTrack {
        motion: PitchMotion::Unverified,
        points: Vec::new(),
        coverage: 0.0,
        delta_cents: None,
        min_confidence: None,
        rms_dbfs,
        oscillation: None,
        warnings: vec![
            "EXPERIMENTAL",
            "MONOPHONIC_ONLY",
            "NOT_TECHNIQUE_CLASSIFICATION",
        ],
    };
    if clipped * 1000 >= samples.len() {
        report.warnings.push("CLIPPED");
        return Ok(report);
    }
    if rms_dbfs < -65.0 {
        report.warnings.push("LOW_LEVEL");
        return Ok(report);
    }

    // shortcut: 단음 기본음용 블록 평균이며 고역/왜곡 평가가 필요하면 필터 리샘플러로 교체합니다.
    let decimation = sample_rate.div_ceil(16000) as usize;
    let rate = f64::from(sample_rate) / decimation as f64;
    let reduced: Vec<f32> = samples
        .chunks_exact(decimation)
        .map(|block| {
            (block.iter().map(|x| f64::from(*x)).sum::<f64>() / decimation as f64 - mean) as f32
        })
        .collect();
    let hop = (rate * 0.025).floor() as usize;
    for start in (0..=reduced.len() - 1024).step_by(hop) {
        canceled(cancel)?;
        let window = &reduced[start..start + 1024];
        let energy = window.iter().map(|x| f64::from(*x).powi(2)).sum::<f64>() / 1024.0;
        let pitch = (energy >= 10.0_f64.powf(-6.5))
            .then(|| estimate_pitch(window, rate))
            .flatten()
            .filter(|pitch| pitch.confidence >= 0.90 && (39.5..=88.5).contains(&pitch.midi));
        report.points.push(TrackPoint {
            time_ms: ((start as f64 + 511.5) * decimation as f64 + (decimation - 1) as f64 / 2.0)
                * 1000.0
                / f64::from(sample_rate),
            pitch,
        });
    }
    canceled(cancel)?;
    let valid: Vec<_> = report.points.iter().filter_map(|p| p.pitch).collect();
    report.coverage = valid.len() as f64 / report.points.len() as f64;
    report.min_confidence = valid.iter().map(|p| p.confidence).reduce(f64::min);
    if report.coverage < 0.8 || valid.len() < 6 {
        report.warnings.push("LOW_COVERAGE");
        return Ok(report);
    }
    let first = median_three(valid.iter().map(|p| p.midi));
    let last = median_three(valid.iter().rev().map(|p| p.midi));
    let delta = (last - first) * 100.0;
    let minimum = valid.iter().map(|p| p.midi).fold(f64::INFINITY, f64::min);
    let maximum = valid
        .iter()
        .map(|p| p.midi)
        .fold(f64::NEG_INFINITY, f64::max);
    report.delta_cents = Some(delta);
    let steps: Vec<_> = valid
        .windows(2)
        .map(|p| (p[1].midi - p[0].midi) * 100.0)
        .collect();
    let direction_consistent = steps
        .iter()
        .filter(|step| **step * delta.signum() >= -15.0)
        .count() as f64
        / steps.len() as f64
        >= 0.85;
    report.motion = if (maximum - minimum) * 100.0 <= 35.0 {
        PitchMotion::Steady
    } else if (75.0..=1200.0).contains(&delta.abs())
        && direction_consistent
        && steps.iter().all(|step| step.abs() <= 80.0)
    {
        if delta > 0.0 {
            PitchMotion::Rising
        } else {
            PitchMotion::Falling
        }
    } else {
        report.oscillation = oscillation::measure(&report.points);
        if report.oscillation.is_some() {
            PitchMotion::Oscillating
        } else {
            report.warnings.push("NON_MONOTONIC_OR_AMBIGUOUS");
            PitchMotion::Unverified
        }
    };
    Ok(report)
}

#[cfg(test)]
mod tests;
