//! 중단된 파일 교체를 정상 DB 초기화로 덮지 않도록 시작을 보호합니다.
use crate::ipc::AppError;
use std::{fs, io, path::Path};

pub(crate) fn pending(root: &Path) -> Result<bool, AppError> {
    if !root.is_absolute() {
        return Err(AppError::invalid());
    }
    for name in [".local-restore.json", ".local-restore-request.json"] {
        match fs::symlink_metadata(root.join(name)) {
            Ok(_) => return Ok(true),
            Err(cause) if cause.kind() == io::ErrorKind::NotFound => {}
            Err(_) => return Err(super::project_model::storage_error()),
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::projects_tests::Fixture;

    #[test]
    fn missing_marker_allows_start_and_any_existing_marker_blocks_without_reading_it() {
        let fixture = Fixture::new();
        let database = fixture.store.root.join("guitarlab.sqlite");
        let before = fs::read(&database).expect("자체 DB");
        assert!(!pending(&fixture.store.root).expect("복원 없음"));
        for name in [".local-restore.json", ".local-restore-request.json"] {
            let path = fixture.store.root.join(name);
            fs::write(&path, b"keep unknown marker").expect("자체 잘못된 기록");
            assert!(pending(&fixture.store.root).expect("형식 추정 없이 차단"));
            assert_eq!(fs::read(&path).expect("기록 보존"), b"keep unknown marker");
            fs::remove_file(path).expect("자체 fixture 정리");
        }
        assert_eq!(fs::read(database).expect("DB 보존"), before);
    }

    #[test]
    fn directory_marker_and_relative_roots_are_not_accepted_as_no_restore() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.store.root.join(".local-restore.json")).expect("자체 잘못된 폴더");
        assert!(pending(&fixture.store.root).expect("폴더도 차단"));
        assert!(pending(Path::new("relative")).is_err());
    }
}
