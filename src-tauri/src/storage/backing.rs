use super::{
    database::connect,
    project_model::{storage_error, validate_uuid},
    projects::{canceled, now_ms, ProjectStore},
};
use crate::ipc::AppError;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub enum BackingKind {
    #[serde(rename = "YOUTUBE_EMBED")]
    YoutubeEmbed,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct YoutubeSelection {
    pub kind: BackingKind,
    pub video_id: String,
    pub selected_by_user: bool,
}
impl YoutubeSelection {
    pub fn validate(&self) -> Result<(), AppError> {
        if !self.selected_by_user
            || self.video_id.len() != 11
            || !self
                .video_id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        {
            return Err(invalid_backing());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectBacking {
    pub schema_version: u8,
    pub project_id: String,
    #[serde(deserialize_with = "Option::deserialize")]
    pub selection: Option<YoutubeSelection>,
}
impl ProjectBacking {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_uuid(&self.project_id)?;
        if let Some(selection) = &self.selection {
            selection.validate()?;
        }
        Ok(())
    }
}
fn invalid_backing() -> AppError {
    AppError::new(
        "INVALID_BACKING_SOURCE",
        "저장한 YouTube 영상 주소 정보를 확인하세요.",
        false,
    )
}

impl ProjectStore {
    pub fn backing(
        &self,
        project_id: &str,
        cancel: &AtomicBool,
    ) -> Result<ProjectBacking, AppError> {
        validate_uuid(project_id)?;
        canceled(cancel)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let row = db.query_row(
            "SELECT kind,video_id,user_selected,updated_at_ms FROM project_backings WHERE project_id=?1",
            [project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?)),
        ).optional().map_err(|_| storage_error())?;
        let selection = if let Some((kind, video_id, selected, updated)) = row {
            if kind != "YOUTUBE_EMBED"
                || selected != 1
                || !(0..=9_007_199_254_740_991).contains(&updated)
            {
                return Err(invalid_backing());
            }
            let selection = YoutubeSelection {
                kind: BackingKind::YoutubeEmbed,
                video_id,
                selected_by_user: true,
            };
            selection.validate()?;
            Some(selection)
        } else {
            None
        };
        canceled(cancel)?;
        Ok(ProjectBacking {
            schema_version: 1,
            project_id: project_id.into(),
            selection,
        })
    }

    pub fn save_backing(
        &self,
        value: &ProjectBacking,
        cancel: &AtomicBool,
    ) -> Result<(), AppError> {
        value.validate()?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        canceled(cancel)?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        self.summary(&tx, &value.project_id)?;
        let time = now_ms()?;
        if let Some(selection) = &value.selection {
            tx.execute("INSERT INTO project_backings(project_id,kind,video_id,user_selected,updated_at_ms) VALUES(?1,'YOUTUBE_EMBED',?2,1,?3) ON CONFLICT(project_id) DO UPDATE SET kind=excluded.kind,video_id=excluded.video_id,user_selected=1,updated_at_ms=excluded.updated_at_ms", params![value.project_id,selection.video_id,time]).map_err(|_|storage_error())?;
        } else {
            tx.execute(
                "DELETE FROM project_backings WHERE project_id=?1",
                [&value.project_id],
            )
            .map_err(|_| storage_error())?;
        }
        tx.execute(
            "UPDATE projects SET updated_at_ms=?1 WHERE id=?2",
            params![time, value.project_id],
        )
        .map_err(|_| storage_error())?;
        canceled(cancel)?;
        tx.commit().map_err(|_| storage_error())
    }
}
