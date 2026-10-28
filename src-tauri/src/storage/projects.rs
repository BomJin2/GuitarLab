use super::{
    database::{checked_file, connect},
    project_model::*,
};
use crate::ipc::AppError;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub fn canceled(flag: &AtomicBool) -> Result<(), AppError> {
    if flag.load(Ordering::Acquire) {
        Err(AppError::new(
            "CANCELED",
            "저장 작업을 취소했습니다.",
            false,
        ))
    } else {
        Ok(())
    }
}
pub(crate) fn now_ms() -> Result<i64, AppError> {
    let value = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| storage_error())?
        .as_millis();
    i64::try_from(value)
        .ok()
        .filter(|value| *value <= 9_007_199_254_740_991)
        .ok_or_else(storage_error)
}
pub(crate) fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    bytes
        .iter()
        .flat_map(|byte| {
            [
                char::from(HEX[usize::from(byte >> 4)]),
                char::from(HEX[usize::from(byte & 15)]),
            ]
        })
        .collect()
}
pub(crate) fn hash(bytes: &[u8]) -> String {
    hex(Sha256::digest(bytes).as_ref())
}
pub(super) fn unsigned_column(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<u64> {
    let value: i64 = row.get(index)?;
    u64::try_from(value).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, value))
}
fn conflict() -> AppError {
    AppError::new(
        "REVISION_CONFLICT",
        "프로젝트가 다른 작업에서 변경되었습니다. 다시 읽은 뒤 저장하세요.",
        true,
    )
}
fn invalid_file() -> AppError {
    AppError::new(
        "FILE_INVALID",
        "파일 크기·확장자·내용을 확인하세요. 원본은 변경하지 않았습니다.",
        false,
    )
}
fn extension(path: &Path, kind: AssetKind) -> Result<String, AppError> {
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .ok_or_else(invalid_file)?
        .to_lowercase();
    let supported = match kind {
        AssetKind::Original => ["wav", "mp3"].contains(&ext.as_str()),
        AssetKind::ScoreImport => {
            ["musicxml", "xml", "gp", "gp3", "gp4", "gp5", "gpx", "json"].contains(&ext.as_str())
        }
    };
    if supported {
        Ok(ext)
    } else {
        Err(invalid_file())
    }
}
fn valid_header(bytes: &[u8], ext: &str) -> bool {
    match ext {
        "json" => bytes
            .iter()
            .copied()
            .find(|v| !v.is_ascii_whitespace())
            .is_none_or(|v| v == b'{'),
        "wav" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE"),
        "mp3" => {
            bytes.starts_with(b"ID3")
                || (bytes.first() == Some(&255) && bytes.get(1).is_some_and(|v| v & 224 == 224))
        }
        "xml" | "musicxml" => {
            let bytes = bytes.strip_prefix(&[239, 187, 191]).unwrap_or(bytes);
            bytes.iter().copied().find(|v| !v.is_ascii_whitespace()) == Some(b'<')
        }
        _ => {
            bytes.starts_with(b"PK")
                || bytes.starts_with(b"BCFS")
                || bytes.starts_with(b"BCFZ")
                || bytes.windows(7).any(|part| part == b"FICHIER")
        }
    }
}
struct AssetRow {
    info: AssetInfo,
    relative: Option<String>,
    external: Option<String>,
    extension: String,
}
fn asset_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AssetRow> {
    let kind: String = row.get(2)?;
    let storage: String = row.get(3)?;
    let fail = || rusqlite::Error::InvalidQuery;
    Ok(AssetRow {
        info: AssetInfo {
            id: row.get(0)?,
            project_id: row.get(1)?,
            kind: match kind.as_str() {
                "SCORE_IMPORT" => AssetKind::ScoreImport,
                "ORIGINAL" => AssetKind::Original,
                _ => return Err(fail()),
            },
            storage: match storage.as_str() {
                "MANAGED" => AssetStorage::Managed,
                "REFERENCE" => AssetStorage::Reference,
                _ => return Err(fail()),
            },
            name: row.get(4)?,
            sha256: row.get(7)?,
            bytes: unsigned_column(row, 8)?,
            available: false,
        },
        relative: row.get(5)?,
        external: row.get(6)?,
        extension: row.get(9)?,
    })
}
const ASSET_COLUMNS: &str =
    "id,project_id,kind,storage,name,relative_path,external_path,sha256,bytes,extension";
