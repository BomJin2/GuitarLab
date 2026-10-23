use super::*;
use std::time::Instant;

fn signal(notes: &[f64], rate: u32, harmonics: usize) -> Vec<f32> {
    let mut samples: Vec<f32> = (0..rate * 2 / 5)
        .map(|index| {
            notes
                .iter()
                .enumerate()
                .map(|(note_index, midi)| {
                    let hz = 440.0 * 2.0_f64.powf((midi - 69.0) / 12.0);
                    (1..=harmonics)
                        .map(|h| {
                            (TAU * hz * h as f64 * f64::from(index) / f64::from(rate)
                                + note_index as f64 * 0.71)
                                .sin()
                                / h as f64
                        })
                        .sum::<f64>()
                })
                .sum::<f64>() as f32
        })
        .collect();
    let peak = samples.iter().map(|x| x.abs()).fold(0.0_f32, f32::max);
    for sample in &mut samples {
        *sample *= 0.7 / peak;
    }
    samples
}

#[test]
fn pure_and_harmonic_single_notes_do_not_become_chords() {
    for midi in [40.0, 45.0, 52.0, 59.0, 64.0, 76.0] {
        for harmonics in [1, 6] {
            let result = analyze_window(
                &signal(&[midi], 48000, harmonics),
                48000,
                &AtomicBool::new(false),
            )
            .expect("자체 단음 파형");
            assert_eq!(result.state, "CANDIDATES", "{midi}: {result:?}");
            assert_eq!(result.pitches.len(), 1, "{midi}: {result:?}");
            assert!((result.pitches[0].midi - midi).abs() * 100.0 < 10.0);
        }
    }
}

#[test]
fn three_nonoverlapping_fundamentals_survive_harmonic_grouping() {
    for rate in [8000, 44100, 48000, 96000, 192000] {
        let expected = [60.03, 64.03, 67.03];
        let result = analyze_window(&signal(&expected, rate, 4), rate, &AtomicBool::new(false))
            .expect("합성 3음");
        assert_eq!(result.pitches.len(), expected.len(), "{rate}: {result:?}");
        for (pitch, expected) in result.pitches.iter().zip(expected) {
            assert!(
                (pitch.midi - expected).abs() * 100.0 < 10.0,
                "{rate}: {result:?}"
            );
            assert!((0.0..=1.0).contains(&pitch.salience));
        }
        assert!(result.warnings.contains(&"OCTAVE_VOICES_AMBIGUOUS"));
    }
}

#[test]
fn silence_dc_clipping_noise_and_overcomplex_spectra_are_not_successful_chords() {
    for samples in [vec![0.0; 19200], vec![0.2; 19200]] {
        let result = analyze_window(&samples, 48000, &AtomicBool::new(false)).expect("무음/DC");
        assert_eq!(result.state, "SILENT");
        assert!(result.pitches.is_empty());
    }
    let clipped: Vec<_> = (0..19200)
        .map(|i| if i % 2 == 0 { 1.0 } else { -1.0 })
        .collect();
    let result = analyze_window(&clipped, 48000, &AtomicBool::new(false)).expect("클리핑");
    assert_eq!(result.state, "UNVERIFIED");
    assert!(result.warnings.contains(&"CLIPPED"));
    let mut seed = 17u32;
    let noise: Vec<_> = (0..19200)
        .map(|_| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            (f64::from(seed) / f64::from(u32::MAX) - 0.5) as f32
        })
        .collect();
    let result = analyze_window(&noise, 48000, &AtomicBool::new(false)).expect("고정 잡음");
    assert_eq!(result.state, "UNVERIFIED");
    assert!(result.pitches.is_empty());
    let complex = analyze_window(
        &signal(&[60.0, 61.0, 62.0, 63.0, 64.0, 65.0, 66.0], 48000, 1),
        48000,
        &AtomicBool::new(false),
    )
    .expect("후보 한도를 넘는 파형");
    assert_eq!(complex.state, "UNVERIFIED");
    assert!(complex.pitches.is_empty());
    assert!(complex.warnings.contains(&"TOO_MANY_PITCHES"));
}

