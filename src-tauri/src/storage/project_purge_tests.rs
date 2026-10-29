use super::{
    database::connect,
    project_model::{AssetKind, AssetStorage},
    project_purge::{PurgeConfirmation, PurgePlan},
    projects::ProjectStore,
    projects_tests::{score, workspace, Fixture},
};
use std::{
    fs,
    sync::atomic::{AtomicBool, Ordering},
};

fn prepare(f: &Fixture, id: &str) -> PurgePlan {
    let no = AtomicBool::new(false);
    let revision = f.store.open(id).expect("자체 프로젝트").0.revision;
    let entry = f.store.trash_project(id, revision, &no).expect("보관");
    f.store
        .prepare_project_purge(id, &entry.trash_id, &no, |_, _| Ok(()))
        .expect("삭제 계획")
}
fn purge(
    f: &Fixture,
    plan: &PurgePlan,
) -> Result<super::project_purge::PurgedProject, crate::ipc::AppError> {
    f.store
        .purge_project(confirmation(plan), &AtomicBool::new(false), |_, _| Ok(()))
}
fn confirmation(plan: &PurgePlan) -> PurgeConfirmation<'_> {
    PurgeConfirmation {
        project_id: &plan.project_id,
        trash_id: &plan.trash_id,
        fingerprint: &plan.fingerprint,
        confirmed_title: &plan.title,
        consent: true,
    }
}
#[test]
fn deletes_only_confirmed_archived_project_and_preserves_other_project_and_external_original() {
    let f = Fixture::new();
    let id = f.project();
    let other = f.project();
    let asset = f.asset(&id, AssetStorage::Managed);
    let external = f
        .store
        .root
        .parent()
        .expect("자체 상위")
        .join("별도 원본.musicxml");
    fs::write(
        &external,
        b"<?xml version=\"1.0\"?><score-partwise> </score-partwise>",
    )
    .expect("자체 외부 원본");
    f.store
        .import_asset(
            &id,
            &external,
            AssetKind::ScoreImport,
            AssetStorage::Reference,
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("별도 참조");
    let external_before = fs::read(&external).expect("참조 원문");
    let other_asset = f.asset(&other, AssetStorage::Managed);
    f.store
        .save_revision(
            &id,
            0,
            &asset,
            score(),
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("악보");
    let outside = f
        .store
        .root
        .parent()
        .expect("자체 상위")
        .join("원본 악보.musicxml");
    let original = fs::read(&outside).expect("원본");
    let other_bytes = f
        .store
        .read_asset(&other, &other_asset, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("다른 자료");
    let plan = prepare(&f, &id);
    assert!(!plan.purge_started);
    assert!(plan.files >= 2);
    assert_eq!(plan.external_references, 1);
    assert_eq!(f.store.trashed_projects().expect("보관").len(), 1);
    let result = purge(&f, &plan).expect("영구 삭제");
    assert_eq!(
        (result.files, result.logical_bytes),
        (plan.files, plan.logical_bytes)
    );
    assert!(!f.store.root.join("projects").join(&id).exists());
    assert!(f.store.trashed_projects().expect("빈 휴지통").is_empty());
    assert_eq!(f.store.list().expect("일반 프로젝트").len(), 1);
    assert_eq!(fs::read(&outside).expect("원본 보존"), original);
    assert_eq!(
        fs::read(&external).expect("참조 원문 보존"),
        external_before
    );
    assert_eq!(
        f.store
            .read_asset(&other, &other_asset, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("다른 자료 보존"),
        other_bytes
    );
    let db = connect(&f.store.root).expect("DB");
    assert_eq!(
        db.query_row("PRAGMA foreign_key_check", [], |_| Ok(()))
            .optional()
            .expect("FK"),
        None
    );
    assert_eq!(
        db.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
            .expect("무결성"),
        "ok"
    );
}
use rusqlite::OptionalExtension;
#[test]
fn unarchived_wrong_title_no_consent_and_changed_plan_preserve_files_and_marker() {
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, AssetStorage::Managed);
    let no = AtomicBool::new(false);
    assert!(f
        .store
        .prepare_project_purge(&id, &uuid::Uuid::new_v4().to_string(), &no, |_, _| Ok(()))
        .is_err());
    let plan = prepare(&f, &id);
    for (title, consent, fingerprint) in [
        ("다른 제목", true, plan.fingerprint.clone()),
        (plan.title.as_str(), false, plan.fingerprint.clone()),
        (plan.title.as_str(), true, "0".repeat(64)),
    ] {
        assert!(f
            .store
            .purge_project(
                PurgeConfirmation {
                    fingerprint: &fingerprint,
                    confirmed_title: title,
                    consent,
                    ..confirmation(&plan)
                },
                &no,
                |_, _| Ok(())
            )
            .is_err());
    }
    let folder = f.store.root.join("projects").join(&id);
    fs::write(folder.join("new-file"), b"keep").expect("변경");
    assert_eq!(
        purge(&f, &plan).expect_err("오래된 계획").code,
        "PROJECT_PURGE_CHANGED"
    );
    assert_eq!(fs::read(folder.join("new-file")).expect("보존"), b"keep");
    assert_eq!(
        f.store.trashed_projects().expect("보관 유지")[0].purge_started,
        None
    );
    f.store
        .restore_trashed_project(&id, &plan.trash_id, &no)
        .expect("시작 전 복원 가능");
}
#[test]
fn interruption_persists_intent_blocks_restore_and_requires_new_confirmation_after_restart() {
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, AssetStorage::Managed);
    let folder = f.store.root.join("projects").join(&id);
    fs::write(folder.join("remaining.bin"), b"remaining").expect("자체 파일");
    let plan = prepare(&f, &id);
    let cancel = AtomicBool::new(false);
    let outcome = f
        .store
        .purge_project(confirmation(&plan), &cancel, |done, _| {
            if done > 0 {
                cancel.store(true, Ordering::Release);
            }
            Ok(())
        });
    assert_eq!(outcome.expect_err("중간 취소").code, "CANCELED");
    let reopened = ProjectStore::new(f.store.root.clone());
    reopened.initialize().expect("재시작은 삭제하지 않음");
    assert_eq!(
        reopened.trashed_projects().expect("진행 기록")[0].purge_started,
        Some(true)
    );
    assert_eq!(
        reopened
            .restore_trashed_project(&id, &plan.trash_id, &AtomicBool::new(false))
            .err()
            .expect("부분 삭제 복원 차단")
            .code,
        "PROJECT_PURGE_IN_PROGRESS"
    );
    assert!(purge(&f, &plan).is_err());
    let next = reopened
        .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("남은 계획");
    assert!(next.purge_started);
    assert!(next.files < plan.files);
    reopened
        .purge_project(confirmation(&next), &AtomicBool::new(false), |_, _| Ok(()))
        .expect("새 확인 뒤 완료");
    assert!(reopened.trashed_projects().expect("목록").is_empty());
}
#[test]
fn reference_to_candidate_folder_and_database_trigger_refuse_before_deleting_anything() {
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, AssetStorage::Managed);
    let plan = prepare(&f, &id);
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("CREATE TRIGGER refuse_purge BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT,'test'); END;").expect("자체 실패 주입");
    assert_eq!(
        purge(&f, &plan).expect_err("trigger 차단").code,
        "PROJECT_PURGE_UNAVAILABLE"
    );
    assert_eq!(
        f.store.trashed_projects().expect("시작 전")[0].purge_started,
        None
    );
    db.execute_batch("DROP TRIGGER refuse_purge")
        .expect("자체 주입 해제");
    let other = f.project();
    let reference = f.asset(&other, AssetStorage::Reference);
    let target = fs::read_dir(f.store.root.join("projects").join(&id).join("assets"))
        .expect("자체 자산")
        .next()
        .expect("항목")
        .expect("경로")
        .path()
        .canonicalize()
        .expect("정규 경로");
    db.execute(
        "UPDATE project_assets SET external_path=?1 WHERE id=?2",
        rusqlite::params![target.to_str().expect("UTF8"), reference],
    )
    .expect("참조 주입");
    assert_eq!(
        purge(&f, &plan).expect_err("참조 보존").code,
        "PROJECT_PURGE_REFERENCED"
    );
    assert!(target.is_file());
}
#[test]
fn cancellation_before_start_and_empty_project_never_leave_a_false_partial_state() {
    let f = Fixture::new();
    let id = f.project();
    let plan = prepare(&f, &id);
    assert_eq!(plan.files, 0);
    assert_eq!(
        f.store
            .purge_project(confirmation(&plan), &AtomicBool::new(true), |_, _| Ok(()))
            .expect_err("처음 취소")
            .code,
        "CANCELED"
    );
    assert_eq!(
        f.store.trashed_projects().expect("marker 유지")[0].purge_started,
        None
    );
    purge(&f, &plan).expect("빈 프로젝트 삭제");
    assert!(f.store.trashed_projects().expect("빈 목록").is_empty());
}

#[test]
fn complete_foreign_key_graph_is_removed_and_other_project_rows_are_byte_identical() {
    use rusqlite::{params, types::Value, Connection};
    fn seed(f: &Fixture, id: &str) -> Vec<String> {
        let asset = f.asset(id, AssetStorage::Managed);
        let saved = f
            .store
            .save_revision(id, 0, &asset, score(), workspace(), &AtomicBool::new(false))
            .expect("저장");
        let ids: Vec<String> = (0..7).map(|_| uuid::Uuid::new_v4().to_string()).collect();
        let db = connect(&f.store.root).expect("자체 관계 DB");
        let hash = "0".repeat(64);
        db.execute("INSERT INTO practice_sessions VALUES(?1,?2,?3,'track-0','{}',?4,'test',0,1,'FINISHED')", params![ids[0], id, saved.revision_id, hash]).expect("session FK");
        db.execute(
            "INSERT INTO practice_attempts VALUES(?1,?2,1,'FINISHED','{}',?3,1,0,1,NULL)",
            params![ids[1], ids[0], hash],
        )
        .expect("attempt FK");
        db.execute(
            "INSERT INTO judgement_events VALUES(?1,1,'n',0,'{}',?2)",
            params![ids[1], hash],
        )
        .expect("event FK");
        db.execute(
            "INSERT INTO recorded_takes VALUES(?1,?2,?3,'READY','{}',?4,0)",
            params![ids[2], id, saved.revision_id, hash],
        )
        .expect("take FK");
        db.execute(
            "INSERT INTO project_mixes VALUES(?1,'{}',?2)",
            params![id, hash],
        )
        .expect("mix FK");
        db.execute("INSERT INTO ai_transcription_drafts(id,project_id,asset_id,context_json,context_sha256,result_json,result_sha256) VALUES(?1,?2,?3,'{}',?4,'{}',?4)", params![ids[3], id, asset, hash]).expect("draft FK");
        db.execute("INSERT INTO audio_stem_sets(id,project_id,asset_id,metadata_json,metadata_sha256) VALUES(?1,?2,?3,'{}',?4)", params![ids[4], id, asset, hash]).expect("stem set FK");
        db.execute(
            "INSERT INTO audio_stems VALUES(?1,?2,?3,'GUITAR_FULL',?4,45)",
            params![ids[5], id, ids[4], hash],
        )
        .expect("stem FK");
        db.execute(
            "INSERT INTO project_backings VALUES(?1,'YOUTUBE_EMBED','abcdefghijk',1,0)",
            [id],
        )
        .expect("backing FK");
        db.execute(
            "INSERT INTO project_youtube_syncs VALUES(?1,?2,'abcdefghijk','track-0','{}',?3,0)",
            params![id, saved.revision_id, hash],
        )
        .expect("sync FK");
        db.execute(
            "INSERT INTO imported_guitar_stems VALUES(?1,?2,'USER_IMPORTED','{}',?3)",
            params![ids[6], id, hash],
        )
        .expect("imported FK");
        [vec![id.into(), asset, saved.revision_id], ids].concat()
    }
    let f = Fixture::new();
    let id = f.project();
    let other = f.project();
    let victim_ids = seed(&f, &id);
    seed(&f, &other);
    let db: Connection = connect(&f.store.root).expect("DB");
    let expected = super::project_trash_tests::rows(&db)
        .into_iter()
        .map(|(table, rows)| {
            (
                table,
                rows.into_iter()
                    .filter(|row| {
                        !row.iter()
                            .any(|v| matches!(v, Value::Text(text) if victim_ids.contains(text)))
                    })
                    .collect(),
            )
        })
        .collect();
    let plan = prepare(&f, &id);
    db.execute(
        "UPDATE practice_sessions SET status='RUNNING' WHERE project_id=?1",
        [&other],
    )
    .expect("다른 프로젝트 연습");
    assert_eq!(
        purge(&f, &plan).expect_err("전역 연습 보호").code,
        "PROJECT_IN_USE"
    );
    assert_eq!(
        f.store.trashed_projects().expect("미시작")[0].purge_started,
        None
    );
    db.execute(
        "UPDATE practice_sessions SET status='FINISHED' WHERE project_id=?1",
        [&other],
    )
    .expect("자체 연습 종료");
    purge(&f, &plan).expect("모든 관계 삭제");
    assert_eq!(super::project_trash_tests::rows(&db), expected);
    assert_eq!(f.store.list().expect("다른 프로젝트")[0].id, other);
}

#[test]
fn version_nine_migration_preserves_trash_and_never_starts_deletion() {
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, AssetStorage::Managed);
    let plan = prepare(&f, &id);
    let db = connect(&f.store.root).expect("DB");
    let rows = super::project_trash_tests::rows(&db);
    db.execute_batch("DROP TABLE project_purge_intents; PRAGMA user_version=9")
        .expect("자체 이전 DB");
    drop(db);
    let db = connect(&f.store.root).expect("마이그레이션");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
            .expect("버전"),
        10
    );
    assert_eq!(super::project_trash_tests::rows(&db), rows);
    let current = f.store.trashed_projects().expect("보관 유지");
    assert_eq!(current[0].trash_id, plan.trash_id);
    assert_eq!(current[0].purge_started, None);
    assert_eq!(
        f.store
            .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| Ok(()))
            .expect("유지된 파일")
            .files,
        plan.files
    );
}

