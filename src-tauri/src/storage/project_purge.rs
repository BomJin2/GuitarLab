use super::{
    database::connect,
    project_model::{storage_error, validate_uuid, MAX_SAFE},
    project_trash_usage::plain,
    projects::{canceled, hex, now_ms, ProjectStore},
};
use crate::ipc::AppError;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    cmp::Reverse,
    fs::{self, File, OpenOptions},
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgePlan {
    pub project_id: String,
    pub trash_id: String,
    pub revision: u32,
    pub title: String,
    pub fingerprint: String,
    pub files: u64,
    pub logical_bytes: u64,
    pub external_references: u64,
    pub purge_started: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgedProject {
    pub project_id: String,
    pub trash_id: String,
    pub files: u64,
    pub logical_bytes: u64,
    pub external_references: u64,
}
pub struct PurgeConfirmation<'a> {
    pub project_id: &'a str,
    pub trash_id: &'a str,
    pub fingerprint: &'a str,
    pub confirmed_title: &'a str,
    pub consent: bool,
}
fn error(code: &'static str) -> AppError {
    AppError::new(
        code,
        "삭제 대상을 다시 확인하세요. 이미 삭제한 파일은 복구되지 않습니다.",
        true,
    )
}
fn unavailable() -> AppError {
    error("PROJECT_PURGE_UNAVAILABLE")
}
fn changed() -> AppError {
    error("PROJECT_PURGE_CHANGED")
}
fn ensure_idle(db: &Connection) -> Result<(), AppError> {
    let active = db.query_row("SELECT EXISTS(SELECT 1 FROM practice_sessions WHERE status='RUNNING') OR EXISTS(SELECT 1 FROM recorded_takes WHERE state IN ('ARMING','RECORDING','FINALIZING'))", [], |row| row.get::<_, bool>(0)).map_err(|_| storage_error())?;
    if active {
        return Err(error("PROJECT_IN_USE"));
    }
    Ok(())
}
fn check(cancel: &AtomicBool, deadline: Instant) -> Result<(), AppError> {
    canceled(cancel)?;
    if Instant::now() >= deadline {
        return Err(unavailable());
    }
    Ok(())
}
#[derive(PartialEq)]
struct Stamp {
    bytes: u64,
    modified: SystemTime,
    created: Option<SystemTime>,
}
impl Stamp {
    fn read(metadata: &fs::Metadata) -> Result<Self, AppError> {
        if !plain(metadata) {
            return Err(unavailable());
        }
        Ok(Self {
            bytes: metadata.len(),
            modified: metadata.modified().map_err(|_| unavailable())?,
            created: metadata.created().ok(),
        })
    }
    fn digest(&self, digest: &mut Sha256) -> Result<(), AppError> {
        digest.update(self.bytes.to_le_bytes());
        for time in [Some(self.modified), self.created] {
            digest.update(
                time.map(|t| t.duration_since(UNIX_EPOCH).map(|v| v.as_nanos()))
                    .transpose()
                    .map_err(|_| unavailable())?
                    .unwrap_or(0)
                    .to_le_bytes(),
            );
        }
        Ok(())
    }
}
struct Directory {
    path: PathBuf,
    guard: File,
    stamp: Stamp,
}
fn directory(path: &Path) -> Result<Directory, AppError> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // 부모의 rename/delete와 재분석 지점 추적을 차단합니다.
        options.share_mode(3).custom_flags(0x0220_0000);
    }
    let guard = options.open(path).map_err(|_| unavailable())?;
    let metadata = guard.metadata().map_err(|_| unavailable())?;
    if !metadata.is_dir() {
        return Err(unavailable());
    }
    let stamp = Stamp::read(&metadata)?;
    Ok(Directory {
        path: path.into(),
        guard,
        stamp,
    })
}
struct Entry {
    path: PathBuf,
    relative: String,
    stamp: Stamp,
    sha256: String,
}
struct Tree {
    _parents: Vec<Directory>,
    directories: Vec<Directory>,
    files: Vec<Entry>,
    bytes: u64,
}
fn hash_file(
    path: &Path,
    deleting: bool,
    cancel: &AtomicBool,
    deadline: Instant,
    mut progress: impl FnMut(u64) -> Result<(), AppError>,
) -> Result<(File, Stamp, String), AppError> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1).custom_flags(0x0020_0000);
        if deleting {
            options.access_mode(0x8001_0000);
        }
    }
    let mut file = options.open(path).map_err(|_| unavailable())?;
    let metadata = file.metadata().map_err(|_| unavailable())?;
    if !metadata.is_file() {
        return Err(unavailable());
    }
    let before = Stamp::read(&metadata)?;
    let (mut size, mut digest) = (0_u64, Sha256::new());
    let mut buffer = [0_u8; 65536];
    loop {
        check(cancel, deadline)?;
        let read = file.read(&mut buffer).map_err(|_| unavailable())?;
        if read == 0 {
            break;
        }
        size = size
            .checked_add(read as u64)
            .filter(|s| *s <= before.bytes)
            .ok_or_else(changed)?;
        digest.update(&buffer[..read]);
        progress(read as u64)?;
    }
    if size != before.bytes || Stamp::read(&file.metadata().map_err(|_| unavailable())?)? != before
    {
        return Err(changed());
    }
    #[cfg(not(windows))]
    let _ = deleting;
    Ok((file, before, hex(digest.finalize().as_ref())))
}
fn remove_checked_file(file: File, entry: &Entry) -> Result<(), AppError> {
    if Stamp::read(&file.metadata().map_err(|_| unavailable())?)? != entry.stamp {
        return Err(changed());
    }
    #[cfg(windows)]
    {
        use std::{ffi::c_void, os::windows::io::AsRawHandle};
        #[link(name = "kernel32")]
        unsafe extern "system" {
            #[link_name = "SetFileInformationByHandle"]
            fn set_file_information_by_handle(
                handle: *mut c_void,
                class: i32,
                information: *mut c_void,
                size: u32,
            ) -> i32;
        }
        let mut delete: u8 = 1;
        // 안전성: 소유 File의 열린 핸들, FileDispositionInfo(4), BOOLEAN 한 바이트를 호출 중 유지합니다.
        let result = unsafe {
            set_file_information_by_handle(
                file.as_raw_handle(),
                4,
                (&mut delete as *mut u8).cast(),
                1,
            )
        };
        if result == 0 {
            return Err(unavailable());
        }
    }
    #[cfg(not(windows))]
    fs::remove_file(&entry.path).map_err(|_| unavailable())?;
    drop(file);
    Ok(())
}
fn tree(
    root: &Path,
    id: &str,
    cancel: &AtomicBool,
    deadline: Instant,
    progress: &mut impl FnMut(u64, u64) -> Result<(), AppError>,
) -> Result<Tree, AppError> {
    if !root.is_absolute() {
        return Err(unavailable());
    }
    let first = directory(root)?;
    let root = root.canonicalize().map_err(|_| unavailable())?;
    let mut result = Tree {
        _parents: vec![first],
        directories: Vec::new(),
        files: Vec::new(),
        bytes: 0,
    };
    let projects = root.join("projects");
    match fs::symlink_metadata(&projects) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(result),
        Err(_) => return Err(unavailable()),
        Ok(_) => result._parents.push(directory(&projects)?),
    }
    let folder = projects.join(id);
    match fs::symlink_metadata(&folder) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(result),
        Err(_) => return Err(unavailable()),
        Ok(_) => result.directories.push(directory(&folder)?),
    }
    let mut pending = vec![(folder.clone(), 0)];
    let mut visited = 0;
    while let Some((path, depth)) = pending.pop() {
        check(cancel, deadline)?;
        if depth > 16 {
            return Err(unavailable());
        }
        for entry in fs::read_dir(path).map_err(|_| unavailable())? {
            check(cancel, deadline)?;
            visited += 1;
            if visited > 10000 {
                return Err(unavailable());
            }
            let path = entry.map_err(|_| unavailable())?.path();
            let metadata = fs::symlink_metadata(&path).map_err(|_| unavailable())?;
            if !plain(&metadata) {
                return Err(unavailable());
            }
            if metadata.is_dir() {
                result.directories.push(directory(&path)?);
                pending.push((path, depth + 1));
            } else {
                result.bytes = result
                    .bytes
                    .checked_add(metadata.len())
                    .filter(|v| *v <= MAX_SAFE)
                    .ok_or_else(unavailable)?;
                let relative = path
                    .strip_prefix(&folder)
                    .map_err(|_| unavailable())?
                    .to_str()
                    .ok_or_else(unavailable)?
                    .replace('\\', "/");
                result.files.push(Entry {
                    path,
                    relative,
                    stamp: Stamp::read(&metadata)?,
                    sha256: String::new(),
                });
            }
        }
    }
    result.files.sort_by(|a, b| a.relative.cmp(&b.relative));
    result.directories.sort_by(|a, b| a.path.cmp(&b.path));
    let mut completed = 0;
    progress(0, result.bytes)?;
    for entry in &mut result.files {
        let (_file, stamp, sha) = hash_file(&entry.path, false, cancel, deadline, |read| {
            completed += read;
            progress(completed, result.bytes)
        })?;
        if stamp != entry.stamp {
            return Err(changed());
        }
        entry.sha256 = sha;
    }
    for dir in &result.directories {
        if Stamp::read(&dir.guard.metadata().map_err(|_| unavailable())?)? != dir.stamp {
            return Err(changed());
        }
    }
    check(cancel, deadline)?;
    Ok(result)
}
fn path_key(path: &Path) -> Result<String, AppError> {
    let key = path
        .to_str()
        .ok_or_else(unavailable)?
        .replace('\\', "/")
        .to_lowercase();
    let key = key.strip_prefix("//?/").unwrap_or(&key);
    Ok(key
        .strip_prefix("unc/")
        .map_or_else(|| key.to_string(), |tail| format!("//{tail}")))
}
fn scope(db: &Connection, root: &Path, id: &str) -> Result<(), AppError> {
    let folder = path_key(
        &root
            .canonicalize()
            .map_err(|_| unavailable())?
            .join("projects")
            .join(id),
    )?;
    let prefix = format!("{folder}/");
    // 저장 시 canonical로 기록한 참조 경로만 대조하며 외부 파일/UNC를 열지 않습니다.
    let mut query = db
        .prepare("SELECT external_path FROM project_assets WHERE storage='REFERENCE' LIMIT 100001")
        .map_err(|_| storage_error())?;
    for (index, row) in query
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|_| storage_error())?
        .enumerate()
    {
        if index >= 100000 {
            return Err(unavailable());
        }
        let key = path_key(Path::new(&row.map_err(|_| storage_error())?))?;
        if key == folder || key.starts_with(&prefix) {
            return Err(error("PROJECT_PURGE_REFERENCED"));
        }
    }
    let managed_prefix = format!("projects/{id}/");
    let mut query = db.prepare("SELECT relative_path FROM project_assets WHERE storage='MANAGED' AND project_id<>?1 UNION ALL SELECT relative_path FROM score_revisions WHERE project_id<>?1 LIMIT 100001").map_err(|_| storage_error())?;
    for (index, row) in query
        .query_map([id], |r| r.get::<_, String>(0))
        .map_err(|_| storage_error())?
        .enumerate()
    {
        let path = row.map_err(|_| storage_error())?;
        if index >= 100000
            || Path::new(&path)
                .components()
                .any(|c| !matches!(c, std::path::Component::Normal(_)))
        {
            return Err(unavailable());
        }
        if path
            .replace('\\', "/")
            .to_lowercase()
            .starts_with(&managed_prefix)
        {
            return Err(error("PROJECT_PURGE_REFERENCED"));
        }
    }
    if db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger')",
            [],
            |r| r.get::<_, bool>(0),
        )
        .map_err(|_| storage_error())?
    {
        return Err(unavailable());
    }
    Ok(())
}
fn remove_rows(db: &Connection, id: &str) -> Result<(), AppError> {
    db.execute("DELETE FROM judgement_events WHERE attempt_id IN (SELECT a.id FROM practice_attempts a JOIN practice_sessions s ON a.session_id=s.id WHERE s.project_id=?1)", [id]).map_err(|_| storage_error())?;
    db.execute("DELETE FROM practice_attempts WHERE session_id IN (SELECT id FROM practice_sessions WHERE project_id=?1)", [id]).map_err(|_| storage_error())?;
    for table in [
        "practice_sessions",
        "recorded_takes",
        "project_mixes",
        "ai_transcription_drafts",
        "audio_stems",
        "audio_stem_sets",
        "project_youtube_syncs",
        "project_backings",
        "imported_guitar_stems",
        "score_revisions",
        "project_assets",
        "project_purge_intents",
        "project_trash",
        "projects",
    ] {
        let column = if table == "projects" {
            "id"
        } else {
            "project_id"
        };
        db.execute(&format!("DELETE FROM {table} WHERE {column}=?1"), [id])
            .map_err(|_| storage_error())?;
    }
    Ok(())
}
impl ProjectStore {
    fn purge_plan(
        &self,
        db: &Connection,
        id: &str,
        trash: &str,
        cancel: &AtomicBool,
        deadline: Instant,
        progress: &mut impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<(PurgePlan, Tree), AppError> {
        validate_uuid(id)?;
        validate_uuid(trash)?;
        check(cancel, deadline)?;
        let project = self.raw_summary(db, id)?;
        let matched = db
            .query_row(
                "SELECT project_revision FROM project_trash WHERE project_id=?1 AND trash_id=?2",
                params![id, trash],
                |r| r.get::<_, u32>(0),
            )
            .optional()
            .map_err(|_| storage_error())?;
        if matched != Some(project.revision) {
            return Err(error("PROJECT_TRASH_CHANGED"));
        }
        ensure_idle(db)?;
        let intent = db
            .query_row(
                "SELECT trash_id,project_revision FROM project_purge_intents WHERE project_id=?1",
                [id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, u32>(1)?)),
            )
            .optional()
            .map_err(|_| storage_error())?;
        if intent
            .as_ref()
            .is_some_and(|(old, revision)| old != trash || *revision != project.revision)
        {
            return Err(changed());
        }
        scope(db, &self.root, id)?;
        let tree = tree(&self.root, id, cancel, deadline, progress)?;
        let mut digest = Sha256::new();
        digest.update(
            serde_json::to_vec(&(
                id,
                trash,
                project.revision,
                &project.title,
                project.updated_at_ms,
                intent.is_some(),
            ))
            .map_err(|_| storage_error())?,
        );
        for dir in &tree.directories {
            digest.update(path_key(&dir.path)?.as_bytes());
            dir.stamp.digest(&mut digest)?;
        }
        for entry in &tree.files {
            digest.update(
                serde_json::to_vec(&(&entry.relative, &entry.sha256))
                    .map_err(|_| storage_error())?,
            );
            entry.stamp.digest(&mut digest)?;
        }
        let references = db
            .query_row(
                "SELECT COUNT(*) FROM project_assets WHERE project_id=?1 AND storage='REFERENCE'",
                [id],
                |r| r.get::<_, u32>(0),
            )
            .map_err(|_| storage_error())?;
        if references > 100000 {
            return Err(unavailable());
        }
        digest.update(references.to_le_bytes());
        check(cancel, deadline)?;
        Ok((
            PurgePlan {
                project_id: id.into(),
                trash_id: trash.into(),
                revision: project.revision,
                title: project.title,
                fingerprint: hex(digest.finalize().as_ref()),
                files: tree.files.len() as u64,
                logical_bytes: tree.bytes,
                external_references: u64::from(references),
                purge_started: intent.is_some(),
            },
            tree,
        ))
    }
    pub fn prepare_project_purge(
        &self,
        id: &str,
        trash: &str,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<PurgePlan, AppError> {
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        self.purge_plan(
            &tx,
            id,
            trash,
            cancel,
            Instant::now() + Duration::from_secs(30),
            &mut progress,
        )
        .map(|(plan, _)| plan)
    }
    pub fn purge_project(
        &self,
        confirmation: PurgeConfirmation<'_>,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<PurgedProject, AppError> {
        let PurgeConfirmation {
            project_id: id,
            trash_id: trash,
            fingerprint,
            confirmed_title,
            consent,
        } = confirmation;
        if !consent
            || fingerprint.len() != 64
            || !fingerprint
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err(AppError::invalid());
        }
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        let mut db = connect(&self.root)?;
        let deadline = Instant::now() + Duration::from_secs(300);
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        let (plan, mut tree) =
            self.purge_plan(&tx, id, trash, cancel, deadline, &mut |_, _| Ok(()))?;
        if plan.fingerprint != fingerprint || plan.title != confirmed_title {
            return Err(changed());
        }
        tx.execute_batch("SAVEPOINT purge_preflight")
            .map_err(|_| storage_error())?;
        let preflight = remove_rows(&tx, id);
        tx.execute_batch("ROLLBACK TO purge_preflight; RELEASE purge_preflight")
            .map_err(|_| storage_error())?;
        preflight?;
        check(cancel, deadline)?;
        tx.execute("INSERT INTO project_purge_intents(project_id,trash_id,project_revision,started_at_ms) VALUES(?1,?2,?3,?4) ON CONFLICT(project_id) DO NOTHING", params![id, trash, plan.revision, now_ms()?]).map_err(|_| storage_error())?;
        tx.commit().map_err(|_| storage_error())?;
        let result = (|| {
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| storage_error())?;
            let current: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM project_trash t JOIN projects p ON p.id=t.project_id JOIN project_purge_intents d ON d.project_id=p.id WHERE p.id=?1 AND t.trash_id=?2 AND d.trash_id=?2 AND p.revision=?3 AND t.project_revision=?3 AND d.project_revision=?3 AND p.title=?4)", params![id, trash, plan.revision, plan.title], |r| r.get(0)).map_err(|_| storage_error())?;
            if !current {
                return Err(changed());
            }
            // 파일 처리 중에도 새 참조/행 변경이 들어오지 않도록 쓰기 트랜잭션을 유지합니다.
            ensure_idle(&tx)?;
            scope(&tx, &self.root, id)?;
            let mut completed = 0_u64;
            progress(0, plan.logical_bytes)?;
            for entry in &tree.files {
                check(cancel, deadline)?;
                let (file, stamp, sha) =
                    hash_file(&entry.path, true, cancel, deadline, |_| Ok(()))?;
                if stamp != entry.stamp || sha != entry.sha256 {
                    return Err(changed());
                }
                if Stamp::read(&fs::symlink_metadata(&entry.path).map_err(|_| unavailable())?)?
                    != stamp
                {
                    return Err(changed());
                }
                check(cancel, deadline)?;
                remove_checked_file(file, entry)?;
                completed += stamp.bytes;
                progress(completed, plan.logical_bytes)?;
            }
            tree.directories
                .sort_by_key(|d| Reverse(d.path.components().count()));
            for dir in tree.directories {
                check(cancel, deadline)?;
                let path = dir.path;
                drop(dir.guard);
                fs::remove_dir(path).map_err(|_| unavailable())?;
            }
            check(cancel, deadline)?;
            scope(&tx, &self.root, id)?;
            remove_rows(&tx, id)?;
            check(cancel, deadline)?;
            tx.commit().map_err(|_| storage_error())?;
            Ok(PurgedProject {
                project_id: plan.project_id,
                trash_id: plan.trash_id,
                files: plan.files,
                logical_bytes: plan.logical_bytes,
                external_references: plan.external_references,
            })
        })();
        result.map_err(|cause: AppError| {
            if cause.code == "STORAGE_ERROR" {
                unavailable()
            } else {
                cause
            }
        })
    }
}

