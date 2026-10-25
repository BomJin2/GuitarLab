use super::{
    database::connect,
    project_model::{storage_error, validate_uuid, MAX_SAFE},
    projects::{canceled, unsigned_column, ProjectStore},
};
use crate::ipc::AppError;
use rusqlite::params;
use serde::Serialize;
use std::sync::atomic::AtomicBool;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreRevisionEntry {
    pub revision_id: String,
    pub revision: u32,
    pub created_at_ms: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreRevisionPage {
    pub project_id: String,
    pub head_revision: u32,
    pub entries: Vec<ScoreRevisionEntry>,
    pub next_before_revision: Option<u32>,
}
impl ProjectStore {
    pub fn list_score_revisions(
        &self,
        project_id: &str,
        before_revision: Option<u32>,
        cancel: &AtomicBool,
    ) -> Result<ScoreRevisionPage, AppError> {
        validate_uuid(project_id)?;
        if before_revision == Some(0) {
            return Err(AppError::invalid());
        }
        canceled(cancel)?;
        let mut db = connect(&self.root)?;
        let tx = db.transaction().map_err(|_| storage_error())?;
        let project = self.summary(&tx, project_id)?;
        let mut query = tx.prepare("SELECT id,revision,created_at_ms FROM score_revisions WHERE project_id=?1 AND (?2 IS NULL OR revision<?2) ORDER BY revision DESC LIMIT 101").map_err(|_| storage_error())?;
        let mut entries = query
            .query_map(params![project_id, before_revision], |row| {
                Ok(ScoreRevisionEntry {
                    revision_id: row.get(0)?,
                    revision: row.get(1)?,
                    created_at_ms: unsigned_column(row, 2)?,
                })
            })
            .map_err(|_| storage_error())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|_| storage_error())?;
        let mut upper = before_revision;
        for entry in &entries {
            if validate_uuid(&entry.revision_id).is_err()
                || entry.revision == 0
                || entry.revision > project.revision
                || upper.is_some_and(|value| entry.revision >= value)
                || entry.created_at_ms > MAX_SAFE
            {
                return Err(storage_error());
            }
            upper = Some(entry.revision);
        }
        if before_revision.is_none()
            && entries.first().map_or(0, |entry| entry.revision) != project.revision
        {
            return Err(storage_error());
        }
        let next_before_revision = if entries.len() > 100 {
            entries.truncate(100);
            entries.last().map(|entry| entry.revision)
        } else {
            None
        };
        canceled(cancel)?;
        Ok(ScoreRevisionPage {
            project_id: project_id.into(),
            head_revision: project.revision,
            entries,
            next_before_revision,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{
        project_model::AssetStorage,
        project_trash_tests::rows,
        projects_tests::{score, workspace, Fixture},
    };

    #[test]
    fn pagination_and_saved_content_are_read_only_even_when_the_original_is_missing() {
        let f = Fixture::new();
        let id = f.project();
        let cancel = AtomicBool::new(false);
        assert!(f
            .store
            .list_score_revisions(&id, None, &cancel)
            .expect("빈 목록")
            .entries
            .is_empty());
        let asset = f.asset(&id, AssetStorage::Managed);
        let mut first = None;
        for expected in 0..101 {
            let mut document = score();
            document.title = format!("저장 악보 {}", expected + 1);
            let revision = f
                .store
                .save_revision(&id, expected, &asset, document, workspace(), &cancel)
                .expect("자체 버전 저장");
            if expected == 0 {
                first = Some(revision);
            }
        }
        let db = connect(&f.store.root).expect("DB");
        let original_path: String = db
            .query_row(
                "SELECT relative_path FROM project_assets WHERE id=?1",
                [&asset],
                |row| row.get(0),
            )
            .expect("자체 원본 경로");
        let target = f.store.root.join(original_path);
        assert!(target
            .canonicalize()
            .expect("자체 원본")
            .starts_with(f.store.root.canonicalize().expect("자체 앱 데이터")));
        std::fs::remove_file(target).expect("자체 원본 누락 주입");
        let before = rows(&db);
        let page = f
            .store
            .list_score_revisions(&id, None, &cancel)
            .expect("목록");
        assert_eq!(page.head_revision, 101);
        assert_eq!(page.entries.len(), 100);
        assert_eq!(page.entries[0].revision, 101);
        assert_eq!(page.next_before_revision, Some(2));
        let older = f
            .store
            .list_score_revisions(&id, page.next_before_revision, &cancel)
            .expect("이전 페이지");
        assert_eq!(older.entries.len(), 1);
        assert_eq!(older.entries[0].revision, 1);
        assert!(older.next_before_revision.is_none());
        let first = first.expect("첫 버전");
        let read = f
            .store
            .revision(&id, &older.entries[0].revision_id)
            .expect("저장 악보 읽기");
        assert_eq!(
            serde_json::to_value(read).expect("읽음"),
            serde_json::to_value(first).expect("기존")
        );
        assert_eq!(rows(&db), before);
        assert!(f
            .store
            .list_score_revisions(&id, Some(1), &cancel)
            .expect("끝")
            .entries
            .is_empty());
    }

    #[test]
    fn invalid_canceled_trashed_and_corrupt_history_never_change_rows() {
        let f = Fixture::new();
        let id = f.project();
        let asset = f.asset(&id, AssetStorage::Managed);
        let cancel = AtomicBool::new(false);
        let revision = f
            .store
            .save_revision(&id, 0, &asset, score(), workspace(), &cancel)
            .expect("저장");
        let db = connect(&f.store.root).expect("DB");
        let before = rows(&db);
        for (project, cursor, canceled) in [
            ("../private", None, false),
            (&id, Some(0), false),
            (&id, None, true),
            ("00000000-0000-4000-8000-000000000099", None, false),
        ] {
            assert!(f
                .store
                .list_score_revisions(project, cursor, &AtomicBool::new(canceled))
                .is_err());
        }
        let other = f.project();
        assert!(f.store.revision(&other, &revision.revision_id).is_err());
        assert_eq!(
            rows(&db).get("score_revisions"),
            before.get("score_revisions")
        );
        let trash = f.store.trash_project(&id, 1, &cancel).expect("보관");
        assert_eq!(
            f.store
                .list_score_revisions(&id, None, &cancel)
                .err()
                .expect("보관 거부")
                .code,
            "PROJECT_IN_TRASH"
        );
        f.store
            .restore_trashed_project(&id, &trash.trash_id, &cancel)
            .expect("복원");
        db.execute(
            "UPDATE score_revisions SET created_at_ms=-1 WHERE id=?1",
            [&revision.revision_id],
        )
        .expect("잘못된 시각 주입");
        let before = rows(&db);
        assert!(f.store.list_score_revisions(&id, None, &cancel).is_err());
        assert_eq!(rows(&db), before);
        db.execute(
            "UPDATE score_revisions SET created_at_ms=1 WHERE id=?1",
            [&revision.revision_id],
        )
        .expect("시각 복원");
        let path = f
            .store
            .root
            .join("projects")
            .join(&id)
            .join("scores")
            .join(format!("{}.json", revision.revision_id));
        std::fs::write(&path, b"{}").expect("자체 버전 손상 주입");
        let before = rows(&db);
        assert!(f.store.revision(&id, &revision.revision_id).is_err());
        assert_eq!(rows(&db), before);
        assert_eq!(std::fs::read(path).expect("손상 파일 보존"), b"{}");
    }
}
