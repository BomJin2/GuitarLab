use super::{
    database::{checked_file, connect},
    export_file::save_new_file,
    project_model::{storage_error, title_valid, validate_uuid, GuitarPartRole, MAX_SAFE},
    projects::{canceled, hash, now_ms, ProjectStore},
};
use crate::{ipc::AppError, mixer::pcm};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
};
use uuid::Uuid;
pub const MAX_IMPORTED_STEM_BYTES: usize = 64 * 1024 * 1024;
#[derive(Clone, Debug, Deserialize, Serialize)]
pub enum StemOrigin {
    #[serde(rename = "USER_IMPORTED")]
    UserImported,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportedGuitarStem {
    pub schema_version: u8,
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub role: GuitarPartRole,
    pub origin: StemOrigin,
    pub sample_rate: u32,
    pub channels: u16,
    pub frames: u64,
    pub duration_ms: f64,
    pub bytes: usize,
    pub sha256: String,
    pub peak: f64,
    pub created_at_ms: u64,
}
fn invalid() -> AppError {
    AppError::new(
        "IMPORTED_STEM_INVALID",
        "기타 파일의 WAV 형식·길이·저장 무결성을 확인하세요.",
        false,
    )
}
impl ImportedGuitarStem {
    fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.id)?;
        validate_uuid(&self.project_id)?;
        if self.schema_version != 1
            || !title_valid(&self.name)
            || !(8000..=192000).contains(&self.sample_rate)
            || ![1, 2].contains(&self.channels)
            || self.frames == 0
            || self.frames > u64::from(self.sample_rate) * 600
            || !self.duration_ms.is_finite()
            || (self.duration_ms - self.frames as f64 * 1000.0 / f64::from(self.sample_rate)).abs()
                > 0.000001
            || !(44..=MAX_IMPORTED_STEM_BYTES).contains(&self.bytes)
            || self.sha256.len() != 64
            || !self
                .sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
            || !self.peak.is_finite()
            || self.peak < 0.0
            || self.created_at_ms > MAX_SAFE
        {
            return Err(invalid());
        }
        Ok(())
    }
    fn relative(&self) -> PathBuf {
        PathBuf::from(format!(
            "projects/{}/imported-stems/{}.wav",
            self.project_id, self.id
        ))
    }
}
fn read_bytes(
    path: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
) -> Result<Vec<u8>, AppError> {
    canceled(cancel)?;
    let metadata = fs::symlink_metadata(path).map_err(|_| storage_error())?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > MAX_IMPORTED_STEM_BYTES as u64
        || metadata.len() < 44
    {
        return Err(invalid());
    }
    let mut file = File::open(path).map_err(|_| storage_error())?;
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 65536];
    loop {
        canceled(cancel)?;
        let count = file.read(&mut buffer).map_err(|_| storage_error())?;
        if count == 0 {
            break;
        }
        if bytes.len() + count > MAX_IMPORTED_STEM_BYTES {
            return Err(invalid());
        }
        bytes.extend_from_slice(&buffer[..count]);
        progress(bytes.len() as u64, metadata.len().max(bytes.len() as u64))?;
    }
    if bytes.len() as u64 != metadata.len() {
        return Err(invalid());
    }
    canceled(cancel)?;
    Ok(bytes)
}
impl ProjectStore {
    pub fn import_guitar_stem(
        &self,
        project_id: &str,
        role: GuitarPartRole,
        path: &Path,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<ImportedGuitarStem, AppError> {
        validate_uuid(project_id)?;
        canceled(cancel)?;
        if !path.is_absolute()
            || !path
                .extension()
                .and_then(|v| v.to_str())
                .is_some_and(|v| v.eq_ignore_ascii_case("wav"))
        {
            return Err(invalid());
        }
        let name = path
            .file_name()
            .and_then(|v| v.to_str())
            .filter(|v| title_valid(v))
            .ok_or_else(invalid)?
            .to_string();
        {
            let db = connect(&self.root)?;
            self.summary(&db, project_id)?;
        }
        let bytes = read_bytes(path, cancel, &mut progress)?;
        let mut budget = MAX_IMPORTED_STEM_BYTES;
        let pcm = pcm::decode(&bytes, &mut budget, cancel).map_err(|e| {
            if e.code == "CANCELED" {
                e
            } else {
                invalid()
            }
        })?;
        let stem = ImportedGuitarStem {
            schema_version: 1,
            id: Uuid::new_v4().to_string(),
            project_id: project_id.into(),
            name,
            role,
            origin: StemOrigin::UserImported,
            sample_rate: pcm.rate,
            channels: pcm.channels,
            frames: pcm.samples.len() as u64,
            duration_ms: pcm.samples.len() as f64 * 1000.0 / f64::from(pcm.rate),
            bytes: bytes.len(),
            sha256: hash(&bytes),
            peak: pcm.peak,
            created_at_ms: now_ms()? as u64,
        };
        drop(pcm);
        stem.validate()?;
        let text = serde_json::to_string(&stem).map_err(|_| invalid())?;
        if text.len() > 4096 {
            return Err(invalid());
        }
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        canceled(cancel)?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        self.summary(&tx, project_id)?;
        let count: u32 = tx
            .query_row(
                "SELECT count(*) FROM imported_guitar_stems WHERE project_id=?1",
                [project_id],
                |r| r.get(0),
            )
            .map_err(|_| storage_error())?;
        if count >= 20 {
            return Err(AppError::new(
                "IMPORTED_STEM_LIMIT",
                "프로젝트의 사용자 기타 파일20개 한도입니다.",
                false,
            ));
        }
        let path = checked_file(&self.root, &stem.relative())?;
        save_new_file(&path, &bytes, "wav", cancel)?;
        let result = (|| {
            tx.execute(
                "INSERT INTO imported_guitar_stems VALUES(?1,?2,'USER_IMPORTED',?3,?4)",
                params![stem.id, project_id, text, hash(text.as_bytes())],
            )
            .map_err(|_| storage_error())?;
            canceled(cancel)?;
            tx.commit().map_err(|_| storage_error())
        })();
        if result.is_err() && fs::remove_file(&path).is_err() {
            eprintln!("GuitarLab 새 기타 파일 정리 실패: IMPORTED_STEM_CLEANUP_FAILED");
        }
        result?;
        Ok(stem)
    }
    pub(crate) fn imported_stem_metadata(
        &self,
        project_id: &str,
        id: &str,
    ) -> Result<ImportedGuitarStem, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let (origin,text,digest):(String,String,String)=db.query_row("SELECT origin,metadata_json,metadata_sha256 FROM imported_guitar_stems WHERE project_id=?1 AND id=?2",params![project_id,id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|_|storage_error())?.ok_or_else(||AppError::new("IMPORTED_STEM_NOT_FOUND","이 프로젝트의 사용자 기타 파일을 찾을 수 없습니다.",false))?;
        if origin != "USER_IMPORTED" || text.len() > 4096 || hash(text.as_bytes()) != digest {
            return Err(invalid());
        }
        let stem: ImportedGuitarStem = serde_json::from_str(&text).map_err(|_| invalid())?;
        stem.validate()?;
        if stem.project_id != project_id || stem.id != id {
            return Err(invalid());
        }
        Ok(stem)
    }
    pub fn imported_guitar_stems(
        &self,
        project_id: &str,
        cancel: &AtomicBool,
    ) -> Result<Vec<ImportedGuitarStem>, AppError> {
        validate_uuid(project_id)?;
        canceled(cancel)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let mut stmt=db.prepare("SELECT id FROM imported_guitar_stems WHERE project_id=?1 ORDER BY rowid DESC LIMIT 21").map_err(|_|storage_error())?;
        let ids = stmt
            .query_map([project_id], |r| r.get::<_, String>(0))
            .map_err(|_| storage_error())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|_| storage_error())?;
        if ids.len() > 20 {
            return Err(invalid());
        }
        ids.into_iter()
            .map(|id| {
                canceled(cancel)?;
                self.imported_stem_metadata(project_id, &id)
            })
            .collect()
    }
    pub fn read_imported_guitar_stem(
        &self,
        project_id: &str,
        id: &str,
        cancel: &AtomicBool,
    ) -> Result<(ImportedGuitarStem, Vec<u8>), AppError> {
        canceled(cancel)?;
        let stem = self.imported_stem_metadata(project_id, id)?;
        let path = checked_file(&self.root, &stem.relative())?;
        let bytes = read_bytes(&path, cancel, |_, _| Ok(()))?;
        if bytes.len() != stem.bytes || hash(&bytes) != stem.sha256 {
            return Err(invalid());
        }
        let mut budget = MAX_IMPORTED_STEM_BYTES;
        let pcm = pcm::decode(&bytes, &mut budget, cancel).map_err(|e| {
            if e.code == "CANCELED" {
                e
            } else {
                invalid()
            }
        })?;
        if pcm.rate != stem.sample_rate
            || pcm.channels != stem.channels
            || pcm.samples.len() as u64 != stem.frames
            || (pcm.peak - stem.peak).abs() > 0.000001
        {
            return Err(invalid());
        }
        canceled(cancel)?;
        Ok((stem, bytes))
    }
}
