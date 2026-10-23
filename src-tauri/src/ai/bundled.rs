use super::error;
use crate::{
    ipc::AppError,
    storage::{
        database::{checked_directory, checked_file},
        project_model::validate_uuid,
        projects::canceled,
    },
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::atomic::AtomicBool,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bundle {
    schema_version: u8,
    state: String,
    python_version: String,
    files: Vec<BundleFile>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct BundleFile {
    path: String,
    bytes: u64,
    sha256: String,
}
fn reparse(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}
fn verify(root: &Path, expected: &[BundleFile], cancel: &AtomicBool) -> Result<(), AppError> {
    let invalid = || error("AI_RUNTIME_INTEGRITY");
    canceled(cancel)?;
    let mut remaining = BTreeMap::new();
    let mut total = 0u64;
    for item in expected {
        let path = Path::new(&item.path);
        if item.bytes > 64 * 1024 * 1024
            || item.sha256.len() != 64
            || !item
                .sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
            || path.is_absolute()
            || item.path.is_empty()
            || item.path.contains([':', '\\'])
            || !path
                .components()
                .all(|part| matches!(part, Component::Normal(_)))
            || remaining.insert(item.path.clone(), item).is_some()
        {
            return Err(invalid());
        }
        total = total.checked_add(item.bytes).ok_or_else(invalid)?;
    }
    if remaining.is_empty() || remaining.len() > 5000 || total > 128 * 1024 * 1024 {
        return Err(invalid());
    }
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        canceled(cancel)?;
        let info = fs::symlink_metadata(&folder).map_err(|_| invalid())?;
        if !info.is_dir() || reparse(&info) {
            return Err(invalid());
        }
        for entry in fs::read_dir(&folder).map_err(|_| invalid())? {
            canceled(cancel)?;
            let entry = entry.map_err(|_| invalid())?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(|_| invalid())?;
            if reparse(&metadata) {
                return Err(invalid());
            }
            if metadata.is_dir() {
                pending.push(path);
                continue;
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|_| invalid())?
                .to_str()
                .ok_or_else(invalid)?
                .replace('\\', "/");
            let item = remaining.remove(&relative).ok_or_else(invalid)?;
            if !metadata.is_file() || metadata.len() != item.bytes {
                return Err(invalid());
            }
            let mut file = fs::File::open(path).map_err(|_| invalid())?;
            let mut digest = Sha256::new();
            let mut bytes = [0u8; 65536];
            let mut read = 0u64;
            loop {
                canceled(cancel)?;
                let count = file.read(&mut bytes).map_err(|_| invalid())?;
                if count == 0 {
                    break;
                }
                read += count as u64;
                if read > item.bytes {
                    return Err(invalid());
                }
                digest.update(&bytes[..count]);
            }
            let actual = crate::storage::projects::hex(digest.finalize().as_ref());
            if read != item.bytes || actual != item.sha256 {
                return Err(invalid());
            }
        }
    }
    if !remaining.is_empty() {
        return Err(invalid());
    }
    Ok(())
}
pub(super) fn command(root: &Path, cancel: &AtomicBool) -> Result<Command, AppError> {
    let bundle = plan()?;
    verify(root, &bundle.files, cancel)?;
    let root = root
        .canonicalize()
        .map_err(|_| error("AI_RUNTIME_INTEGRITY"))?;
    worker_command(
        &root,
        &root.join("runtime/python/python.exe"),
        &root.join("runtime/python"),
    )
}
fn plan() -> Result<Bundle, AppError> {
    let bundle: Bundle =
        serde_json::from_str(include_str!("../../../ai/models/runtime-bundle-lock.json"))
            .map_err(|_| error("AI_RUNTIME_INTEGRITY"))?;
    if bundle.schema_version != 1
        || bundle.state != "RUNTIME_RESOURCE_CANDIDATE"
        || bundle.python_version != "3.12.15"
    {
        return Err(error("AI_RUNTIME_INTEGRITY"));
    }
    Ok(bundle)
}
fn worker_command(root: &Path, python: &Path, base: &Path) -> Result<Command, AppError> {
    let mut command = python_command(root, python, base)?;
    command.arg(root.join("worker/launch_worker.py"));
    Ok(command)
}
fn python_command(root: &Path, python: &Path, base: &Path) -> Result<Command, AppError> {
    let windows = PathBuf::from(
        std::env::var_os("SystemRoot").ok_or_else(|| error("AI_RUNTIME_UNAVAILABLE"))?,
    );
    // DLL 로더가 긴 한글 경로를 처리하도록 Windows 확장 경로를 유지합니다.
    let python = python
        .canonicalize()
        .map_err(|_| error("AI_RUNTIME_INTEGRITY"))?;
    let base = base
        .canonicalize()
        .map_err(|_| error("AI_RUNTIME_INTEGRITY"))?;
    let mut command = Command::new(python);
    command
        .args(["-I", "-B", "-X", "utf8", "-u"])
        .current_dir(root)
        .env(
            "PATH",
            std::env::join_paths([windows.join("System32"), windows])
                .map_err(|_| error("AI_RUNTIME_UNAVAILABLE"))?,
        )
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .env("GUITARLAB_AI_BASE", base);
    Ok(command)
}

pub(super) fn backup_command(root: &Path, cancel: &AtomicBool) -> Result<Command, AppError> {
    let bundle = plan()?;
    verify(root, &bundle.files, cancel)?;
    let root = root
        .canonicalize()
        .map_err(|_| error("AI_RUNTIME_INTEGRITY"))?;
    let mut command = python_command(
        &root,
        &root.join("runtime/python/python.exe"),
        &root.join("runtime/python"),
    )?;
    command.args(["-c", include_str!("../../../scripts/backup_local_data.py")]);
    Ok(command)
}

fn persistent_files(bundle: &Bundle) -> Vec<BundleFile> {
    bundle
        .files
        .iter()
        .filter_map(|item| {
            if let Some(relative) = item.path.strip_prefix("runtime/") {
                Some(BundleFile {
                    path: relative.to_owned(),
                    ..item.clone()
                })
            } else if item.path.starts_with("notices/") {
                Some(item.clone())
            } else {
                None
            }
        })
        .collect()
}
pub(super) fn persistent_command(
    resources: &Path,
    root: &Path,
    environment: Option<&Path>,
    cancel: &AtomicBool,
) -> Result<Command, AppError> {
    let bundle = plan()?;
    verify(resources, &bundle.files, cancel)?;
    let stable = root.join("ai/runtimes/cpython-3.12.15-20261013-r1");
    verify(&stable, &persistent_files(&bundle), cancel)?;
    let python = environment.map_or_else(
        || stable.join("python/python.exe"),
        |path| path.join("Scripts/python.exe"),
    );
    let mut command = worker_command(resources, &python, &stable.join("python"))?;
    if let Some(environment) = environment {
        let id = environment
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| error("AI_SETUP_PATH"))?;
        validate_uuid(id)?;
        let cache = checked_directory(root, &Path::new("ai/cache/numba").join(id))?;
        command.env("NUMBA_CACHE_DIR", cache);
    }
    command
        .env("HF_HUB_OFFLINE", "1")
        .env("HF_HUB_DISABLE_TELEMETRY", "1");
    Ok(command)
}