#[test]
fn file_changed_after_start_is_preserved_and_new_review_is_required() {
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, AssetStorage::Managed);
    let plan = prepare(&f, &id);
    let path = fs::read_dir(f.store.root.join("projects").join(&id).join("assets"))
        .expect("자체 자산")
        .next()
        .expect("항목")
        .expect("경로")
        .path();
    let mut injected = false;
    let result = f
        .store
        .purge_project(confirmation(&plan), &AtomicBool::new(false), |done, _| {
            if !injected && done == 0 {
                injected = true;
                fs::write(&path, b"changed after durable intent").expect("변경 주입");
            }
            Ok(())
        });
    assert_eq!(result.expect_err("변경 차단").code, "PROJECT_PURGE_CHANGED");
    assert_eq!(
        fs::read(&path).expect("새 내용 보존"),
        b"changed after durable intent"
    );
    assert_eq!(
        f.store.trashed_projects().expect("중단 기록")[0].purge_started,
        Some(true)
    );
    let next = f
        .store
        .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("새 계획");
    assert_ne!(next.fingerprint, plan.fingerprint);
    purge(&f, &next).expect("새 동의 뒤 완료");
}

#[test]
fn storage_failure_after_a_deleted_file_reports_incomplete_state_without_preservation_claim() {
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, AssetStorage::Managed);
    let folder = f.store.root.join("projects").join(&id);
    fs::write(folder.join("remaining.bin"), b"remaining").expect("자체 추가 파일");
    let plan = prepare(&f, &id);
    let error = f
        .store
        .purge_project(confirmation(&plan), &AtomicBool::new(false), |done, _| {
            if done > 0 {
                Err(super::project_model::storage_error())
            } else {
                Ok(())
            }
        })
        .expect_err("삭제 후 실패");
    assert_eq!(error.code, "PROJECT_PURGE_UNAVAILABLE");
    assert!(!error.message.contains("보존"));
    let next = f
        .store
        .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| Ok(()))
        .expect("남은 상태");
    assert!(next.purge_started);
    assert!(next.files < plan.files);
    purge(&f, &next).expect("재확인 후 완료");
}

