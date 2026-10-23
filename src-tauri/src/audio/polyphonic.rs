//! 저장한 짧은 PCM의 스펙트럼 후보 진단입니다. 실시간 콜백이나 채점에서는 호출하지 않습니다.

use crate::{ipc::AppError, storage::projects::canceled};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::Serialize;
use std::{f64::consts::TAU, sync::atomic::AtomicBool};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralPitch {
    pub midi: f64,
    pub salience: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchWindow {
    pub state: &'static str,
    pub rms_dbfs: f64,
    pub pitches: Vec<SpectralPitch>,
    pub warnings: Vec<&'static str>,
}

pub fn analyze_window(
    samples: &[f32],
    sample_rate: u32,
    cancel: &AtomicBool,
) -> Result<PitchWindow, AppError> {
    canceled(cancel)?;
    if !(8000..=192000).contains(&sample_rate)
        || samples.len() != sample_rate as usize * 2 / 5
        || samples.iter().any(|value| !value.is_finite())
    {
        return Err(AppError::invalid());
    }
    let length = samples.len();
    let mean = samples.iter().map(|x| f64::from(*x)).sum::<f64>() / length as f64;
    let energy = samples
        .iter()
        .map(|x| (f64::from(*x) - mean).powi(2))
        .sum::<f64>()
        / length as f64;
    let mut result = PitchWindow {
        state: "UNVERIFIED",
        rms_dbfs: (10.0 * energy.max(1e-12).log10()).clamp(-120.0, 120.0),
        pitches: vec![],
        warnings: vec!["EXPERIMENTAL", "OCTAVE_VOICES_AMBIGUOUS"],
    };
    if samples.iter().filter(|x| x.abs() >= 0.9999).count() * 1000 >= length {
        result.warnings.push("CLIPPED");
        return Ok(result);
    }
    if result.rms_dbfs < -65.0 {
        result.state = "SILENT";
        result.warnings.push("LOW_LEVEL");
        return Ok(result);
    }
    let fft_length = length.next_power_of_two();
    let mut buffer = vec![Complex::new(0.0, 0.0); fft_length];
    for (index, value) in samples.iter().enumerate() {
        if index % 1024 == 0 {
            canceled(cancel)?;
        }
        let window = 0.5 - 0.5 * (TAU * index as f64 / (length - 1) as f64).cos();
        buffer[index].re = (f64::from(*value) - mean) * window;
    }
    let mut planner = FftPlanner::<f64>::new();
    planner.plan_fft_forward(fft_length).process(&mut buffer);
    canceled(cancel)?;
    let magnitudes: Vec<_> = buffer[..fft_length / 2].iter().map(|x| x.norm()).collect();
    let hz_per_bin = f64::from(sample_rate) / fft_length as f64;
    let first = (70.0 / hz_per_bin).ceil() as usize;
    let end = ((6000.0 / hz_per_bin) as usize).min(magnitudes.len() - 1);
    let band = &magnitudes[first..end];
    let average = band.iter().sum::<f64>() / band.len() as f64;
    let geometric = (band.iter().map(|x| x.max(1e-12).ln()).sum::<f64>() / band.len() as f64).exp();
    if geometric / average.max(1e-12) > 0.3 {
        result.warnings.push("NOISY");
        return Ok(result);
    }
    let maximum = band.iter().copied().fold(0.0_f64, f64::max);
    let threshold = (maximum * 0.06).max(average * 6.0);
    let mut fundamentals: Vec<f64> = Vec::new();
    for index in first..end {
        if index % 1024 == 0 {
            canceled(cancel)?;
        }
        let center = magnitudes[index];
        if center < threshold || center <= magnitudes[index - 1] || center <= magnitudes[index + 1]
        {
            continue;
        }
        let left = magnitudes[index - 1].max(1e-12).ln();
        let middle = center.max(1e-12).ln();
        let right = magnitudes[index + 1].max(1e-12).ln();
        let curvature = left - 2.0 * middle + right;
        let offset = if curvature.abs() > 1e-12 {
            (0.5 * (left - right) / curvature).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        let hz = (index as f64 + offset) * hz_per_bin;
        let midi = 69.0 + 12.0 * (hz / 440.0).log2();
        if !(39.5..=88.5).contains(&midi) {
            continue;
        }
        let harmonic = fundamentals.iter().any(|fundamental| {
            let ratio = hz / fundamental;
            let integer = ratio.round();
            (2.0..=32.0).contains(&integer) && (1200.0 * (ratio / integer).log2()).abs() <= 35.0
        });
        if harmonic {
            if !result.warnings.contains(&"HARMONICS_SUPPRESSED") {
                result.warnings.push("HARMONICS_SUPPRESSED");
            }
            continue;
        }
        fundamentals.push(hz);
        result.pitches.push(SpectralPitch {
            midi,
            salience: (center / maximum).clamp(0.0, 1.0),
        });
        if result.pitches.len() > 6 {
            result.pitches.clear();
            result.warnings.push("TOO_MANY_PITCHES");
            return Ok(result);
        }
    }
    if result.pitches.is_empty() {
        result.warnings.push("NO_PEAKS");
    } else {
        result.state = "CANDIDATES";
    }
    canceled(cancel)?;
    Ok(result)
}

#[cfg(test)]
mod tests;
