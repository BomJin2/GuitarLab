//! 검출된 음정 후보만 비교하는 실험 엔진입니다. 실시간 PCM 검출·채점에는 연결하지 않습니다.

use crate::{audio::dsp::Pitch, ipc::AppError};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChordVerdict {
    Match,
    Mismatch,
    Unverified,
}

#[derive(Debug, PartialEq)]
pub struct ChordAssessment {
    pub verdict: ChordVerdict,
    pub expected_pitch_count: usize,
    pub detected_pitch_count: usize,
    pub matched_pitch_count: Option<usize>,
    pub mean_pitch_error_cents: Option<f64>,
    pub min_confidence: Option<f64>,
}

pub fn evaluate_chord(
    expected: &[u8],
    detected: &[Pitch],
    tolerance_cents: f64,
) -> Result<ChordAssessment, AppError> {
    if !(2..=6).contains(&expected.len())
        || expected.iter().any(|midi| *midi > 127)
        || detected.len() > 6
        || !tolerance_cents.is_finite()
        || !(10.0..=100.0).contains(&tolerance_cents)
        || detected.iter().any(|pitch| {
            !pitch.midi.is_finite()
                || !(0.0..=127.0).contains(&pitch.midi)
                || !pitch.confidence.is_finite()
                || !(0.0..=1.0).contains(&pitch.confidence)
        })
    {
        return Err(AppError::invalid());
    }
    let mut targets = expected.to_vec();
    targets.sort_unstable();
    targets.dedup();
    let min_confidence = detected
        .iter()
        .map(|pitch| pitch.confidence)
        .reduce(f64::min);
    let mut assessment = ChordAssessment {
        verdict: ChordVerdict::Unverified,
        expected_pitch_count: targets.len(),
        detected_pitch_count: detected.len(),
        matched_pitch_count: None,
        mean_pitch_error_cents: None,
        min_confidence,
    };
    let duplicate_candidates = detected.iter().enumerate().any(|(index, pitch)| {
        detected[index + 1..]
            .iter()
            .any(|other| (pitch.midi - other.midi).abs() <= 0.1)
    });
    if min_confidence.is_none_or(|confidence| confidence < 0.85) || duplicate_candidates {
        return Ok(assessment);
    }

    // 가장 가까운 음을 먼저 소비해 대응을 놓치지 않도록 최대6후보의 부분집합을 비교합니다.
    let state_count = 1usize << detected.len();
    let mut costs = [f64::INFINITY; 64];
    costs[0] = 0.0;
    for target in &targets {
        let mut next = costs;
        for (mask, cost) in costs[..state_count].iter().enumerate() {
            if !cost.is_finite() {
                continue;
            }
            for (index, pitch) in detected.iter().enumerate() {
                let error = (f64::from(*target) - pitch.midi).abs() * 100.0;
                if mask & (1 << index) == 0 && error <= tolerance_cents {
                    let matched = mask | (1 << index);
                    next[matched] = next[matched].min(cost + error);
                }
            }
        }
        costs = next;
    }
    let best = (0..state_count)
        .filter(|mask| costs[*mask].is_finite())
        .max_by(|a, b| {
            a.count_ones()
                .cmp(&b.count_ones())
                .then_with(|| costs[*b].total_cmp(&costs[*a]))
        })
        .ok_or_else(AppError::invalid)?;
    let matched = best.count_ones() as usize;
    assessment.verdict = if matched == targets.len() && matched == detected.len() {
        ChordVerdict::Match
    } else {
        ChordVerdict::Mismatch
    };
    assessment.matched_pitch_count = Some(matched);
    if matched > 0 {
        assessment.mean_pitch_error_cents = Some(costs[best] / matched as f64);
    }
    Ok(assessment)
}

#[cfg(test)]
mod tests;
