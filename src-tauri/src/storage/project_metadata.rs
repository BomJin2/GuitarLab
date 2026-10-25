use super::{
    database::connect,
    project_model::{storage_error, title_valid, validate_uuid, ProjectSummary, MAX_SAFE},
    projects::{canceled, now_ms, ProjectStore},
};
use crate::ipc::AppError;
use rusqlite::{params, TransactionBehavior};
use serde::Deserialize;
use std::sync::atomic::AtomicBool;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectMetadata {
    pub title: String,
    #[serde(deserialize_with = "Option::deserialize")]
    pub artist: Option<String>,
}

impl ProjectMetadata {
    pub fn validate(&self) -> Result<(), AppError> {
        if !title_valid(&self.title) || self.artist.as_ref().is_some_and(|v| !title_valid(v)) {
            return Err(AppError::new(
                "PROJECT_METADATA_INVALID",
                "제목과 아티스트는 제어문자 없는200자 이하로 입력하세요.",
                true,
            ));
        }
        Ok(())
    }
}
impl ProjectStore {
    pub fn update_metadata(
        &self,
        project_id: &str,
        expected: ProjectMetadata,
        changes: ProjectMetadata,
        cancel: &AtomicBool,
    ) -> Result<ProjectSummary, AppError> {
        validate_uuid(project_id)?;
        expected.validate()?;
        changes.validate()?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        let current = self.summary(&tx, project_id)?;
        if current.title != expected.title || current.artist != expected.artist {
            return Err(AppError::new(
                "PROJECT_METADATA_CONFLICT",
                "프로젝트 정보가 바뀌었습니다. 최신 정보를 읽은 뒤 다시 수정하세요.",
                true,
            ));
        }
        let active: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM practice_sessions WHERE project_id=?1 AND status='RUNNING') OR EXISTS(SELECT 1 FROM recorded_takes WHERE project_id=?1 AND state IN ('ARMING','RECORDING','FINALIZING'))", [project_id], |row| row.get(0)).map_err(|_| storage_error())?;
        if active {
            return Err(AppError::new(
                "PROJECT_IN_USE",
                "프로젝트의 연습·녹음을 마친 뒤 정보를 수정하세요.",
                true,
            ));
        }
        let title = changes.title.trim().to_owned();
        let artist = changes.artist.map(|v| v.trim().to_owned());
        canceled(cancel)?;
        if title == current.title && artist == current.artist {
            return Ok(current);
        }
        let next = current
            .updated_at_ms
            .checked_add(1)
            .filter(|v| *v <= MAX_SAFE)
            .ok_or_else(storage_error)?;
        let timestamp =
            i64::try_from(next.max(u64::try_from(now_ms()?).map_err(|_| storage_error())?))
                .map_err(|_| storage_error())?;
        tx.execute(
            "UPDATE projects SET title=?1,artist=?2,updated_at_ms=?3 WHERE id=?4",
            params![title, artist, timestamp, project_id],
        )
        .map_err(|_| storage_error())?;
        let updated = self.summary(&tx, project_id)?;
        canceled(cancel)?;
        tx.commit().map_err(|_| storage_error())?;
        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{
        project_model::{AssetStorage, ProjectMode},
        project_trash_tests::rows,
        projects_tests::{score, workspace, Fixture},
    };

