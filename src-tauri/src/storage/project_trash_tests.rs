use super::{
    database::connect,
    project_model::AssetStorage,
    projects::ProjectStore,
    projects_tests::{score, workspace, Fixture},
};
use rusqlite::{params, types::Value, Connection};
use std::{collections::BTreeMap, fs, sync::atomic::AtomicBool};
use uuid::Uuid;

fn rows(db: &Connection) -> BTreeMap<String, Vec<Vec<Value>>> {
    let names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'project_trash' ORDER BY name").expect("테이블")
        .query_map([], |row| row.get::<_, String>(0)).expect("목록").collect::<rusqlite::Result<Vec<_>>>().expect("이름");
    names
        .into_iter()
        .map(|name| {
            let quoted = name.replace('"', "\"\"");
            let mut query = db
                .prepare(&format!("SELECT * FROM \"{quoted}\" ORDER BY rowid"))
                .expect("자체 테이블");
            let columns = query.column_count();
            let values = query
                .query_map([], |row| {
                    (0..columns)
                        .map(|i| row.get::<_, Value>(i))
                        .collect::<rusqlite::Result<Vec<_>>>()
                })
                .expect("행")
                .collect::<rusqlite::Result<Vec<_>>>()
                .expect("내용");
            (name, values)
        })
        .collect()
}
#[test]
fn archive_restore_preserves_all_original_rows_revision_assets_and_source_files() {
    let f = Fixture::new();
    let project = f.project();
    let other = f.project();
    let asset = f.asset(&project, AssetStorage::Managed);
    f.asset(&other, AssetStorage::Reference);
    let cancel = AtomicBool::new(false);
    let saved = f
        .store
        .save_revision(&project, 0, &asset, score(), workspace(), &cancel)
        .expect("원래 악보");
    let before = rows(&connect(&f.store.root).expect("DB"));
    let bytes = f
        .store
        .read_asset(&project, &asset, &cancel, |_, _| Ok(()))
        .expect("원본");
    let path = f
        .store
        .root
        .join(format!("projects/{project}/assets/{asset}.musicxml"));
    let source = f
        .store
        .root
        .parent()
        .expect("자체 상위")
        .join("원본 악보.musicxml");
    let source_before = fs::read(&source).expect("외부 참조");
    let entry = f.store.trash_project(&project, 1, &cancel).expect("보관");
    assert_eq!(entry.project.id, project);
    assert_eq!(entry.project.revision, 1);
    assert_eq!(f.store.list().expect("일반 목록").len(), 1);
    assert_eq!(f.store.list().expect("일반 목록")[0].id, other);
    assert_eq!(
        f.store.open(&project).err().expect("조회 차단").code,
        "PROJECT_IN_TRASH"
    );
    assert_eq!(
        f.store.assets(&project).err().expect("자산 차단").code,
        "PROJECT_IN_TRASH"
    );
    assert_eq!(
        f.store
            .read_asset(&project, &asset, &cancel, |_, _| Ok(()))
            .expect_err("읽기 차단")
            .code,
        "PROJECT_IN_TRASH"
    );
    assert_eq!(
        f.store
            .revision(&project, &saved.revision_id)
            .err()
            .expect("리비전 차단")
            .code,
        "PROJECT_IN_TRASH"
    );
    assert_eq!(
        f.store
            .recordings(&project)
            .err()
            .expect("테이크 차단")
            .code,
        "PROJECT_IN_TRASH"
    );
    assert_eq!(rows(&connect(&f.store.root).expect("DB")), before);
    assert_eq!(fs::read(&path).expect("관리 원본 보존"), bytes);
    assert_eq!(fs::read(&source).expect("참조 원본 보존"), source_before);
    let reopened = ProjectStore::new(f.store.root.clone());
    assert_eq!(
        reopened.trashed_projects().expect("재열기")[0].trash_id,
        entry.trash_id
    );
    let restored = reopened
        .restore_trashed_project(&project, &entry.trash_id, &cancel)
        .expect("복원");
    assert_eq!(
        serde_json::to_value(restored).expect("복원 값"),
        serde_json::to_value(entry.project).expect("원래 값")
    );
    assert_eq!(f.store.list().expect("복원 목록").len(), 2);
    assert_eq!(f.store.open(&project).expect("다시 열기").0.revision, 1);
    assert_eq!(rows(&connect(&f.store.root).expect("DB")), before);
}
#[test]
fn version_eight_migration_only_adds_empty_trash_and_keeps_all_previous_rows() {
    let f = Fixture::new();
    let project = f.project();
    f.asset(&project, AssetStorage::Managed);
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("DROP TABLE project_trash; PRAGMA user_version=8;")
        .expect("자체 v8");
    let before = rows(&db);
    drop(db);
    let db = connect(&f.store.root).expect("v9 마이그레이션");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
            .expect("버전"),
        9
    );
    assert_eq!(rows(&db), before);
    assert!(f.store.trashed_projects().expect("빈 휴지통").is_empty());
    assert_eq!(
        db.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
            .expect("무결성"),
        "ok"
    );
}
#[test]
fn cancellation_conflict_and_transaction_failures_preserve_previous_state() {
    let f = Fixture::new();
    let project = f.project();
    let no = AtomicBool::new(false);
    let canceled = AtomicBool::new(true);
    assert_eq!(
        f.store
            .trash_project(&project, 0, &canceled)
            .err()
            .expect("취소")
            .code,
        "CANCELED"
    );
    assert_eq!(
        f.store
            .trash_project(&project, 1, &no)
            .err()
            .expect("충돌")
            .code,
        "REVISION_CONFLICT"
    );
    assert_eq!(
        f.store
            .trash_project("../outside", 0, &no)
            .err()
            .expect("경로 거부")
            .code,
        "INVALID_INPUT"
    );
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("CREATE TRIGGER fail_trash BEFORE INSERT ON project_trash BEGIN SELECT RAISE(ABORT,'fixture'); END;").expect("실패 주입");
    assert!(f.store.trash_project(&project, 0, &no).is_err());
    assert!(f.store.trashed_projects().expect("보존").is_empty());
    db.execute_batch("DROP TRIGGER fail_trash;").expect("해제");
    let entry = f.store.trash_project(&project, 0, &no).expect("보관");
    assert_eq!(
        f.store
            .restore_trashed_project(&project, &entry.trash_id, &canceled)
            .err()
            .expect("복원 취소")
            .code,
        "CANCELED"
    );
    db.execute_batch("CREATE TRIGGER fail_restore BEFORE DELETE ON project_trash BEGIN SELECT RAISE(ABORT,'fixture'); END;").expect("실패 주입");
    assert!(f
        .store
        .restore_trashed_project(&project, &entry.trash_id, &no)
        .is_err());
    assert_eq!(
        f.store.trashed_projects().expect("보관 유지")[0].trash_id,
        entry.trash_id
    );
}
#[test]
fn stale_restore_and_tampered_revision_are_refused_and_equal_times_have_fixed_order() {
    let f = Fixture::new();
    let a = f.project();
    let b = f.project();
    let no = AtomicBool::new(false);
    let first = f.store.trash_project(&a, 0, &no).expect("첫 보관");
    f.store.trash_project(&b, 0, &no).expect("둘째 보관");
    let db = connect(&f.store.root).expect("DB");
    db.execute("UPDATE project_trash SET trashed_at_ms=42", [])
        .expect("동일 시각");
    let mut sorted = vec![a.clone(), b.clone()];
    sorted.sort();
    assert_eq!(
        f.store
            .trashed_projects()
            .expect("정렬")
            .into_iter()
            .map(|e| e.project.id)
            .collect::<Vec<_>>(),
        sorted
    );
    f.store
        .restore_trashed_project(&a, &first.trash_id, &no)
        .expect("복원");
    let second = f.store.trash_project(&a, 0, &no).expect("다시 보관");
    assert_ne!(first.trash_id, second.trash_id);
    assert_eq!(
        f.store
            .restore_trashed_project(&a, &first.trash_id, &no)
            .err()
            .expect("이전 UUID")
            .code,
        "PROJECT_TRASH_CHANGED"
    );
    db.execute("UPDATE projects SET revision=1 WHERE id=?1", [&a])
        .expect("외부 변경 주입");
    assert!(f.store.trashed_projects().is_err());
    assert_eq!(
        f.store
            .restore_trashed_project(&a, &second.trash_id, &no)
            .err()
            .expect("변경된 버전")
            .code,
        "PROJECT_TRASH_CHANGED"
    );
}
#[test]
fn running_practice_cannot_be_archived() {
    let f = Fixture::new();
    let id = f.project();
    let no = AtomicBool::new(false);
    let asset = f.asset(&id, AssetStorage::Managed);
    let revision = f
        .store
        .save_revision(&id, 0, &asset, score(), workspace(), &no)
        .expect("악보");
    let db = connect(&f.store.root).expect("DB");
    db.execute("INSERT INTO practice_sessions(id,project_id,score_revision_id,track_id,config_json,config_fingerprint,scoring_version,started_at_ms,status) VALUES(?1,?2,?3,'track-0','{}','fixture','fixture',0,'RUNNING')", params![Uuid::new_v4().to_string(),id,revision.revision_id]).expect("실행 중 연습");
    assert_eq!(
        f.store
            .trash_project(&id, 1, &no)
            .err()
            .expect("연습 우선")
            .code,
        "PROJECT_IN_USE"
    );
    assert!(f.store.trashed_projects().expect("원래 상태").is_empty());
}

