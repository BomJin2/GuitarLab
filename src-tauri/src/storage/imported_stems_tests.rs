use super::{
    database::connect, project_model::GuitarPartRole, projects::ProjectStore,
    projects_tests::Fixture,
};
use std::{
    fs,
    sync::atomic::{AtomicBool, Ordering},
};
fn source(f: &Fixture) -> std::path::PathBuf {
    let path = f.store.root.join("자체 단음.wav");
    fs::write(&path, include_bytes!("../../../public/fixtures/sine.wav")).expect("자체 WAV");
    path
}
#[test]
fn imported_stereo_peak_uses_original_channels_and_keeps_pcm16_bytes() {
    let f = Fixture::new();
    let id = f.project();
    let path = f.store.root.join("자체 스테레오.wav");
    let mut bytes = b"RIFF".to_vec();
    bytes.extend_from_slice(&44u32.to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&48000u32.to_le_bytes());
    bytes.extend_from_slice(&192000u32.to_le_bytes());
    bytes.extend_from_slice(&4u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&8u32.to_le_bytes());
    for sample in [16384i16, -16384, 8192, -8192] {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    fs::write(&path, &bytes).expect("자체 좌우 반대 위상 PCM16");
    let flag = AtomicBool::new(false);
    let stem = f
        .store
        .import_guitar_stem(&id, GuitarPartRole::Rhythm, &path, &flag, |_, _| Ok(()))
        .expect("스테레오 import");
    assert_eq!(stem.channels, 2);
    assert_eq!(stem.frames, 2);
    assert_eq!(stem.peak, 0.5);
    assert_eq!(
        f.store
            .read_imported_guitar_stem(&id, &stem.id, &flag)
            .expect("원본 재읽기")
            .1,
        bytes
    );
}
#[test]
fn imported_roles_reopen_keep_source_bytes_and_cannot_read_cross_project() {
    let f = Fixture::new();
    let project = f.project();
    let other = f.project();
    let path = source(&f);
    let original = fs::read(&path).expect("원본");
    let cancel = AtomicBool::new(false);
    let a = f
        .store
        .import_guitar_stem(
            &project,
            GuitarPartRole::Lead,
            &path,
            &cancel,
            |_, _| Ok(()),
        )
        .expect("리드");
    let b = f
        .store
        .import_guitar_stem(&project, GuitarPartRole::Rhythm, &path, &cancel, |_, _| {
            Ok(())
        })
        .expect("리듬");
    assert_ne!(a.id, b.id);
    assert_eq!(a.frames, 192000);
    assert_eq!(a.sample_rate, 48000);
    assert_eq!(a.duration_ms, 4000.0);
    let reopened = ProjectStore::new(f.store.root.clone());
    assert_eq!(
        reopened
            .imported_guitar_stems(&project, &cancel)
            .expect("목록")
            .len(),
        2
    );
    assert!(reopened
        .imported_guitar_stems(&other, &cancel)
        .expect("다른 프로젝트")
        .is_empty());
    assert_eq!(
        reopened
            .read_imported_guitar_stem(&project, &a.id, &cancel)
            .expect("리드 읽기")
            .1,
        original
    );
    assert_eq!(
        reopened
            .read_imported_guitar_stem(&project, &b.id, &cancel)
            .expect("리듬 읽기")
            .1,
        original
    );
    assert!(reopened
        .read_imported_guitar_stem(&other, &a.id, &cancel)
        .is_err());
    assert_eq!(fs::read(&path).expect("원본 보존"), original);
    assert!(reopened
        .assets(&project)
        .expect("원본 자산 영역 분리")
        .is_empty());
}
#[test]
fn invalid_cancelled_failed_and_tampered_imports_preserve_existing_files() {
    let f = Fixture::new();
    let id = f.project();
    let path = source(&f);
    let flag = AtomicBool::new(false);
    let first = f
        .store
        .import_guitar_stem(&id, GuitarPartRole::Unknown, &path, &flag, |_, _| Ok(()))
        .expect("기준");
    let stored = f
        .store
        .root
        .join(format!("projects/{id}/imported-stems/{}.wav", first.id));
    let original = fs::read(&stored).expect("저장 원본");
    assert_eq!(
        f.store
            .import_guitar_stem(&id, GuitarPartRole::Lead, &path, &flag, |_, _| {
                flag.store(true, Ordering::Release);
                Ok(())
            })
            .expect_err("중간 취소")
            .code,
        "CANCELED"
    );
    flag.store(false, Ordering::Release);
    let invalid = f.store.root.join("손상.wav");
    fs::write(
        &invalid,
        b"not a wave file but at least forty four bytes!!!!",
    )
    .expect("손상 fixture");
    assert!(f
        .store
        .import_guitar_stem(&id, GuitarPartRole::Lead, &invalid, &flag, |_, _| Ok(()))
        .is_err());
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("CREATE TRIGGER fail_import BEFORE INSERT ON imported_guitar_stems BEGIN SELECT RAISE(ABORT,'DEMO 실패');END;").expect("실패 주입");
    assert!(f
        .store
        .import_guitar_stem(&id, GuitarPartRole::Lead, &path, &flag, |_, _| Ok(()))
        .is_err());
    assert_eq!(
        fs::read_dir(stored.parent().expect("자체 폴더"))
            .expect("목록")
            .count(),
        1
    );
    assert_eq!(
        f.store
            .imported_guitar_stems(&id, &flag)
            .expect("기존 행")
            .len(),
        1
    );
    assert_eq!(
        fs::read(&stored).expect("원본").as_slice(),
        original.as_slice()
    );
    let mut corrupted = original;
    *corrupted.last_mut().expect("샘플") ^= 1;
    fs::write(&stored, corrupted).expect("손상");
    assert!(f
        .store
        .read_imported_guitar_stem(&id, &first.id, &flag)
        .is_err());
    db.execute("UPDATE imported_guitar_stems SET metadata_json='{}'", [])
        .expect("메타데이터 손상");
    assert!(f.store.imported_guitar_stems(&id, &flag).is_err());
}
#[test]
fn version_seven_migrates_additively_and_twenty_item_limit_keeps_previous_stems() {
    let f = Fixture::new();
    let id = f.project();
    let path = source(&f);
    let flag = AtomicBool::new(false);
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch(
        "DROP TABLE project_trash;DROP TABLE imported_guitar_stems;PRAGMA user_version=7;",
    )
    .expect("v7");
    drop(db);
    let db = connect(&f.store.root).expect("v9");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
            .expect("버전"),
        9
    );
    for _ in 0..20 {
        f.store
            .import_guitar_stem(&id, GuitarPartRole::Unknown, &path, &flag, |_, _| Ok(()))
            .expect("20개");
    }
    assert_eq!(
        f.store
            .import_guitar_stem(&id, GuitarPartRole::Unknown, &path, &flag, |_, _| Ok(()))
            .expect_err("한도")
            .code,
        "IMPORTED_STEM_LIMIT"
    );
    assert_eq!(
        f.store
            .imported_guitar_stems(&id, &flag)
            .expect("기존 보존")
            .len(),
        20
    );
}
