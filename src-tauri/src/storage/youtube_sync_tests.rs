use super::{
    database::connect,
    project_model::{AssetStorage, SyncAnchor},
    projects::ProjectStore,
    projects_tests::{score, workspace, Fixture},
    youtube_sync::{ProjectYoutubeSync, YoutubeSyncKey, YoutubeSyncProfile},
};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

fn document(f: &Fixture, project: &str) -> ProjectYoutubeSync {
    let asset = f.asset(project, AssetStorage::Managed);
    let mut content = score();
    // 로컬 음원 앵커와 영상용 렌더 끝은 별도 문맥입니다.
    content.sync_anchors[1].score_tick = 1920;
    let mut rhythm = content.tracks[0].clone();
    rhythm.id = "track-1".into();
    for note in &mut rhythm.notes {
        note.id.push_str("-rhythm");
        note.track_id = rhythm.id.clone();
    }
    content.tracks.push(rhythm);
    let revision = f
        .store
        .save_revision(
            project,
            0,
            &asset,
            content,
            workspace(),
            &AtomicBool::new(false),
        )
        .expect("악보 저장");
    ProjectYoutubeSync {
        schema_version: 1,
        project_id: project.into(),
        revision_id: revision.revision_id,
        video_id: "Ab_cD-12345".into(),
        track_id: "track-0".into(),
        profile: Some(YoutubeSyncProfile {
            score_id: revision.score.id,
            end_tick: 3840,
            duration_ms: 20000.0,
            anchors: vec![
                SyncAnchor {
                    score_tick: 0,
                    audio_time_ms: 1000.0,
                },
                SyncAnchor {
                    score_tick: 3840,
                    audio_time_ms: 10000.0,
                },
            ],
        }),
    }
}
fn json(value: &ProjectYoutubeSync) -> Value {
    serde_json::to_value(value).expect("JSON")
}

