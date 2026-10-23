use super::TrackPoint;
use serde::Serialize;
use std::f64::consts::TAU;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Oscillation {
    pub rate_hz: f64,
    pub depth_cents: f64,
    pub cycles: f64,
    pub fit: f64,
}

// 사후 궤적의 주기성만 관측합니다. 손가락 주법이나 연주 정답을 분류하지 않습니다.
pub(super) fn measure(points: &[TrackPoint]) -> Option<Oscillation> {
    let valid: Vec<_> = points
        .iter()
        .filter_map(|point| point.pitch.map(|pitch| (point.time_ms / 1000.0, pitch)))
        .collect();
    if valid.len() < 20
        || (valid.len() as f64 / points.len() as f64) < 0.9
        || valid.iter().any(|(time, pitch)| {
            !time.is_finite()
                || !pitch.midi.is_finite()
                || !pitch.confidence.is_finite()
                || pitch.confidence < 0.95
        })
        || valid.windows(2).any(|pair| {
            !(0.0..=0.080001).contains(&(pair[1].0 - pair[0].0))
                || pair[1].0 <= pair[0].0
                || (pair[1].1.midi - pair[0].1.midi).abs() * 100.0 > 80.0
        })
    {
        return None;
    }
    let span = valid.last()?.0 - valid.first()?.0;
    let count = valid.len() as f64;
    let mean_time = valid.iter().map(|p| p.0).sum::<f64>() / count;
    let mean_pitch = valid.iter().map(|p| p.1.midi * 100.0).sum::<f64>() / count;
    let time_power = valid.iter().map(|p| (p.0 - mean_time).powi(2)).sum::<f64>();
    if time_power <= 1e-12 {
        return None;
    }
    let slope = valid
        .iter()
        .map(|p| (p.0 - mean_time) * (p.1.midi * 100.0 - mean_pitch))
        .sum::<f64>()
        / time_power;
    if slope.abs() * span > 50.0 {
        return None;
    }
    let residuals: Vec<_> = valid
        .iter()
        .map(|p| p.1.midi * 100.0 - mean_pitch - slope * (p.0 - mean_time))
        .collect();
    let power = residuals.iter().map(|v| v * v).sum::<f64>();
    if power < 1e-6 {
        return None;
    }
    let mut best: Option<Oscillation> = None;
    for tenth in 30..=90 {
        let rate_hz = f64::from(tenth) / 10.0;
        let (mut ss, mut cc, mut sc, mut ys, mut yc) = (0.0, 0.0, 0.0, 0.0, 0.0);
        for ((time, _), value) in valid.iter().zip(&residuals) {
            let (sin, cos) = (TAU * rate_hz * time).sin_cos();
            ss += sin * sin;
            cc += cos * cos;
            sc += sin * cos;
            ys += value * sin;
            yc += value * cos;
        }
        let determinant = ss * cc - sc * sc;
        if determinant <= 1e-12 {
            continue;
        }
        let a = (ys * cc - yc * sc) / determinant;
        let b = (yc * ss - ys * sc) / determinant;
        let error = valid
            .iter()
            .zip(&residuals)
            .map(|((time, _), value)| {
                let (sin, cos) = (TAU * rate_hz * time).sin_cos();
                (value - a * sin - b * cos).powi(2)
            })
            .sum::<f64>();
        let candidate = Oscillation {
            rate_hz,
            depth_cents: 2.0 * a.hypot(b),
            cycles: span * rate_hz,
            fit: (1.0 - error / power).clamp(0.0, 1.0),
        };
        if best.is_none_or(|previous| candidate.fit > previous.fit) {
            best = Some(candidate);
        }
    }
    best.filter(|value| {
        value.fit >= 0.85 && (35.0..=150.0).contains(&value.depth_cents) && value.cycles >= 3.0
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::dsp::Pitch;

    fn curve(at: impl Fn(f64) -> f64) -> Vec<TrackPoint> {
        (0..38)
            .map(|index| {
                let time = 0.03 + f64::from(index) * 0.025;
                TrackPoint {
                    time_ms: time * 1000.0,
                    pitch: Some(Pitch {
                        midi: 64.0 + at(time) / 100.0,
                        confidence: 0.99,
                    }),
                }
            })
            .collect()
    }

    #[test]
    fn shallow_periodic_motion_keeps_rate_depth_and_actual_span() {
        for rate in [4.0, 6.0, 8.0] {
            let points = curve(|t| 40.0 * (TAU * rate * t + 0.4).sin());
            let report = measure(&points).expect("명확한 합성 주기");
            assert!((report.rate_hz - rate).abs() <= 0.2, "{report:?}");
            assert!((report.depth_cents - 80.0).abs() < 8.0, "{report:?}");
            assert!((report.cycles - report.rate_hz * 0.925).abs() < 1e-6);
        }
        for phase in [0.0, 0.5, 1.2, 2.4] {
            assert!(measure(&curve(|t| 40.0 * (TAU * 6.0 * t + phase).sin())).is_some());
        }
        assert!(measure(&curve(|t| 200.0 * t + 40.0 * (TAU * 6.0 * t).sin())).is_none());
    }

    #[test]
    fn gaps_and_weak_periodicity_do_not_become_confirmed_motion() {
        let curves: [fn(f64) -> f64; 4] = [
            |_| 0.0,
            |t| t * 200.0,
            |t| if t < 0.5 { 0.0 } else { 100.0 },
            |t| 100.0 * (TAU * 6.0 * t).sin(),
        ];
        for at in curves {
            assert!(measure(&curve(at)).is_none());
        }
        let mut points = curve(|t| 40.0 * (TAU * 6.0 * t).sin());
        for point in points.iter_mut().take(5) {
            point.pitch = None;
        }
        assert!(measure(&points).is_none());
        let mut points = curve(|t| 40.0 * (TAU * 6.0 * t).sin());
        points[0].pitch = Some(Pitch {
            midi: 64.0,
            confidence: 0.94,
        });
        assert!(measure(&points).is_none());
    }
}
