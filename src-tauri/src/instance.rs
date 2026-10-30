//! 같은 앱 데이터의 동시 녹음 복구·파일 쓰기를 시작 전에 차단합니다.
use std::{
    fs::{self, File, OpenOptions, TryLockError},
    path::Path,
};

#[derive(Debug)]
pub struct InstanceGuard {
    _lock: File,
}
#[derive(Debug, PartialEq, Eq)]
pub enum InstanceError {
    Busy,
    Unavailable,
}
impl InstanceError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::Busy => "GuitarLab이 이미 실행 중입니다. 기존 창을 사용하세요. 새 실행은 데이터를 변경하지 않고 종료합니다.",
            Self::Unavailable => "앱 데이터의 사용 잠금을 확인하지 못했습니다. 다른 GuitarLab을 닫고 저장 폴더의 권한을 확인한 뒤 다시 실행하세요. 잠금 파일을 임의로 삭제하지 마세요.",
        }
    }
}
fn reparse(info: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        info.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        info.file_type().is_symlink()
    }
}
impl InstanceGuard {
    pub fn acquire(root: &Path) -> Result<Self, InstanceError> {
        let invalid = || InstanceError::Unavailable;
        if !root.is_absolute() {
            return Err(invalid());
        }
        fs::create_dir_all(root).map_err(|_| invalid())?;
        let info = fs::symlink_metadata(root).map_err(|_| invalid())?;
        if !info.is_dir() || reparse(&info) {
            return Err(invalid());
        }
        let path = root
            .canonicalize()
            .map_err(|_| invalid())?
            .join(".app-instance.lock");
        match fs::symlink_metadata(&path) {
            Ok(info) if !info.is_file() || info.len() != 0 || reparse(&info) => {
                return Err(invalid())
            }
            Err(cause) if cause.kind() != std::io::ErrorKind::NotFound => return Err(invalid()),
            _ => {}
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0).custom_flags(0x00200000);
        }
        let lock = options.open(&path).map_err(|cause| {
            if cfg!(windows) && cause.raw_os_error() == Some(32) {
                InstanceError::Busy
            } else {
                invalid()
            }
        })?;
        let info = lock.metadata().map_err(|_| invalid())?;
        if !info.is_file() || info.len() != 0 || reparse(&info) {
            return Err(invalid());
        }
        lock.try_lock().map_err(|cause| match cause {
            TryLockError::WouldBlock => InstanceError::Busy,
            TryLockError::Error(_) => invalid(),
        })?;
        Ok(Self { _lock: lock })
    }

    pub(crate) fn child_stdin(&self) -> Result<std::process::Stdio, InstanceError> {
        self._lock
            .try_clone()
            .map(std::process::Stdio::from)
            .map_err(|_| InstanceError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::projects_tests::Fixture;

    #[test]
    fn separate_root_and_restart_work_without_pid_or_file_deletion() {
        let first = Fixture::new();
        let other = Fixture::new();
        let lock = InstanceGuard::acquire(&first.store.root).expect("첫 실행");
        assert_eq!(
            InstanceGuard::acquire(&first.store.root).expect_err("중복 거부"),
            InstanceError::Busy
        );
        let _other = InstanceGuard::acquire(&other.store.root).expect("다른 제품 root");
        drop(lock);
        assert_eq!(
            fs::read(first.store.root.join(".app-instance.lock")).expect("빈 파일 보존"),
            b""
        );
        let _again = InstanceGuard::acquire(&first.store.root).expect("재실행");
    }
    #[test]
    fn bad_paths_and_existing_unknown_contents_are_preserved() {
        let fixture = Fixture::new();
        assert_eq!(
            InstanceGuard::acquire(Path::new("relative")).expect_err("상대 경로"),
            InstanceError::Unavailable
        );
        let file = fixture.store.root.join(".app-instance.lock");
        fs::write(&file, b"keep unknown bytes").expect("자체 잘못된 파일");
        assert_eq!(
            InstanceGuard::acquire(&fixture.store.root).expect_err("덮어쓰기 거부"),
            InstanceError::Unavailable
        );
        assert_eq!(
            fs::read(file).expect("기존 바이트 보존"),
            b"keep unknown bytes"
        );
    }
    #[test]
    #[ignore = "부모가 지정한 자체 임시 root의 별도 프로세스 잠금 검사 전용"]
    fn instance_child() {
        let root = std::path::PathBuf::from(
            std::env::var_os("GUITARLAB_INSTANCE_TEST_ROOT").expect("자체 root"),
        );
        let root = root.canonicalize().expect("자체 실제 경로");
        let fixture = root.parent().expect("자체 fixture");
        assert!(fixture
            .file_name()
            .expect("자체 이름")
            .to_string_lossy()
            .starts_with("guitarlab-project-test-"));
        assert_eq!(
            fixture.parent(),
            Some(
                std::env::temp_dir()
                    .canonicalize()
                    .expect("임시 폴더")
                    .as_path()
            )
        );
        if std::env::var("GUITARLAB_INSTANCE_INHERITED_STDIN").as_deref() == Ok("1") {
            let started = std::time::Instant::now();
            while !root.join("parent-guard-closed").exists()
                && started.elapsed() < std::time::Duration::from_secs(10)
            {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            assert!(root.join("parent-guard-closed").exists(), "부모 종료 신호");
            assert_eq!(
                InstanceGuard::acquire(&root).expect_err("상속한 핸들의 공유 차단"),
                InstanceError::Busy
            );
            return;
        }
        if std::env::var("GUITARLAB_INSTANCE_EXPECT_BUSY").as_deref() == Ok("1") {
            assert_eq!(
                InstanceGuard::acquire(&root).expect_err("다른 프로세스 잠금"),
                InstanceError::Busy
            );
        } else {
            let _lock = InstanceGuard::acquire(&root).expect("별도 프로세스 잠금");
            // Drop을 생략해도 OS가 종료 시 핸들을 닫아야 합니다.
            std::process::exit(0);
        }
    }
    #[test]
    fn actual_child_process_conflict_and_exit_release_without_touching_database() {
        let fixture = Fixture::new();
        let root = &fixture.store.root;
        let original = fs::read(root.join("guitarlab.sqlite")).expect("자체 DB");
        let child = |busy: bool| {
            let result =
                std::process::Command::new(std::env::current_exe().expect("검사 실행 파일"))
                    .args([
                        "--exact",
                        "instance::tests::instance_child",
                        "--ignored",
                        "--nocapture",
                    ])
                    .env("GUITARLAB_INSTANCE_TEST_ROOT", root)
                    .env(
                        "GUITARLAB_INSTANCE_EXPECT_BUSY",
                        if busy { "1" } else { "0" },
                    )
                    .output()
                    .expect("자체 자식 검사");
            assert!(result.status.success(), "별도 프로세스 잠금 검사 실패");
        };
        let lock = InstanceGuard::acquire(root).expect("부모 실행");
        child(true);
        drop(lock);
        child(false);
        let _again = InstanceGuard::acquire(root).expect("자식 종료 후 잠금 해제");
        assert_eq!(
            fs::read(root.join("guitarlab.sqlite")).expect("DB 보존"),
            original
        );
    }

    #[test]
    #[cfg(windows)]
    fn inherited_stdin_keeps_root_exclusive_after_parent_guard_is_dropped() {
        let fixture = Fixture::new();
        let root = &fixture.store.root;
        let before = fs::read(root.join("guitarlab.sqlite")).expect("자체 DB");
        let guard = InstanceGuard::acquire(root).expect("부모 잠금");
        let child = std::process::Command::new(std::env::current_exe().expect("검사 실행 파일"))
            .args([
                "--exact",
                "instance::tests::instance_child",
                "--ignored",
                "--nocapture",
            ])
            .env("GUITARLAB_INSTANCE_TEST_ROOT", root)
            .env("GUITARLAB_INSTANCE_INHERITED_STDIN", "1")
            .stdin(guard.child_stdin().expect("잠금 핸들 복제"))
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("자체 자식 실행");
        drop(guard);
        fs::write(root.join("parent-guard-closed"), b"").expect("부모 핸들 종료 신호");
        assert!(child
            .wait_with_output()
            .expect("자식 종료")
            .status
            .success());
        let _again = InstanceGuard::acquire(root).expect("자식 종료 후 해제");
        assert_eq!(
            fs::read(root.join("guitarlab.sqlite")).expect("DB 보존"),
            before
        );
    }

    #[test]
    #[ignore = "현재 소스로 빌드한 모델 관리 CLI의 실제 중복 거부를 자체 root에서 검사합니다"]
    fn actual_model_cli_refuses_busy_root_before_starting_any_worker() {
        let fixture = Fixture::new();
        let root = fixture.store.root.join("com.guitarlab.app");
        let _guard = InstanceGuard::acquire(&root).expect("자체 점유");
        let executable =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("target/debug/examples/manage_ai_model.exe");
        assert!(executable.is_file(), "먼저 현재 모델 CLI를 빌드하세요.");
        for action in ["install", "download", "verify"] {
            let output = std::process::Command::new(&executable)
                .args([action, "basic-pitch"])
                .arg(&fixture.store.root)
                .env("APPDATA", &fixture.store.root)
                .output()
                .expect("자체 CLI");
            assert_eq!(output.status.code(), Some(1));
            let result: serde_json::Value =
                serde_json::from_slice(&output.stdout).expect("고정 오류");
            assert_eq!(
                result,
                serde_json::json!({"error":"INSTANCE_ALREADY_RUNNING"})
            );
        }
        assert_eq!(fs::read_dir(root).expect("추가 작업 없음").count(), 1);
    }
}
