use super::*;
use crate::{
    recording::wave,
    storage::{projects_tests::Fixture, recordings_tests::prepared},
};
use std::{f64::consts::TAU, fs};

fn fixture() -> (Fixture, RecordedPitchesRequest) {
    fixture_signal(|index| {
        [60.0, 64.0, 67.0]
            .iter()
            .map(|midi| {
                let hz = 440.0 * 2.0_f64.powf((midi - 69.0) / 12.0);
                0.15 * (TAU * hz * f64::from(index) / 48000.0).sin()
            })
            .sum::<f64>() as f32
    })
}
fn fixture_signal(mut value: impl FnMut(u32) -> f32) -> (Fixture, RecordedPitchesRequest) {
    let f = Fixture::new();
    let mut take = prepared(&f);
    let path = f.store.prepare_recording(&take).expect("자체 테이크");
    let mut writer = wave::create(&path, 48000).expect("자체 WAV");
    for index in 0..144000 {
        writer.push(value(index)).expect("합성 파형");
    }
    take.frames = writer.frames;
    take.peak = writer.peak;
    wave::finish(writer).expect("원본 확정");
    f.store.finalize_take(&mut take).expect("READY");
    let request = RecordedPitchesRequest {
        schema_version: 1,
        project_id: take.project_id,
        take_id: take.id,
        start_ms: 1000.0,
    };
    (f, request)
}

