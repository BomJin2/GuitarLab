use super::{
    database::connect,
    project_model::{storage_error, validate_uuid, ProjectSummary, MAX_SAFE},
    projects::{canceled, now_ms, project_row, validate_summary, ProjectStore},
};
use crate::ipc::AppError;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedProject {
    pub project: ProjectSummary,
    pub trash_id: String,
    pub trashed_at_ms: u64,
}
fn changed() -> AppError {
    AppError::new(
        "PROJECT_TRASH_CHANGED",
        "휴지통 상태가 바뀌었습니다. 목록을 다시 읽어주세요.",
        true,
    )
}
impl ProjectStore {
    pub fn trashed_projects(&self) -> Result<Vec<TrashedProject>, AppError> {
        let db = connect(&self.root)?;
        let mut query = db.prepare("SELECT p.id,p.title,p.artist,p.mode,p.revision,p.revision_id,p.updated_at_ms,t.trash_id,t.trashed_at_ms,t.project_revision FROM project_trash t JOIN projects p ON p.id=t.project_id ORDER BY t.trashed_at_ms DESC,p.id LIMIT 1000").map_err(|_| storage_error())?;
        let rows = query
            .query_map([], |row| {
                let timestamp: i64 = row.get(8)?;
                Ok((
                    TrashedProject {
                        project: project_row(row)?,
                        trash_id: row.get(7)?,
                        trashed_at_ms: u64::try_from(timestamp)
                            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(8, timestamp))?,
                    },
                    row.get::<_, u32>(9)?,
                ))
            })
            .map_err(|_| storage_error())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|_| storage_error())?;
        let mut result = Vec::with_capacity(rows.len());
        for (entry, revision) in rows {
            validate_summary(&entry.project)?;
            validate_uuid(&entry.trash_id).map_err(|_| storage_error())?;
            if entry.trashed_at_ms > MAX_SAFE || entry.project.revision != revision {
                return Err(storage_error());
            }
            result.push(entry);
        }
        Ok(result)
    }
    pub fn trash_project(
        &self,
        project_id: &str,
        expected_revision: u32,
        cancel: &AtomicBool,
    ) -> Result<TrashedProject, AppError> {
        validate_uuid(project_id)?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        let project = self.summary(&tx, project_id)?;
        if project.revision != expected_revision {
            return Err(AppError::new(
                "REVISION_CONFLICT",
                "프로젝트가 바뀌었습니다. 목록을 다시 읽어주세요.",
                true,
            ));
        }
        let active: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM practice_sessions WHERE project_id=?1 AND status='RUNNING') OR EXISTS(SELECT 1 FROM recorded_takes WHERE project_id=?1 AND state IN ('ARMING','RECORDING','FINALIZING'))", [project_id], |row| row.get(0)).map_err(|_| storage_error())?;
        if active {
            return Err(AppError::new(
                "PROJECT_IN_USE",
                "프로젝트의 연습·녹음을 마친 뒤 보관하세요.",
                true,
            ));
        }
        let count: u32 = tx
            .query_row("SELECT COUNT(*) FROM project_trash", [], |row| row.get(0))
            .map_err(|_| storage_error())?;
        if count >= 1000 {
            return Err(AppError::new(
                "PROJECT_TRASH_LIMIT",
                "휴지통 보관 한도 1000개에 도달했습니다.",
                false,
            ));
        }
        let timestamp = now_ms()?;
        let entry = TrashedProject {
            project,
            trash_id: Uuid::new_v4().to_string(),
            trashed_at_ms: u64::try_from(timestamp).map_err(|_| storage_error())?,
        };
        tx.execute("INSERT INTO project_trash(project_id,trash_id,trashed_at_ms,project_revision) VALUES(?1,?2,?3,?4)", params![project_id, entry.trash_id, timestamp, expected_revision]).map_err(|_| storage_error())?;
        canceled(cancel)?;
        tx.commit().map_err(|_| storage_error())?;
        Ok(entry)
    }
    pub fn restore_trashed_project(
        &self,
        project_id: &str,
        trash_id: &str,
        cancel: &AtomicBool,
    ) -> Result<ProjectSummary, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(trash_id)?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        let revision = tx
            .query_row(
                "SELECT project_revision FROM project_trash WHERE project_id=?1 AND trash_id=?2",
                params![project_id, trash_id],
                |row| row.get::<_, u32>(0),
            )
            .optional()
            .map_err(|_| storage_error())?
            .ok_or_else(changed)?;
        let project = self.raw_summary(&tx, project_id)?;
        if project.revision != revision {
            return Err(changed());
        }
        if tx
            .execute(
                "DELETE FROM project_trash WHERE project_id=?1 AND trash_id=?2",
                params![project_id, trash_id],
            )
            .map_err(|_| storage_error())?
            != 1
        {
            return Err(changed());
        }
        canceled(cancel)?;
        tx.commit().map_err(|_| storage_error())?;
        Ok(project)
    }
}