    fn metadata(project: &ProjectSummary) -> ProjectMetadata {
        ProjectMetadata {
            title: project.title.clone(),
            artist: project.artist.clone(),
        }
    }
    fn changes(title: &str, artist: Option<&str>) -> ProjectMetadata {
        ProjectMetadata {
            title: title.into(),
            artist: artist.map(str::to_owned),
        }
    }
    #[test]
    fn update_reopens_preserving_every_other_row_revision_and_source() {
        let f = Fixture::new();
        let id = f.project();
        let other = f.project();
        let asset = f.asset(&id, AssetStorage::Managed);
        f.asset(&other, AssetStorage::Reference);
        let cancel = AtomicBool::new(false);
        f.store
            .save_revision(&id, 0, &asset, score(), workspace(), &cancel)
            .expect("악보 저장");
        let (before, revision, assets) = f.store.open(&id).expect("기존 프로젝트");
        let mut expected_rows = rows(&connect(&f.store.root).expect("DB"));
        let source = f
            .store
            .read_asset(&id, &asset, &cancel, |_, _| Ok(()))
            .expect("원본");
        let updated = f
            .store
            .update_metadata(
                &id,
                metadata(&before),
                changes("  새 제목  ", Some("  연주자  ")),
                &cancel,
            )
            .expect("정보 수정");
        assert_eq!(updated.title, "새 제목");
        assert_eq!(updated.artist.as_deref(), Some("연주자"));
        assert!(updated.updated_at_ms > before.updated_at_ms);
        assert_eq!(updated.mode, ProjectMode::Practice);
        let project_rows = expected_rows.get_mut("projects").expect("프로젝트 테이블");
        let row = project_rows
            .iter_mut()
            .find(|row| row[0] == rusqlite::types::Value::Text(id.clone()))
            .expect("대상 행");
        row[1] = updated.title.clone().into();
        row[2] = updated.artist.clone().expect("아티스트").into();
        row[7] =
            rusqlite::types::Value::Integer(i64::try_from(updated.updated_at_ms).expect("시각"));
        assert_eq!(rows(&connect(&f.store.root).expect("DB")), expected_rows);
        let reopened = ProjectStore::new(f.store.root.clone());
        let (summary, reopened_revision, reopened_assets) = reopened.open(&id).expect("재열기");
        assert_eq!(summary.title, updated.title);
        assert_eq!(summary.revision, before.revision);
        assert_eq!(summary.revision_id, before.revision_id);
        assert_eq!(
            serde_json::to_value(reopened_revision).expect("revision"),
            serde_json::to_value(revision).expect("revision")
        );
        assert_eq!(
            serde_json::to_value(reopened_assets).expect("자산"),
            serde_json::to_value(assets).expect("자산")
        );
        assert_eq!(
            reopened
                .read_asset(&id, &asset, &cancel, |_, _| Ok(()))
                .expect("원본 유지"),
            source
        );
        let cleared = reopened
            .update_metadata(&id, metadata(&summary), changes("새 제목", None), &cancel)
            .expect("아티스트 비우기");
        assert!(cleared.artist.is_none());
        let unchanged = reopened
            .update_metadata(&id, metadata(&cleared), changes(" 새 제목 ", None), &cancel)
            .expect("동일 값");
        assert_eq!(unchanged.updated_at_ms, cleared.updated_at_ms);
    }
    #[test]
    fn invalid_conflict_cancel_and_database_failure_leave_all_rows_unchanged() {
        let f = Fixture::new();
        let id = f.project();
        let original = f.store.open(&id).expect("기존").0;
        let db = connect(&f.store.root).expect("DB");
        let before = rows(&db);
        for invalid in [
            changes("", None),
            changes("\n제목", None),
            changes(&"가".repeat(201), None),
            changes("제목", Some("")),
            changes("제목", Some("잘못\u{0085}")),
        ] {
            assert_eq!(
                f.store
                    .update_metadata(&id, metadata(&original), invalid, &AtomicBool::new(false))
                    .err()
                    .expect("거부")
                    .code,
                "PROJECT_METADATA_INVALID"
            );
        }
        assert_eq!(
            f.store
                .update_metadata(
                    &id,
                    changes("오래된 제목", None),
                    changes("수정", None),
                    &AtomicBool::new(false)
                )
                .err()
                .expect("충돌")
                .code,
            "PROJECT_METADATA_CONFLICT"
        );
        assert_eq!(
            f.store
                .update_metadata(
                    &id,
                    metadata(&original),
                    changes("수정", None),
                    &AtomicBool::new(true)
                )
                .err()
                .expect("취소")
                .code,
            "CANCELED"
        );
        db.execute_batch("CREATE TRIGGER fail_metadata BEFORE UPDATE OF title ON projects BEGIN SELECT RAISE(ABORT,'테스트 실패'); END;").expect("DB 실패 주입");
        assert_eq!(
            f.store
                .update_metadata(
                    &id,
                    metadata(&original),
                    changes("수정", None),
                    &AtomicBool::new(false)
                )
                .err()
                .expect("실패")
                .code,
            "STORAGE_ERROR"
        );
        assert_eq!(rows(&db), before);
    }
    #[test]
    fn archived_and_active_projects_are_refused_and_timestamps_are_checked() {
        let f = Fixture::new();
        let id = f.project();
        let asset = f.asset(&id, AssetStorage::Managed);
        let cancel = AtomicBool::new(false);
        let revision = f
            .store
            .save_revision(&id, 0, &asset, score(), workspace(), &cancel)
            .expect("악보 저장");
        let original = f.store.open(&id).expect("기존").0;
        let db = connect(&f.store.root).expect("DB");
        db.execute("INSERT INTO practice_sessions(id,project_id,score_revision_id,track_id,config_json,config_fingerprint,scoring_version,started_at_ms,status) VALUES(?1,?2,?3,'guitar','{}','fingerprint','test',1,'RUNNING')", params![uuid::Uuid::new_v4().to_string(),id,revision.revision_id]).expect("연습 진행");
        let before = rows(&db);
        assert_eq!(
            f.store
                .update_metadata(&id, metadata(&original), changes("수정", None), &cancel)
                .err()
                .expect("활성 거부")
                .code,
            "PROJECT_IN_USE"
        );
        assert_eq!(rows(&db), before);
        db.execute("UPDATE practice_sessions SET status='STOPPED'", [])
            .expect("연습 중단");
        let entry = f.store.trash_project(&id, 1, &cancel).expect("보관");
        assert_eq!(
            f.store
                .update_metadata(&id, metadata(&original), changes("수정", None), &cancel)
                .err()
                .expect("보관 거부")
                .code,
            "PROJECT_IN_TRASH"
        );
        f.store
            .restore_trashed_project(&id, &entry.trash_id, &cancel)
            .expect("복원");
        db.execute(
            "UPDATE projects SET updated_at_ms=?1 WHERE id=?2",
            params![i64::try_from(MAX_SAFE).expect("안전 정수 상한"), id],
        )
        .expect("상한 시각");
        let maximum = f.store.open(&id).expect("최대 시각").0;
        assert_eq!(
            f.store
                .update_metadata(&id, metadata(&maximum), changes("수정", None), &cancel)
                .err()
                .expect("시각 초과")
                .code,
            "STORAGE_ERROR"
        );
        assert_eq!(f.store.open(&id).expect("보존").0.title, maximum.title);
    }
}
