//! docs/12 "테이크 Freeze v1": 테이크를 AmpliTube로 처리한 캐시 WAV와 렌더에 쓴 톤을 저장합니다.
use super::{
    database::{checked_file, connect},
    export_file::{save_new_file, save_new_file_with_progress},
    project_model::{storage_error, validate_uuid},
    projects::{canceled, hash, ProjectStore},
};
use crate::{ipc::AppError, recording::model::RecordingState};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};

const MAX_STATE_BYTES: usize = 8 * 1024 * 1024;
/// 저장한 결과를 다시 읽고 내보내는 작업 전송 한도(`StorageJob` 256MiB)와 같게 맞춥니다.
pub const MAX_RENDER_BYTES: usize = 256 * 1024 * 1024;
pub fn too_large() -> AppError {
    render_error(
        "RENDER_TOO_LARGE",
        "처리 결과가 256MB를 넘어 저장하지 않았습니다. 테이크를 짧게 나누거나 48kHz로 녹음하세요.",
    )
}
/// 렌더 캐시 최대 길이(원본 10분 + tail 10초 + 여유 1초). 믹스 디코더도 이 길이까지 받습니다.
pub(crate) const MAX_SECONDS: u64 = 600 + 11;

pub fn render_error(code: &'static str, message: &'static str) -> AppError {
    AppError::new(code, message, true)
}
fn invalid() -> AppError {
    render_error(
        "FREEZE_INVALID",
        "Freeze 캐시가 손상됐습니다. Unfreeze 후 다시 Freeze하세요.",
    )
}
fn hex(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|b| b.is_ascii_hexdigit())
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TakeRender {
    pub schema_version: u8,
    pub id: String,
    pub project_id: String,
    pub take_id: String,
    pub kind: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub frames: u64,
    pub duration_ms: f64,
    pub bytes: usize,
    pub sha256: String,
    pub take_sha256: String,
    pub plugin_class_id: String,
    pub plugin_version: String,
    pub latency_frames: u32,
    pub tail_frames: u64,
    pub created_at_ms: u64,
}
impl TakeRender {
    fn validate(&self) -> Result<(), AppError> {
        if self.bytes > MAX_RENDER_BYTES {
            return Err(too_large());
        }
        validate_uuid(&self.id)?;
        validate_uuid(&self.project_id)?;
        validate_uuid(&self.take_id)?;
        let rate = u64::from(self.sample_rate);
        if self.schema_version != 1
            || !["FREEZE", "BOUNCE"].contains(&self.kind.as_str())
            || !(8000..=192_000).contains(&self.sample_rate)
            || self.channels != 2
            || self.frames == 0
            || self.frames > rate * MAX_SECONDS
            || (self.duration_ms - self.frames as f64 * 1000.0 / rate as f64).abs() > 0.000001
            || self.bytes as u64 != 44 + self.frames * 8
            || !hex(&self.sha256, 64)
            || !hex(&self.take_sha256, 64)
            || !hex(&self.plugin_class_id, 32)
            || !(1..=64).contains(&self.plugin_version.len())
            || self.plugin_version.chars().any(char::is_control)
            || self.latency_frames > 192_000
            || self.tail_frames > rate * 11
        {
            return Err(invalid());
        }
        Ok(())
    }
    fn relative(&self) -> PathBuf {
        PathBuf::from(format!(
            "projects/{}/renders/{}.wav",
            self.project_id, self.id
        ))
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreezeExport {
    schema_version: u8,
    state: &'static str,
    project_id: String,
    take_id: String,
    bytes: u64,
    sha256: String,
}

impl ProjectStore {
    fn read_render_row(
        &self,
        db: &rusqlite::Connection,
        project_id: &str,
        take_id: &str,
    ) -> Result<Option<(TakeRender, Vec<u8>)>, AppError> {
        let row: Option<(String, String, Vec<u8>, String)> = db
            .query_row(
                "SELECT metadata_json,metadata_sha256,state,state_sha256 FROM take_renders WHERE project_id=?1 AND take_id=?2 AND kind='FREEZE'",
                params![project_id, take_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|_| storage_error())?;
        row.map(|(text, digest, state, state_digest)| {
            if hash(text.as_bytes()) != digest
                || state.is_empty()
                || state.len() > MAX_STATE_BYTES
                || hash(&state) != state_digest
            {
                return Err(invalid());
            }
            let meta: TakeRender = serde_json::from_str(&text).map_err(|_| invalid())?;
            meta.validate()?;
            if meta.project_id != project_id || meta.take_id != take_id || meta.kind != "FREEZE" {
                return Err(invalid());
            }
            Ok((meta, state))
        })
        .transpose()
    }
    pub fn take_freezes(&self, project_id: &str) -> Result<Vec<TakeRender>, AppError> {
        self.renders_of(project_id, "FREEZE")
    }
    /// docs/12 "Bounce to New Track v1"
    pub fn take_bounces(&self, project_id: &str) -> Result<Vec<TakeRender>, AppError> {
        self.renders_of(project_id, "BOUNCE")
    }
    fn renders_of(&self, project_id: &str, kind: &str) -> Result<Vec<TakeRender>, AppError> {
        validate_uuid(project_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let mut query = db
            .prepare("SELECT metadata_json,metadata_sha256 FROM take_renders WHERE project_id=?1 AND kind=?2 ORDER BY rowid LIMIT 1001")
            .map_err(|_| storage_error())?;
        let rows = query
            .query_map(params![project_id, kind], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|_| storage_error())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|_| storage_error())?;
        if rows.len() > 1000 {
            return Err(storage_error());
        }
        rows.into_iter()
            .map(|(text, digest)| {
                if hash(text.as_bytes()) != digest {
                    return Err(invalid());
                }
                let meta: TakeRender = serde_json::from_str(&text).map_err(|_| invalid())?;
                meta.validate()?;
                if meta.project_id != project_id || meta.kind != kind {
                    return Err(invalid());
                }
                Ok(meta)
            })
            .collect()
    }
    /// 영구 Bounce 결과를 새 파일·새 행으로 더합니다(프로젝트당 20개, 이전 것은 그대로).
    pub fn save_take_bounce(
        &self,
        meta: &TakeRender,
        wav: &[u8],
        state: &[u8],
        cancel: &AtomicBool,
    ) -> Result<(), AppError> {
        meta.validate()?;
        if meta.kind != "BOUNCE"
            || wav.len() != meta.bytes
            || hash(wav) != meta.sha256
            || state.is_empty()
            || state.len() > MAX_STATE_BYTES
        {
            return Err(invalid());
        }
        if self.ready_take_sha(&meta.project_id, &meta.take_id)? != meta.take_sha256 {
            return Err(render_error(
                "FREEZE_STALE",
                "처리하는 동안 테이크가 바뀌었습니다.",
            ));
        }
        let text = serde_json::to_string(meta).map_err(|_| invalid())?;
        if text.len() > 4096 {
            return Err(invalid());
        }
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        canceled(cancel)?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        self.summary(&tx, &meta.project_id)?;
        let count: u32 = tx
            .query_row(
                "SELECT count(*) FROM take_renders WHERE project_id=?1 AND kind='BOUNCE'",
                [&meta.project_id],
                |r| r.get(0),
            )
            .map_err(|_| storage_error())?;
        if count >= 20 {
            return Err(render_error(
                "BOUNCE_LIMIT",
                "프로젝트당 Bounce 트랙은 20개까지입니다.",
            ));
        }
        let path = checked_file(&self.root, &meta.relative())?;
        save_new_file(&path, wav, "wav", cancel)?;
        let result = (|| {
            tx.execute(
                "INSERT INTO take_renders VALUES(?1,?2,?3,'BOUNCE',?4,?5,?6,?7)",
                params![
                    meta.id,
                    meta.project_id,
                    meta.take_id,
                    text,
                    hash(text.as_bytes()),
                    state,
                    hash(state)
                ],
            )
            .map_err(|_| storage_error())?;
            canceled(cancel)?;
            tx.commit().map_err(|_| storage_error())
        })();
        if result.is_err() && fs::remove_file(&path).is_err() {
            eprintln!("GuitarLab 새 Bounce 파일 정리 실패: BOUNCE_CLEANUP_FAILED");
        }
        result
    }
    /// Bounce 결과(크기·SHA만 검사, 원본 테이크와 독립).
    pub fn read_take_bounce(
        &self,
        project_id: &str,
        render_id: &str,
        cancel: &AtomicBool,
    ) -> Result<(TakeRender, Vec<u8>), AppError> {
        validate_uuid(project_id)?;
        validate_uuid(render_id)?;
        canceled(cancel)?;
        let (text, digest): (String, String) = {
            let db = connect(&self.root)?;
            self.summary(&db, project_id)?;
            db.query_row(
                "SELECT metadata_json,metadata_sha256 FROM take_renders WHERE project_id=?1 AND id=?2 AND kind='BOUNCE'",
                params![project_id, render_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|_| storage_error())?
            .ok_or_else(|| {
                render_error(
                    "BOUNCE_NOT_FOUND",
                    "이 프로젝트의 Bounce 트랙을 찾을 수 없습니다.",
                )
            })?
        };
        if hash(text.as_bytes()) != digest {
            return Err(invalid());
        }
        let meta: TakeRender = serde_json::from_str(&text).map_err(|_| invalid())?;
        meta.validate()?;
        if meta.project_id != project_id || meta.id != render_id || meta.kind != "BOUNCE" {
            return Err(invalid());
        }
        let path = checked_file(&self.root, &meta.relative())?;
        if fs::metadata(&path).map_err(|_| invalid())?.len() != meta.bytes as u64 {
            return Err(invalid());
        }
        let bytes = fs::read(&path).map_err(|_| invalid())?;
        canceled(cancel)?;
        if bytes.len() != meta.bytes || hash(&bytes) != meta.sha256 {
            return Err(invalid());
        }
        Ok((meta, bytes))
    }
    /// 테이크의 현재 원본 SHA(READY일 때만).
    pub fn ready_take_sha(&self, project_id: &str, take_id: &str) -> Result<String, AppError> {
        let take = self.take(project_id, take_id)?;
        match (take.state, take.sha256) {
            (RecordingState::Ready, Some(sha)) => Ok(sha),
            _ => Err(render_error(
                "TAKE_NOT_READY",
                "완료된 테이크만 Freeze할 수 있습니다.",
            )),
        }
    }
    /// 새 캐시를 저장하고 같은 테이크의 이전 Freeze를 한 트랜잭션에서 바꿉니다(실패하면 이전 것 유지).
    pub fn save_take_freeze(
        &self,
        meta: &TakeRender,
        wav: &[u8],
        state: &[u8],
        cancel: &AtomicBool,
    ) -> Result<(), AppError> {
        meta.validate()?;
        if meta.kind != "FREEZE"
            || wav.len() != meta.bytes
            || hash(wav) != meta.sha256
            || state.is_empty()
            || state.len() > MAX_STATE_BYTES
        {
            return Err(invalid());
        }
        if self.ready_take_sha(&meta.project_id, &meta.take_id)? != meta.take_sha256 {
            return Err(render_error(
                "FREEZE_STALE",
                "Freeze하는 동안 테이크가 바뀌었습니다.",
            ));
        }
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        canceled(cancel)?;
        let path = checked_file(&self.root, &meta.relative())?;
        save_new_file(&path, wav, "wav", cancel)?;
        let mut old = None;
        let result = (|| {
            let text = serde_json::to_string(meta).map_err(|_| invalid())?;
            if text.len() > 4096 {
                return Err(invalid());
            }
            let mut db = connect(&self.root)?;
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| storage_error())?;
            self.summary(&tx, &meta.project_id)?;
            old = self
                .read_render_row(&tx, &meta.project_id, &meta.take_id)
                .ok()
                .flatten();
            tx.execute(
                "DELETE FROM take_renders WHERE project_id=?1 AND take_id=?2 AND kind='FREEZE'",
                params![meta.project_id, meta.take_id],
            )
            .map_err(|_| storage_error())?;
            tx.execute(
                "INSERT INTO take_renders VALUES(?1,?2,?3,'FREEZE',?4,?5,?6,?7)",
                params![
                    meta.id,
                    meta.project_id,
                    meta.take_id,
                    text,
                    hash(text.as_bytes()),
                    state,
                    hash(state)
                ],
            )
            .map_err(|_| storage_error())?;
            canceled(cancel)?;
            tx.commit().map_err(|_| storage_error())
        })();
        if result.is_err() {
            if fs::remove_file(&path).is_err() {
                eprintln!("GuitarLab 새 Freeze 캐시 정리 실패: FREEZE_CLEANUP_FAILED");
            }
            return result;
        }
        if let Some((previous, _)) = old {
            remove_cache(&self.root, &previous);
        }
        Ok(())
    }
    /// 캐시 바이트를 크기·SHA·테이크 원본 SHA까지 확인해 돌려줍니다.
    pub fn read_take_freeze(
        &self,
        project_id: &str,
        take_id: &str,
        cancel: &AtomicBool,
    ) -> Result<(TakeRender, Vec<u8>), AppError> {
        validate_uuid(project_id)?;
        validate_uuid(take_id)?;
        canceled(cancel)?;
        let meta = {
            let db = connect(&self.root)?;
            self.summary(&db, project_id)?;
            self.read_render_row(&db, project_id, take_id)?
                .ok_or_else(|| render_error("FREEZE_NOT_FOUND", "Freeze된 테이크가 아닙니다."))?
                .0
        };
        if self.take(project_id, take_id)?.sha256.as_deref() != Some(meta.take_sha256.as_str()) {
            return Err(render_error(
                "FREEZE_STALE",
                "테이크가 Freeze 뒤 바뀌었습니다. 다시 Freeze하세요.",
            ));
        }
        let path = checked_file(&self.root, &meta.relative())?;
        if fs::metadata(&path).map_err(|_| invalid())?.len() != meta.bytes as u64 {
            return Err(invalid());
        }
        let bytes = fs::read(&path).map_err(|_| invalid())?;
        canceled(cancel)?;
        if bytes.len() != meta.bytes || hash(&bytes) != meta.sha256 {
            return Err(invalid());
        }
        Ok((meta, bytes))
    }
    /// docs/12 "처리된 소리 내보내기 v1": 검사한 캐시를 사용자가 고른 새 파일에 그대로 씁니다.
    pub fn export_take_freeze(
        &self,
        project_id: &str,
        take_id: &str,
        path: &Path,
        cancel: &AtomicBool,
        progress: impl Fn(u64, u64) -> Result<(), AppError>,
    ) -> Result<FreezeExport, AppError> {
        let parent = path
            .parent()
            .ok_or_else(AppError::invalid)?
            .canonicalize()
            .map_err(|_| AppError::invalid())?;
        if !path.is_absolute()
            || parent.starts_with(self.root.canonicalize().map_err(|_| AppError::invalid())?)
        {
            return Err(AppError::invalid());
        }
        let (meta, bytes) = self.read_take_freeze(project_id, take_id, cancel)?;
        save_new_file_with_progress(path, &bytes, "wav", cancel, progress)?;
        Ok(FreezeExport {
            schema_version: 1,
            state: "FREEZE_EXPORTED",
            project_id: meta.project_id,
            take_id: meta.take_id,
            bytes: bytes.len() as u64,
            sha256: meta.sha256,
        })
    }
    /// docs/12 "Bounce 삭제·관리 v1": 저장된 믹스가 쓰면 거부하고, 아니면 행·파일을 지웁니다(멱등).
    pub fn delete_take_bounce(&self, project_id: &str, render_id: &str) -> Result<bool, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(render_id)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        self.summary(&tx, project_id)?;
        let saved: Option<String> = tx
            .query_row(
                "SELECT document_json FROM project_mixes WHERE project_id=?1",
                [project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| storage_error())?;
        if let Some(text) = saved {
            let mix: serde_json::Value =
                serde_json::from_str(&text).map_err(|_| storage_error())?;
            let used = mix["layers"].as_array().is_some_and(|layers| {
                layers
                    .iter()
                    .any(|l| l["kind"] == "RENDER" && l["id"] == render_id)
            });
            if used {
                return Err(render_error(
                    "BOUNCE_IN_USE",
                    "저장된 믹스 설정이 이 Bounce를 쓰고 있습니다. 믹스에서 빼고 설정을 저장한 뒤 지우세요.",
                ));
            }
        }
        let text: Option<String> = tx
            .query_row(
                "SELECT metadata_json FROM take_renders WHERE project_id=?1 AND id=?2 AND kind='BOUNCE'",
                params![project_id, render_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| storage_error())?;
        let removed = tx
            .execute(
                "DELETE FROM take_renders WHERE project_id=?1 AND id=?2 AND kind='BOUNCE'",
                params![project_id, render_id],
            )
            .map_err(|_| storage_error())?
            > 0;
        tx.commit().map_err(|_| storage_error())?;
        // 손상된 메타데이터라 경로를 못 만들면 행만 지우고 파일 정리는 건너뜁니다.
        if let Some(meta) = text.and_then(|t| serde_json::from_str::<TakeRender>(&t).ok()) {
            if meta.id == render_id && meta.project_id == project_id {
                remove_cache(&self.root, &meta);
            }
        }
        Ok(removed)
    }
    /// Freeze에 쓴 톤(class ID, 상태 봉투).
    pub fn take_freeze_state(
        &self,
        project_id: &str,
        take_id: &str,
    ) -> Result<(String, Vec<u8>), AppError> {
        validate_uuid(project_id)?;
        validate_uuid(take_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let (meta, state) = self
            .read_render_row(&db, project_id, take_id)?
            .ok_or_else(|| render_error("FREEZE_NOT_FOUND", "Freeze된 테이크가 아닙니다."))?;
        Ok((meta.plugin_class_id, state))
    }
    /// 행을 지운 뒤 캐시 파일을 지웁니다(멱등, DI는 건드리지 않음).
    pub fn unfreeze_take(&self, project_id: &str, take_id: &str) -> Result<bool, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(take_id)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        self.summary(&tx, project_id)?;
        // 손상된 행도 지울 수 있도록 메타데이터를 못 읽으면 파일 정리만 건너뜁니다.
        let old = self
            .read_render_row(&tx, project_id, take_id)
            .ok()
            .flatten();
        let removed = tx
            .execute(
                "DELETE FROM take_renders WHERE project_id=?1 AND take_id=?2 AND kind='FREEZE'",
                params![project_id, take_id],
            )
            .map_err(|_| storage_error())?
            > 0;
        tx.commit().map_err(|_| storage_error())?;
        if let Some((meta, _)) = old {
            remove_cache(&self.root, &meta);
        }
        Ok(removed)
    }
}
fn remove_cache(root: &std::path::Path, meta: &TakeRender) {
    if let Ok(path) = checked_file(root, &meta.relative()) {
        if path.exists() && fs::remove_file(&path).is_err() {
            eprintln!("GuitarLab Freeze 캐시 정리 실패: FREEZE_CLEANUP_FAILED");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::projects_tests::Fixture;

    fn wav(frames: usize) -> Vec<u8> {
        crate::plugins::render::stereo_wav(&vec![0.1; frames], &vec![0.2; frames], 48000)
    }
    pub(crate) fn meta(project: &str, take: &str, take_sha: &str, bytes: &[u8]) -> TakeRender {
        let frames = ((bytes.len() - 44) / 8) as u64;
        TakeRender {
            schema_version: 1,
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project.into(),
            take_id: take.into(),
            kind: "FREEZE".into(),
            sample_rate: 48000,
            channels: 2,
            frames,
            duration_ms: frames as f64 * 1000.0 / 48000.0,
            bytes: bytes.len(),
            sha256: hash(bytes),
            take_sha256: take_sha.into(),
            plugin_class_id: "56535441746235616D706C6974756265".into(),
            plugin_version: "5.10.4".into(),
            latency_frames: 7,
            tail_frames: 0,
            created_at_ms: 1,
        }
    }
    #[test]
    fn freeze_saves_replaces_reads_and_unfreezes_without_touching_dry_take() {
        let f = Fixture::new();
        let (project, take, dry_path) = crate::storage::recordings_tests::ready_take(&f);
        let dry = fs::read(&dry_path).expect("DI");
        let take_sha = f.store.ready_take_sha(&project, &take).expect("SHA");
        let no = AtomicBool::new(false);
        let first = wav(480);
        let a = meta(&project, &take, &take_sha, &first);
        f.store
            .save_take_freeze(&a, &first, &[1, 2, 3], &no)
            .expect("Freeze");
        assert_eq!(
            f.store.take_freezes(&project).expect("목록"),
            std::slice::from_ref(&a)
        );
        // 다시 Freeze하면 새 캐시로 바뀌고 이전 파일은 지워집니다.
        let second = wav(960);
        let b = meta(&project, &take, &take_sha, &second);
        f.store
            .save_take_freeze(&b, &second, &[4], &no)
            .expect("다시 Freeze");
        assert!(!checked_file(&f.store.root, &a.relative())
            .expect("경로")
            .exists());
        let (read, bytes) = f
            .store
            .read_take_freeze(&project, &take, &no)
            .expect("읽기");
        assert_eq!((read, bytes), (b.clone(), second.clone()));
        assert_eq!(
            f.store.take_freeze_state(&project, &take).expect("톤").1,
            [4]
        );
        // 캐시가 손상되면 읽지 않습니다.
        let path = checked_file(&f.store.root, &b.relative()).expect("경로");
        let mut broken = second.clone();
        broken[100] ^= 1;
        fs::write(&path, &broken).expect("손상 fixture");
        assert_eq!(
            f.store
                .read_take_freeze(&project, &take, &no)
                .expect_err("손상")
                .code,
            "FREEZE_INVALID"
        );
        fs::write(&path, &second).expect("캐시 복구");
        // 처리된 소리 내보내기: 앱 밖 새 파일에만, 캐시와 같은 바이트로 씁니다.
        let outside = f.store.root.parent().expect("상위").join("처리된 소리.wav");
        let exported = f
            .store
            .export_take_freeze(&project, &take, &outside, &no, |_, _| Ok(()))
            .expect("내보내기");
        assert_eq!(fs::read(&outside).expect("결과"), second);
        assert_eq!(exported.bytes, second.len() as u64);
        assert_eq!(
            f.store
                .export_take_freeze(&project, &take, &outside, &no, |_, _| Ok(()))
                .expect_err("덮어쓰기")
                .code,
            "EXPORT_DESTINATION_EXISTS"
        );
        let inside = f.store.root.join("안쪽.wav");
        assert_eq!(
            f.store
                .export_take_freeze(&project, &take, &inside, &no, |_, _| Ok(()))
                .expect_err("앱 폴더")
                .code,
            "INVALID_INPUT"
        );
        // Bounce: Freeze와 따로 영구 보존되고, 여러 개가 쌓이며 Unfreeze와 무관합니다.
        let mut bounce = meta(&project, &take, &take_sha, &first);
        bounce.kind = "BOUNCE".into();
        f.store
            .save_take_bounce(&bounce, &first, &[9], &no)
            .expect("Bounce");
        assert_eq!(
            f.store.take_bounces(&project).expect("목록"),
            std::slice::from_ref(&bounce)
        );
        assert_eq!(
            f.store.take_freezes(&project).expect("Freeze 목록").len(),
            1
        );
        assert_eq!(
            f.store
                .read_take_bounce(&project, &bounce.id, &no)
                .expect("읽기")
                .1,
            first
        );
        assert_eq!(
            f.store
                .read_take_bounce(&project, &b.id, &no)
                .expect_err("Freeze id로는 읽지 않음")
                .code,
            "BOUNCE_NOT_FOUND"
        );
        assert!(f.store.unfreeze_take(&project, &take).expect("Unfreeze"));
        assert!(!path.exists());
        assert!(!f.store.unfreeze_take(&project, &take).expect("멱등"));
        assert_eq!(
            f.store
                .read_take_freeze(&project, &take, &no)
                .expect_err("없음")
                .code,
            "FREEZE_NOT_FOUND"
        );
        assert_eq!(fs::read(&dry_path).expect("DI"), dry, "원본 DI 불변");
        assert!(
            f.store.read_take_bounce(&project, &bounce.id, &no).is_ok(),
            "Unfreeze 뒤에도 Bounce 보존"
        );
        // 삭제: 저장된 믹스가 쓰면 거부하고, 빼고 저장하면 행·파일을 지웁니다(멱등).
        let bounce_path = checked_file(&f.store.root, &bounce.relative()).expect("경로");
        let save_mix = |layers: serde_json::Value| {
            let text = serde_json::json!({"schemaVersion":1,"projectId":project,"masterGain":0.7,"layers":layers}).to_string();
            let db = connect(&f.store.root).expect("DB");
            db.execute(
                "INSERT INTO project_mixes VALUES(?1,?2,?3) ON CONFLICT(project_id) DO UPDATE SET document_json=excluded.document_json,document_sha256=excluded.document_sha256",
                params![project, text, hash(text.as_bytes())],
            )
            .expect("저장 믹스 fixture");
        };
        save_mix(
            serde_json::json!([{"kind":"RENDER","id":bounce.id,"gain":0.7,"mute":false,"solo":false,"offsetMs":0}]),
        );
        assert_eq!(
            f.store
                .delete_take_bounce(&project, &bounce.id)
                .expect_err("사용 중")
                .code,
            "BOUNCE_IN_USE"
        );
        assert!(bounce_path.exists());
        save_mix(serde_json::json!([]));
        assert!(f
            .store
            .delete_take_bounce(&project, &bounce.id)
            .expect("삭제"));
        assert!(!bounce_path.exists());
        assert!(!f
            .store
            .delete_take_bounce(&project, &bounce.id)
            .expect("멱등"));
        assert_eq!(
            f.store
                .read_take_bounce(&project, &bounce.id, &no)
                .expect_err("없음")
                .code,
            "BOUNCE_NOT_FOUND"
        );
        // 위에서 하나를 지웠으므로 20개를 채웁니다.
        for _ in 0..20 {
            let mut more = meta(&project, &take, &take_sha, &first);
            more.kind = "BOUNCE".into();
            f.store
                .save_take_bounce(&more, &first, &[9], &no)
                .expect("Bounce 추가");
        }
        let mut over = meta(&project, &take, &take_sha, &first);
        over.kind = "BOUNCE".into();
        assert_eq!(
            f.store
                .save_take_bounce(&over, &first, &[9], &no)
                .expect_err("한도")
                .code,
            "BOUNCE_LIMIT"
        );
        assert!(!checked_file(&f.store.root, &over.relative())
            .expect("경로")
            .exists());
        // 테이크 SHA가 다르면(렌더 중 바뀜) 저장하지 않고 파일도 남기지 않습니다.
        let stale = meta(&project, &take, &"0".repeat(64), &first);
        assert_eq!(
            f.store
                .save_take_freeze(&stale, &first, &[1], &no)
                .expect_err("바뀜")
                .code,
            "FREEZE_STALE"
        );
        assert!(!checked_file(&f.store.root, &stale.relative())
            .expect("경로")
            .exists());
        // 저장은 되는데 다시 읽거나 내보내지 못하는 크기(96kHz·400초 stereo 등)는 처음부터 거부합니다.
        let mut huge = meta(&project, &take, &take_sha, &first);
        huge.sample_rate = 96000;
        huge.frames = (MAX_RENDER_BYTES as u64 - 44) / 8 + 1;
        huge.bytes = 44 + huge.frames as usize * 8;
        huge.duration_ms = huge.frames as f64 * 1000.0 / 96000.0;
        assert_eq!(
            f.store
                .save_take_freeze(&huge, &first, &[1], &no)
                .expect_err("너무 큼")
                .code,
            "RENDER_TOO_LARGE"
        );
        let mut wrong = meta(&project, &take, &take_sha, &first);
        wrong.channels = 1;
        assert_eq!(
            f.store
                .save_take_freeze(&wrong, &first, &[1], &no)
                .expect_err("형식")
                .code,
            "FREEZE_INVALID"
        );
    }
}