#[test]
fn sync_reopens_with_video_revision_track_isolation_and_clear_preserves_score_assets() {
    let f = Fixture::new();
    let a = f.project();
    let value = document(&f, &a);
    let flag = AtomicBool::new(false);
    let score_before =
        serde_json::to_value(f.store.revision(&a, &value.revision_id).expect("악보"))
            .expect("기준");
    assert!(f
        .store
        .youtube_sync(&value.key(), &flag)
        .expect("없음")
        .profile
        .is_none());
    f.store.save_youtube_sync(&value, &flag).expect("저장");
    let reopened = ProjectStore::new(f.store.root.clone());
    assert_eq!(
        json(&reopened.youtube_sync(&value.key(), &flag).expect("재열기")),
        json(&value)
    );
    let mut other = value.clone();
    other.video_id = "zY_xW-98765".into();
    assert!(reopened
        .youtube_sync(&other.key(), &flag)
        .expect("다른 영상")
        .profile
        .is_none());
    reopened
        .save_youtube_sync(&other, &flag)
        .expect("별도 영상 저장");
    let other_track = ProjectYoutubeSync {
        track_id: "track-1".into(),
        ..value.clone()
    };
    assert!(reopened
        .youtube_sync(&other_track.key(), &flag)
        .expect("다른 트랙")
        .profile
        .is_none());
    reopened
        .save_youtube_sync(&other_track, &flag)
        .expect("별도 트랙");
    let b = f.project();
    let mut cross = value.key();
    cross.project_id = b;
    assert_eq!(
        reopened
            .youtube_sync(&cross, &flag)
            .expect_err("다른 소유권")
            .code,
        "REVISION_NOT_FOUND"
    );
    let next = reopened
        .save_revision(
            &a,
            1,
            &reopened
                .revision(&a, &value.revision_id)
                .expect("이전")
                .score_asset_id,
            score(),
            workspace(),
            &flag,
        )
        .expect("새 revision");
    let mut different_revision = value.key();
    different_revision.revision_id = next.revision_id;
    assert!(reopened
        .youtube_sync(&different_revision, &flag)
        .expect("다른 버전")
        .profile
        .is_none());
    let mut wrong_track = value.clone();
    wrong_track.track_id = "unknown".into();
    assert!(reopened.save_youtube_sync(&wrong_track, &flag).is_err());
    let clear = ProjectYoutubeSync {
        profile: None,
        ..value.clone()
    };
    reopened
        .save_youtube_sync(&clear, &flag)
        .expect("해당 문맥 삭제");
    assert!(reopened
        .youtube_sync(&value.key(), &flag)
        .expect("삭제됨")
        .profile
        .is_none());
    assert_eq!(
        json(
            &reopened
                .youtube_sync(&other.key(), &flag)
                .expect("다른 영상 보존")
        ),
        json(&other)
    );
    assert_eq!(
        serde_json::to_value(
            reopened
                .revision(&a, &value.revision_id)
                .expect("원래 악보")
        )
        .expect("비교"),
        score_before
    );
    assert_eq!(
        json(
            &reopened
                .youtube_sync(&other_track.key(), &flag)
                .expect("다른 트랙 보존")
        ),
        json(&other_track)
    );
    assert_eq!(reopened.assets(&a).expect("원본").len(), 1);
}
#[test]
fn invalid_canceled_failed_and_corrupt_profiles_do_not_replace_valid_sync() {
    let f = Fixture::new();
    let a = f.project();
    let value = document(&f, &a);
    let flag = AtomicBool::new(false);
    f.store.save_youtube_sync(&value, &flag).expect("기준");
    let canceled = AtomicBool::new(true);
    assert_eq!(
        f.store
            .save_youtube_sync(
                &ProjectYoutubeSync {
                    profile: None,
                    ..value.clone()
                },
                &canceled
            )
            .expect_err("저장 취소")
            .code,
        "CANCELED"
    );
    assert_eq!(
        f.store
            .youtube_sync(&value.key(), &canceled)
            .expect_err("조회 취소")
            .code,
        "CANCELED"
    );
    for field in ["scoreId", "endTick", "durationMs", "anchors"] {
        let mut bad = json(&value);
        bad["profile"][field] = match field {
            "scoreId" => json!("wrong"),
            "endTick" => json!(0),
            "durationMs" => json!(500),
            _ => json!([{"scoreTick":3840,"audioTimeMs":1},{"scoreTick":0,"audioTimeMs":2}]),
        };
        let parsed: ProjectYoutubeSync = serde_json::from_value(bad).expect("형식");
        assert!(
            f.store.save_youtube_sync(&parsed, &flag).is_err(),
            "{field}"
        );
    }
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("CREATE TRIGGER fail_sync BEFORE DELETE ON project_youtube_syncs BEGIN SELECT RAISE(ABORT,'DEMO 실패'); END;").expect("실패 주입");
    assert!(f
        .store
        .save_youtube_sync(
            &ProjectYoutubeSync {
                profile: None,
                ..value.clone()
            },
            &flag
        )
        .is_err());
    assert_eq!(
        json(&f.store.youtube_sync(&value.key(), &flag).expect("보존")),
        json(&value)
    );
    db.execute("UPDATE project_youtube_syncs SET document_json='{}'", [])
        .expect("손상 주입");
    assert_eq!(
        f.store
            .youtube_sync(&value.key(), &flag)
            .expect_err("해시 손상")
            .code,
        "INVALID_YOUTUBE_SYNC"
    );
}
#[test]
fn sync_contract_requires_explicit_profile_and_rejects_unsafe_fields() {
    let f = Fixture::new();
    let id = f.project();
    let value = document(&f, &id);
    let valid = json(&value);
    let mut omitted = valid.clone();
    omitted.as_object_mut().expect("객체").remove("profile");
    assert!(serde_json::from_value::<ProjectYoutubeSync>(omitted).is_err());
    let mut extra = valid.clone();
    extra["url"] = json!("https://example.invalid");
    assert!(serde_json::from_value::<ProjectYoutubeSync>(extra).is_err());
    for (field, bad) in [
        ("schemaVersion", json!(2)),
        ("projectId", json!("../escape")),
        ("revisionId", json!("bad")),
        ("trackId", json!("a\n")),
        ("videoId", json!("bad/path!!!")),
    ] {
        let mut bad_value = valid.clone();
        bad_value[field] = bad;
        assert!(serde_json::from_value::<ProjectYoutubeSync>(bad_value)
            .expect("형식")
            .validate()
            .is_err());
    }
    let mut key = serde_json::to_value(value.key()).expect("조회");
    key["profile"] = Value::Null;
    assert!(serde_json::from_value::<YoutubeSyncKey>(key).is_err());
    let clear = ProjectYoutubeSync {
        profile: None,
        ..value
    };
    clear.validate().expect("명시적 삭제");
}
#[test]
fn version_six_migration_only_adds_sync_table_and_limits_new_contexts() {
    let f = Fixture::new();
    let a = f.project();
    let value = document(&f, &a);
    let flag = AtomicBool::new(false);
    let db = connect(&f.store.root).expect("DB");
    db.execute_batch("DROP TABLE project_purge_intents; DROP TABLE project_trash; DROP TABLE imported_guitar_stems; DROP TABLE project_youtube_syncs; PRAGMA user_version=6;")
        .expect("v6");
    drop(db);
    let db = connect(&f.store.root).expect("v7");
    assert_eq!(
        db.pragma_query_value::<u32, _>(None, "user_version", |r| r.get(0))
            .expect("버전"),
        10
    );
    for index in 0..100 {
        let next = ProjectYoutubeSync {
            video_id: format!("vid{index:08}"),
            ..value.clone()
        };
        f.store.save_youtube_sync(&next, &flag).expect("100개");
    }
    assert_eq!(
        f.store
            .save_youtube_sync(&value, &flag)
            .expect_err("한도")
            .code,
        "YOUTUBE_SYNC_LIMIT"
    );
    let existing = ProjectYoutubeSync {
        video_id: "vid00000000".into(),
        ..value.clone()
    };
    f.store
        .save_youtube_sync(&existing, &flag)
        .expect("기존 교체 허용");
    f.store
        .save_youtube_sync(
            &ProjectYoutubeSync {
                profile: None,
                ..existing
            },
            &flag,
        )
        .expect("한 문맥 삭제");
    f.store.save_youtube_sync(&value, &flag).expect("한도 복구");
    assert!(db
        .execute(
            "INSERT INTO project_youtube_syncs VALUES(?1,?2,'bad/path!!!','track-0','{}',?3,1)",
            rusqlite::params![a, value.revision_id, "a".repeat(64)]
        )
        .is_err());
}
