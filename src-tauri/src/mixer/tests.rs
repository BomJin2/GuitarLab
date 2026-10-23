use super::{export, model::*, pcm, render};
use crate::{
    recording::wave,
    storage::{
        database::connect,
        projects_tests::Fixture,
        recordings_tests::{prepared, write_part},
    },
};
use std::{
    fs,
    sync::atomic::{AtomicBool, Ordering},
};
use uuid::Uuid;

#[test]
fn imported_stem_mix_preserves_source_validates_ownership_and_applies_controls() {
    let f = Fixture::new();
    let project = f.project();
    let other = f.project();
    let path = f.store.root.join("DEMO 리드.wav");
    let mut writer = wave::create(&path, 48000).expect("자체 WAV");
    for _ in 0..480 {
        writer.push(0.8).expect("표본");
    }
    wave::finish(writer).expect("확정");
    let original = fs::read(&path).expect("원본");
    let flag = AtomicBool::new(false);
    let stem = f
        .store
        .import_guitar_stem(
            &project,
            crate::storage::project_model::GuitarPartRole::Lead,
            &path,
            &flag,
            |_, _| Ok(()),
        )
        .expect("보존");
    let mut mix = MixDocument {
        schema_version: 1,
        project_id: project.clone(),
        master_gain: 0.5,
        layers: vec![MixLayer {
            kind: LayerKind::ImportedStem,
            id: stem.id.clone(),
            gain: 0.5,
            mute: false,
            solo: false,
            offset_ms: 10.0,
        }],
    };
    let (output, stats) =
        render::render(&f.store, &mix, &flag, |_, _| Ok(())).expect("사용자 출력");
    assert_eq!(stats.frames, 960);
    let values = samples(&output);
    assert!(values[..480].iter().all(|v| *v == 0.0));
    assert!(values[480..].iter().all(|v| (*v - 0.2).abs() < 0.00001));
    f.store.save_mix(&mix).expect("설정 보존");
    let reopened = crate::storage::projects::ProjectStore::new(f.store.root.clone());
    let restored = reopened.mix(&project).expect("다시 읽기").expect("설정");
    assert!(restored.layers[0].kind == LayerKind::ImportedStem);
    assert_eq!(
        render::render(&reopened, &restored, &flag, |_, _| Ok(()))
            .expect("복원 출력")
            .0,
        output
    );
    mix.layers[0].mute = true;
    assert!(
        render::render(&f.store, &mix, &flag, |_, _| Ok(())).is_err_and(|e| e.code == "MIX_EMPTY")
    );
    mix.layers[0].mute = false;
    mix.layers[0].solo = true;
    mix.layers[0].offset_ms = -5.0;
    let rhythm = f
        .store
        .import_guitar_stem(
            &project,
            crate::storage::project_model::GuitarPartRole::Rhythm,
            &path,
            &flag,
            |_, _| Ok(()),
        )
        .expect("리듬 독립 보존");
    mix.layers.push(MixLayer {
        kind: LayerKind::ImportedStem,
        id: rhythm.id,
        gain: 1.0,
        mute: false,
        solo: false,
        offset_ms: 0.0,
    });
    let (cropped, _) =
        render::render(&f.store, &mix, &flag, |_, _| Ok(())).expect("음수 오프셋/solo");
    assert_eq!(samples(&cropped).len(), 240);
    mix.project_id = other;
    assert!(f.store.save_mix(&mix).is_err());
    mix.project_id = project.clone();
    flag.store(true, Ordering::Release);
    assert!(
        render::render(&f.store, &mix, &flag, |_, _| Ok(())).is_err_and(|e| e.code == "CANCELED")
    );
    flag.store(false, Ordering::Release);
    assert_eq!(fs::read(&path).expect("원본 유지"), original);
    assert_eq!(
        f.store
            .read_imported_guitar_stem(&project, &stem.id, &flag)
            .expect("관리본 유지")
            .1,
        original
    );
}

