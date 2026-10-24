use super::{
    database::connect,
    project_model::{storage_error, validate_uuid, MAX_SAFE},
    projects::{canceled, ProjectStore},
};
use crate::ipc::AppError;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use std::{
    fs,
    path::Path,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashUsage {
    pub project_id: String,
    pub trash_id: String,
    pub files: u64,
    pub logical_bytes: u64,
    pub external_references: u64,
}
fn unavailable() -> AppError {
    AppError::new(
        "PROJECT_USAGE_UNAVAILABLE",
        "용량을 안전하게 확인하지 못했습니다. 원본은 변경하지 않았습니다.",
        true,
    )
}
fn plain(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return false;
        }
    }
    !metadata.file_type().is_symlink() && (metadata.is_file() || metadata.is_dir())
}
fn directory(path: &Path) -> Result<bool, AppError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if plain(&metadata) && metadata.is_dir() => Ok(true),
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err(unavailable()),
    }
}
fn scan(folder: &Path, cancel: &AtomicBool, deadline: Instant) -> Result<(u64, u64), AppError> {
    let mut pending = vec![(folder.to_path_buf(), 0)];
    let (mut visited, mut files, mut bytes) = (0_u64, 0_u64, 0_u64);
    while let Some((path, depth)) = pending.pop() {
        canceled(cancel)?;
        if Instant::now() >= deadline || depth > 16 || !directory(&path)? {
            return Err(unavailable());
        }
        for entry in fs::read_dir(&path).map_err(|_| unavailable())? {
            canceled(cancel)?;
            visited += 1;
            if visited > 10000 || Instant::now() >= deadline {
                return Err(unavailable());
            }
            let entry = entry.map_err(|_| unavailable())?;
            let metadata = fs::symlink_metadata(entry.path()).map_err(|_| unavailable())?;
            if !plain(&metadata) {
                return Err(unavailable());
            }
            if metadata.is_dir() {
                pending.push((entry.path(), depth + 1));
            } else {
                files += 1;
                bytes = bytes
                    .checked_add(metadata.len())
                    .filter(|v| *v <= MAX_SAFE)
                    .ok_or_else(unavailable)?;
            }
        }
    }
    canceled(cancel)?;
    if Instant::now() >= deadline {
        return Err(unavailable());
    }
    Ok((files, bytes))
}
impl ProjectStore {
    pub fn trashed_project_usage(
        &self,
        project_id: &str,
        trash_id: &str,
        cancel: &AtomicBool,
    ) -> Result<TrashUsage, AppError> {
        validate_uuid(project_id)?;
        validate_uuid(trash_id)?;
        canceled(cancel)?;
        let _writer = self.writer.lock().map_err(|_| storage_error())?;
        if !directory(&self.root)? {
            return Err(unavailable());
        }
        let mut db = connect(&self.root)?;
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| storage_error())?;
        let matched: bool = tx.query_row(
            "SELECT 1 FROM project_trash t JOIN projects p ON p.id=t.project_id WHERE t.project_id=?1 AND t.trash_id=?2 AND t.project_revision=p.revision",
            params![project_id, trash_id], |r| r.get(0)).optional().map_err(|_| storage_error())?.unwrap_or(false);
        if !matched {
            return Err(AppError::new(
                "PROJECT_TRASH_CHANGED",
                "휴지통 상태가 바뀌었습니다. 목록을 다시 읽어주세요.",
                true,
            ));
        }
        let external_references: u32 = tx
            .query_row(
                "SELECT COUNT(*) FROM project_assets WHERE project_id=?1 AND storage='REFERENCE'",
                [project_id],
                |r| r.get(0),
            )
            .map_err(|_| storage_error())?;
        if external_references > 100000 {
            return Err(unavailable());
        }
        let projects = self.root.join("projects");
        let folder = projects.join(project_id);
        let (files, logical_bytes) = if directory(&projects)? && directory(&folder)? {
            scan(&folder, cancel, Instant::now() + Duration::from_secs(30))?
        } else {
            (0, 0)
        };
        canceled(cancel)?;
        Ok(TrashUsage {
            project_id: project_id.into(),
            trash_id: trash_id.into(),
            files,
            logical_bytes,
            external_references: u64::from(external_references),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{project_model::AssetStorage, projects_tests::Fixture};
    #[test]
    fn counts_managed_tree_without_opening_external_references_and_preserves_originals() {
        let f = Fixture::new();
        let id = f.project();
        f.asset(&id, AssetStorage::Reference);
        let no = AtomicBool::new(false);
        let trash = f.store.trash_project(&id, 0, &no).expect("보관");
        let folder = f.store.root.join("projects").join(&id);
        fs::create_dir_all(folder.join("recordings")).expect("자체 폴더");
        fs::write(folder.join("recordings/take.wav"), b"DEMO").expect("자체 파일");
        fs::write(folder.join("unknown"), b"keep").expect("미분류 보존");
        let usage = f
            .store
            .trashed_project_usage(&id, &trash.trash_id, &no)
            .expect("읽기");
        assert_eq!(
            (usage.files, usage.logical_bytes, usage.external_references),
            (2, 8, 1)
        );
        assert_eq!(fs::read(folder.join("unknown")).expect("불변"), b"keep");
        assert_eq!(
            f.store.trashed_projects().expect("보관 유지")[0].trash_id,
            trash.trash_id
        );
        f.store
            .restore_trashed_project(&id, &trash.trash_id, &no)
            .expect("복원");
        assert_eq!(
            f.store
                .trashed_project_usage(&id, &trash.trash_id, &no)
                .expect_err("오래된 요청")
                .code,
            "PROJECT_TRASH_CHANGED"
        );
        assert_eq!(
            f.store
                .trashed_project_usage(&id, &trash.trash_id, &AtomicBool::new(true))
                .expect_err("취소")
                .code,
            "CANCELED"
        );
    }
    #[test]
    fn empty_project_limits_and_timeout_never_return_partial_success() {
        let f = Fixture::new();
        let id = f.project();
        let no = AtomicBool::new(false);
        let trash = f.store.trash_project(&id, 0, &no).expect("보관");
        assert_eq!(
            f.store
                .trashed_project_usage(&id, &trash.trash_id, &no)
                .expect("빈 폴더")
                .files,
            0
        );
        let folder = f.store.root.join("projects").join(&id);
        fs::create_dir_all(&folder).expect("자체 폴더");
        assert!(scan(&folder, &no, Instant::now()).is_err());
        let mut child = folder.clone();
        for _ in 0..17 {
            child.push("d");
            fs::create_dir(&child).expect("깊이 경계");
        }
        assert!(scan(&folder, &no, Instant::now() + Duration::from_secs(30)).is_err());
        assert!(f
            .store
            .trashed_project_usage("../outside", &trash.trash_id, &no)
            .is_err());
    }
    #[test]
    fn entry_limit_and_revision_change_are_rejected() {
        let f = Fixture::new();
        let id = f.project();
        let no = AtomicBool::new(false);
        let trash = f.store.trash_project(&id, 0, &no).expect("보관");
        let folder = f.store.root.join("projects").join(&id);
        fs::create_dir_all(&folder).expect("자체 폴더");
        for i in 0..10001 {
            fs::File::create(folder.join(i.to_string())).expect("경계 파일");
        }
        assert_eq!(
            f.store
                .trashed_project_usage(&id, &trash.trash_id, &no)
                .expect_err("개수 경계")
                .code,
            "PROJECT_USAGE_UNAVAILABLE"
        );
        connect(&f.store.root)
            .expect("자체DB")
            .execute("UPDATE projects SET revision=1 WHERE id=?1", [&id])
            .expect("충돌 주입");
        assert_eq!(
            f.store
                .trashed_project_usage(&id, &trash.trash_id, &no)
                .expect_err("revision 충돌")
                .code,
            "PROJECT_TRASH_CHANGED"
        );
    }
    #[cfg(windows)]
    #[test]
    fn junction_inside_project_is_rejected_without_following_or_modifying_target() {
        let f = Fixture::new();
        let id = f.project();
        let no = AtomicBool::new(false);
        let trash = f.store.trash_project(&id, 0, &no).expect("보관");
        let folder = f.store.root.join("projects").join(&id);
        fs::create_dir_all(&folder).expect("자체 폴더");
        let outside = f.store.root.join("outside");
        fs::create_dir(&outside).expect("자체 대상");
        fs::write(outside.join("keep"), b"keep").expect("대상");
        let link = folder.join("link");
        let created = std::process::Command::new("pwsh").args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:GUITARLAB_TEST_LINK -Target $env:GUITARLAB_TEST_TARGET -ErrorAction Stop | Out-Null"])
            .env("GUITARLAB_TEST_LINK", &link).env("GUITARLAB_TEST_TARGET", &outside).output().expect("자체 junction 생성");
        assert!(created.status.success(), "자체 junction 생성 실패");
        let result = f.store.trashed_project_usage(&id, &trash.trash_id, &no);
        fs::remove_dir(&link).expect("자체 링크만 비재귀 정리");
        assert_eq!(
            result.expect_err("연결 거부").code,
            "PROJECT_USAGE_UNAVAILABLE"
        );
        assert_eq!(fs::read(outside.join("keep")).expect("대상 보존"), b"keep");
    }
}