#[test]
fn full_trash_rejects_growth_but_still_allows_restore_without_deleting_data() {
    let f = Fixture::new();
    let target = f.project();
    let mut db = connect(&f.store.root).expect("DB");
    let tx = db.transaction().expect("자체 한도 자료");
    let mut first = None;
    for _ in 0..1000 {
        let project = Uuid::new_v4().to_string();
        let token = Uuid::new_v4().to_string();
        tx.execute("INSERT INTO projects(id,title,mode,created_at_ms,updated_at_ms) VALUES(?1,'한도 자료','practice',0,0)", [&project]).expect("자체 프로젝트");
        tx.execute(
            "INSERT INTO project_trash VALUES(?1,?2,42,0)",
            params![project, token],
        )
        .expect("자체 보관");
        if first.is_none() {
            first = Some((project, token));
        }
    }
    tx.commit().expect("자체 자료 완료");
    let no = AtomicBool::new(false);
    assert_eq!(
        f.store
            .trash_project(&target, 0, &no)
            .err()
            .expect("한도")
            .code,
        "PROJECT_TRASH_LIMIT"
    );
    assert_eq!(f.store.trashed_projects().expect("보관 유지").len(), 1000);
    let (project, token) = first.expect("첫 자료");
    f.store
        .restore_trashed_project(&project, &token, &no)
        .expect("한도에서도 복원");
    f.store.trash_project(&target, 0, &no).expect("남은 한도");
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get::<_, u32>(0))
            .expect("원본 행 유지"),
        1001
    );
}