fn setup() -> (Fixture, MixDocument, Vec<u8>, Vec<u8>) {
    let f = Fixture::new();
    let mut a = prepared(&f);
    write_part(&f, &mut a, 4800, true);
    f.store.finalize_take(&mut a).expect("A 보존");
    let mut b = a.clone();
    b.id = Uuid::new_v4().to_string();
    b.sha256 = None;
    b.frames = 0;
    b.state = crate::recording::model::RecordingState::Arming;
    b.reference_take_ids = vec![a.id.clone()];
    write_part(&f, &mut b, 4800, true);
    f.store.finalize_take(&mut b).expect("B 독립 저장");
    let a_bytes = f
        .store
        .recording_bytes(&a.project_id, &a.id, &AtomicBool::new(false))
        .expect("A");
    let b_bytes = f
        .store
        .recording_bytes(&a.project_id, &b.id, &AtomicBool::new(false))
        .expect("B");
    let mix = MixDocument {
        schema_version: 1,
        project_id: a.project_id,
        master_gain: 1.0,
        layers: vec![
            MixLayer {
                kind: LayerKind::Take,
                id: a.id,
                gain: 1.0,
                mute: false,
                solo: false,
                offset_ms: 0.0,
            },
            MixLayer {
                kind: LayerKind::Take,
                id: b.id,
                gain: 1.0,
                mute: false,
                solo: false,
                offset_ms: 50.0,
            },
        ],
    };
    (f, mix, a_bytes, b_bytes)
}