#[test]
fn selected_take_analysis_preserves_wave_metadata_and_score_and_checks_ownership() {
    let (f, request) = fixture();
    let take = f
        .store
        .take(&request.project_id, &request.take_id)
        .expect("자체 테이크");
    let path = f.store.recording_path(&take, false).expect("관리 경로");
    let before = fs::read(&path).expect("원본 파형");
    let metadata = serde_json::to_value(&take).expect("메타데이터");
    let revision = f
        .store
        .revision(&take.project_id, &take.score_revision_id)
        .expect("악보");
    let result = analyze_recording(&f.store, request, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("선택 분석");
    assert_eq!(result.window.pitches.len(), 3);
    assert_eq!(result.start_ms, 1000.0);
    assert_eq!(result.duration_ms, 400.0);
    assert_eq!(result.frames, 19200);
    assert_eq!(fs::read(path).expect("분석 후 파형"), before);
    assert_eq!(
        serde_json::to_value(f.store.take(&take.project_id, &take.id).expect("다시 읽기"))
            .expect("메타데이터"),
        metadata
    );
    assert_eq!(
        serde_json::to_value(
            f.store
                .revision(&take.project_id, &take.score_revision_id)
                .expect("악보")
        )
        .expect("악보 JSON"),
        serde_json::to_value(revision).expect("이전 악보")
    );
    let wrong = RecordedPitchesRequest {
        schema_version: 1,
        project_id: f.project(),
        take_id: take.id,
        start_ms: 0.0,
    };
    assert!(analyze_recording(&f.store, wrong, &AtomicBool::new(false), |_, _| Ok(())).is_err());
}

#[test]
fn invalid_range_canceled_corrupt_and_dropped_takes_are_not_analyzed() {
    let (f, mut request) = fixture();
    let project_id = request.project_id.clone();
    let take_id = request.take_id.clone();
    let valid_request = || RecordedPitchesRequest {
        schema_version: 1,
        project_id: project_id.clone(),
        take_id: take_id.clone(),
        start_ms: 0.0,
    };
    assert_eq!(
        analyze_recording(
            &f.store,
            RecordedPitchesRequest {
                schema_version: 1,
                project_id: request.project_id.clone(),
                take_id: request.take_id.clone(),
                start_ms: 1000.0
            },
            &AtomicBool::new(true),
            |_, _| Ok(())
        )
        .expect_err("기존 취소")
        .code,
        "CANCELED"
    );
    for time in [f64::NAN, -1.0, 30001.0] {
        request.start_ms = time;
        assert!(request.validate().is_err());
    }
    request.start_ms = 2900.0;
    assert_eq!(
        analyze_recording(&f.store, request, &AtomicBool::new(false), |_, _| Ok(()))
            .expect_err("불완전 구간")
            .code,
        "CHORD_WINDOW_INVALID"
    );
    let mut take = f
        .store
        .take(&project_id, &take_id)
        .expect("자체 메타데이터");
    take.dropped_frames = 1;
    f.store.save_take(&take).expect("누락 조건");
    assert_eq!(
        analyze_recording(
            &f.store,
            valid_request(),
            &AtomicBool::new(false),
            |_, _| Ok(())
        )
        .expect_err("누락 테이크")
        .code,
        "CHORD_TAKE_UNVERIFIED"
    );
    take.dropped_frames = 0;
    let original_frames = take.frames;
    take.frames = 48000 * 31;
    f.store.save_take(&take).expect("긴 테이크 조건");
    assert_eq!(
        analyze_recording(
            &f.store,
            valid_request(),
            &AtomicBool::new(false),
            |_, _| Ok(())
        )
        .expect_err("길이 한도")
        .code,
        "CHORD_TAKE_LIMIT"
    );
    take.frames = original_frames;
    f.store.save_take(&take).expect("검사 조건 복원");
    let path = f.store.recording_path(&take, false).expect("자체 경로");
    let mut corrupt = fs::read(&path).expect("자체 파일");
    corrupt[100] ^= 1;
    fs::write(&path, &corrupt).expect("변조 조건");
    assert_eq!(
        analyze_recording(
            &f.store,
            valid_request(),
            &AtomicBool::new(false),
            |_, _| Ok(())
        )
        .expect_err("SHA 손상")
        .code,
        "WAV_INVALID"
    );
    assert_eq!(fs::read(path).expect("실패 후 파일"), corrupt);
}

#[test]
fn request_contract_rejects_unknown_fields_versions_and_noncanonical_ids() {
    let request = serde_json::json!({
        "schemaVersion":1,"projectId":"00000000-0000-4000-8000-000000000001",
        "takeId":"00000000-0000-4000-8000-000000000002","startMs":0
    });
    assert!(
        serde_json::from_value::<RecordedPitchesRequest>(request.clone())
            .expect("요청")
            .validate()
            .is_ok()
    );
    for change in [
        serde_json::json!({"schemaVersion":2}),
        serde_json::json!({"projectId":"../outside"}),
        serde_json::json!({"takeId":"invalid"}),
        serde_json::json!({"startMs":-1}),
        serde_json::json!({"startMs":null}),
        serde_json::json!({"extra":true}),
    ] {
        let mut invalid = request.clone();
        invalid
            .as_object_mut()
            .expect("객체")
            .extend(change.as_object().expect("변경").clone());
        assert!(serde_json::from_value::<RecordedPitchesRequest>(invalid)
            .map(|request| request.validate().is_err())
            .unwrap_or(true));
    }
}

#[test]
fn selected_pitch_track_uses_same_ownership_hash_limits_and_preserves_originals() {
    let mut phase = 0.0;
    let (f, request) = fixture_signal(|index| {
        let time = f64::from(index % 48000) / 48000.0;
        let midi = 52.0 + 2.0 * time;
        phase += TAU * 440.0 * 2.0_f64.powf((midi - 69.0) / 12.0) / 48000.0;
        (0.5 * phase.sin()) as f32
    });
    let project = request.project_id.clone();
    let id = request.take_id.clone();
    let take = f.store.take(&project, &id).expect("자체 테이크");
    let path = f.store.recording_path(&take, false).expect("자체 경로");
    let before = fs::read(&path).expect("원본");
    let metadata = serde_json::to_value(&take).expect("메타데이터");
    let track = analyze_recording_track(&f.store, request, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("선택1초");
    assert_eq!(track.motion, "RISING");
    assert_eq!(track.schema_version, 2);
    assert!(track.oscillation.is_none());
    assert_eq!(
        (track.frames, track.duration_ms, track.start_ms),
        (48000, 1000.0, 1000.0)
    );
    assert_eq!(
        serde_json::to_value(&track)
            .expect("결과")
            .as_object()
            .expect("객체")
            .len(),
        16
    );
    assert!(track.coverage >= 0.95);
    assert!(track.delta_cents.expect("변화량") > 150.0);
    let make_request = |start_ms| RecordedPitchesRequest {
        schema_version: 1,
        project_id: project.clone(),
        take_id: id.clone(),
        start_ms,
    };
    assert_eq!(
        analyze_recording_track(
            &f.store,
            make_request(2001.0),
            &AtomicBool::new(false),
            |_, _| Ok(())
        )
        .expect_err("부족 구간")
        .code,
        "PITCH_TRACK_WINDOW_INVALID"
    );
    assert_eq!(
        analyze_recording_track(
            &f.store,
            make_request(0.0),
            &AtomicBool::new(true),
            |_, _| Ok(())
        )
        .expect_err("취소")
        .code,
        "CANCELED"
    );
    let wrong = RecordedPitchesRequest {
        project_id: f.project(),
        ..make_request(0.0)
    };
    assert!(
        analyze_recording_track(&f.store, wrong, &AtomicBool::new(false), |_, _| Ok(())).is_err()
    );
    assert_eq!(fs::read(&path).expect("보존"), before);
    assert_eq!(
        serde_json::to_value(f.store.take(&project, &id).expect("재열기")).expect("메타데이터"),
        metadata
    );
    let mut dropped = take.clone();
    dropped.dropped_frames = 1;
    f.store.save_take(&dropped).expect("누락 fixture");
    assert_eq!(
        analyze_recording_track(
            &f.store,
            make_request(0.0),
            &AtomicBool::new(false),
            |_, _| Ok(())
        )
        .expect_err("누락")
        .code,
        "CHORD_TAKE_UNVERIFIED"
    );
    f.store.save_take(&take).expect("fixture 복원");
    let mut corrupt = before;
    corrupt[100] ^= 1;
    fs::write(&path, &corrupt).expect("손상 fixture");
    assert_eq!(
        analyze_recording_track(
            &f.store,
            make_request(0.0),
            &AtomicBool::new(false),
            |_, _| Ok(())
        )
        .expect_err("SHA")
        .code,
        "WAV_INVALID"
    );
    assert_eq!(fs::read(&path).expect("손상 후 보존"), corrupt);
}

#[test]
fn selected_periodic_track_reports_v2_observation_without_technique_claim() {
    let mut phase = 0.0;
    let (f, request) = fixture_signal(|index| {
        let time = f64::from(index) / 48000.0;
        let midi = 64.0 + 0.4 * (TAU * 6.0 * time).sin();
        phase += TAU * 440.0 * 2.0_f64.powf((midi - 69.0) / 12.0) / 48000.0;
        (0.5 * phase.sin()) as f32
    });
    let track = analyze_recording_track(&f.store, request, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("소유 테이크의 주기적 관측");
    let value = serde_json::to_value(&track).expect("v2 결과");
    assert_eq!(value["schemaVersion"], 2);
    assert_eq!(value["motion"], "OSCILLATING");
    assert_eq!(value.as_object().expect("결과 객체").len(), 16);
    assert!((track.oscillation.expect("관측치").rate_hz - 6.0).abs() <= 0.3);
    assert!(track.warnings.contains(&"NOT_TECHNIQUE_CLASSIFICATION"));
}