#[test]
fn scan_depth_and_entry_limits_refuse_before_creating_a_purge_intent() {
    let f = Fixture::new();
    let id = f.project();
    let plan = prepare(&f, &id);
    let root = f.store.root.join("projects").join(&id);
    fs::create_dir_all(&root).expect("자체 폴더");
    let mut depth = root.clone();
    let mut folders = Vec::new();
    for _ in 0..17 {
        depth.push("d");
        fs::create_dir(&depth).expect("깊이 경계");
        folders.push(depth.clone());
    }
    assert_eq!(
        f.store
            .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| Ok(()))
            .expect_err("깊이 초과")
            .code,
        "PROJECT_PURGE_UNAVAILABLE"
    );
    for path in folders.into_iter().rev() {
        fs::remove_dir(path).expect("자체 빈 폴더 정리");
    }
    for index in 0..10001 {
        fs::File::create(root.join(index.to_string())).expect("개수 경계");
    }
    assert_eq!(
        f.store
            .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| Ok(()))
            .expect_err("개수 초과")
            .code,
        "PROJECT_PURGE_UNAVAILABLE"
    );
    assert_eq!(
        f.store.trashed_projects().expect("시작 안 함")[0].purge_started,
        None
    );
}

#[cfg(windows)]
#[test]
fn locked_file_failure_preserves_intent_and_parent_handles_block_directory_replacement() {
    use std::fs::OpenOptions;
    use std::os::windows::fs::OpenOptionsExt;
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, AssetStorage::Managed);
    let plan = prepare(&f, &id);
    let folder = f.store.root.join("projects").join(&id);
    let path = fs::read_dir(folder.join("assets"))
        .expect("자체 폴더")
        .next()
        .expect("파일")
        .expect("경로")
        .path();
    let held = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .expect("자체 파일 잠금");
    assert_eq!(
        purge(&f, &plan).expect_err("파일 잠금").code,
        "PROJECT_PURGE_UNAVAILABLE"
    );
    assert!(path.is_file());
    assert_eq!(
        f.store.trashed_projects().expect("기록")[0].purge_started,
        Some(true)
    );
    drop(held);
    let mut attempted = false;
    let next = f
        .store
        .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| {
            if !attempted {
                attempted = true;
                assert!(fs::rename(&folder, folder.with_extension("moved")).is_err());
            }
            Ok(())
        })
        .expect("부모 교체 차단/다시 확인");
    assert!(attempted);
    purge(&f, &next).expect("재확인 뒤 완료");
}