#[test]
fn overdub_reference_allows_a_different_score_track_and_preserves_both_inputs() {
    let f = Fixture::new();
    let mut lead = prepared(&f);
    let revision = f
        .store
        .revision(&lead.project_id, &lead.score_revision_id)
        .expect("저장 리비전");
    let mut score = revision.score;
    score.tracks[0].name = "Lead".into();
    let mut rhythm = score.tracks[0].clone();
    rhythm.id = "track-rhythm".into();
    rhythm.name = "Rhythm".into();
    for (index, note) in rhythm.notes.iter_mut().enumerate() {
        note.id = format!("rhythm-note-{index}");
        note.track_id = rhythm.id.clone();
    }
    score.tracks.push(rhythm);
    let revision = f
        .store
        .save_revision(
            &lead.project_id,
            revision.revision,
            &revision.score_asset_id,
            score,
            revision.workspace,
            &AtomicBool::new(false),
        )
        .expect("두 트랙 저장");
    lead.score_revision_id = revision.revision_id.clone();
    write_part(&f, &mut lead, 4800, true);
    f.store.finalize_take(&mut lead).expect("Lead 입력 저장");
    let original = f
        .store
        .recording_bytes(&lead.project_id, &lead.id, &AtomicBool::new(false))
        .expect("Lead 기준");
    let mut rhythm = lead.clone();
    rhythm.id = Uuid::new_v4().to_string();
    rhythm.target_score_track_id = "track-rhythm".into();
    rhythm.frames = 0;
    rhythm.sha256 = None;
    rhythm.state = crate::recording::model::RecordingState::Arming;
    rhythm.reference_take_ids = vec![lead.id.clone()];
    write_part(&f, &mut rhythm, 2400, true);
    f.store
        .finalize_take(&mut rhythm)
        .expect("Rhythm 독립 입력 저장");
    assert_ne!(lead.id, rhythm.id);
    assert_ne!(lead.target_score_track_id, rhythm.target_score_track_id);
    let saved = f
        .store
        .take(&lead.project_id, &rhythm.id)
        .expect("새 테이크");
    assert_eq!(saved.reference_take_ids, vec![lead.id.clone()]);
    assert_eq!(saved.frames, 2400);
    assert_eq!(
        f.store
            .recording_bytes(&lead.project_id, &lead.id, &AtomicBool::new(false))
            .expect("Lead 원본 보존"),
        original
    );
    assert_eq!(
        f.store
            .recording_bytes(&lead.project_id, &rhythm.id, &AtomicBool::new(false))
            .expect("Rhythm 원본")
            .len(),
        58 + 2400 * 4
    );
}
fn samples(bytes: &[u8]) -> Vec<f32> {
    let mut budget = render::INPUT_BUDGET;
    pcm::decode(bytes, &mut budget, &AtomicBool::new(false))
        .expect("출력 WAV")
        .samples
}
#[test]
fn two_takes_mute_solo_gain_offset_limiter_and_settings_preserve_originals() {
    let (f, mut mix, a, b) = setup();
    let flag = AtomicBool::new(false);
    let (output, stats) = render::render(&f.store, &mix, &flag, |_, _| Ok(())).expect("두 테이크");
    assert_eq!(stats.frames, 7200);
    assert!(stats.limited_frames > 0);
    assert!(samples(&output).iter().all(|s| s.abs() <= 1.0));
    mix.layers[1].mute = true;
    let (muted, _) = render::render(&f.store, &mix, &flag, |_, _| Ok(())).expect("B mute");
    assert_eq!(samples(&muted), samples(&a));
    mix.layers[1].mute = false;
    mix.layers[1].solo = true;
    mix.layers[1].gain = 0.5;
    let (solo, _) = render::render(&f.store, &mix, &flag, |_, _| Ok(())).expect("B solo");
    let solo = samples(&solo);
    assert!(solo[..2400].iter().all(|s| *s == 0.0));
    for (actual, source) in solo[2400..].iter().zip(samples(&b)) {
        assert!((actual - source * 0.5).abs() < 0.00001);
    }
    mix.layers[1].offset_ms = -50.0;
    let (trimmed, stats) =
        render::render(&f.store, &mix, &flag, |_, _| Ok(())).expect("음수 offset");
    assert_eq!(stats.frames, 2400);
    assert!((samples(&trimmed)[0] - samples(&b)[2400] * 0.5).abs() < 0.00001);
    f.store.save_mix(&mix).expect("믹스 설정 저장");
    assert_eq!(
        f.store
            .mix(&mix.project_id)
            .expect("재열기")
            .expect("저장값")
            .layers[1]
            .offset_ms,
        -50.0
    );
    assert_eq!(
        f.store
            .recording_bytes(&mix.project_id, &mix.layers[0].id, &flag)
            .expect("원본 A"),
        a
    );
    assert_eq!(
        f.store
            .recording_bytes(&mix.project_id, &mix.layers[1].id, &flag)
            .expect("원본 B"),
        b
    );
    let second = f
        .store
        .take(&mix.project_id, &mix.layers[1].id)
        .expect("참조 관계");
    assert_eq!(second.reference_take_ids, vec![mix.layers[0].id.clone()]);
}
#[test]
fn malformed_foreign_nonready_and_unsupported_rate_cannot_render_or_save() {
    let (f, mut mix, _, _) = setup();
    let flag = AtomicBool::new(false);
    let original = serde_json::to_value(&mix).expect("계약");
    let mut invalid = original.clone();
    invalid["layers"][0]["kind"] = "YOUTUBE_EMBED".into();
    assert!(serde_json::from_value::<MixDocument>(invalid).is_err());
    mix.layers[1].id = mix.layers[0].id.clone();
    assert!(mix.validate().is_err());
    let mut mix: MixDocument = serde_json::from_value(original).expect("정상");
    mix.layers[1].id = Uuid::new_v4().to_string();
    assert!(f.store.save_mix(&mix).is_err());
    mix.layers.pop();
    let mut take = f
        .store
        .take(&mix.project_id, &mix.layers[0].id)
        .expect("테이크");
    take.transport = Some(crate::recording::model::RecordingTransport {
        playback_epoch: 1,
        rate: 0.5,
        backing_asset_id: Uuid::new_v4().to_string(),
    });
    f.store.save_take(&take).expect("0.5 기록");
    assert!(render::render(&f.store, &mix, &flag, |_, _| Ok(()))
        .is_err_and(|e| e.code == "MIX_RATE_UNSUPPORTED"));
    take.state = crate::recording::model::RecordingState::RecoverableError;
    f.store.save_take(&take).expect("불완전");
    assert!(render::validate_sources(&f.store, &mix, &AtomicBool::new(false)).is_err());
}

