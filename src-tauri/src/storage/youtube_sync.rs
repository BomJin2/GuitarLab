use super::{
    backing::{BackingKind, YoutubeSelection},
    database::connect,
    project_model::{storage_error, validate_uuid, SyncAnchor, MAX_SAFE},
    projects::{canceled, hash, now_ms, ProjectStore},
};
use crate::ipc::AppError;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct YoutubeSyncKey {
    pub schema_version: u8,
    pub project_id: String,
    pub revision_id: String,
    pub video_id: String,
    pub track_id: String,
}
impl YoutubeSyncKey {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.revision_id)?;
        if self.schema_version != 1
            || self.track_id.is_empty()
            || self.track_id.chars().count() > 128
            || self.track_id.chars().any(char::is_control)
        {
            return Err(invalid());
        }
        YoutubeSelection {
            kind: BackingKind::YoutubeEmbed,
            video_id: self.video_id.clone(),
            selected_by_user: true,
        }
        .validate()
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct YoutubeSyncProfile {
    pub score_id: String,
    pub end_tick: u64,
    pub duration_ms: f64,
    pub anchors: Vec<SyncAnchor>,
}
impl YoutubeSyncProfile {
    fn validate(&self) -> Result<(), AppError> {
        if self.score_id.is_empty()
            || self.score_id.chars().count() > 128
            || self.score_id.chars().any(char::is_control)
            || self.end_tick == 0
            || self.end_tick > MAX_SAFE
            || !self.duration_ms.is_finite()
            || self.duration_ms <= 0.0
            || self.duration_ms > 604_800_000.0
            || self.anchors.len() != 2
            || self.anchors.iter().any(|a| {
                a.score_tick > self.end_tick
                    || !a.audio_time_ms.is_finite()
                    || !(0.0..=self.duration_ms).contains(&a.audio_time_ms)
            })
            || self.anchors[0].score_tick >= self.anchors[1].score_tick
            || self.anchors[0].audio_time_ms >= self.anchors[1].audio_time_ms
        {
            return Err(invalid());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectYoutubeSync {
    pub schema_version: u8,
    pub project_id: String,
    pub revision_id: String,
    pub video_id: String,
    pub track_id: String,
    #[serde(deserialize_with = "Option::deserialize")]
    pub profile: Option<YoutubeSyncProfile>,
}
impl ProjectYoutubeSync {
    pub fn key(&self) -> YoutubeSyncKey {
        YoutubeSyncKey {
            schema_version: self.schema_version,
            project_id: self.project_id.clone(),
            revision_id: self.revision_id.clone(),
            video_id: self.video_id.clone(),
            track_id: self.track_id.clone(),
        }
    }
    pub fn validate(&self) -> Result<(), AppError> {
        self.key().validate()?;
        if let Some(profile) = &self.profile {
            profile.validate()?;
        }
        Ok(())
    }
}
fn invalid() -> AppError {
    AppError::new(
        "INVALID_YOUTUBE_SYNC",
        "영상 맞춤의 악보 버전·영상·지점을 확인하세요.",
        false,
    )
}
impl ProjectStore {
    fn validate_youtube_revision(&self, value: &ProjectYoutubeSync) -> Result<(), AppError> {
        value.validate()?;
        let revision = self.revision(&value.project_id, &value.revision_id)?;
        if !revision.score.tracks.iter().any(|t| t.id == value.track_id) {
            return Err(invalid());
        }
        if let Some(profile) = &value.profile {
            if revision.score.id != profile.score_id
                || revision
                    .score
                    .time_signatures
                    .last()
                    .is_some_and(|s| profile.end_tick <= s.tick)
            {
                return Err(invalid());
            }
        }
        Ok(())
    }
    pub fn youtube_sync(
        &self,
        key: &YoutubeSyncKey,
        cancel: &AtomicBool,
    ) -> Result<ProjectYoutubeSync, AppError> {
        key.validate()?;
        canceled(cancel)?;
        let db = connect(&self.root)?;
        let row = db.query_row(
            "SELECT document_json,document_sha256,updated_at_ms FROM project_youtube_syncs WHERE project_id=?1 AND revision_id=?2 AND video_id=?3 AND track_id=?4",
            params![key.project_id,key.revision_id,key.video_id,key.track_id],
            |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,i64>(2)?))
        ).optional().map_err(|_|storage_error())?;
        let value = if let Some((json, digest, time)) = row {
            if json.len() > 4096
                || hash(json.as_bytes()) != digest
                || !(0..=MAX_SAFE as i64).contains(&time)
            {
                return Err(invalid());
            }
            let value: ProjectYoutubeSync = serde_json::from_str(&json).map_err(|_| invalid())?;
            if value.project_id != key.project_id
                || value.revision_id != key.revision_id
                || value.video_id != key.video_id
                || value.track_id != key.track_id
                || value.profile.is_none()
            {
                return Err(invalid());
            }
            value
        } else {
            ProjectYoutubeSync {
                schema_version: 1,
                project_id: key.project_id.clone(),
                revision_id: key.revision_id.clone(),
                video_id: key.video_id.clone(),
                track_id: key.track_id.clone(),
                profile: None,
            }
        };
        self.validate_youtube_revision(&value)?;
        canceled(cancel)?;
        Ok(value)
    }
    pub fn save_youtube_sync(
        &self,
        value: &ProjectYoutubeSync,
        cancel: &AtomicBool,
    ) -> Result<(), AppError> {
        value.validate()?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        self.validate_youtube_revision(value)?;
        canceled(cancel)?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        if value.profile.is_some() {
            let count: u32 = tx
                .query_row(
                    "SELECT COUNT(*) FROM project_youtube_syncs WHERE project_id=?1",
                    [&value.project_id],
                    |r| r.get(0),
                )
                .map_err(|_| storage_error())?;
            let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM project_youtube_syncs WHERE project_id=?1 AND revision_id=?2 AND video_id=?3 AND track_id=?4)", params![value.project_id,value.revision_id,value.video_id,value.track_id],|r|r.get(0)).map_err(|_|storage_error())?;
            if count >= 100 && !exists {
                return Err(AppError::new(
                    "YOUTUBE_SYNC_LIMIT",
                    "프로젝트 맞춤100개 한도입니다. 필요 없는 맞춤을 삭제하세요.",
                    false,
                ));
            }
            let json = serde_json::to_string(value).map_err(|_| invalid())?;
            if json.len() > 4096 {
                return Err(invalid());
            }
            tx.execute("INSERT INTO project_youtube_syncs VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(project_id,revision_id,video_id,track_id) DO UPDATE SET document_json=excluded.document_json,document_sha256=excluded.document_sha256,updated_at_ms=excluded.updated_at_ms",params![value.project_id,value.revision_id,value.video_id,value.track_id,json,hash(json.as_bytes()),now_ms()?]).map_err(|_|storage_error())?;
        } else {
            tx.execute("DELETE FROM project_youtube_syncs WHERE project_id=?1 AND revision_id=?2 AND video_id=?3 AND track_id=?4",params![value.project_id,value.revision_id,value.video_id,value.track_id]).map_err(|_|storage_error())?;
        }
        canceled(cancel)?;
        tx.commit().map_err(|_| storage_error())
    }
}
