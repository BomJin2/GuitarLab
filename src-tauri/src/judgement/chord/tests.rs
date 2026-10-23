use super::*;

fn pitches(notes: &[f64]) -> Vec<Pitch> {
    notes
        .iter()
        .map(|midi| Pitch {
            midi: *midi,
            confidence: 0.95,
        })
        .collect()
}

#[test]
fn order_and_transposition_do_not_change_complete_chord_matches() {
    for root in 40..=100 {
        let expected = [root, root + 4, root + 7];
        let detected = pitches(&[f64::from(root + 7), f64::from(root), f64::from(root + 4)]);
        let result = evaluate_chord(&expected, &detected, 50.0).expect("자체 코드 후보");
        assert_eq!(result.verdict, ChordVerdict::Match);
        assert_eq!(result.matched_pitch_count, Some(3));
        assert_eq!(result.mean_pitch_error_cents, Some(0.0));
        assert_eq!(result.min_confidence, Some(0.95));
    }
}

#[test]
fn maximum_one_to_one_assignment_does_not_greedily_consume_the_wrong_note() {
    let result = evaluate_chord(&[60, 61], &pitches(&[60.6, 61.1]), 75.0)
        .expect("허용 범위가 겹치는 두 후보");
    assert_eq!(result.verdict, ChordVerdict::Match);
    assert_eq!(result.matched_pitch_count, Some(2));
    assert!((result.mean_pitch_error_cents.expect("대응 오차") - 35.0).abs() < 1e-8);
}

#[test]
fn equal_cardinality_assignments_use_the_smallest_error() {
    let result =
        evaluate_chord(&[60, 61], &pitches(&[61.05, 60.1]), 100.0).expect("오차 최소 대응");
    assert_eq!(result.verdict, ChordVerdict::Match);
    assert!((result.mean_pitch_error_cents.expect("평균 오차") - 7.5).abs() < 1e-8);
}

#[test]
fn missing_extra_and_octave_notes_cannot_be_a_complete_match() {
    for (detected, count) in [
        (vec![60.0, 64.0], 2),
        (vec![60.0, 64.0, 67.0, 70.0], 3),
        (vec![60.0, 64.0, 79.0], 2),
        (vec![61.0, 65.0, 68.0], 0),
    ] {
        let result = evaluate_chord(&[60, 64, 67], &pitches(&detected), 50.0)
            .expect("누락·추가·옥타브 오차");
        assert_eq!(result.verdict, ChordVerdict::Mismatch);
        assert_eq!(result.matched_pitch_count, Some(count));
        assert_eq!(result.detected_pitch_count, detected.len());
    }
}

#[test]
fn low_confidence_silence_and_duplicate_candidates_remain_unverified() {
    let mut low = pitches(&[60.0, 64.0, 67.0]);
    low[1].confidence = 0.84;
    for detected in [low, vec![], pitches(&[60.0, 60.01, 64.0, 67.0])] {
        let result = evaluate_chord(&[60, 64, 67], &detected, 50.0).expect("판정 근거 부족");
        assert_eq!(result.verdict, ChordVerdict::Unverified);
        assert_eq!(result.matched_pitch_count, None);
        assert_eq!(result.mean_pitch_error_cents, None);
    }
    let mut boundary = pitches(&[60.0, 64.0, 67.0]);
    boundary[1].confidence = 0.85;
    assert_eq!(
        evaluate_chord(&[60, 64, 67], &boundary, 50.0)
            .expect("경계 신뢰도")
            .verdict,
        ChordVerdict::Match
    );
}

#[test]
fn repeated_expected_unisons_are_pitch_sets_not_detected_string_counts() {
    let result = evaluate_chord(&[60, 60, 67], &pitches(&[60.0, 67.0]), 50.0)
        .expect("동음의 다른 줄은 구분 불가");
    assert_eq!(result.verdict, ChordVerdict::Match);
    assert_eq!(result.expected_pitch_count, 2);
    assert_eq!(result.matched_pitch_count, Some(2));
}

#[test]
fn six_note_chords_and_tolerance_boundary_are_bounded() {
    let result = evaluate_chord(
        &[40, 47, 52, 56, 59, 64],
        &pitches(&[64.5, 59.5, 56.5, 52.5, 47.5, 40.5]),
        50.0,
    )
    .expect("6음·50cents 경계");
    assert_eq!(result.verdict, ChordVerdict::Match);
    assert_eq!(result.mean_pitch_error_cents, Some(50.0));
    assert_eq!(
        evaluate_chord(&[60, 64], &pitches(&[60.51, 64.0]), 50.0)
            .expect("범위 바로 밖")
            .verdict,
        ChordVerdict::Mismatch
    );
}

#[test]
fn invalid_values_are_rejected_before_comparison() {
    for expected in [vec![], vec![60], vec![60; 7], vec![60, 128]] {
        assert!(evaluate_chord(&expected, &pitches(&[60.0, 64.0]), 50.0).is_err());
    }
    assert!(evaluate_chord(&[60, 64], &pitches(&[60.0; 7]), 50.0).is_err());
    for midi in [f64::NAN, f64::INFINITY, -1.0, 128.0] {
        assert!(evaluate_chord(&[60, 64], &pitches(&[midi, 64.0]), 50.0).is_err());
    }
    for confidence in [f64::NAN, f64::INFINITY, -0.1, 1.1] {
        let mut detected = pitches(&[60.0, 64.0]);
        detected[0].confidence = confidence;
        assert!(evaluate_chord(&[60, 64], &detected, 50.0).is_err());
    }
    for tolerance in [f64::NAN, f64::INFINITY, 9.0, 101.0] {
        assert!(evaluate_chord(&[60, 64], &pitches(&[60.0, 64.0]), tolerance).is_err());
    }
}