#[test]
fn reference_metadata_is_optional_but_rejects_duplicates_self_and_missing_takes() {
    let f = Fixture::new();
    let mut take = prepared(&f);
    let mut legacy = serde_json::to_value(&take).expect("테이크");
    legacy
        .as_object_mut()
        .expect("구조")
        .remove("referenceTakeIds");
    let old: crate::recording::model::RecordedTake =
        serde_json::from_value(legacy).expect("이전 파일 읽기");
    assert!(old.reference_take_ids.is_empty());
    take.reference_take_ids = vec![take.id.clone()];
    assert!(take.validate().is_err());
    let missing = Uuid::new_v4().to_string();
    take.reference_take_ids = vec![missing.clone(), missing.clone()];
    assert!(take.validate().is_err());
    take.reference_take_ids = vec![missing];
    assert!(f.store.prepare_recording(&take).is_err());
    assert!(f
        .store
        .recordings(&take.project_id)
        .expect("파일 준비 전 거부")
        .is_empty());
    let request = serde_json::json!({"schemaVersion":1,"projectId":take.project_id,"scoreRevisionId":take.score_revision_id,"targetScoreTrackId":"track-0","expectedStreamGeneration":1,"monitorEnvironment":"HEADPHONES","source":"INPUT_ONLY","transport":null});
    let old: crate::recording::model::StartRecordingRequest =
        serde_json::from_value(request.clone()).expect("이전 요청");
    old.validate().expect("정상");
    assert!(old.reference_take_ids.is_empty());
    let mut bad = request;
    bad["referenceTakeIds"] = serde_json::json!(["../../input.wav"]);
    let bad: crate::recording::model::StartRecordingRequest =
        serde_json::from_value(bad).expect("요청 구조");
    assert!(bad.validate().is_err());
}

