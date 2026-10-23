use super::*;
use std::f64::consts::TAU;

fn signal(rate: u32, midi_at: impl Fn(f64) -> f64, harmonics: bool) -> Vec<f32> {
    let mut phase = 0.0;
    (0..rate)
        .map(|i| {
            let midi = midi_at(f64::from(i) / f64::from(rate));
            phase += TAU * 440.0 * 2.0_f64.powf((midi - 69.0) / 12.0) / f64::from(rate);
            (0.4 * phase.sin()
                + if harmonics {
                    0.2 * (2.0 * phase).sin() + 0.1 * (3.0 * phase).sin()
                } else {
                    0.0
                }) as f32
        })
        .collect()
}

#[test]
fn steady_pure_and_harmonic_notes_keep_time_and_pitch_across_rates() {
    for rate in [8000, 44100, 48000, 96000, 192000] {
        for midi in [40.0, 64.0, 76.0] {
            for harmonics in [false, true] {
                let report = analyze_pitch_track(
                    &signal(rate, |_| midi, harmonics),
                    rate,
                    &AtomicBool::new(false),
                )
                .expect("유지음");
                assert_eq!(
                    report.motion,
                    PitchMotion::Steady,
                    "{rate}/{midi}: {report:?}"
                );
                assert!(report.coverage >= 0.95);
                assert!((30..=40).contains(&report.points.len()));
                assert!(report.delta_cents.expect("변화량").abs() < 5.0);
                assert!(report
                    .points
                    .windows(2)
                    .all(|points| points[1].time_ms > points[0].time_ms));
                for point in report.points {
                    assert!(point.time_ms > 0.0 && point.time_ms < 1000.0);
                    assert!((point.pitch.expect("주기성").midi - midi).abs() * 100.0 < 10.0);
                }
            }
        }
    }
}

#[test]
fn smooth_pitch_changes_report_direction_without_claiming_actual_technique() {
    for rate in [44100, 48000, 96000] {
        for (first, last, motion) in [
            (52.0, 54.0, PitchMotion::Rising),
            (64.0, 60.0, PitchMotion::Falling),
        ] {
            let expected = |time: f64| first + (last - first) * time;
            let report =
                analyze_pitch_track(&signal(rate, expected, true), rate, &AtomicBool::new(false))
                    .expect("합성 변화");
            assert_eq!(report.motion, motion, "{rate}: {report:?}");
            assert!(report.warnings.contains(&"NOT_TECHNIQUE_CLASSIFICATION"));
            let mut errors = Vec::new();
            for point in &report.points {
                if let Some(pitch) = point.pitch {
                    errors.push((pitch.midi - expected(point.time_ms / 1000.0)).abs() * 100.0);
                }
            }
            let maximum = errors.into_iter().fold(0.0, f64::max);
            println!("합성 궤적 rate={rate} first={first} last={last} coverage={:.4} maxErrorCents={maximum:.4}", report.coverage);
            assert!(maximum < 20.0, "궤적 오차 {maximum}");
        }
    }
}

#[test]
fn silence_dc_noise_clipping_vibrato_and_large_steps_are_not_supported_techniques() {
    let rate = 48000;
    let mut seed = 17u32;
    let noise = (0..rate)
        .map(|_| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            (f64::from(seed) / f64::from(u32::MAX) - 0.5) as f32
        })
        .collect::<Vec<_>>();
    for samples in [
        vec![0.0; rate as usize],
        vec![0.2; rate as usize],
        vec![1.0; rate as usize],
        noise,
        signal(rate, |t| 64.0 + (TAU * 5.0 * t).sin(), false),
        signal(rate, |t| if t < 0.5 { 52.0 } else { 64.0 }, false),
    ] {
        let report =
            analyze_pitch_track(&samples, rate, &AtomicBool::new(false)).expect("불확실 신호");
        assert_eq!(report.motion, PitchMotion::Unverified, "{report:?}");
        assert!(report.warnings.contains(&"EXPERIMENTAL"));
    }
}

#[test]
fn invalid_shapes_nonfinite_and_cancellation_never_return_a_track() {
    for rate in [0, 7999, 192001] {
        assert!(analyze_pitch_track(&[], rate, &AtomicBool::new(false)).is_err());
    }
    assert!(analyze_pitch_track(&[0.0; 512], 48000, &AtomicBool::new(false)).is_err());
    for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
        let mut samples = vec![0.0; 48000];
        samples[24000] = bad;
        assert!(analyze_pitch_track(&samples, 48000, &AtomicBool::new(false)).is_err());
    }
    assert_eq!(
        analyze_pitch_track(&[0.0; 48000], 48000, &AtomicBool::new(true))
            .expect_err("취소")
            .code,
        "CANCELED"
    );
}

#[test]
fn shallow_periodic_pcm_is_observed_without_classifying_a_technique() {
    for rate in [44100, 48000, 96000] {
        let samples = signal(rate, |time| 64.0 + 0.4 * (TAU * 6.0 * time).sin(), true);
        let report =
            analyze_pitch_track(&samples, rate, &AtomicBool::new(false)).expect("합성 흔들림");
        assert_eq!(
            report.motion,
            PitchMotion::Oscillating,
            "{rate}: {report:?}"
        );
        let observed = report.oscillation.expect("관측 지표");
        println!("합성 흔들림 rate={rate} motion={observed:?}");
        assert!((observed.rate_hz - 6.0).abs() <= 0.3);
        assert!((35.0..=90.0).contains(&observed.depth_cents));
        assert!(report.warnings.contains(&"NOT_TECHNIQUE_CLASSIFICATION"));
    }
    let mut tremolo = signal(48000, |_| 64.0, true);
    for (index, value) in tremolo.iter_mut().enumerate() {
        *value *= (0.7 + 0.2 * (TAU * 6.0 * index as f64 / 48000.0).sin()) as f32;
    }
    let report = analyze_pitch_track(&tremolo, 48000, &AtomicBool::new(false)).expect("음량 변화");
    assert_eq!(report.motion, PitchMotion::Steady);
    assert!(report.oscillation.is_none());
}

#[test]
#[ignore = "명시적으로 실행하는 오프라인 궤적 처리 시간 측정"]
fn offline_track_processing_time_is_measured_separately_from_capture_latency() {
    use std::time::Instant;
    let samples = signal(48000, |time| 52.0 + 2.0 * time, true);
    let mut times = Vec::new();
    for _ in 0..25 {
        let start = Instant::now();
        let report =
            analyze_pitch_track(&samples, 48000, &AtomicBool::new(false)).expect("합성 궤적");
        times.push(start.elapsed().as_secs_f64() * 1000.0);
        assert_eq!(report.motion, PitchMotion::Rising);
    }
    times.sort_by(f64::total_cmp);
    println!("오프라인1초/48kHz 디버그 궤적25회 처리 p50={:.3}ms p95={:.3}ms max={:.3}ms; 데이터 수집·디스크·입출력 왕복 제외", times[12], times[23], times[24]);
}