#[cfg(all(test, windows))]
mod handle_tests {
    use super::*;
    use crate::storage::projects_tests::Fixture;
    #[test]
    fn validated_file_handle_blocks_replacement_and_only_explicit_disposition_deletes() {
        let f = Fixture::new();
        let path = f.store.root.join("owned-test.bin");
        fs::write(&path, b"owned test only").expect("자체 파일");
        let no = AtomicBool::new(false);
        let deadline = Instant::now() + Duration::from_secs(30);
        let (file, stamp, sha256) =
            hash_file(&path, true, &no, deadline, |_| Ok(())).expect("삭제용 읽기");
        assert!(fs::rename(&path, path.with_extension("moved")).is_err());
        drop(file);
        assert_eq!(
            fs::read(&path).expect("표시 전 닫기는 보존"),
            b"owned test only"
        );
        let mut entry = Entry {
            path: path.clone(),
            relative: "owned-test.bin".into(),
            stamp,
            sha256,
        };
        entry.stamp.bytes += 1;
        let (file, _, _) = hash_file(&path, true, &no, deadline, |_| Ok(())).expect("재확인");
        assert_eq!(
            remove_checked_file(file, &entry)
                .expect_err("metadata 불일치")
                .code,
            "PROJECT_PURGE_CHANGED"
        );
        assert!(path.is_file());
        entry.stamp.bytes -= 1;
        let (file, _, _) = hash_file(&path, true, &no, deadline, |_| Ok(())).expect("같은 핸들");
        remove_checked_file(file, &entry).expect("명시적 삭제");
        assert!(!path.exists());
    }
}
