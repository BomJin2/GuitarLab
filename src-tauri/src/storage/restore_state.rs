//! 중단된 파일 교체를 정상 DB 초기화로 덮지 않도록 시작을 보호합니다.
use crate::{instance::InstanceGuard, ipc::AppError};
use std::{
    fs,
    io::{self, BufRead, BufReader, Read},
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

fn recovery_error() -> AppError {
    AppError::new(
        "RESTORE_RECOVERY_REQUIRED",
        "복원 기록과 데이터를 확인하지 못했습니다. 초기화를 중단하고 복구 자료를 보존합니다.",
        true,
    )
}

fn response(bytes: &[u8]) -> Result<&'static str, AppError> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| recovery_error())?;
    let object = value.as_object().ok_or_else(recovery_error)?;
    if value["schemaVersion"].as_u64() != Some(1) {
        return Err(recovery_error());
    }
    if value["state"] == "RESTORE_NOT_PENDING" && object.len() == 2 {
        return Ok("RESTORE_NOT_PENDING");
    }
    let applied = match value["state"].as_str() {
        Some("LOCAL_DATA_RESTORED") => true,
        Some("LOCAL_DATA_ROLLED_BACK") => false,
        _ => return Err(recovery_error()),
    };
    if object.len() != 7
        || value["appDataReplaced"].as_bool() != Some(applied)
        || value["recoveryId"]
            .as_str()
            .is_none_or(|id| super::project_model::validate_uuid(id).is_err())
        || value["files"]
            .as_u64()
            .is_none_or(|v| !(1..10_000).contains(&v))
        || value["bytes"]
            .as_u64()
            .is_none_or(|v| !(1..=2 * 1024 * 1024 * 1024).contains(&v))
        || value["externalReferencesNotCopied"]
            .as_u64()
            .is_none_or(|v| v > 100_000)
    {
        return Err(recovery_error());
    }
    Ok(if applied {
        "LOCAL_DATA_RESTORED"
    } else {
        "LOCAL_DATA_ROLLED_BACK"
    })
}

fn run_recovery(mut command: Command, guard: &InstanceGuard) -> Result<&'static str, AppError> {
    let bytes = run_command(&mut command, guard, None)?;
    response(&serde_json::to_vec(&bytes).map_err(|_| recovery_error())?)
}

pub(crate) fn run_command(
    command: &mut Command,
    guard: &InstanceGuard,
    job: Option<&super::jobs::StorageJob>,
) -> Result<serde_json::Value, AppError> {
    command
        .stdin(guard.child_stdin().map_err(|_| recovery_error())?)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|_| recovery_error())?;
    let output = child.stdout.take().ok_or_else(recovery_error)?;
    let (send, receive) = mpsc::sync_channel(8);
    let reader = thread::spawn(move || {
        let mut output = BufReader::new(output);
        loop {
            let mut bytes = Vec::new();
            let result = output.by_ref().take(8193).read_until(b'\n', &mut bytes);
            if matches!(result, Ok(0)) {
                break;
            }
            let valid = result.is_ok() && bytes.len() <= 8192;
            if send.send(if valid { Some(bytes) } else { None }).is_err() || !valid {
                break;
            }
        }
    });
    let started = Instant::now();
    let result = loop {
        if job.is_some_and(|j| j.cancel.load(Ordering::Acquire)) {
            break Err(AppError::new(
                "CANCELED",
                "취소 후 복원 예약의 실제 상태를 확인해주세요.",
                false,
            ));
        }
        if started.elapsed() > Duration::from_secs(300) {
            break Err(recovery_error());
        }
        match receive.recv_timeout(Duration::from_millis(50)) {
            Ok(Some(bytes)) => {
                let value: serde_json::Value = match serde_json::from_slice(&bytes) {
                    Ok(value) => value,
                    Err(_) => break Err(recovery_error()),
                };
                if value["state"] == "PROGRESS" {
                    let progress = (|| {
                        let job = job.ok_or_else(recovery_error)?;
                        if value.as_object().is_none_or(|v| v.len() != 4)
                            || value["schemaVersion"].as_u64() != Some(1)
                        {
                            return Err(recovery_error());
                        }
                        job.progress_with_limit(
                            value["completedBytes"]
                                .as_u64()
                                .ok_or_else(recovery_error)?,
                            value["totalBytes"].as_u64().ok_or_else(recovery_error)?,
                            2 * 1024 * 1024 * 1024,
                        )
                    })();
                    if let Err(cause) = progress {
                        break Err(cause);
                    }
                } else {
                    break Ok(value);
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            _ => break Err(recovery_error()),
        }
    };
    drop(receive);
    if result.is_err() {
        child.kill().map_err(|_| recovery_error())?;
    }
    let wait = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if wait.elapsed() < Duration::from_secs(5) => {
                thread::sleep(Duration::from_millis(20));
            }
            _ => {
                child.kill().map_err(|_| recovery_error())?;
                child.wait().map_err(|_| recovery_error())?;
                reader.join().map_err(|_| recovery_error())?;
                return Err(recovery_error());
            }
        }
    };
    reader.join().map_err(|_| recovery_error())?;
    let value = result?;
    if !status.success()
        || value["state"] == "FAILED" && value.as_object().is_some_and(|v| v.len() == 3)
    {
        return Err(recovery_error());
    }
    Ok(value)
}