pub(super) fn ensure_persistent(
    resources: &Path,
    root: &Path,
    job: &str,
    cancel: &AtomicBool,
    progress: impl Fn(u64, u64) -> Result<(), AppError>,
) -> Result<PathBuf, AppError> {
    validate_uuid(job)?;
    let bundle = plan()?;
    verify(resources, &bundle.files, cancel)?;
    let entries = persistent_files(&bundle);
    let parent = checked_directory(root, Path::new("ai/runtimes"))?;
    let target = parent.join("cpython-3.12.15-20261013-r1");
    let total = entries.iter().map(|item| item.bytes).sum();
    match fs::symlink_metadata(&target) {
        Ok(_) => {
            verify(&target, &entries, cancel)?;
            progress(total, total)?;
            return Ok(target);
        }
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(error("AI_RUNTIME_INTEGRITY")),
    }
    let stage = parent.join(job);
    if fs::symlink_metadata(&stage).is_ok() {
        return Err(error("AI_SETUP_PATH"));
    }
    if crate::recording::wave::available_bytes(&parent).map_err(|_| error("AI_DISK_SPACE"))?
        < total + 16 * 1024 * 1024
    {
        return Err(error("AI_DISK_SPACE"));
    }
    fs::create_dir(&stage).map_err(|_| error("AI_SETUP_PATH"))?;
    let result = (|| {
        let mut completed = 0u64;
        let mut buffer = [0u8; 65536];
        progress(0, total)?;
        for item in &entries {
            canceled(cancel)?;
            let source = if item.path.starts_with("notices/") {
                resources.join(&item.path)
            } else {
                resources.join("runtime").join(&item.path)
            };
            let mut input = fs::File::open(source).map_err(|_| error("AI_RUNTIME_INTEGRITY"))?;
            let output = checked_file(&stage, Path::new(&item.path))?;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(output)
                .map_err(|_| error("AI_SETUP_PROCESS_FAILED"))?;
            use std::io::Write;
            let mut file_bytes = 0u64;
            loop {
                canceled(cancel)?;
                let count = input
                    .read(&mut buffer)
                    .map_err(|_| error("AI_RUNTIME_INTEGRITY"))?;
                if count == 0 {
                    break;
                }
                file_bytes += count as u64;
                if file_bytes > item.bytes {
                    return Err(error("AI_RUNTIME_INTEGRITY"));
                }
                output
                    .write_all(&buffer[..count])
                    .map_err(|_| error("AI_SETUP_PROCESS_FAILED"))?;
                completed += count as u64;
                if completed > total {
                    return Err(error("AI_RUNTIME_INTEGRITY"));
                }
                progress(completed, total)?;
            }
            output
                .sync_all()
                .map_err(|_| error("AI_SETUP_PROCESS_FAILED"))?;
        }
        verify(&stage, &entries, cancel)?;
        canceled(cancel)?;
        fs::rename(&stage, &target).map_err(|_| error("AI_SETUP_PROCESS_FAILED"))?;
        Ok(target)
    })();
    if result.is_err() && stage.exists() {
        if stage.parent() != Some(parent.as_path())
            || stage.file_name().and_then(|value| value.to_str()) != Some(job)
            || reparse(&fs::symlink_metadata(&stage).map_err(|_| error("AI_SETUP_CLEANUP_FAILED"))?)
            || stage
                .canonicalize()
                .map_err(|_| error("AI_SETUP_CLEANUP_FAILED"))?
                .parent()
                != Some(
                    parent
                        .canonicalize()
                        .map_err(|_| error("AI_SETUP_CLEANUP_FAILED"))?
                        .as_path(),
                )
        {
            return Err(error("AI_SETUP_CLEANUP_FAILED"));
        }
        fs::remove_dir_all(stage).map_err(|_| error("AI_SETUP_CLEANUP_FAILED"))?;
    }
    result
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use crate::storage::projects::hash;
    #[test]
    fn resources_require_exact_files_hashes_and_containment() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = fixture.store.root.join("DEMO-bundle");
        fs::create_dir(&root).expect("DEMO 리소스");
        let file = root.join("worker.py");
        fs::write(&file, b"DEMO").expect("실행하지 않는 소스");
        let mut expected = vec![BundleFile {
            path: "worker.py".into(),
            bytes: 4,
            sha256: hash(b"DEMO"),
        }];
        let cancel = AtomicBool::new(false);
        verify(&root, &expected, &cancel).expect("전체 일치");
        fs::write(root.join("extra.py"), b"extra").expect("추가 파일");
        assert!(verify(&root, &expected, &cancel).is_err());
        fs::remove_file(root.join("extra.py")).expect("자체 파일 정리");
        fs::write(&file, b"FAIL").expect("동일 크기 변조");
        assert!(verify(&root, &expected, &cancel).is_err());
        fs::remove_file(&file).expect("누락 검사");
        assert!(verify(&root, &expected, &cancel).is_err());
        expected[0].path = "../worker.py".into();
        assert!(verify(&root, &expected, &cancel).is_err());
        assert_eq!(
            verify(&root, &expected, &AtomicBool::new(true))
                .expect_err("사전 취소")
                .code,
            "CANCELED"
        );
    }
    pub(in crate::ai) fn resource_candidate() -> PathBuf {
        let validation = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/runtime-validation");
        let mut receipts: Vec<_> = fs::read_dir(&validation)
            .expect("리소스 후보 기록")
            .map(|entry| entry.expect("기록").path())
            .filter(|path| {
                path.file_name().is_some_and(|name| {
                    name.to_string_lossy()
                        .strip_prefix("bundle-")
                        .and_then(|value| value.strip_suffix(".json"))
                        .is_some_and(|value| uuid::Uuid::parse_str(value).is_ok())
                }) && path.extension().is_some_and(|value| value == "json")
            })
            .collect();
        receipts.sort_by_key(|path| {
            fs::metadata(path)
                .and_then(|value| value.modified())
                .expect("후보 시각")
        });
        let receipt: serde_json::Value = serde_json::from_slice(
            &fs::read(receipts.last().expect("최신 리소스 후보")).expect("후보 기록"),
        )
        .expect("후보 JSON");
        let root = PathBuf::from(receipt["resourcePath"].as_str().expect("리소스 경로"));
        assert!(root.canonicalize().expect("후보 경로").starts_with(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("target/ai-runtime-resources")
                .canonicalize()
                .expect("후보 루트")
        ));
        root
    }
    #[cfg(windows)]
    #[test]
    fn interpreter_keeps_extended_path_for_windows_dll_loading() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let base = fixture.store.root.join("DEMO-python");
        fs::create_dir(&base).expect("실행하지 않는 가짜 runtime");
        let python = base.join("python.exe");
        fs::write(&python, b"DEMO never executed").expect("경로 검증 자료");
        let command =
            worker_command(&fixture.store.root, &python, &base).expect("실행 경로 정규화");
        assert!(
            matches!(Path::new(command.get_program()).components().next(),Some(Component::Prefix(prefix)) if matches!(prefix.kind(),std::path::Prefix::VerbatimDisk(_)))
        );
    }
    #[test]
    #[ignore = "별도 Python runtime 리소스 후보가 필요하며 다운로드·모델 추론은 하지 않습니다"]
    fn actual_bundled_runtime_inspects_without_development_python_or_models() {
        let root = resource_candidate();
        let cancel = AtomicBool::new(false);
        let result = super::super::run(
            command(&root, &cancel).expect("전체 파일 검증"),
            &uuid::Uuid::new_v4().to_string(),
            &cancel,
            std::time::Duration::from_secs(10),
        )
        .expect("독립 런타임 환경 확인");
        assert_eq!(result.python_version, "3.12.15");
        assert!(result
            .models
            .iter()
            .all(|model| model.package_version.is_none()
                && model.state == "PACKAGE_MISSING"
                && !model.usable));
        command(&root, &cancel).expect("실행 후에도 전체 파일 불변");
    }
    #[test]
    #[ignore = "검증된 runtime 후보를 격리 앱 데이터에 복사·재사용·취소하며 기존 모델은 건드리지 않습니다"]
    fn actual_persistent_runtime_copy_reuses_cleans_cancel_and_preserves_legacy() {
        let resources = resource_candidate();
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        fs::create_dir(root.join("ai")).expect("격리 앱 데이터");
        let legacy = root.join("ai/basic-pitch-active.json");
        fs::write(&legacy, b"DEMO legacy marker").expect("기존 marker 모사");
        let canceled_id = uuid::Uuid::new_v4().to_string();
        let cancel = AtomicBool::new(false);
        assert_eq!(
            ensure_persistent(&resources, root, &canceled_id, &cancel, |done, _| {
                if done > 0 {
                    cancel.store(true, std::sync::atomic::Ordering::Release);
                }
                Ok(())
            })
            .expect_err("복사 중 취소")
            .code,
            "CANCELED"
        );
        assert!(!root.join("ai/runtimes").join(canceled_id).exists());
        let stable = ensure_persistent(
            &resources,
            root,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("원자적 새 runtime 준비");
        let reused = ensure_persistent(
            &resources,
            root,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
            |_, _| Ok(()),
        )
        .expect("기존 경로 검증·재사용");
        assert_eq!(stable, reused);
        let result = super::super::run(
            persistent_command(&resources, root, None, &AtomicBool::new(false))
                .expect("불변 base worker"),
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
            std::time::Duration::from_secs(10),
        )
        .expect("앱 데이터 runtime 실제 실행");
        assert_eq!(result.python_version, "3.12.15");
        let damaged = stable.join("python/LICENSE.txt");
        fs::write(&damaged, b"DEMO damaged").expect("격리 runtime 손상 모사");
        assert_eq!(
            ensure_persistent(
                &resources,
                root,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(false),
                |_, _| Ok(())
            )
            .expect_err("손상 기존 runtime 자동 교체 금지")
            .code,
            "AI_RUNTIME_INTEGRITY"
        );
        assert_eq!(fs::read(damaged).expect("손상 파일 보존"), b"DEMO damaged");
        assert_eq!(
            fs::read(legacy).expect("이전 marker 보존"),
            b"DEMO legacy marker"
        );
    }
}
