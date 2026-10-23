use super::{
    database::{checked_directory, connect},
    project_model::*,
    projects::ProjectStore,
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use uuid::Uuid;

pub(crate) struct Fixture {
    root: PathBuf,
    pub(crate) store: ProjectStore,
    source: PathBuf,
}
impl Fixture {
    pub(crate) fn new() -> Self {
        let root = std::env::temp_dir().join(format!("guitarlab-project-test-{}", Uuid::new_v4()));
        fs::create_dir(&root).expect("테스트 폴더");
        let source = root.join("원본 악보.musicxml");
        fs::write(&source, b"<?xml version=\"1.0\"?><score-partwise/>").expect("자체 원본");
        let store = ProjectStore::new(root.join("앱 데이터"));
        store.initialize().expect("migration");
        Self {
            root,
            store,
            source,
        }
    }
    pub(crate) fn project(&self) -> String {
        self.store
            .create("기타 연습".into(), None, ProjectMode::Practice)
            .expect("프로젝트")
            .id
    }
    pub(crate) fn asset(&self, project: &str, storage: AssetStorage) -> String {
        self.store
            .import_asset(
                project,
                &self.source,
                AssetKind::ScoreImport,
                storage,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("자체 원본 import")
            .asset
            .id
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let absolute = self.root.canonicalize().expect("임시 경로");
        assert_eq!(
            absolute.parent(),
            Some(
                std::env::temp_dir()
                    .canonicalize()
                    .expect("임시 상위")
                    .as_path()
            )
        );
        assert!(absolute
            .file_name()
            .and_then(|v| v.to_str())
            .is_some_and(|v| v.starts_with("guitarlab-project-test-")));
        fs::remove_dir_all(absolute).expect("자체 테스트 폴더 정리");
    }
}
pub(crate) fn score() -> ScoreDocument {
    ScoreDocument {
        schema_version: 1,
        render_source: None,
        id: Uuid::new_v4().to_string(),
        title: "테스트 악보".into(),
        ppq: 960,
        tempo_map: vec![Tempo {
            tick: 0,
            bpm: 120.0,
        }],
        time_signatures: vec![TimeSignature {
            tick: 0,
            numerator: 4,
            denominator: 4,
        }],
        sync_anchors: vec![
            SyncAnchor {
                score_tick: 0,
                audio_time_ms: 0.0,
            },
            SyncAnchor {
                score_tick: 3840,
                audio_time_ms: 2000.0,
            },
        ],
        tracks: vec![ScoreTrack {
            id: "track-0".into(),
            name: "Guitar".into(),
            instrument: None,
            role: None,
            tuning_midi: vec![64, 59, 55, 50, 45, 40],
            notes: vec![ScoreNote {
                judgement_support: None,
                id: "note-0".into(),
                track_id: "track-0".into(),
                measure_index: 0,
                start_tick: 960,
                duration_ticks: 960,
                pitch_midi: 67,
                string_index: Some(1),
                fret: Some(3),
                notation_note_id: Some("n0".into()),
                attack: Some(true),
                source: NoteSource::Import,
            }],
        }],
    }
}
pub(crate) fn workspace() -> WorkspaceState {
    WorkspaceState {
        active_track_index: 0,
        active_performance_track_id: None,
        audio_asset_id: None,
        position_ms: 1234.0,
        rate: 0.75,
        playback_loop: PlaybackLoop {
            enabled: true,
            start_ms: 0.0,
            end_ms: 2000.0,
        },
    }
}

#[test]
fn blank_score_saves_and_reopens_without_replacing_previous_assets_or_revisions() {
    let f = Fixture::new();
    let project = f.project();
    let old_asset = f.asset(&project, AssetStorage::Managed);
    let cancel = AtomicBool::new(false);
    let previous = f
        .store
        .save_revision(&project, 0, &old_asset, score(), workspace(), &cancel)
        .expect("이전 악보 저장");
    let asset = f
        .store
        .create_blank_score(&project, 1, &cancel, |_, _| Ok(()))
        .expect("빈 악보 생성");
    assert_ne!(asset.id, old_asset);
    assert_eq!(asset.kind, AssetKind::ScoreImport);
    assert_eq!(asset.storage, AssetStorage::Managed);
    assert_eq!(f.store.open(&project).expect("이전 상태").0.revision, 1);
    let bytes = f
        .store
        .read_asset(&project, &asset.id, &cancel, |_, _| Ok(()))
        .expect("생성 원본");
    assert_eq!(bytes, include_bytes!("../../../fixtures/blank.musicxml"));
    let mut empty = score();
    empty.render_source = Some(ScoreRenderSource::Normalized);
    empty.tracks[0].notes.clear();
    let saved = f
        .store
        .save_revision(&project, 1, &asset.id, empty, workspace(), &cancel)
        .expect("빈 악보 저장");
    let reopened = ProjectStore::new(f.store.root.clone());
    reopened.initialize().expect("재실행");
    let (_, revision, assets) = reopened.open(&project).expect("다시 열기");
    assert_eq!(
        revision.expect("빈 악보 revision").revision_id,
        saved.revision_id
    );
    assert_eq!(assets.len(), 2);
    assert!(reopened
        .revision(&project, &saved.revision_id)
        .expect("빈 음표")
        .score
        .tracks[0]
        .notes
        .is_empty());
    assert_eq!(
        reopened
            .revision(&project, &previous.revision_id)
            .expect("이전 버전")
            .score
            .tracks[0]
            .notes
            .len(),
        1
    );
    assert_eq!(
        reopened
            .read_asset(&project, &old_asset, &cancel, |_, _| Ok(()))
            .expect("이전 원본"),
        fs::read(&f.source).expect("원본 bytes")
    );
}

#[test]
fn normalized_json_import_reopens_exact_ids_roles_sync_and_preserves_original_and_revisions() {
    let f = Fixture::new();
    let source = f.root.join("직접 작성.json");
    let bytes = include_bytes!("../../../fixtures/manual-score-v1.json");
    fs::write(&source, bytes).expect("자체 JSON");
    let document: ScoreDocument = serde_json::from_slice(bytes).expect("공통 계약");
    let cancel = AtomicBool::new(false);
    let padded = f.root.join("공백 있는 악보.json");
    let mut padded_bytes = vec![b' '; 70000];
    padded_bytes.extend_from_slice(bytes);
    fs::write(&padded, &padded_bytes).expect("첫 읽기보다 긴 공백");
    let padded_project = f.project();
    let padded_asset = f
        .store
        .import_asset(
            &padded_project,
            &padded,
            AssetKind::ScoreImport,
            AssetStorage::Managed,
            &cancel,
            |_, _| Ok(()),
        )
        .expect("긴 공백 포함 JSON")
        .asset;
    assert_eq!(
        f.store
            .read_asset(&padded_project, &padded_asset.id, &cancel, |_, _| Ok(()))
            .expect("동일 bytes"),
        padded_bytes
    );
    for storage in [AssetStorage::Managed, AssetStorage::Reference] {
        let project = f.project();
        let old_asset = f.asset(&project, AssetStorage::Managed);
        let previous = f
            .store
            .save_revision(&project, 0, &old_asset, score(), workspace(), &cancel)
            .expect("이전 버전");
        let imported = f
            .store
            .import_asset(
                &project,
                &source,
                AssetKind::ScoreImport,
                storage,
                &cancel,
                |_, _| Ok(()),
            )
            .expect("JSON import");
        let saved = f
            .store
            .save_revision(
                &project,
                1,
                &imported.asset.id,
                document.clone(),
                workspace(),
                &cancel,
            )
            .expect("JSON 악보 저장");
        let reopened = ProjectStore::new(f.store.root.clone());
        let (_, revision, _) = reopened.open(&project).expect("JSON 프로젝트 재열기");
        let revision = revision.expect("저장본");
        assert_eq!(revision.revision_id, saved.revision_id);
        assert_eq!(
            serde_json::to_value(&revision.score).expect("JSON"),
            serde_json::to_value(&document).expect("원본 JSON")
        );
        assert_eq!(
            reopened
                .read_asset(&project, &imported.asset.id, &cancel, |_, _| Ok(()))
                .expect("원본 조회"),
            bytes
        );
        assert_eq!(
            reopened
                .revision(&project, &previous.revision_id)
                .expect("이전 보존")
                .score
                .tracks[0]
                .notes[0]
                .id,
            "note-0"
        );
        assert_eq!(fs::read(&source).expect("외부 원본 보존"), bytes);
    }
}

#[test]
fn malformed_or_canceled_json_import_leaves_no_asset_or_partial_file() {
    let f = Fixture::new();
    let project = f.project();
    let source = f.root.join("미완성.json");
    let raw = std::str::from_utf8(include_bytes!("../../../fixtures/manual-score-v1.json"))
        .expect("UTF8");
    for value in [
        "{}".into(),
        "[]".into(),
        raw.replace("\"NORMALIZED\"", "null"),
        raw.replace("\"ppq\": 960", "\"ppq\": 960, \"sourcePath\": \"private\""),
        raw.replace("\"bpm\": 120", "\"bpm\": 120, \"bpm\": 120"),
        raw.replace("\"lead-2\"", "\"lead-1\""),
        raw.replace("manual-json-fixture", "bad\\u007f"),
        format!("\u{feff}{raw}"),
    ] {
        fs::write(&source, value.as_bytes()).expect("잘못된 자체 입력");
        for storage in [AssetStorage::Managed, AssetStorage::Reference] {
            assert_eq!(
                f.store
                    .import_asset(
                        &project,
                        &source,
                        AssetKind::ScoreImport,
                        storage,
                        &AtomicBool::new(false),
                        |_, _| Ok(())
                    )
                    .err()
                    .expect("JSON 거부")
                    .code,
                "FILE_INVALID"
            );
            assert!(f.store.assets(&project).expect("자산 목록").is_empty());
            let folder = f.store.root.join(format!("projects/{project}/assets"));
            assert_eq!(fs::read_dir(folder).expect("part 정리").count(), 0);
        }
        assert_eq!(fs::read(&source).expect("원본 그대로"), value.as_bytes());
    }
    fs::write(&source, raw.as_bytes()).expect("정상 자체 입력");
    let cancel = AtomicBool::new(false);
    assert_eq!(
        f.store
            .import_asset(
                &project,
                &source,
                AssetKind::ScoreImport,
                AssetStorage::Managed,
                &cancel,
                |_, _| {
                    cancel.store(true, Ordering::Release);
                    Ok(())
                }
            )
            .err()
            .expect("JSON 읽기 취소")
            .code,
        "CANCELED"
    );
    assert!(f.store.assets(&project).expect("취소 자산 없음").is_empty());
}

#[test]
fn blank_score_cancel_write_or_database_failure_leaves_existing_files_and_database_unchanged() {
    let f = Fixture::new();
    let project = f.project();
    let old_asset = f.asset(&project, AssetStorage::Managed);
    let folder = f.store.root.join(format!("projects/{project}/assets"));
    let before = fs::read_dir(&folder).expect("원본 폴더").count();
    for after_write in [false, true] {
        let cancel = AtomicBool::new(false);
        let error = f
            .store
            .create_blank_score(&project, 0, &cancel, |done, _| {
                if (done > 0) == after_write {
                    cancel.store(true, Ordering::Release);
                }
                Ok(())
            })
            .err()
            .expect("생성 취소");
        assert_eq!(error.code, "CANCELED");
        assert_eq!(fs::read_dir(&folder).expect("파일 정리").count(), before);
    }
    assert_eq!(
        f.store
            .create_blank_score(&project, 1, &AtomicBool::new(false), |_, _| Ok(()))
            .err()
            .expect("오래된 revision")
            .code,
        "REVISION_CONFLICT"
    );
    assert!(f
        .store
        .create_blank_score("../escape", 0, &AtomicBool::new(false), |_, _| Ok(()))
        .is_err());
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("CREATE TRIGGER reject_blank BEFORE INSERT ON project_assets BEGIN SELECT RAISE(ABORT, 'test'); END;").expect("DB 실패 재현");
    assert_eq!(
        f.store
            .create_blank_score(&project, 0, &AtomicBool::new(false), |_, _| Ok(()))
            .err()
            .expect("삽입 실패")
            .code,
        "STORAGE_ERROR"
    );
    assert_eq!(
        fs::read_dir(&folder).expect("실패 파일 정리").count(),
        before
    );
    assert_eq!(f.store.assets(&project).expect("기존 자산").len(), 1);
    assert_eq!(
        f.store
            .read_asset(&project, &old_asset, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("원본 유지"),
        fs::read(&f.source).expect("원본 bytes")
    );
    f.store
        .trash_project(&project, 0, &AtomicBool::new(false))
        .expect("보관");
    assert_eq!(
        f.store
            .create_blank_score(&project, 0, &AtomicBool::new(false), |_, _| Ok(()))
            .err()
            .expect("보관 프로젝트 생성 차단")
            .code,
        "PROJECT_IN_TRASH"
    );
    assert_eq!(
        fs::read_dir(folder).expect("보관 파일 보존").count(),
        before
    );
}

#[test]
fn migration_reopens_and_rejects_future_or_corrupt_database_without_overwrite() {
    let f = Fixture::new();
    let db = connect(&f.store.root).expect("DB");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |row| row.get(0))
            .expect("버전"),
        9
    );
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "foreign_keys", |row| row.get(0))
            .expect("FK"),
        1
    );
    db.pragma_update(None, "user_version", 10)
        .expect("향후 버전 fixture");
    drop(db);
    assert_eq!(
        connect(&f.store.root).expect_err("차단").code,
        "STORAGE_ERROR"
    );
    let db = rusqlite::Connection::open(f.store.root.join("guitarlab.sqlite")).expect("직접 읽기");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |row| row.get(0))
            .expect("보존"),
        10
    );
    drop(db);
    let corrupt = f.root.join("손상 DB");
    fs::create_dir(&corrupt).expect("폴더");
    fs::write(corrupt.join("guitarlab.sqlite"), b"not a sqlite database").expect("손상 fixture");
    assert!(connect(&corrupt).is_err());
    assert_eq!(
        fs::read(corrupt.join("guitarlab.sqlite")).expect("보존"),
        b"not a sqlite database"
    );
}
#[test]
fn ten_immutable_revisions_reopen_with_original_bytes_and_workspace() {
    let f = Fixture::new();
    let p = f.project();
    let a = f.asset(&p, AssetStorage::Managed);
    let original = fs::read(&f.source).expect("원본");
    let mut ids = Vec::new();
    for revision in 0..10 {
        let saved = f
            .store
            .save_revision(
                &p,
                revision,
                &a,
                score(),
                workspace(),
                &AtomicBool::new(false),
            )
            .expect("revision 저장");
        ids.push(saved.revision_id);
    }
    let reopened = ProjectStore::new(f.store.root.clone());
    reopened.initialize().expect("재실행");
    let (summary, latest, assets) = reopened.open(&p).expect("복구");
    assert_eq!(summary.revision, 10);
    assert_eq!(assets.len(), 1);
    let latest = latest.expect("악보");
    assert_eq!(latest.workspace.position_ms, 1234.0);
    assert_eq!(latest.workspace.rate, 0.75);
    for (index, id) in ids.iter().enumerate() {
        assert_eq!(
            reopened.revision(&p, id).expect("이전 revision").revision,
            index as u32 + 1
        );
    }
    fs::remove_file(&f.source).expect("외부 원본 누락 시뮬레이션");
    assert_eq!(
        reopened
            .read_asset(&p, &a, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("관리 복사본"),
        original
    );
}

#[test]
fn normalized_render_revision_keeps_legacy_revision_and_original_asset() {
    let f = Fixture::new();
    let project = f.project();
    let asset = f.asset(&project, AssetStorage::Managed);
    let original = fs::read(&f.source).expect("원본 fixture");
    let first = f
        .store
        .save_revision(
            &project,
            0,
            &asset,
            score(),
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("원본 저장");
    let first_json = serde_json::to_value(&first.score).expect("원본 문서");
    assert!(first_json.get("renderSource").is_none());
    let mut edited = first.score.clone();
    edited.render_source = Some(ScoreRenderSource::Normalized);
    edited.tracks[0].notes[0].fret = Some(5);
    edited.tracks[0].notes[0].pitch_midi = 69;
    let saved = f
        .store
        .save_revision(
            &project,
            1,
            &asset,
            edited,
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("편집 저장");
    let reopened = ProjectStore::new(f.store.root.clone());
    reopened.initialize().expect("재실행");
    let latest = reopened
        .open(&project)
        .expect("재열기")
        .1
        .expect("최신 문서");
    assert_eq!(latest.revision_id, saved.revision_id);
    assert!(matches!(
        latest.score.render_source,
        Some(ScoreRenderSource::Normalized)
    ));
    assert_eq!(latest.score.tracks[0].notes[0].pitch_midi, 69);
    let mut ai_document = latest.score.clone();
    ai_document.tracks[0].notes[0].source = NoteSource::Ai;
    let ai_revision = reopened
        .save_revision(
            &project,
            2,
            &asset,
            ai_document,
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("AI 적용본 저장");
    let ai_reopened = ProjectStore::new(f.store.root.clone())
        .open(&project)
        .expect("AI 재열기")
        .1
        .expect("AI 악보");
    assert_eq!(ai_reopened.revision_id, ai_revision.revision_id);
    assert!(matches!(
        ai_reopened.score.tracks[0].notes[0].source,
        NoteSource::Ai
    ));
    assert_eq!(
        reopened
            .revision(&project, &saved.revision_id)
            .expect("이전 편집본")
            .score
            .tracks[0]
            .notes[0]
            .pitch_midi,
        69
    );
    assert_eq!(
        serde_json::to_value(
            reopened
                .revision(&project, &first.revision_id)
                .expect("이전 문서")
                .score
        )
        .expect("JSON"),
        first_json
    );
    assert_eq!(fs::read(&f.source).expect("원본 유지"), original);
    for value in [
        serde_json::Value::Null,
        serde_json::json!(false),
        serde_json::json!("OTHER"),
    ] {
        let mut invalid = first_json.clone();
        invalid["renderSource"] = value;
        assert!(serde_json::from_value::<ScoreDocument>(invalid).is_err());
    }
}
#[test]
fn duplicate_import_preserves_original_and_does_not_add_rows() {
    let f = Fixture::new();
    let p = f.project();
    let a = f.asset(&p, AssetStorage::Managed);
    let before = fs::read(&f.source).expect("원본");
    let result = f
        .store
        .import_asset(
            &p,
            &f.source,
            AssetKind::ScoreImport,
            AssetStorage::Reference,
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("중복");
    assert!(result.duplicate);
    assert_eq!(result.asset.id, a);
    assert_eq!(f.store.assets(&p).expect("목록").len(), 1);
    assert_eq!(fs::read(&f.source).expect("원본 보존"), before);
}
#[test]
fn missing_reference_relinks_only_same_content_and_never_deletes_source() {
    let f = Fixture::new();
    let p = f.project();
    let a = f.asset(&p, AssetStorage::Reference);
    let moved = f.root.join("이동한 악보.musicxml");
    fs::rename(&f.source, &moved).expect("사용자 파일 이동");
    assert!(!f.store.assets(&p).expect("목록")[0].available);
    assert_eq!(
        f.store
            .read_asset(&p, &a, &AtomicBool::new(false), |_, _| Ok(()))
            .expect_err("누락")
            .code,
        "FILE_NOT_FOUND"
    );
    let wrong = f.root.join("다른 악보.musicxml");
    fs::write(&wrong, b"<?xml version=\"1.0\"?><score-partwisa/>").expect("다른 원본");
    assert!(f
        .store
        .relink(&p, &a, &wrong, &AtomicBool::new(false), |_, _| Ok(()))
        .is_err());
    assert!(
        f.store
            .relink(&p, &a, &moved, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("재연결")
            .available
    );
    assert_eq!(
        f.store
            .read_asset(&p, &a, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("재읽기"),
        fs::read(&moved).expect("원본")
    );
    assert!(wrong.exists());
    assert!(moved.exists());
}
#[test]
fn cancellation_during_copy_leaves_no_asset_and_preserves_source() {
    let f = Fixture::new();
    let p = f.project();
    let cancel = AtomicBool::new(false);
    let result = f.store.import_asset(
        &p,
        &f.source,
        AssetKind::ScoreImport,
        AssetStorage::Managed,
        &cancel,
        |_, _| {
            cancel.store(true, Ordering::Release);
            Ok(())
        },
    );
    assert_eq!(result.err().expect("취소").code, "CANCELED");
    assert!(f.store.assets(&p).expect("목록").is_empty());
    assert!(f.source.exists());
    let assets = f.store.root.join(format!("projects/{p}/assets"));
    assert_eq!(fs::read_dir(assets).expect("임시 정리").count(), 0);
}
#[test]
fn revision_conflict_or_database_failure_keeps_previous_head_and_original() {
    let f = Fixture::new();
    let p = f.project();
    let a = f.asset(&p, AssetStorage::Managed);
    let first = f
        .store
        .save_revision(&p, 0, &a, score(), workspace(), &AtomicBool::new(false))
        .expect("첫 저장");
    assert_eq!(
        f.store
            .save_revision(&p, 0, &a, score(), workspace(), &AtomicBool::new(false))
            .err()
            .expect("충돌")
            .code,
        "REVISION_CONFLICT"
    );
    let db = connect(&f.store.root).expect("실패 fixture");
    db.execute_batch("CREATE TRIGGER fail_revision BEFORE INSERT ON score_revisions BEGIN SELECT RAISE(ABORT,'test failure'); END;").expect("강제 실패");
    drop(db);
    assert_eq!(
        f.store
            .save_revision(&p, 1, &a, score(), workspace(), &AtomicBool::new(false))
            .err()
            .expect("실패")
            .code,
        "STORAGE_ERROR"
    );
    let (summary, latest, _) = f.store.open(&p).expect("마지막 정상 revision");
    assert_eq!(summary.revision, 1);
    assert_eq!(latest.expect("복구").revision_id, first.revision_id);
    assert!(f.source.exists());
}
#[test]
fn malformed_score_wrong_project_assets_and_traversal_are_rejected() {
    let f = Fixture::new();
    let p = f.project();
    let other = f.project();
    let a = f.asset(&other, AssetStorage::Managed);
    assert!(f
        .store
        .save_revision(&p, 0, &a, score(), workspace(), &AtomicBool::new(false))
        .is_err());
    assert!(checked_directory(&f.store.root, Path::new("../escape")).is_err());
    assert!(f.store.open("../../escape").is_err());
    for condition in 0..7 {
        let mut document = score();
        match condition {
            0 => document.tracks[0].notes[0].track_id = "other".into(),
            1 => document.sync_anchors[1].audio_time_ms = 0.0,
            2 => document.tracks[0].notes[0].duration_ticks = 0,
            3 => document.tracks[0].notes[0].string_index = Some(7),
            4 => document.tempo_map[0].bpm = f64::NAN,
            5 => {
                let note = document.tracks[0].notes[0].clone();
                document.tracks[0].notes.push(note);
            }
            _ => document.schema_version = 2,
        }
        assert_eq!(
            document.validate().expect_err("잘못된 악보").code,
            "INVALID_INPUT"
        );
    }
}
#[test]
fn corrupted_revision_or_asset_hash_is_not_silently_loaded() {
    let f = Fixture::new();
    let p = f.project();
    let a = f.asset(&p, AssetStorage::Managed);
    let revision = f
        .store
        .save_revision(&p, 0, &a, score(), workspace(), &AtomicBool::new(false))
        .expect("저장");
    let path = f
        .store
        .root
        .join(format!("projects/{p}/scores/{}.json", revision.revision_id));
    fs::write(path, b"{}").expect("손상 fixture");
    assert_eq!(
        f.store.open(&p).err().expect("손상 차단").code,
        "STORAGE_ERROR"
    );
    let db = connect(&f.store.root).expect("DB");
    let relative: String = db
        .query_row(
            "SELECT relative_path FROM project_assets WHERE id=?1",
            [&a],
            |r| r.get(0),
        )
        .expect("파일");
    drop(db);
    let path = f.store.root.join(relative);
    let mut bytes = fs::read(&path).expect("bytes");
    bytes[2] ^= 1;
    fs::write(path, bytes).expect("같은 크기 변경");
    assert_eq!(
        f.store
            .read_asset(&p, &a, &AtomicBool::new(false), |_, _| Ok(()))
            .expect_err("hash 차단")
            .code,
        "ASSET_MISMATCH"
    );
}
#[test]
fn unsafe_managed_path_from_tampered_database_is_rejected() {
    let f = Fixture::new();
    let p = f.project();
    let a = f.asset(&p, AssetStorage::Managed);
    let db = connect(&f.store.root).expect("DB");
    db.execute(
        "UPDATE project_assets SET relative_path='../원본 악보.musicxml' WHERE id=?1",
        [&a],
    )
    .expect("변조 fixture");
    drop(db);
    assert_eq!(
        f.store.assets(&p).err().expect("경로 우회 차단").code,
        "STORAGE_ERROR"
    );
    assert!(f.source.exists());
}
#[test]
fn managed_asset_restore_keeps_damaged_copy_and_immutable_revision_readable() {
    let f = Fixture::new();
    let p = f.project();
    let a = f.asset(&p, AssetStorage::Managed);
    let revision = f
        .store
        .save_revision(&p, 0, &a, score(), workspace(), &AtomicBool::new(false))
        .expect("저장");
    let db = connect(&f.store.root).expect("DB");
    let old: String = db
        .query_row(
            "SELECT relative_path FROM project_assets WHERE id=?1",
            [&a],
            |r| r.get(0),
        )
        .expect("원본 위치");
    drop(db);
    let damaged = f.store.root.join(&old);
    fs::write(&damaged, b"damaged").expect("손상 fixture");
    let restored = f
        .store
        .relink(&p, &a, &f.source, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("새 파일 복구");
    assert!(restored.available);
    assert_eq!(fs::read(&damaged).expect("이전 파일 보존"), b"damaged");
    assert_eq!(
        f.store
            .read_asset(&p, &a, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("복구 읽기"),
        fs::read(&f.source).expect("승인 원본")
    );
    assert_eq!(
        f.store
            .open(&p)
            .expect("기존 revision")
            .1
            .expect("악보")
            .revision_id,
        revision.revision_id
    );
    let db = connect(&f.store.root).expect("DB");
    let new: String = db
        .query_row(
            "SELECT relative_path FROM project_assets WHERE id=?1",
            [&a],
            |r| r.get(0),
        )
        .expect("새 위치");
    drop(db);
    assert_ne!(old, new);
    fs::remove_file(f.store.root.join(new)).expect("복구본 누락 fixture");
    assert!(
        f.store
            .relink(&p, &a, &f.source, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("다시 복구")
            .available
    );
    assert_eq!(fs::read(damaged).expect("이전 파일 보존"), b"damaged");
}
#[cfg(unix)]
#[test]
fn managed_directory_symlink_cannot_escape_app_root() {
    let f = Fixture::new();
    std::os::unix::fs::symlink(&f.root, f.store.root.join("projects")).expect("symlink fixture");
    assert!(checked_directory(&f.store.root, Path::new("projects/escape")).is_err());
}
#[cfg(windows)]
#[test]
fn windows_junction_cannot_escape_app_directory_or_change_original() {
    let f = Fixture::new();
    let outside = f.root.join("외부 폴더");
    fs::create_dir(&outside).expect("자체 외부 fixture");
    let marker = outside.join("원본.txt");
    fs::write(&marker, b"keep original").expect("보존 fixture");
    let link = f.store.root.join("projects");
    assert_eq!(link.parent(), Some(f.store.root.as_path()));
    assert!(outside.starts_with(&f.root));
    let result=std::process::Command::new("pwsh").args(["-NoProfile","-NonInteractive","-Command","New-Item -ItemType Junction -Path $env:GUITARLAB_TEST_LINK -Target $env:GUITARLAB_TEST_TARGET -ErrorAction Stop | Out-Null"])
        .env("GUITARLAB_TEST_LINK",&link).env("GUITARLAB_TEST_TARGET",&outside).output().expect("Windows junction 생성");
    assert!(result.status.success(), "자체 fixture junction 생성 실패");
    let blocked = checked_directory(&f.store.root, Path::new("projects/escape")).is_err();
    let cleanup = std::process::Command::new("pwsh")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Remove-Item -LiteralPath $env:GUITARLAB_TEST_LINK -Force -ErrorAction Stop",
        ])
        .env("GUITARLAB_TEST_LINK", &link)
        .output()
        .expect("junction 자체 정리");
    assert!(cleanup.status.success(), "자체 junction 정리 실패");
    assert!(blocked);
    assert_eq!(fs::read(marker).expect("원본 보존"), b"keep original");
    assert!(!outside.join("escape").exists());
}

#[test]
fn guitar_selection_roles_and_legacy_revision_reopen_without_changing_notes() {
    use crate::{
        judgement::practice::PracticeTarget, storage::practice_records::PracticeArchiveRequest,
    };
    let fixture = Fixture::new();
    let project = fixture.project();
    let asset = fixture.asset(&project, AssetStorage::Managed);
    let mut document = score();
    let mut second = document.tracks[0].clone();
    second.id = "track-1".into();
    second.name = "Guitar 2".into();
    second.notes[0].id = "note-1".into();
    second.notes[0].track_id = second.id.clone();
    second.notes[0].pitch_midi = 40;
    second.notes[0].string_index = Some(6);
    second.notes[0].fret = Some(0);
    document.tracks.push(second);
    let legacy = fixture
        .store
        .save_revision(
            &project,
            0,
            &asset,
            document.clone(),
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("이전 형식 저장");
    let notes = serde_json::to_value(&document.tracks[0].notes).expect("원본 음표");
    document.tracks[0].instrument = Some(ScoreInstrument::Guitar);
    document.tracks[0].role = Some(GuitarPartRole::Lead);
    document.tracks[1].instrument = Some(ScoreInstrument::Guitar);
    document.tracks[1].role = Some(GuitarPartRole::Rhythm);
    let mut selected = workspace();
    selected.active_track_index = 1;
    selected.active_performance_track_id = Some("track-1".into());
    let saved = fixture
        .store
        .save_revision(
            &project,
            1,
            &asset,
            document,
            selected,
            &AtomicBool::new(false),
        )
        .expect("두 번째 기타 선택 저장");
    let reopened = ProjectStore::new(fixture.store.root.clone());
    reopened.initialize().expect("재열기");
    let restored = reopened.open(&project).expect("프로젝트").1.expect("악보");
    assert_eq!(restored.workspace.active_track_index, 1);
    assert_eq!(
        restored.workspace.active_performance_track_id.as_deref(),
        Some("track-1")
    );
    assert_eq!(restored.score.tracks[1].role, Some(GuitarPartRole::Rhythm));
    assert_eq!(
        serde_json::to_value(&restored.score.tracks[0].notes).expect("불변 음표"),
        notes
    );
    assert!(reopened
        .revision(&project, &legacy.revision_id)
        .expect("이전 revision")
        .score
        .tracks[0]
        .role
        .is_none());
    let context = PracticeArchiveRequest {
        project_id: project.clone(),
        session_id: Uuid::new_v4().to_string(),
        range_start_ms: 0.0,
        range_end_ms: 2000.0,
    };
    let rhythm = PracticeTarget {
        unsupported: false,
        id: "note-1".into(),
        song_time_ms: 500.0,
        pitch_midi: 40,
    };
    assert!(reopened
        .prepare_archive(context.clone(), &saved.revision_id, "track-1", &[rhythm])
        .is_ok());
    let lead = PracticeTarget {
        unsupported: false,
        id: "note-0".into(),
        song_time_ms: 500.0,
        pitch_midi: 67,
    };
    assert!(reopened
        .prepare_archive(context, &saved.revision_id, "track-1", &[lead])
        .is_err());
}

#[test]
fn guitar_metadata_and_selected_identity_reject_invalid_contracts() {
    let document = score();
    let mut selected = workspace();
    for id in ["missing", "track-1"] {
        selected.active_performance_track_id = Some(id.into());
        assert!(selected.validate(&document).is_err());
    }
    let mut value = serde_json::to_value(&document).expect("이전 형식");
    assert!(serde_json::from_value::<ScoreDocument>(value.clone()).is_ok());
    for role in [
        serde_json::json!("AUTOMATIC_LEAD"),
        serde_json::Value::Null,
        serde_json::json!(1),
    ] {
        value["tracks"][0]["role"] = role;
        assert!(serde_json::from_value::<ScoreDocument>(value.clone()).is_err());
    }
    let mut workspace_value = serde_json::to_value(workspace()).expect("이전 workspace");
    workspace_value["activePerformanceTrackId"] = serde_json::Value::Null;
    assert!(serde_json::from_value::<WorkspaceState>(workspace_value).is_err());
}

#[test]
fn unsupported_technique_metadata_reopens_without_rewriting_legacy_and_binds_targets() {
    use crate::{
        judgement::practice::PracticeTarget, storage::practice_records::PracticeArchiveRequest,
    };
    let fixture = Fixture::new();
    let project = fixture.project();
    let asset = fixture.asset(&project, AssetStorage::Managed);
    let legacy = fixture
        .store
        .save_revision(
            &project,
            0,
            &asset,
            score(),
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("이전 revision");
    let mut document = score();
    document.tracks[0].notes[0].judgement_support = Some(JudgementSupport::Unsupported);
    let saved = fixture
        .store
        .save_revision(
            &project,
            1,
            &asset,
            document,
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("보호 revision");
    let reopened = ProjectStore::new(fixture.store.root.clone());
    reopened.initialize().expect("재실행");
    let restored = reopened.open(&project).expect("프로젝트").1.expect("악보");
    assert_eq!(
        restored.score.tracks[0].notes[0].judgement_support,
        Some(JudgementSupport::Unsupported)
    );
    assert!(reopened
        .revision(&project, &legacy.revision_id)
        .expect("이전 보존")
        .score
        .tracks[0]
        .notes[0]
        .judgement_support
        .is_none());
    let context = PracticeArchiveRequest {
        project_id: project.clone(),
        session_id: Uuid::new_v4().to_string(),
        range_start_ms: 0.0,
        range_end_ms: 2000.0,
    };
    let mut target = PracticeTarget {
        unsupported: true,
        id: "note-0".into(),
        song_time_ms: 500.0,
        pitch_midi: 67,
    };
    assert!(reopened
        .prepare_archive(
            context.clone(),
            &saved.revision_id,
            "track-0",
            &[target.clone()]
        )
        .is_ok());
    target.unsupported = false;
    assert!(reopened
        .prepare_archive(
            context.clone(),
            &saved.revision_id,
            "track-0",
            &[target.clone()]
        )
        .is_err());
    assert!(reopened
        .prepare_archive(
            context.clone(),
            &legacy.revision_id,
            "track-0",
            &[target.clone()]
        )
        .is_ok());
    target.unsupported = true;
    assert!(reopened
        .prepare_archive(context, &legacy.revision_id, "track-0", &[target])
        .is_err());
    let base = serde_json::to_value(score()).expect("기존 형식");
    for invalid in [
        serde_json::Value::Null,
        serde_json::json!(false),
        serde_json::json!("SUPPORTED"),
        serde_json::json!(["UNSUPPORTED"]),
    ] {
        let mut value = base.clone();
        value["tracks"][0]["notes"][0]["judgementSupport"] = invalid;
        assert!(serde_json::from_value::<ScoreDocument>(value).is_err());
    }
    for value in [
        serde_json::json!(null),
        serde_json::json!("true"),
        serde_json::json!([true]),
    ] {
        assert!(serde_json::from_value::<PracticeTarget>(
            serde_json::json!({"id":"n","songTimeMs":0.0,"pitchMidi":64,"unsupported":value})
        )
        .is_err());
    }
    assert!(
        !serde_json::from_value::<PracticeTarget>(
            serde_json::json!({"id":"n","songTimeMs":0.0,"pitchMidi":64})
        )
        .expect("이전 목표")
        .unsupported
    );
}