#[test]
fn recorded_take_wave_and_metadata_survive_archive_and_restore_exactly() {
    let f = Fixture::new();
    let mut take = super::recordings_tests::prepared(&f);
    super::recordings_tests::write_part(&f, &mut take, 4800, true);
    f.store.finalize_take(&mut take).expect("합성 테이크 READY");
    let no = AtomicBool::new(false);
    let bytes = f
        .store
        .recording_bytes(&take.project_id, &take.id, &no)
        .expect("합성 원본");
    let path = f
        .store
        .recording_path(&take, false)
        .expect("자체 파일 경로");
    let before = rows(&connect(&f.store.root).expect("DB"));
    let entry = f
        .store
        .trash_project(&take.project_id, 1, &no)
        .expect("보관");
    assert_eq!(
        f.store
            .recording_bytes(&take.project_id, &take.id, &no)
            .expect_err("보관 읽기 거부")
            .code,
        "PROJECT_IN_TRASH"
    );
    assert_eq!(fs::read(&path).expect("원본 파일 보존"), bytes);
    f.store
        .restore_trashed_project(&take.project_id, &entry.trash_id, &no)
        .expect("복원");
    assert_eq!(rows(&connect(&f.store.root).expect("DB")), before);
    assert_eq!(
        f.store
            .recording_bytes(&take.project_id, &take.id, &no)
            .expect("복원 청취 데이터"),
        bytes
    );
    assert_eq!(
        serde_json::to_value(
            f.store
                .take(&take.project_id, &take.id)
                .expect("복원 메타데이터")
        )
        .expect("JSON"),
        serde_json::to_value(take).expect("원본 JSON")
    );
}
