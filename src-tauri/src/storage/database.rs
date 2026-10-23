use super::project_model::storage_error;
use crate::ipc::AppError;
use rusqlite::{Connection, TransactionBehavior};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

pub fn checked_directory(root: &Path, relative: &Path) -> Result<PathBuf, AppError> {
    if !root.is_absolute()
        || relative.is_absolute()
        || relative
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err(storage_error());
    }
    fs::create_dir_all(root).map_err(|_| storage_error())?;
    let root = root.canonicalize().map_err(|_| storage_error())?;
    let mut path = root.clone();
    for component in relative.components() {
        path.push(component);
        if !path.exists() {
            fs::create_dir(&path).map_err(|_| storage_error())?;
        }
        let metadata = fs::symlink_metadata(&path).map_err(|_| storage_error())?;
        if metadata.file_type().is_symlink()
            || !metadata.is_dir()
            || !path
                .canonicalize()
                .map_err(|_| storage_error())?
                .starts_with(&root)
        {
            return Err(storage_error());
        }
    }
    Ok(path)
}
pub fn checked_file(root: &Path, relative: &Path) -> Result<PathBuf, AppError> {
    let parent = relative.parent().ok_or_else(storage_error)?;
    let name = relative.file_name().ok_or_else(storage_error)?;
    let path = checked_directory(root, parent)?.join(name);
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || !path
                .canonicalize()
                .map_err(|_| storage_error())?
                .starts_with(root.canonicalize().map_err(|_| storage_error())?)
        {
            return Err(storage_error());
        }
    }
    Ok(path)
}
pub fn connect(root: &Path) -> Result<Connection, AppError> {
    let directory = checked_directory(root, Path::new(""))?;
    for name in [
        "guitarlab.sqlite",
        "guitarlab.sqlite-wal",
        "guitarlab.sqlite-shm",
    ] {
        checked_file(&directory, Path::new(name))?;
    }
    let mut db =
        Connection::open(directory.join("guitarlab.sqlite")).map_err(|_| storage_error())?;
    db.busy_timeout(Duration::from_secs(5))
        .map_err(|_| storage_error())?;
    let version: u32 = db
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|_| storage_error())?;
    if version > 9 {
        return Err(storage_error());
    }
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")
        .map_err(|_| storage_error())?;
    if version == 0 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/001-projects.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 2 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/002-recordings.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 3 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/003-mixer.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 4 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/004-ai-drafts.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 5 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/005-audio-stems.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 6 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/006-project-backings.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 7 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/007-youtube-syncs.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 8 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/008-imported-guitar-stems.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    if version < 9 {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        transaction
            .execute_batch(include_str!("migrations/009-project-trash.sql"))
            .map_err(|_| storage_error())?;
        transaction.commit().map_err(|_| storage_error())?;
    }
    Ok(db)
}