#[cfg(windows)]
#[test]
fn project_junction_is_rejected_and_target_files_are_never_followed() {
    let f = Fixture::new();
    let id = f.project();
    let plan = prepare(&f, &id);
    let folder = f.store.root.join("projects").join(&id);
    fs::create_dir_all(&folder).expect("자체 폴더");
    let outside = f.store.root.join("outside");
    fs::create_dir(&outside).expect("자체 대상");
    fs::write(outside.join("keep"), b"keep").expect("보존 대상");
    let link = folder.join("link");
    let created = std::process::Command::new("pwsh").args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:GUITARLAB_TEST_LINK -Target $env:GUITARLAB_TEST_TARGET -ErrorAction Stop | Out-Null"])
        .env("GUITARLAB_TEST_LINK", &link).env("GUITARLAB_TEST_TARGET", &outside).output().expect("자체 junction");
    assert!(created.status.success());
    let result =
        f.store
            .prepare_project_purge(&id, &plan.trash_id, &AtomicBool::new(false), |_, _| Ok(()));
    fs::remove_dir(&link).expect("자체 링크만 정리");
    assert_eq!(
        result.expect_err("연결 거부").code,
        "PROJECT_PURGE_UNAVAILABLE"
    );
    assert_eq!(fs::read(outside.join("keep")).expect("외부 보존"), b"keep");
    assert_eq!(
        f.store.trashed_projects().expect("시작 안 함")[0].purge_started,
        None
    );
}