#[test]
fn octave_voices_are_explicitly_ambiguous_and_do_not_claim_string_counts() {
    let result = analyze_window(
        &signal(&[40.0, 52.0, 64.0], 48000, 3),
        48000,
        &AtomicBool::new(false),
    )
    .expect("배음과 겹치는 성부");
    assert_eq!(result.pitches.len(), 1);
    assert!(result.warnings.contains(&"OCTAVE_VOICES_AMBIGUOUS"));
    assert!(result.warnings.contains(&"HARMONICS_SUPPRESSED"));
}

#[test]
fn malformed_pcm_and_cancellation_are_errors() {
    for rate in [0, 7999, 192001] {
        assert!(analyze_window(&[], rate, &AtomicBool::new(false)).is_err());
    }
    assert!(analyze_window(&[0.0; 10], 48000, &AtomicBool::new(false)).is_err());
    for bad in [f32::NAN, f32::INFINITY] {
        let mut pcm = vec![0.0; 19200];
        pcm[32] = bad;
        assert!(analyze_window(&pcm, 48000, &AtomicBool::new(false)).is_err());
    }
    assert!(analyze_window(&vec![0.0; 19200], 48000, &AtomicBool::new(true)).is_err());
}

#[test]
#[ignore = "명시적 성능 측정에서 실행"]
fn diagnostic_window_performance() {
    let pcm = signal(&[60.0, 64.0, 67.0], 48000, 4);
    let mut timings = Vec::new();
    for _ in 0..25 {
        let started = Instant::now();
        let result = analyze_window(&pcm, 48000, &AtomicBool::new(false)).expect("성능 측정");
        assert_eq!(result.pitches.len(), 3);
        timings.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    timings.sort_by(f64::total_cmp);
    println!(
        "400ms window / debug or release as invoked: p50={:.3}ms p95={:.3}ms max={:.3}ms",
        timings[12], timings[23], timings[24]
    );
}

#[test]
#[ignore = "초기 후보 검출기의 한계를 정량 기록할 때 실행"]
fn diagnostic_synthetic_voicing_metrics() {
    let groups = [
        (
            "close_triads",
            vec![
                vec![48.0, 52.0, 55.0],
                vec![60.0, 64.0, 67.0],
                vec![72.0, 75.0, 79.0],
            ],
        ),
        (
            "octave_and_open_voicings",
            vec![
                vec![40.0, 47.0, 52.0, 56.0, 59.0, 64.0],
                vec![45.0, 52.0, 57.0, 60.0, 64.0],
                vec![50.0, 57.0, 62.0, 66.0],
            ],
        ),
    ];
    for (label, voicings) in groups {
        let mut correct = 0;
        let mut expected_count = 0;
        let mut detected_count = 0;
        for voicing in voicings {
            for harmonics in [1, 4, 8] {
                let result = analyze_window(
                    &signal(&voicing, 48000, harmonics),
                    48000,
                    &AtomicBool::new(false),
                )
                .expect("고정 합성 평가");
                expected_count += voicing.len();
                detected_count += result.pitches.len();
                correct += result
                    .pitches
                    .iter()
                    .filter(|pitch| {
                        voicing
                            .iter()
                            .any(|target| (pitch.midi - target).abs() * 100.0 <= 25.0)
                    })
                    .count();
            }
        }
        let precision = correct as f64 / detected_count.max(1) as f64;
        let recall = correct as f64 / expected_count as f64;
        println!("{label}: TP={correct} predicted={detected_count} expected={expected_count} precision={precision:.4} recall={recall:.4} F1={:.4}",2.0*precision*recall/(precision+recall).max(1e-12));
    }
}