#[test]
fn version_two_migration_preserves_existing_takes_and_wave_bytes() {
    let (f, mix, a, b) = setup();
    let db = connect(&f.store.root).expect("fixture DB");
    db.execute_batch(
        "DROP TABLE project_trash; DROP TABLE imported_guitar_stems; DROP TABLE project_youtube_syncs; DROP TABLE project_backings; DROP TABLE audio_stems; DROP TABLE audio_stem_sets; DROP TABLE ai_transcription_drafts; DROP TABLE project_mixes; PRAGMA user_version=2;",
    )
    .expect("기존 v2 구조 재현");
    let before: Vec<(String, String)> = db
        .prepare("SELECT id,metadata_json FROM recorded_takes ORDER BY id")
        .expect("기존 테이크")
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .expect("읽기")
        .collect::<rusqlite::Result<_>>()
        .expect("기준");
    drop(db);
    let db = connect(&f.store.root).expect("추가003");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
            .expect("버전"),
        9
    );
    let after: Vec<(String, String)> = db
        .prepare("SELECT id,metadata_json FROM recorded_takes ORDER BY id")
        .expect("테이크")
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .expect("읽기")
        .collect::<rusqlite::Result<_>>()
        .expect("비교");
    assert_eq!(before, after);
    assert!(f.store.mix(&mix.project_id).expect("새 빈 설정").is_none());
    assert_eq!(
        f.store
            .recording_bytes(&mix.project_id, &mix.layers[0].id, &AtomicBool::new(false))
            .expect("A 원본"),
        a
    );
    assert_eq!(
        f.store
            .recording_bytes(&mix.project_id, &mix.layers[1].id, &AtomicBool::new(false))
            .expect("B 원본"),
        b
    );
}
#[test]
fn cancelled_render_export_collision_and_corrupted_settings_keep_files() {
    let (f, mix, a, _) = setup();
    let flag = AtomicBool::new(false);
    let canceled = render::render(&f.store, &mix, &flag, |_, _| {
        flag.store(true, Ordering::Release);
        Ok(())
    });
    assert!(canceled.is_err_and(|e| e.code == "CANCELED"));
    let path = std::env::temp_dir().join(format!("guitarlab-mix-test-{}.wav", Uuid::new_v4()));
    assert!(export::save_new_wav(&path, &a, &flag).is_err());
    assert!(!path.exists());
    flag.store(false, Ordering::Release);
    export::save_new_wav(&path, &a, &flag).expect("새 출력");
    assert!(export::save_new_wav(&path, b"bad", &flag)
        .is_err_and(|e| e.code == "MIX_DESTINATION_EXISTS"));
    assert_eq!(fs::read(&path).expect("기존 파일"), a);
    fs::remove_file(path).expect("직접 만든 파일 정리");
    f.store.save_mix(&mix).expect("설정");
    connect(&f.store.root)
        .expect("DB")
        .execute(
            "UPDATE project_mixes SET document_sha256=?1 WHERE project_id=?2",
            rusqlite::params!["0".repeat(64), mix.project_id],
        )
        .expect("손상 주입");
    assert!(f.store.mix(&mix.project_id).is_err());
}
#[test]
fn pcm16_stereo_downmix_rate_conversion_and_invalid_data_are_bounded() {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&40u32.to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    for v in [1u16, 2] {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes.extend_from_slice(&24000u32.to_le_bytes());
    bytes.extend_from_slice(&96000u32.to_le_bytes());
    bytes.extend_from_slice(&4u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&4u32.to_le_bytes());
    bytes.extend_from_slice(&16384i16.to_le_bytes());
    bytes.extend_from_slice(&0i16.to_le_bytes());
    let flag = AtomicBool::new(false);
    let mut budget = 4;
    let pcm = pcm::decode(&bytes, &mut budget, &flag).expect("PCM16 stereo");
    assert_eq!(pcm.rate, 24000);
    assert_eq!(pcm.samples, vec![0.25]);
    assert_eq!(budget, 0);
    assert!(pcm::decode(&bytes, &mut 0, &flag).is_err());
    bytes[32] = 0;
    assert!(pcm::decode(&bytes, &mut 64, &flag).is_err());
    let mut writer = wave::WaveWriter::new(std::io::Cursor::new(Vec::new()), 48000).expect("float");
    writer.push(0.5).expect("표본");
    let mut raw = writer.finish().expect("헤더").into_inner();
    raw[58..62].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(pcm::decode(&raw, &mut 64, &flag).is_err());
}

#[test]
fn local_wav_and_two_takes_mix_to_four_seconds_and_resample_without_touching_sources() {
    let (f, mut mix, a, b) = setup();
    let path = f.store.root.join("자체 합성 로컬 반주.wav");
    let mut writer = wave::create(&path, 24000).expect("24k 반주");
    for _ in 0..96000 {
        writer.push(0.25).expect("4초 합성");
    }
    wave::finish(writer).expect("합성 반주 확정");
    let original = fs::read(&path).expect("자체 반주");
    let asset = f
        .store
        .import_asset(
            &mix.project_id,
            &path,
            crate::storage::project_model::AssetKind::Original,
            crate::storage::project_model::AssetStorage::Managed,
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("권리 보유 fixture import");
    mix.layers.push(MixLayer {
        kind: LayerKind::LocalAsset,
        id: asset.asset.id,
        gain: 0.5,
        mute: false,
        solo: false,
        offset_ms: 0.0,
    });
    mix.master_gain = 0.5;
    let flag = AtomicBool::new(false);
    let (out, stats) =
        render::render(&f.store, &mix, &flag, |_, _| Ok(())).expect("로컬 반주+2테이크");
    assert_eq!(stats.frames, 192000);
    assert_eq!(out.len(), 768058);
    let pcm = samples(&out);
    assert!((pcm[0] - 0.0625).abs() < 0.00001);
    assert!((pcm[100000] - 0.0625).abs() < 0.00001);
    assert_eq!(fs::read(&path).expect("원본 반주 보존"), original);
    assert_eq!(
        f.store
            .recording_bytes(&mix.project_id, &mix.layers[0].id, &flag)
            .expect("A 보존"),
        a
    );
    assert_eq!(
        f.store
            .recording_bytes(&mix.project_id, &mix.layers[1].id, &flag)
            .expect("B 보존"),
        b
    );
}
