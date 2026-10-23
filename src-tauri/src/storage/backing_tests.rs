use super::{
    backing::{BackingKind, ProjectBacking, YoutubeSelection},
    database::connect,
    projects::ProjectStore,
    projects_tests::Fixture,
};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};

fn document(id: &str, video: &str) -> ProjectBacking {
    ProjectBacking {
        schema_version: 1,
        project_id: id.into(),
        selection: Some(YoutubeSelection {
            kind: BackingKind::YoutubeEmbed,
            video_id: video.into(),
            selected_by_user: true,
        }),
    }
}
#[test]
fn project_selection_reopens_is_isolated_and_clear_keeps_assets_and_revisions() {
    let f = Fixture::new();
    let a = f.project();
    let b = f.project();
    let asset = f.asset(&a, super::project_model::AssetStorage::Managed);
    let assets = serde_json::to_value(f.store.assets(&a).expect("원본 목록")).expect("기준");
    let flag = AtomicBool::new(false);
    assert_eq!(f.store.backing(&a, &flag).expect("미선택").selection, None);
    let first = document(&a, "Ab_cD-12345");
    f.store.save_backing(&first, &flag).expect("저장");
    let reopened = ProjectStore::new(f.store.root.clone());
    assert_eq!(reopened.backing(&a, &flag).expect("재실행 복원"), first);
    assert!(reopened
        .backing(&b, &flag)
        .expect("다른 프로젝트")
        .selection
        .is_none());
    let other = document(&b, "zY_xW-98765");
    reopened.save_backing(&other, &flag).expect("별도 저장");
    let clear = ProjectBacking {
        selection: None,
        ..first.clone()
    };
    reopened.save_backing(&clear, &flag).expect("주소 삭제");
    assert_eq!(reopened.backing(&a, &flag).expect("해제"), clear);
    assert_eq!(reopened.backing(&b, &flag).expect("다른 선택 보존"), other);
    assert_eq!(
        serde_json::to_value(reopened.assets(&a).expect("원본 보존")).expect("JSON"),
        assets
    );
    assert_eq!(reopened.assets(&a).expect("원본")[0].id, asset);
    assert!(reopened
        .list()
        .expect("프로젝트")
        .iter()
        .all(|p| p.revision == 0 && p.revision_id.is_none()));
}
#[test]
fn canceled_invalid_missing_and_failed_writes_preserve_previous_selection() {
    let f = Fixture::new();
    let id = f.project();
    let first = document(&id, "Ab_cD-12345");
    let flag = AtomicBool::new(false);
    f.store.save_backing(&first, &flag).expect("초기 저장");
    flag.store(true, Ordering::Release);
    assert_eq!(
        f.store
            .save_backing(
                &ProjectBacking {
                    selection: None,
                    ..first.clone()
                },
                &flag
            )
            .expect_err("취소")
            .code,
        "CANCELED"
    );
    assert_eq!(
        f.store.backing(&id, &flag).expect_err("조회 취소").code,
        "CANCELED"
    );
    flag.store(false, Ordering::Release);
    for video in [
        "../escape",
        "https://youtu.be/Ab_cD-12345",
        "ABCDEFGHIJ!",
        "한글문자1234567",
    ] {
        assert!(f.store.save_backing(&document(&id, video), &flag).is_err());
    }
    assert_eq!(
        f.store
            .save_backing(
                &document(&uuid::Uuid::new_v4().to_string(), "Ab_cD-12345"),
                &flag
            )
            .expect_err("없는 프로젝트")
            .code,
        "PROJECT_NOT_FOUND"
    );
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("CREATE TRIGGER fail_backing_update BEFORE UPDATE ON project_backings BEGIN SELECT RAISE(ABORT,'DEMO 실패'); END;").expect("실패 주입");
    assert!(f
        .store
        .save_backing(&document(&id, "zY_xW-98765"), &flag)
        .is_err());
    assert_eq!(f.store.backing(&id, &flag).expect("이전 선택 보존"), first);
    db.execute_batch(
        "PRAGMA ignore_check_constraints=ON; UPDATE project_backings SET video_id='../tampered';",
    )
    .expect_err("트리거 유지");
    db.execute_batch("DROP TRIGGER fail_backing_update; PRAGMA ignore_check_constraints=ON; UPDATE project_backings SET video_id='../tampered';").expect("손상 주입");
    assert_eq!(
        f.store.backing(&id, &flag).expect_err("손상 거부").code,
        "INVALID_BACKING_SOURCE"
    );
}
#[test]
fn version_five_migrates_additively_and_database_constraints_reject_wrong_sources() {
    let f = Fixture::new();
    let id = f.project();
    f.asset(&id, super::project_model::AssetStorage::Managed);
    let before = serde_json::to_value(f.store.assets(&id).expect("원본")).expect("기준");
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch(
        "DROP TABLE project_trash; DROP TABLE imported_guitar_stems; DROP TABLE project_youtube_syncs; DROP TABLE project_backings; PRAGMA user_version=5;",
    )
    .expect("v5 재현");
    drop(db);
    let db = connect(&f.store.root).expect("v6 migration");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |row| row.get(0))
            .expect("버전"),
        9
    );
    assert_eq!(
        serde_json::to_value(f.store.assets(&id).expect("보존")).expect("비교"),
        before
    );
    for (kind, video, selected) in [
        ("LOCAL_ASSET", "Ab_cD-12345", 1),
        ("YOUTUBE_EMBED", "bad/path!!!", 1),
        ("YOUTUBE_EMBED", "Ab_cD-12345", 0),
    ] {
        assert!(db
            .execute(
                "INSERT INTO project_backings VALUES(?1,?2,?3,?4,1)",
                rusqlite::params![id, kind, video, selected]
            )
            .is_err());
    }
    assert!(db
        .execute(
            "INSERT INTO project_backings VALUES(?1,'YOUTUBE_EMBED','Ab_cD-12345',1,1)",
            [uuid::Uuid::new_v4().to_string()]
        )
        .is_err());
}
#[test]
fn versioned_contract_requires_explicit_selection_and_rejects_extra_fields() {
    let id = uuid::Uuid::new_v4().to_string();
    let valid = json!({"schemaVersion":1,"projectId":id,"selection":{"kind":"YOUTUBE_EMBED","videoId":"Ab_cD-12345","selectedByUser":true}});
    let request: ProjectBacking = serde_json::from_value(valid.clone()).expect("정상 계약");
    request.validate().expect("검증");
    let clear: ProjectBacking =
        serde_json::from_value(json!({"schemaVersion":1,"projectId":id,"selection":null}))
            .expect("명시적 해제");
    clear.validate().expect("해제 검증");
    for value in [
        json!({"schemaVersion":1,"projectId":id}),
        json!({"schemaVersion":1,"projectId":id,"selection":null,"path":"../escape"}),
        json!({"schemaVersion":1,"projectId":id,"selection":{"kind":"LOCAL_ASSET","videoId":"Ab_cD-12345","selectedByUser":true}}),
    ] {
        assert!(serde_json::from_value::<ProjectBacking>(value).is_err());
    }
    for value in [
        json!({"schemaVersion":2,"projectId":id,"selection":null}),
        json!({"schemaVersion":1,"projectId":"../escape","selection":null}),
        json!({"schemaVersion":1,"projectId":id,"selection":{"kind":"YOUTUBE_EMBED","videoId":"Ab_cD-12345","selectedByUser":false}}),
    ] {
        assert!(serde_json::from_value::<ProjectBacking>(value)
            .expect("형식")
            .validate()
            .is_err());
    }
}
