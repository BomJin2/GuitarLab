use super::installation::ModelId;
use crate::{ipc::AppError, storage::projects::canceled};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Component, Path, PathBuf},
    sync::atomic::AtomicBool,
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
fn error(code: &'static str) -> AppError {
    AppError::new(code, "캐시 상태가 바뀌었거나 정리하지 못했습니다. 일부 캐시는 이미 삭제됐을 수 있습니다. 다시 조회하세요.", true)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Plan {
    id: String,
    model_id: ModelId,
    model_version: String,
    python: String,
    artifacts: Vec<Artifact>,
    model_files: Vec<ModelFile>,
}
#[derive(Deserialize)]
struct Artifact {
    filename: String,
    bytes: u64,
}
#[derive(Deserialize)]
struct ModelFile {
    path: String,
    bytes: u64,
}
fn artifacts(model: ModelId) -> Result<BTreeMap<String, u64>, AppError> {
    let raw = match model {
        ModelId::BasicPitch => {
            include_str!("../../../ai/models/basic-pitch-0.4.0-onnx1-windows-cp312.json")
        }
        ModelId::Demucs => {
            include_str!("../../../ai/models/demucs-4.1.0-htdemucs-6s-windows-cp312.json")
        }
    };
    let plan: Plan = serde_json::from_str(raw).map_err(|_| error("AI_CACHE_INTEGRITY"))?;
    if plan.id != model.setup_for(true).cache
        || plan.model_id != model
        || plan.model_version != model.version()
        || plan.python != "3.12.15"
    {
        return Err(error("AI_CACHE_INTEGRITY"));
    }
    let mut entries = plan.artifacts;
    if model == ModelId::Demucs {
        entries.extend(plan.model_files.into_iter().map(|file| Artifact {
            filename: file.path,
            bytes: file.bytes,
        }));
    }
    if entries.len() > 128 {
        return Err(error("AI_CACHE_INTEGRITY"));
    }
    let mut result = BTreeMap::new();
    for entry in entries {
        let path = Path::new(&entry.filename);
        if path.components().count() != 1
            || !path.components().all(|c| matches!(c, Component::Normal(_)))
            || !entry
                .filename
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.+-".contains(&c))
            || !(1..=1024 * 1024 * 1024).contains(&entry.bytes)
            || result.insert(entry.filename, entry.bytes).is_some()
        {
            return Err(error("AI_CACHE_INTEGRITY"));
        }
    }
    let (count, total) = match model {
        ModelId::BasicPitch => (42, 146_364_006),
        ModelId::Demucs => (34, 708_033_316),
    };
    if result.len() != count
        || result
            .values()
            .try_fold(0u64, |sum, bytes| sum.checked_add(*bytes))
            != Some(total)
    {
        return Err(error("AI_CACHE_INTEGRITY"));
    }
    Ok(result)
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
fn directory(root: &Path, model: ModelId) -> Result<Option<PathBuf>, AppError> {
    if !root.is_absolute() {
        return Err(AppError::invalid());
    }
    let metadata = fs::symlink_metadata(root).map_err(|_| error("AI_CACHE_PATH_INVALID"))?;
    if !metadata.is_dir() || reparse(&metadata) {
        return Err(error("AI_CACHE_PATH_INVALID"));
    }
    let base = root
        .canonicalize()
        .map_err(|_| error("AI_CACHE_PATH_INVALID"))?;
    let mut current = base.clone();
    for part in ["ai", "downloads", model.setup_for(true).cache] {
        current.push(part);
        let info = match fs::symlink_metadata(&current) {
            Ok(info) => info,
            Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(error("AI_CACHE_PATH_INVALID")),
        };
        if !info.is_dir()
            || reparse(&info)
            || !current
                .canonicalize()
                .map_err(|_| error("AI_CACHE_PATH_INVALID"))?
                .starts_with(&base)
        {
            return Err(error("AI_CACHE_PATH_INVALID"));
        }
    }
    Ok(Some(current))
}
struct File {
    name: String,
    bytes: u64,
    modified: SystemTime,
}
struct Scan {
    files: Vec<File>,
    bytes: u64,
    revision: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    schema_version: u8,
    state: &'static str,
    model_id: ModelId,
    model_version: &'static str,
    profile: &'static str,
    files: usize,
    bytes: u64,
    revision: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cleared {
    schema_version: u8,
    state: &'static str,
    model_id: ModelId,
    model_version: &'static str,
    profile: &'static str,
    removed_files: usize,
    removed_bytes: u64,
    installed_environments_changed: bool,
}
fn scan(root: &Path, model: ModelId) -> Result<Scan, AppError> {
    let expected = artifacts(model)?;
    let mut files = Vec::new();
    let mut bytes = 0u64;
    if let Some(folder) = directory(root, model)? {
        for entry in fs::read_dir(&folder).map_err(|_| error("AI_CACHE_PATH_INVALID"))? {
            if files.len() >= 128 {
                return Err(error("AI_CACHE_UNEXPECTED_FILE"));
            }
            let entry = entry.map_err(|_| error("AI_CACHE_PATH_INVALID"))?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| error("AI_CACHE_UNEXPECTED_FILE"))?;
            let metadata =
                fs::symlink_metadata(entry.path()).map_err(|_| error("AI_CACHE_PATH_INVALID"))?;
            if !expected.contains_key(&name)
                || !metadata.is_file()
                || reparse(&metadata)
                || metadata.len() > 1024 * 1024 * 1024
            {
                return Err(error("AI_CACHE_UNEXPECTED_FILE"));
            }
            bytes = bytes
                .checked_add(metadata.len())
                .filter(|value| *value <= MAX_BYTES)
                .ok_or_else(|| error("AI_CACHE_LIMIT_EXCEEDED"))?;
            files.push(File {
                name,
                bytes: metadata.len(),
                modified: metadata
                    .modified()
                    .map_err(|_| error("AI_CACHE_PATH_INVALID"))?,
            });
        }
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    let mut digest = Sha256::new();
    digest.update(model.setup_for(true).cache.as_bytes());
    for file in &files {
        digest.update(file.name.as_bytes());
        digest.update([0]);
        digest.update(file.bytes.to_le_bytes());
        digest.update(
            file.modified
                .duration_since(UNIX_EPOCH)
                .map_err(|_| error("AI_CACHE_PATH_INVALID"))?
                .as_nanos()
                .to_le_bytes(),
        );
    }
    Ok(Scan {
        files,
        bytes,
        revision: crate::storage::projects::hex(digest.finalize().as_ref()),
    })
}
pub fn inspect(root: &Path, model: ModelId) -> Result<Usage, AppError> {
    let scan = scan(root, model)?;
    Ok(Usage {
        schema_version: 1,
        state: "CACHE_USAGE",
        model_id: model,
        model_version: model.version(),
        profile: "CP312_DOWNLOADS",
        files: scan.files.len(),
        bytes: scan.bytes,
        revision: scan.revision,
    })
}
pub fn clear(
    root: &Path,
    model: ModelId,
    expected_revision: &str,
    cancel: &AtomicBool,
    progress: impl Fn(u64) -> Result<(), AppError>,
) -> Result<Cleared, AppError> {
    canceled(cancel)?;
    let scan = scan(root, model)?;
    if scan.revision != expected_revision {
        return Err(error("AI_CACHE_CHANGED"));
    }
    progress(0)?;
    for (index, file) in scan.files.iter().enumerate() {
        canceled(cancel)?;
        let folder = directory(root, model)?.ok_or_else(|| error("AI_CACHE_CHANGED"))?;
        let path = folder.join(&file.name);
        let metadata = fs::symlink_metadata(&path).map_err(|_| error("AI_CACHE_CHANGED"))?;
        if !metadata.is_file()
            || reparse(&metadata)
            || metadata.len() != file.bytes
            || metadata.modified().map_err(|_| error("AI_CACHE_CHANGED"))? != file.modified
            || path
                .canonicalize()
                .map_err(|_| error("AI_CACHE_PATH_INVALID"))?
                .parent()
                != Some(folder.as_path())
        {
            return Err(error("AI_CACHE_CHANGED"));
        }
        fs::remove_file(path).map_err(|_| error("AI_CACHE_CLEANUP_FAILED"))?;
        progress((index as u64 + 1) * 100 / scan.files.len() as u64)?;
    }
    if let Some(folder) = directory(root, model)? {
        fs::remove_dir(folder).map_err(|_| error("AI_CACHE_CLEANUP_FAILED"))?;
    }
    progress(100)?;
    Ok(Cleared {
        schema_version: 1,
        state: "CACHE_CLEARED",
        model_id: model,
        model_version: model.version(),
        profile: "CP312_DOWNLOADS",
        removed_files: scan.files.len(),
        removed_bytes: scan.bytes,
        installed_environments_changed: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::projects_tests::Fixture;
    use std::sync::atomic::Ordering;
    fn cache(f: &Fixture, model: ModelId) -> PathBuf {
        let folder = f
            .store
            .root
            .join("ai/downloads")
            .join(model.setup_for(true).cache);
        fs::create_dir_all(&folder).expect("자체 캐시");
        folder
    }
    #[test]
    fn only_fixed_cache_entries_are_unlinked_and_installed_hardlink_and_project_remain() {
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            let f = Fixture::new();
            let project = f.project();
            let folder = cache(&f, model);
            let names: Vec<_> = artifacts(model)
                .expect("고정 계획")
                .into_keys()
                .take(2)
                .collect();
            let environment = f.store.root.join("ai/installed-environment.bin");
            fs::write(&environment, b"installed bytes").expect("설치 원본");
            fs::hard_link(&environment, folder.join(&names[0])).expect("자체 hardlink");
            fs::write(folder.join(&names[1]), b"cache").expect("자체 파일");
            let usage = inspect(&f.store.root, model).expect("현황");
            assert_eq!(usage.files, 2);
            let cleared = clear(
                &f.store.root,
                model,
                &usage.revision,
                &AtomicBool::new(false),
                |_| Ok(()),
            )
            .expect("정리");
            assert_eq!(
                (cleared.removed_files, cleared.removed_bytes),
                (2, usage.bytes)
            );
            assert_eq!(
                fs::read(environment).expect("설치 보존"),
                b"installed bytes"
            );
            assert_eq!(f.store.list().expect("프로젝트 보존")[0].id, project);
            assert!(!folder.exists());
        }
    }
    #[test]
    fn absent_cache_is_readonly_and_cancel_before_work_creates_nothing() {
        let f = Fixture::new();
        let usage = inspect(&f.store.root, ModelId::BasicPitch).expect("빈 현황");
        assert_eq!((usage.files, usage.bytes), (0, 0));
        assert!(!f.store.root.join("ai").exists());
        assert_eq!(
            clear(
                &f.store.root,
                ModelId::BasicPitch,
                &usage.revision,
                &AtomicBool::new(true),
                |_| Ok(())
            )
            .expect_err("시작 전 취소")
            .code,
            "CANCELED"
        );
        let cleared = clear(
            &f.store.root,
            ModelId::BasicPitch,
            &usage.revision,
            &AtomicBool::new(false),
            |_| Ok(()),
        )
        .expect("빈 정리");
        assert_eq!(cleared.removed_files, 0);
        assert!(!f.store.root.join("ai").exists());
    }
    #[test]
    fn unknown_files_and_changed_revision_block_before_deletion() {
        let f = Fixture::new();
        let model = ModelId::BasicPitch;
        let folder = cache(&f, model);
        let name = artifacts(model)
            .expect("계획")
            .into_keys()
            .next()
            .expect("파일");
        let target = folder.join(name);
        fs::write(&target, b"cache").expect("파일");
        let usage = inspect(&f.store.root, model).expect("현황");
        fs::write(&target, b"changed cache").expect("변경");
        assert_eq!(
            clear(
                &f.store.root,
                model,
                &usage.revision,
                &AtomicBool::new(false),
                |_| Ok(())
            )
            .expect_err("변경 거부")
            .code,
            "AI_CACHE_CHANGED"
        );
        let current = inspect(&f.store.root, model).expect("변경 후 현황");
        assert_eq!(
            clear(
                &f.store.root,
                model,
                &current.revision,
                &AtomicBool::new(false),
                |_| {
                    fs::write(&target, b"changed before unlink").expect("삭제 직전 변경");
                    Ok(())
                }
            )
            .expect_err("삭제 직전 변경 거부")
            .code,
            "AI_CACHE_CHANGED"
        );
        fs::write(folder.join("개인 파일.wav"), b"keep private").expect("알 수 없는 파일");
        assert!(inspect(&f.store.root, model).is_err());
        assert!(target.exists());
    }
    #[test]
    #[ignore = "명시한 기존 앱 캐시를 두 번 조회만 하며 삭제/다운로드하지 않습니다"]
    fn actual_existing_cache_inspection_is_readonly() {
        let root = PathBuf::from(
            std::env::var_os("GUITARLAB_CACHE_INSPECTION_ROOT").expect("조회 대상 앱 데이터"),
        );
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            let first = inspect(&root, model).expect("현재 캐시 조회");
            let second = inspect(&root, model).expect("재조회");
            assert_eq!(
                (first.files, first.bytes, &first.revision),
                (second.files, second.bytes, &second.revision)
            );
            println!("{}", serde_json::to_string(&first).expect("경로 없는 현황"));
        }
    }
    #[test]
    fn cancel_keeps_remaining_cache_and_never_touches_other_model() {
        let f = Fixture::new();
        let model = ModelId::BasicPitch;
        let folder = cache(&f, model);
        for name in artifacts(model).expect("계획").into_keys().take(3) {
            fs::write(folder.join(name), b"cache").expect("파일");
        }
        let other = cache(&f, ModelId::Demucs).join("보존.txt");
        fs::write(&other, b"other model").expect("다른 모델");
        let usage = inspect(&f.store.root, model).expect("현황");
        let cancel = AtomicBool::new(false);
        assert_eq!(
            clear(&f.store.root, model, &usage.revision, &cancel, |done| {
                if done > 0 {
                    cancel.store(true, Ordering::Release);
                }
                Ok(())
            })
            .expect_err("취소")
            .code,
            "CANCELED"
        );
        assert_eq!(inspect(&f.store.root, model).expect("남은 현황").files, 2);
        assert_eq!(fs::read(other).expect("다른 모델 보존"), b"other model");
    }
    #[cfg(windows)]
    #[test]
    fn windows_cache_junction_never_reaches_outside_directory() {
        let f = Fixture::new();
        let model = ModelId::BasicPitch;
        let folder = f
            .store
            .root
            .join("ai/downloads")
            .join(model.setup_for(true).cache);
        fs::create_dir_all(folder.parent().expect("자체 상위")).expect("상위");
        let outside = f
            .store
            .root
            .parent()
            .expect("자체 fixture")
            .join("정리 외부 fixture");
        fs::create_dir(&outside).expect("외부 fixture");
        fs::write(outside.join("원본.txt"), b"keep original").expect("보존 파일");
        let created=std::process::Command::new("pwsh").args(["-NoProfile","-NonInteractive","-Command","New-Item -ItemType Junction -Path $env:GUITARLAB_TEST_LINK -Target $env:GUITARLAB_TEST_TARGET -ErrorAction Stop | Out-Null"])
            .env("GUITARLAB_TEST_LINK",&folder).env("GUITARLAB_TEST_TARGET",&outside).output().expect("junction 생성");
        assert!(created.status.success(), "자체 junction 생성 실패");
        let blocked = inspect(&f.store.root, model).is_err();
        assert!(reparse(
            &fs::symlink_metadata(&folder).expect("junction 속성")
        ));
        fs::remove_dir(&folder).expect("링크 자체만 비재귀 제거");
        assert!(blocked);
        assert_eq!(
            fs::read(outside.join("원본.txt")).expect("원본 보존"),
            b"keep original"
        );
    }
}