pub(crate) fn project_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectSummary> {
    let mode: String = row.get(3)?;
    Ok(ProjectSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        artist: row.get(2)?,
        mode: match mode.as_str() {
            "copy" => ProjectMode::Copy,
            "practice" => ProjectMode::Practice,
            "performance" => ProjectMode::Performance,
            _ => return Err(rusqlite::Error::InvalidQuery),
        },
        revision: row.get(4)?,
        revision_id: row.get(5)?,
        updated_at_ms: unsigned_column(row, 6)?,
    })
}
pub(crate) fn validate_summary(value: &ProjectSummary) -> Result<(), AppError> {
    validate_uuid(&value.id).map_err(|_| storage_error())?;
    if !title_valid(&value.title) || value.updated_at_ms > MAX_SAFE {
        return Err(storage_error());
    }
    Ok(())
}
pub struct ProjectStore {
    pub(crate) root: PathBuf,
    pub(crate) writer: Mutex<()>,
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub asset: AssetInfo,
    pub duplicate: bool,
}
impl ProjectStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            writer: Mutex::new(()),
        }
    }
    pub fn initialize(&self) -> Result<(), AppError> {
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        tx.execute("UPDATE practice_attempts SET state='INTERRUPTED', ended_at_ms=?1 WHERE state='RUNNING'", [now_ms()?]).map_err(|_| storage_error())?;
        tx.execute("UPDATE practice_sessions SET status='INTERRUPTED', ended_at_ms=?1 WHERE status='RUNNING'", [now_ms()?]).map_err(|_| storage_error())?;
        tx.commit().map_err(|_| storage_error())
    }
    pub fn create(
        &self,
        title: String,
        artist: Option<String>,
        mode: ProjectMode,
    ) -> Result<ProjectSummary, AppError> {
        if !title_valid(&title) || artist.as_ref().is_some_and(|a| !title_valid(a)) {
            return Err(AppError::invalid());
        }
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let db = connect(&self.root)?;
        let id = Uuid::new_v4().to_string();
        let time = now_ms()?;
        db.execute("INSERT INTO projects(id,title,artist,mode,created_at_ms,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?5)",
            params![id,title.trim(),artist,mode.as_str(),time]).map_err(|_| storage_error())?;
        self.summary(&db, &id)
    }
    pub(crate) fn summary(
        &self,
        db: &rusqlite::Connection,
        id: &str,
    ) -> Result<ProjectSummary, AppError> {
        validate_uuid(id)?;
        if db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM project_trash WHERE project_id=?1)",
                [id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| storage_error())?
        {
            return Err(AppError::new(
                "PROJECT_IN_TRASH",
                "휴지통에 보관된 프로젝트입니다. 먼저 복원하세요.",
                true,
            ));
        }
        self.raw_summary(db, id)
    }
    pub(crate) fn raw_summary(
        &self,
        db: &rusqlite::Connection,
        id: &str,
    ) -> Result<ProjectSummary, AppError> {
        let value = db.query_row("SELECT id,title,artist,mode,revision,revision_id,updated_at_ms FROM projects WHERE id=?1", [id], project_row)
            .optional().map_err(|_| storage_error())?.ok_or_else(|| AppError::new("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.", false))?;
        validate_summary(&value)?;
        Ok(value)
    }
    pub fn list(&self) -> Result<Vec<ProjectSummary>, AppError> {
        let db = connect(&self.root)?;
        let mut statement = db.prepare("SELECT id,title,artist,mode,revision,revision_id,updated_at_ms FROM projects WHERE NOT EXISTS(SELECT 1 FROM project_trash WHERE project_id=projects.id) ORDER BY updated_at_ms DESC,id LIMIT 1000").map_err(|_| storage_error())?;
        let values = statement
            .query_map([], project_row)
            .map_err(|_| storage_error())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|_| storage_error())?;
        for value in &values {
            validate_summary(value)?;
        }
        Ok(values)
    }
    fn asset(
        &self,
        db: &rusqlite::Connection,
        project_id: &str,
        asset_id: &str,
    ) -> Result<AssetRow, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(asset_id)?;
        self.summary(db, project_id)?;
        db.query_row(
            &format!("SELECT {ASSET_COLUMNS} FROM project_assets WHERE project_id=?1 AND id=?2"),
            params![project_id, asset_id],
            asset_row,
        )
        .optional()
        .map_err(|_| storage_error())?
        .ok_or_else(|| {
            AppError::new(
                "ASSET_NOT_FOUND",
                "연결된 파일 정보를 찾을 수 없습니다.",
                false,
            )
        })
    }
    fn path(&self, row: &AssetRow) -> Result<PathBuf, AppError> {
        validate_uuid(&row.info.id)?;
        validate_uuid(&row.info.project_id)?;
        if row.info.bytes == 0
            || row.info.bytes > row.info.kind.max_bytes()
            || row.info.sha256.len() != 64
            || !row.info.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || extension(Path::new(&format!("file.{}", row.extension)), row.info.kind)?
                != row.extension
        {
            return Err(storage_error());
        }
        match row.info.storage {
            AssetStorage::Managed => {
                let expected = format!(
                    "projects/{}/assets/{}.{}",
                    row.info.project_id, row.info.id, row.extension
                );
                let relative = row.relative.as_deref().ok_or_else(storage_error)?;
                let recovery_prefix = format!(
                    "projects/{}/assets/{}/restores/",
                    row.info.project_id, row.info.id
                );
                let recovery = relative
                    .strip_prefix(&recovery_prefix)
                    .and_then(|name| name.strip_suffix(&format!(".{}", row.extension)))
                    .is_some_and(|id| validate_uuid(id).is_ok());
                if (relative != expected && !recovery) || row.external.is_some() {
                    return Err(storage_error());
                }
                checked_file(&self.root, Path::new(relative))
            }
            AssetStorage::Reference => {
                if row.relative.is_some() {
                    return Err(storage_error());
                }
                let path = PathBuf::from(row.external.as_ref().ok_or_else(storage_error)?);
                if !path.is_absolute() {
                    return Err(storage_error());
                }
                Ok(path)
            }
        }
    }
    pub fn assets(&self, project_id: &str) -> Result<Vec<AssetInfo>, AppError> {
        validate_uuid(project_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let mut statement = db.prepare(&format!("SELECT {ASSET_COLUMNS} FROM project_assets WHERE project_id=?1 ORDER BY created_at_ms,id")).map_err(|_| storage_error())?;
        let rows = statement
            .query_map([project_id], asset_row)
            .map_err(|_| storage_error())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|_| storage_error())?;
        rows.into_iter()
            .map(|mut row| {
                let path = self.path(&row)?;
                row.info.available =
                    fs::metadata(path).is_ok_and(|m| m.is_file() && m.len() == row.info.bytes);
                Ok(row.info)
            })
            .collect()
    }
    pub fn create_blank_score(
        &self,
        project_id: &str,
        expected_revision: u32,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<AssetInfo, AppError> {
        validate_uuid(project_id)?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        if self.summary(&tx, project_id)?.revision != expected_revision {
            return Err(conflict());
        }
        let bytes = include_bytes!("../../../fixtures/blank.musicxml");
        let size = bytes.len() as u64;
        let id = Uuid::new_v4().to_string();
        let relative = format!("projects/{project_id}/assets/{id}.musicxml");
        let path = checked_file(&self.root, Path::new(&relative))?;
        progress(0, size)?;
        canceled(cancel)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| storage_error())?;
        let result = (|| {
            output.write_all(bytes).map_err(|_| storage_error())?;
            output.sync_all().map_err(|_| storage_error())?;
            progress(size, size)?;
            canceled(cancel)?;
            let digest = hash(bytes);
            tx.execute("INSERT INTO project_assets(id,project_id,kind,storage,name,extension,relative_path,external_path,sha256,bytes,created_at_ms) VALUES(?1,?2,'SCORE_IMPORT','MANAGED',?3,'musicxml',?4,NULL,?5,?6,?7)",
                params![id,project_id,"새 기타 악보.musicxml",relative,digest,i64::try_from(size).map_err(|_| storage_error())?,now_ms()?]).map_err(|_| storage_error())?;
            canceled(cancel)?;
            tx.commit().map_err(|_| storage_error())?;
            Ok(AssetInfo {
                id,
                project_id: project_id.into(),
                kind: AssetKind::ScoreImport,
                storage: AssetStorage::Managed,
                name: "새 기타 악보.musicxml".into(),
                sha256: digest,
                bytes: size,
                available: true,
            })
        })();
        drop(output);
        if result.is_err() {
            // 이 호출의 create_new 성공 파일만 정리하며 기존 자산에는 접근하지 않습니다.
            fs::remove_file(path).map_err(|_| storage_error())?;
        }
        result
    }
    // native picker 승인 파일 또는 검증한 drop의 앱 소유 임시 파일만 전달합니다.
    pub fn import_asset(
        &self,
        project_id: &str,
        source: &Path,
        kind: AssetKind,
        storage: AssetStorage,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<ImportResult, AppError> {
        validate_uuid(project_id)?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        if !source.is_absolute() {
            return Err(AppError::invalid());
        }
        let source = source.canonicalize().map_err(|_| invalid_file())?;
        let ext = extension(&source, kind)?;
        let name = source
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| !n.is_empty() && n.len() <= 512)
            .ok_or_else(invalid_file)?
            .to_owned();
        let mut input = File::open(&source).map_err(|_| invalid_file())?;
        let metadata = input.metadata().map_err(|_| invalid_file())?;
        let size = metadata.len();
        if !metadata.is_file() || size == 0 || size > kind.max_bytes() {
            return Err(invalid_file());
        }
        let id = Uuid::new_v4().to_string();
        let relative = format!("projects/{project_id}/assets/{id}.{ext}");
        let destination = checked_file(&self.root, Path::new(&relative))?;
        let partial = destination.with_extension(format!("{ext}.part"));
        let mut output = if storage == AssetStorage::Managed {
            Some(
                OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&partial)
                    .map_err(|_| storage_error())?,
            )
        } else {
            None
        };
        let mut owned_path = output.as_ref().map(|_| partial.clone());
        let result = (|| {
            let mut digest = Sha256::new();
            let mut json = Vec::new();
            let mut bytes = 0;
            let mut buffer = [0u8; 65536];
            loop {
                canceled(cancel)?;
                let read = input.read(&mut buffer).map_err(|_| invalid_file())?;
                if read == 0 {
                    break;
                }
                if bytes == 0 && !valid_header(&buffer[..read], &ext) {
                    return Err(invalid_file());
                }
                bytes += read as u64;
                if bytes > size {
                    return Err(invalid_file());
                }
                digest.update(&buffer[..read]);
                if ext == "json" {
                    json.extend_from_slice(&buffer[..read]);
                }
                if let Some(output) = &mut output {
                    output
                        .write_all(&buffer[..read])
                        .map_err(|_| storage_error())?;
                }
                progress(bytes, size)?;
            }
            if bytes != size
                || input
                    .metadata()
                    .map_err(|_| invalid_file())?
                    .modified()
                    .ok()
                    != metadata.modified().ok()
            {
                return Err(invalid_file());
            }
            if ext == "json" {
                canceled(cancel)?;
                let document: ScoreDocument =
                    serde_json::from_slice(&json).map_err(|_| invalid_file())?;
                if document.render_source.is_none() {
                    return Err(invalid_file());
                }
                document.validate().map_err(|_| invalid_file())?;
            }
            if let Some(output) = &mut output {
                output.sync_all().map_err(|_| storage_error())?;
            }
            canceled(cancel)?;
            let digest = hex(digest.finalize().as_ref());
            drop(output.take());
            let duplicate = db.query_row(&format!("SELECT {ASSET_COLUMNS} FROM project_assets WHERE project_id=?1 AND kind=?2 AND sha256=?3"),params![project_id,kind.as_str(),digest],asset_row).optional().map_err(|_| storage_error())?;
            canceled(cancel)?;
            if let Some(mut row) = duplicate {
                row.info.available = self.path(&row)?.is_file();
                return Ok(ImportResult {
                    asset: row.info,
                    duplicate: true,
                });
            }
            canceled(cancel)?;
            if storage == AssetStorage::Managed {
                fs::rename(&partial, &destination).map_err(|_| storage_error())?;
                owned_path = Some(destination.clone());
            }
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| storage_error())?;
            tx.execute("INSERT INTO project_assets(id,project_id,kind,storage,name,extension,relative_path,external_path,sha256,bytes,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![id,project_id,kind.as_str(),if storage==AssetStorage::Managed {"MANAGED"} else {"REFERENCE"},name,ext,
                if storage==AssetStorage::Managed {Some(&relative)} else {None},
                if storage==AssetStorage::Reference {Some(source.to_str().ok_or_else(invalid_file)?)} else {None},digest,i64::try_from(size).map_err(|_|invalid_file())?,now_ms()?]).map_err(|_| storage_error())?;
            canceled(cancel)?;
            tx.commit().map_err(|_| storage_error())?;
            Ok(ImportResult {
                asset: AssetInfo {
                    id,
                    project_id: project_id.into(),
                    kind,
                    storage,
                    name,
                    sha256: digest,
                    bytes: size,
                    available: true,
                },
                duplicate: false,
            })
        })();
        drop(output);
        if result.as_ref().map_or(true, |imported| imported.duplicate) {
            if let Some(path) = owned_path {
                // 이 호출이 새로 만든 복사본만 DB rollback과 함께 정리합니다.
                fs::remove_file(path).map_err(|_| storage_error())?;
            }
        }
        result
    }

    pub fn read_asset(
        &self,
        project_id: &str,
        asset_id: &str,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<Vec<u8>, AppError> {
        canceled(cancel)?;
        let db = connect(&self.root)?;
        let row = self.asset(&db, project_id, asset_id)?;
        let path = self.path(&row)?;
        let mut file = File::open(&path).map_err(|_| {
            AppError::new(
                "FILE_NOT_FOUND",
                "연결된 원본 파일이 없습니다. 파일을 재연결하세요.",
                true,
            )
        })?;
        if file.metadata().map_err(|_| storage_error())?.len() != row.info.bytes {
            return Err(invalid_file());
        }
        let mut bytes = Vec::with_capacity(row.info.bytes as usize);
        let mut buffer = [0u8; 65536];
        loop {
            canceled(cancel)?;
            let count = file.read(&mut buffer).map_err(|_| storage_error())?;
            if count == 0 {
                break;
            }
            if bytes.len() as u64 + count as u64 > row.info.bytes {
                return Err(invalid_file());
            }
            bytes.extend_from_slice(&buffer[..count]);
            progress(bytes.len() as u64, row.info.bytes)?;
        }
        if bytes.len() as u64 != row.info.bytes || hash(&bytes) != row.info.sha256 {
            return Err(AppError::new(
                "ASSET_MISMATCH",
                "원본 파일 내용이 바뀌었습니다. 기존 기록과 다른 파일은 새로 불러오세요.",
                false,
            ));
        }
        Ok(bytes)
    }
    pub fn relink(
        &self,
        project_id: &str,
        asset_id: &str,
        approved_path: &Path,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<AssetInfo, AppError> {
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let db = connect(&self.root)?;
        let mut row = self.asset(&db, project_id, asset_id)?;
        if !approved_path.is_absolute() {
            return Err(AppError::invalid());
        }
        let path = approved_path.canonicalize().map_err(|_| invalid_file())?;
        extension(&path, row.info.kind)?;
        let mut file = File::open(&path).map_err(|_| invalid_file())?;
        if file.metadata().map_err(|_| invalid_file())?.len() != row.info.bytes {
            return Err(invalid_file());
        }
        let recovery_relative = format!(
            "projects/{project_id}/assets/{asset_id}/restores/{}.{}",
            Uuid::new_v4(),
            row.extension
        );
        let recovery = if row.info.storage == AssetStorage::Managed {
            Some(checked_file(&self.root, Path::new(&recovery_relative))?)
        } else {
            None
        };
        let partial = recovery
            .as_ref()
            .map(|path| path.with_extension(format!("{}.part", row.extension)));
        let mut output = partial
            .as_ref()
            .map(|path| {
                OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(path)
                    .map_err(|_| storage_error())
            })
            .transpose()?;
        let result = (|| {
            let mut digest = Sha256::new();
            let mut count = 0u64;
            let mut buffer = [0u8; 65536];
            loop {
                canceled(cancel)?;
                let read = file.read(&mut buffer).map_err(|_| invalid_file())?;
                if read == 0 {
                    break;
                }
                count += read as u64;
                if count > row.info.bytes {
                    return Err(invalid_file());
                }
                digest.update(&buffer[..read]);
                if let Some(output) = &mut output {
                    output
                        .write_all(&buffer[..read])
                        .map_err(|_| storage_error())?;
                }
                progress(count, row.info.bytes)?;
            }
            if count != row.info.bytes || hex(digest.finalize().as_ref()) != row.info.sha256 {
                return Err(AppError::new(
                    "ASSET_MISMATCH",
                    "선택한 파일이 이전 원본과 다릅니다. 기존 연결은 보존했습니다.",
                    false,
                ));
            }
            canceled(cancel)?;
            if let Some(output) = &mut output {
                output.sync_all().map_err(|_| storage_error())?;
            }
            Ok(())
        })();
        drop(output);
        if let Err(error) = result {
            if let Some(partial) = &partial {
                fs::remove_file(partial).map_err(|_| storage_error())?;
            }
            return Err(error);
        }
        if let (Some(partial), Some(recovery)) = (&partial, &recovery) {
            // 새 복구 파일을 가리키며 기존 관리용 파일과 사용자 원본은 덮어쓰지 않습니다.
            fs::rename(partial, recovery).map_err(|_| storage_error())?;
            canceled(cancel)?;
            db.execute(
                "UPDATE project_assets SET relative_path=?1 WHERE project_id=?2 AND id=?3",
                params![recovery_relative, project_id, asset_id],
            )
            .map_err(|_| storage_error())?;
        } else {
            db.execute(
                "UPDATE project_assets SET external_path=?1 WHERE project_id=?2 AND id=?3",
                params![
                    path.to_str().ok_or_else(invalid_file)?,
                    project_id,
                    asset_id
                ],
            )
            .map_err(|_| storage_error())?;
        }
        row.info.available = true;
        Ok(row.info)
    }
    pub fn save_revision(
        &self,
        project_id: &str,
        expected_revision: u32,
        score_asset_id: &str,
        score: ScoreDocument,
        workspace: WorkspaceState,
        cancel: &AtomicBool,
    ) -> Result<RevisionDocument, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(score_asset_id)?;
        score.validate()?;
        workspace.validate(&score)?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        if self.summary(&db, project_id)?.revision != expected_revision {
            return Err(conflict());
        }
        if self.asset(&db, project_id, score_asset_id)?.info.kind != AssetKind::ScoreImport {
            return Err(AppError::invalid());
        }
        if let Some(audio) = &workspace.audio_asset_id {
            if self.asset(&db, project_id, audio)?.info.kind != AssetKind::Original {
                return Err(AppError::invalid());
            }
        }
        let revision = expected_revision
            .checked_add(1)
            .ok_or_else(AppError::invalid)?;
        let id = Uuid::new_v4().to_string();
        let document = RevisionDocument {
            schema_version: 1,
            project_id: project_id.into(),
            revision_id: id.clone(),
            revision,
            score_asset_id: score_asset_id.into(),
            score,
            workspace,
        };
        let bytes = serde_json::to_vec(&document).map_err(|_| AppError::invalid())?;
        if bytes.len() > MAX_SCORE_BYTES {
            return Err(AppError::invalid());
        }
        let relative = format!("projects/{project_id}/scores/{id}.json");
        let final_path = checked_file(&self.root, Path::new(&relative))?;
        let temporary = final_path.with_extension("json.part");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| storage_error())?;
        file.write_all(&bytes).map_err(|_| storage_error())?;
        file.sync_all().map_err(|_| storage_error())?;
        drop(file);
        canceled(cancel)?;
        fs::rename(&temporary, &final_path).map_err(|_| storage_error())?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        let changed=tx.execute("UPDATE projects SET revision=?1,revision_id=?2,updated_at_ms=?3 WHERE id=?4 AND revision=?5",params![revision,id,now_ms()?,project_id,expected_revision]).map_err(|_|storage_error())?;
        if changed != 1 {
            return Err(conflict());
        }
        tx.execute("INSERT INTO score_revisions(id,project_id,revision,relative_path,sha256,score_asset_id,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![id,project_id,revision,relative,hash(&bytes),score_asset_id,now_ms()?]).map_err(|_|storage_error())?;
        canceled(cancel)?;
        tx.commit().map_err(|_| storage_error())?;
        Ok(document)
    }
    pub fn revision(
        &self,
        project_id: &str,
        revision_id: &str,
    ) -> Result<RevisionDocument, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(revision_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let (revision,relative,digest,asset):(u32,String,String,String)=db.query_row("SELECT revision,relative_path,sha256,score_asset_id FROM score_revisions WHERE project_id=?1 AND id=?2",params![project_id,revision_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)))
            .optional().map_err(|_|storage_error())?.ok_or_else(||AppError::new("REVISION_NOT_FOUND","저장한 악보 버전을 찾을 수 없습니다.",false))?;
        if relative != format!("projects/{project_id}/scores/{revision_id}.json") {
            return Err(storage_error());
        }
        let path = checked_file(&self.root, Path::new(&relative))?;
        let mut file = File::open(path).map_err(|_| storage_error())?;
        if file.metadata().map_err(|_| storage_error())?.len() > MAX_SCORE_BYTES as u64 {
            return Err(storage_error());
        }
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(MAX_SCORE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| storage_error())?;
        if bytes.len() > MAX_SCORE_BYTES || hash(&bytes) != digest {
            return Err(storage_error());
        }
        let value: RevisionDocument =
            serde_json::from_slice(&bytes).map_err(|_| storage_error())?;
        if value.schema_version != 1
            || value.project_id != project_id
            || value.revision_id != revision_id
            || value.revision != revision
            || value.score_asset_id != asset
        {
            return Err(storage_error());
        }
        value.score.validate().map_err(|_| storage_error())?;
        value
            .workspace
            .validate(&value.score)
            .map_err(|_| storage_error())?;
        Ok(value)
    }
    pub fn open(
        &self,
        project_id: &str,
    ) -> Result<(ProjectSummary, Option<RevisionDocument>, Vec<AssetInfo>), AppError> {
        validate_uuid(project_id)?;
        let db = connect(&self.root)?;
        let summary = self.summary(&db, project_id)?;
        let revision = summary
            .revision_id
            .as_ref()
            .map(|id| self.revision(project_id, id))
            .transpose()?;
        if revision.as_ref().map_or(0, |value| value.revision) != summary.revision {
            return Err(storage_error());
        }
        Ok((summary, revision, self.assets(project_id)?))
    }
}
