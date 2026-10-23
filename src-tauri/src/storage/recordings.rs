use super::{
    database::{checked_file, connect},
    project_model::{storage_error, validate_uuid, AssetKind},
    projects::{canceled, hash, now_ms, ProjectStore},
};
use crate::{
    ipc::AppError,
    recording::{
        model::{record_error, valid_edits, RecordedTake, RecordingState},
        wave,
    },
};
use rusqlite::{params, OptionalExtension};
use std::{
    fs::{self, File},
    io::{BufReader, Read},
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};
use uuid::Uuid;

fn decode(json: String, digest: String, state: String) -> Result<RecordedTake, AppError> {
    if json.len() > 65536 || hash(json.as_bytes()) != digest {
        return Err(storage_error());
    }
    let take: RecordedTake = serde_json::from_str(&json).map_err(|_| storage_error())?;
    take.validate().map_err(|_| storage_error())?;
    if take.state.as_str() != state {
        return Err(storage_error());
    }
    Ok(take)
}
impl ProjectStore {
    pub fn recording_path(&self, take: &RecordedTake, partial: bool) -> Result<PathBuf, AppError> {
        validate_uuid(&take.project_id)?;
        validate_uuid(&take.id)?;
        checked_file(
            &self.root,
            Path::new(&format!(
                "projects/{}/recordings/{}/{}",
                take.project_id,
                take.id,
                if partial { "dry.wav.part" } else { "dry.wav" }
            )),
        )
    }
    pub fn prepare_recording(&self, take: &RecordedTake) -> Result<PathBuf, AppError> {
        take.validate()?;
        let revision = self.revision(&take.project_id, &take.score_revision_id)?;
        for id in &take.reference_take_ids {
            let reference = self.take(&take.project_id, id)?;
            if reference.state != RecordingState::Ready
                || reference.score_revision_id != take.score_revision_id
            {
                return Err(record_error("RECORDING_REFERENCE_INVALID"));
            }
        }
        if !revision
            .score
            .tracks
            .iter()
            .any(|t| t.id == take.target_score_track_id)
        {
            return Err(AppError::invalid());
        }
        if let Some(t) = &take.transport {
            if take.recovered_from.is_none()
                && !self.assets(&take.project_id)?.iter().any(|a| {
                    a.id == t.backing_asset_id && a.kind == AssetKind::Original && a.available
                })
            {
                return Err(AppError::new(
                    "ASSET_NOT_FOUND",
                    "녹음 반주를 프로젝트에 저장하고 다시 불러오세요.",
                    true,
                ));
            }
        }
        let path = self.recording_path(take, true)?;
        if wave::available_bytes(path.parent().ok_or_else(storage_error)?)
            .map_err(|_| record_error("DISK_CHECK_FAILED"))?
            < wave::frame_limit(take.sample_rate) * 4 + 1024 * 1024
        {
            return Err(record_error("DISK_SPACE_LOW"));
        }
        let _guard = self.writer.lock().map_err(|_| storage_error())?;
        let db = connect(&self.root)?;
        let json = serde_json::to_string(take).map_err(|_| storage_error())?;
        db.execute("INSERT INTO recorded_takes(id,project_id,score_revision_id,state,metadata_json,metadata_sha256,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![take.id,take.project_id,take.score_revision_id,take.state.as_str(),json,hash(json.as_bytes()),take.created_at_ms as i64]).map_err(|_| storage_error())?;
        Ok(path)
    }
    pub fn save_take(&self, take: &RecordedTake) -> Result<(), AppError> {
        take.validate()?;
        let _guard = self.writer.lock().map_err(|_| storage_error())?;
        let db = connect(&self.root)?;
        let json = serde_json::to_string(take).map_err(|_| storage_error())?;
        let n = db.execute("UPDATE recorded_takes SET state=?1,metadata_json=?2,metadata_sha256=?3 WHERE project_id=?4 AND id=?5 AND score_revision_id=?6", params![take.state.as_str(),json,hash(json.as_bytes()),take.project_id,take.id,take.score_revision_id]).map_err(|_| storage_error())?;
        if n != 1 {
            return Err(storage_error());
        }
        Ok(())
    }
    pub fn take(&self, project_id: &str, take_id: &str) -> Result<RecordedTake, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(take_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let tuple = db.query_row("SELECT metadata_json,metadata_sha256,state FROM recorded_takes WHERE project_id=?1 AND id=?2", params![project_id,take_id], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|_| storage_error())?.ok_or_else(|| record_error("TAKE_NOT_FOUND"))?;
        let take = decode(tuple.0, tuple.1, tuple.2)?;
        if take.project_id != project_id || take.id != take_id {
            return Err(storage_error());
        }
        Ok(take)
    }
    pub fn recordings(&self, project_id: &str) -> Result<Vec<RecordedTake>, AppError> {
        validate_uuid(project_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let mut statement = db.prepare("SELECT metadata_json,metadata_sha256,state FROM recorded_takes WHERE project_id=?1 ORDER BY created_at_ms DESC,id LIMIT 1000").map_err(|_| storage_error())?;
        let rows = statement
            .query_map([project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|_| storage_error())?;
        rows.map(|row| {
            let (json, digest, state) = row.map_err(|_| storage_error())?;
            let take = decode(json, digest, state)?;
            if take.project_id != project_id {
                return Err(storage_error());
            }
            Ok(take)
        })
        .collect()
    }
    pub fn interrupt_recordings(&self) -> Result<(), AppError> {
        let db = connect(&self.root)?;
        let mut statement = db.prepare("SELECT metadata_json,metadata_sha256,state FROM recorded_takes WHERE state IN ('ARMING','RECORDING','FINALIZING')").map_err(|_| storage_error())?;
        let rows = statement
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|_| storage_error())?
            .collect::<rusqlite::Result<Vec<(String, String, String)>>>()
            .map_err(|_| storage_error())?;
        drop(statement);
        drop(db);
        for (json, digest, state) in rows {
            let mut take = decode(json, digest, state)?;
            take.state = RecordingState::RecoverableError;
            take.error_code = Some("APP_INTERRUPTED".into());
            self.save_take(&take)?;
        }
        Ok(())
    }
    pub fn finalize_take(&self, take: &mut RecordedTake) -> Result<(), AppError> {
        let partial = self.recording_path(take, true)?;
        let final_path = self.recording_path(take, false)?;
        if final_path.exists() {
            return Err(record_error("TAKE_EXISTS"));
        }
        let mut reader =
            wave::WaveReader::open(&partial, false).map_err(|_| record_error("WAV_INVALID"))?;
        if reader.frames != take.frames
            || reader.sample_rate != take.sample_rate
            || take.frames == 0
        {
            return Err(record_error("WAV_INVALID"));
        }
        while reader
            .next_sample()
            .map_err(|_| record_error("WAV_INVALID"))?
            .is_some()
        {}
        drop(reader);
        let digest = file_digest(&partial)?;
        fs::rename(&partial, &final_path).map_err(|_| record_error("RECORDING_IO_ERROR"))?;
        take.sha256 = Some(digest);
        take.state = RecordingState::Ready;
        self.save_take(take)
    }
    pub fn recording_bytes(
        &self,
        project_id: &str,
        take_id: &str,
        cancel: &AtomicBool,
    ) -> Result<Vec<u8>, AppError> {
        canceled(cancel)?;
        let take = self.take(project_id, take_id)?;
        if take.state != RecordingState::Ready {
            return Err(record_error("TAKE_NOT_READY"));
        }
        let path = self.recording_path(&take, false)?;
        let mut file = File::open(&path).map_err(|_| record_error("TAKE_FILE_MISSING"))?;
        let len = file.metadata().map_err(|_| storage_error())?.len();
        if len != wave::HEADER_BYTES + take.frames * 4 || len > wave::MAX_BYTES {
            return Err(record_error("WAV_INVALID"));
        }
        let mut bytes = Vec::with_capacity(len as usize);
        let mut buffer = [0; 65536];
        loop {
            canceled(cancel)?;
            let n = file.read(&mut buffer).map_err(|_| storage_error())?;
            if n == 0 {
                break;
            }
            if bytes.len() + n > len as usize {
                return Err(record_error("WAV_INVALID"));
            }
            bytes.extend_from_slice(&buffer[..n]);
        }
        if Some(hash(&bytes)) != take.sha256 {
            return Err(record_error("WAV_INVALID"));
        }
        canceled(cancel)?;
        Ok(bytes)
    }
    pub fn update_recording(
        &self,
        project_id: &str,
        take_id: &str,
        name: String,
        memo: String,
        offset: f64,
    ) -> Result<RecordedTake, AppError> {
        if !valid_edits(&name, &memo, offset) {
            return Err(AppError::invalid());
        }
        let mut take = self.take(project_id, take_id)?;
        if take.state.active() {
            return Err(record_error("RECORDING_BUSY"));
        }
        take.name = name.trim().into();
        take.memo = memo;
        take.alignment_offset_ms = offset;
        self.save_take(&take)?;
        Ok(take)
    }
    pub fn recover_recording(
        &self,
        project_id: &str,
        take_id: &str,
        cancel: &AtomicBool,
        progress: impl Fn(u64, u64) -> Result<(), AppError>,
    ) -> Result<RecordedTake, AppError> {
        canceled(cancel)?;
        let original = self.take(project_id, take_id)?;
        if original.state != RecordingState::RecoverableError {
            return Err(record_error("TAKE_NOT_RECOVERABLE"));
        }
        let final_path = self.recording_path(&original, false)?;
        let source = if final_path.exists() {
            final_path
        } else {
            self.recording_path(&original, true)?
        };
        let mut reader =
            wave::WaveReader::open(&source, true).map_err(|_| record_error("WAV_INVALID"))?;
        if reader.sample_rate != original.sample_rate || reader.frames == 0 {
            return Err(record_error("WAV_INVALID"));
        }
        let mut take = original.clone();
        take.id = Uuid::new_v4().to_string();
        take.name = "복구한 테이크".into();
        take.created_at_ms = now_ms()? as u64;
        take.state = RecordingState::Arming;
        take.sha256 = None;
        take.frames = 0;
        take.peak = 0.0;
        take.recovered_from = Some(original.id);
        take.error_code = Some("RECOVERED_PARTIAL".into());
        take.warning_intervals.clear();
        let path = self.prepare_recording(&take)?;
        let result: Result<(), AppError> = (|| {
            let mut writer = wave::create(&path, take.sample_rate)
                .map_err(|_| record_error("RECORDING_IO_ERROR"))?;
            while let Some(value) = reader
                .next_sample()
                .map_err(|_| record_error("WAV_INVALID"))?
            {
                writer
                    .push(value)
                    .map_err(|_| record_error("RECORDING_IO_ERROR"))?;
                if writer.frames % 8192 == 0 {
                    canceled(cancel)?;
                    progress(writer.frames, reader.frames)?;
                }
            }
            take.frames = writer.frames;
            take.peak = writer.peak;
            wave::finish(writer).map_err(|_| record_error("RECORDING_IO_ERROR"))?;
            canceled(cancel)?;
            self.finalize_take(&mut take)?;
            Ok(())
        })();
        if let Err(error) = result {
            take.state = RecordingState::RecoverableError;
            take.error_code = Some(error.code.into());
            self.save_take(&take)?;
            return Err(error);
        }
        Ok(take)
    }
}
fn file_digest(path: &Path) -> Result<String, AppError> {
    use sha2::{Digest, Sha256};
    let mut reader = BufReader::new(File::open(path).map_err(|_| storage_error())?);
    let mut digest = Sha256::new();
    let mut buffer = [0; 65536];
    let mut total = 0;
    loop {
        let n = reader.read(&mut buffer).map_err(|_| storage_error())?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > wave::MAX_BYTES {
            return Err(storage_error());
        }
        digest.update(&buffer[..n]);
    }
    Ok(super::projects::hex(digest.finalize().as_ref()))
}