pub(crate) fn recover(
    root: &Path,
    resources: &Path,
    guard: &InstanceGuard,
) -> Result<&'static str, AppError> {
    if !pending(root)? {
        return Err(recovery_error());
    }
    if fs::symlink_metadata(root.join(".local-restore-request.json")).is_ok() {
        return super::restore_requests::startup(root, resources, guard);
    }
    let mut command = crate::ai::local_restore_command(resources, &AtomicBool::new(false))
        .map_err(|_| recovery_error())?;
    command.arg(root);
    let state = run_recovery(command, guard)?;
    if state == "RESTORE_NOT_PENDING" || pending(root)? {
        return Err(recovery_error());
    }
    Ok(state)
}

pub(crate) fn pending(root: &Path) -> Result<bool, AppError> {
    if !root.is_absolute() {
        return Err(AppError::invalid());
    }
    for name in [".local-restore.json"] {
        match fs::symlink_metadata(root.join(name)) {
            Ok(_) => return Ok(true),
            Err(cause) if cause.kind() == io::ErrorKind::NotFound => {}
            Err(_) => return Err(super::project_model::storage_error()),
        }
    }
    let state = super::restore_requests::status(root)?;
    Ok(matches!(
        state["state"].as_str(),
        Some("SCHEDULED" | "APPLYING")
    ))
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
            assert!(!matches!(pending(&fixture.store.root), Ok(false)));
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

    #[test]
    fn recovery_protocol_has_exact_fields_and_never_exposes_worker_errors() {
        let valid = serde_json::json!({"schemaVersion":1,"state":"LOCAL_DATA_ROLLED_BACK",
            "recoveryId":"95583807-64aa-4c58-9564-ab93d6311d67","files":3,"bytes":2_147_483_648u64,
            "externalReferencesNotCopied":0,"appDataReplaced":false});
        assert_eq!(
            response(&serde_json::to_vec(&valid).expect("응답")).expect("정상"),
            "LOCAL_DATA_ROLLED_BACK"
        );
        for (field, value) in [
            ("schemaVersion", serde_json::json!(true)),
            ("files", serde_json::json!(0)),
            ("bytes", serde_json::json!(2_147_483_649u64)),
            ("recoveryId", serde_json::json!("../outside")),
            ("externalReferencesNotCopied", serde_json::json!(100_001)),
            ("appDataReplaced", serde_json::json!(true)),
            ("extra", serde_json::json!(true)),
        ] {
            let mut changed = valid.clone();
            changed[field] = value;
            assert!(response(&serde_json::to_vec(&changed).expect("잘못된 응답")).is_err());
        }
        let error =
            response(br#"{"schemaVersion":1,"state":"FAILED","errorCode":"C:/private/user-data"}"#)
                .expect_err("비공개 원문");
        assert_eq!(error.code, "RESTORE_RECOVERY_REQUIRED");
        assert!(!error.message.contains("private"));
        assert_eq!(
            response(br#"{"schemaVersion":1,"state":"RESTORE_NOT_PENDING"}"#).expect("기록 없음"),
            "RESTORE_NOT_PENDING"
        );
    }

    #[test]
    #[ignore = "검증한 번들 Python으로 자체 root의 상속 잠금·중단 복구를 확인합니다"]
    fn actual_bundled_worker_inherits_lock_and_recovers_interrupted_swap() {
        let resources = std::path::PathBuf::from(
            std::env::var_os("GUITARLAB_BACKUP_RESOURCES").expect("검증한 리소스 상위 경로"),
        );
        let fixture = Fixture::new();
        let root = &fixture.store.root;
        let before = fs::read(root.join("guitarlab.sqlite")).expect("자체 DB");
        let guard = InstanceGuard::acquire(root).expect("부모 잠금");
        let mut command = crate::ai::local_restore_command(&resources, &AtomicBool::new(false))
            .expect("내장 worker");
        command.arg(root);
        assert_eq!(
            run_recovery(command, &guard).expect("상속한 실제 stdin"),
            "RESTORE_NOT_PENDING"
        );
        let other = Fixture::new();
        let mut command = crate::ai::local_restore_command(&resources, &AtomicBool::new(false))
            .expect("다른 root 검사");
        command.arg(&other.store.root);
        assert!(run_recovery(command, &guard).is_err());
        assert_eq!(
            fs::read(root.join("guitarlab.sqlite")).expect("DB 보존"),
            before
        );
        drop(guard);

        let setup = r#"
def _worker_recover():
    root = Path(sys.argv[1])
    assert root.parent.name.startswith('guitarlab-project-test-')
    assert root.parent.parent == Path(__import__('tempfile').gettempdir()).resolve()
    marker = root / 'projects/test/fixture.txt'
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_bytes(b'backup value')
    archive = root.parent / 'restore-fixture.zip'
    backup.backup(root, archive, consent=True, guard=lambda: None)
    marker.write_bytes(b'current value to preserve')
    original = os.rename
    def interrupt(source, destination):
        result = original(source, destination)
        if Path(destination).name == 'guitarlab.sqlite':
            raise SystemExit(73)
        return result
    os.rename = interrupt
    restore_closed_app(root, archive, consent=True, confirm=True, guard=lambda: None)
"#;
        let mut command = crate::ai::local_restore_command(&resources, &AtomicBool::new(false))
            .expect("자체 중단 준비");
        command
            .env(
                "GUITARLAB_INTERNAL_RESTORE_SOURCE",
                format!(
                    "{}\n{setup}",
                    include_str!("../../../scripts/restore_local_data.py")
                ),
            )
            .arg(root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        assert_eq!(command.status().expect("자체 중단 실행").code(), Some(73));
        assert!(!root.join("guitarlab.sqlite").exists());
        let guard = InstanceGuard::acquire(root).expect("중단 뒤 잠금");
        assert_eq!(
            recover(root, &resources, &guard).expect("앱 초기화 전 실제 복구"),
            "LOCAL_DATA_ROLLED_BACK"
        );
        assert!(!pending(root).expect("복구 완료"));
        assert_eq!(
            fs::read(root.join("guitarlab.sqlite")).expect("원본 DB 복원"),
            before
        );
        assert_eq!(
            fs::read(root.join("projects/test/fixture.txt")).expect("현재 자료 복구"),
            b"current value to preserve"
        );
    }
}
