use super::installation::ModelId;
use super::{dev_command, error, managed, python_at, run_request};
use crate::{ipc::AppError, storage::projects::canceled};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct SetupService {
    active: AtomicBool,
}
pub struct SetupGuard {
    service: Arc<SetupService>,
}
impl SetupService {
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }
    pub fn begin(self: &Arc<Self>) -> Result<SetupGuard, AppError> {
        self.active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| error("STORAGE_BUSY"))?;
        Ok(SetupGuard {
            service: self.clone(),
        })
    }
}
impl Drop for SetupGuard {
    fn drop(&mut self) {
        self.service.active.store(false, Ordering::Release);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SetupAction {
    Prepare,
    Check,
    Activate,
    Discard,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Report {
    schema_version: u8,
    model_id: ModelId,
    model_version: String,
    state: String,
    environment_id: Option<String>,
    self_test: Option<String>,
}
pub fn validate(value: &Value, action: SetupAction, model: ModelId) -> Result<(), AppError> {
    let plan = model.setup();
    let report: Report =
        serde_json::from_value(value.clone()).map_err(|_| error("AI_PROTOCOL_INVALID"))?;
    let count = value.as_object().map_or(0, |object| object.len());
    let valid_id = report
        .environment_id
        .as_deref()
        .is_some_and(|id| crate::storage::project_model::validate_uuid(id).is_ok());
    let valid = match action {
        SetupAction::Prepare => {
            count == 5
                && valid_id
                && report.self_test.is_none()
                && ["PREPARED", "ALREADY_ACTIVE"].contains(&report.state.as_str())
        }
        SetupAction::Check => count == 4 && report.state == "SELF_TEST_PASSED",
        SetupAction::Activate => {
            count == 6
                && valid_id
                && ["INSTALLED", "ALREADY_ACTIVE"].contains(&report.state.as_str())
                && report.self_test.as_deref() == Some(plan.self_test)
        }
        SetupAction::Discard => {
            count == 4 && ["DISCARDED", "KEPT_ACTIVE"].contains(&report.state.as_str())
        }
    };
    if !valid
        || report.schema_version != 1
        || report.model_id != model
        || report.model_version != plan.version
    {
        return Err(error("AI_PROTOCOL_INVALID"));
    }
    Ok(())
}
fn step(
    command: Command,
    root: &Path,
    id: &str,
    job: &str,
    cancel: &AtomicBool,
    action: &str,
    model: ModelId,
) -> Result<Value, AppError> {
    let mut request =
        json!({"protocolVersion":1,"type":"start","jobId":job,"action":action,"modelId":model});
    if action != "check_install" {
        request["input"] = json!({"appDataRoot":root,"environmentId":id});
    }
    run_request(
        command,
        job,
        cancel,
        Duration::from_secs(if action == "check_install" { 180 } else { 30 }),
        request,
        |_| Ok(()),
    )
    .map_err(|cause| {
        if cause.code == "AI_WORKER_TIMEOUT" {
            error("AI_SETUP_TIMEOUT")
        } else {
            cause
        }
    })
}
fn run_fixed(mut command: Command, cancel: &AtomicBool, timeout: Duration) -> Result<(), AppError> {
    canceled(cancel)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .env("PIP_NO_INDEX", "1")
        .env("PYTHONUTF8", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .spawn()
        .map_err(|_| error("AI_SETUP_PROCESS_FAILED"))?;
    let started = Instant::now();
    let result = (|| loop {
        canceled(cancel)?;
        if let Some(status) = child
            .try_wait()
            .map_err(|_| error("AI_SETUP_PROCESS_FAILED"))?
        {
            return if status.success() {
                Ok(())
            } else {
                Err(error("AI_SETUP_PROCESS_FAILED"))
            };
        }
        if started.elapsed() > timeout {
            return Err(error("AI_SETUP_TIMEOUT"));
        }
        thread::sleep(Duration::from_millis(50));
    })();
    if !matches!(child.try_wait(), Ok(Some(_))) {
        let _ = child.kill();
    }
    child.wait().map_err(|_| error("AI_SETUP_PROCESS_FAILED"))?;
    result
}
fn final_result(state: &str, id: &str, model: ModelId) -> Value {
    let plan = model.setup();
    json!({"schemaVersion":1,"modelId":model,"modelVersion":plan.version,"state":state,"environmentId":id,"selfTest":plan.self_test})
}
pub fn install(
    root: &Path,
    job: &str,
    cancel: &AtomicBool,
    progress: impl Fn(u64) -> Result<(), AppError>,
    model: ModelId,
) -> Result<Value, AppError> {
    install_with_resources(root, job, cancel, progress, model, None)
}
pub fn install_with_resources(
    root: &Path,
    job: &str,
    cancel: &AtomicBool,
    progress: impl Fn(u64) -> Result<(), AppError>,
    model: ModelId,
    resources: Option<&Path>,
) -> Result<Value, AppError> {
    crate::storage::project_model::validate_uuid(job)?;
    canceled(cancel)?;
    let portable = resources.is_some();
    let plan = model.setup_for(portable);
    let runtime = if let Some(resources) = resources {
        Some(super::bundled::ensure_persistent(
            resources,
            root,
            job,
            cancel,
            |_, _| Ok(()),
        )?)
    } else {
        None
    };
    let bootstrap = |token: &AtomicBool| {
        if let Some(resources) = resources {
            super::bundled::persistent_command(resources, root, None, token)
        } else {
            dev_command()
        }
    };
    let worker = |environment: std::path::PathBuf| {
        if let Some(resources) = resources {
            super::bundled::persistent_command(resources, root, Some(&environment), cancel)
        } else {
            python_at(environment, "AI_MODEL_MISSING")
        }
    };
    let candidate = root.join("ai/environments").join(plan.folder).join(job);
    if fs::symlink_metadata(&candidate).is_ok() {
        return Err(error("AI_SETUP_PATH"));
    }
    let result = (|| {
        progress(0)?;
        let prepared = step(
            bootstrap(cancel)?,
            root,
            job,
            job,
            cancel,
            "prepare_install",
            model,
        )?;
        let id = prepared["environmentId"]
            .as_str()
            .ok_or_else(|| error("AI_PROTOCOL_INVALID"))?;
        if prepared["state"] == "ALREADY_ACTIVE" {
            let environment = managed::environment_for_profile(root, model, portable)?
                .ok_or_else(|| error("AI_MODEL_INTEGRITY"))?;
            if environment.file_name().and_then(|n| n.to_str()) != Some(id) {
                return Err(error("AI_PROTOCOL_INVALID"));
            }
            progress(3)?;
            step(
                worker(environment)?,
                root,
                id,
                job,
                cancel,
                "check_install",
                model,
            )?;
            progress(5)?;
            return Ok(final_result("ALREADY_ACTIVE", id, model));
        }
        if id != job {
            return Err(error("AI_PROTOCOL_INVALID"));
        }
        let executable = crate::storage::database::checked_file(
            root,
            &Path::new("ai/environments")
                .join(plan.folder)
                .join(job)
                .join("Scripts/python.exe"),
        )?;
        let runner = runtime.as_ref().map_or_else(
            || {
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../ai/.venv/Lib/site-packages/pip/__pip-runner__.py")
            },
            |path| path.join("python/Lib/site-packages/pip/__pip-runner__.py"),
        );
        if !runner.is_file() {
            return Err(error("AI_SETUP_VERSION"));
        }
        let pip = || {
            let mut command = Command::new(&executable);
            command.args(["-I", "-B"]).arg(&runner).args([
                "--isolated",
                "--disable-pip-version-check",
                "--no-input",
            ]);
            command
        };
        progress(1)?;
        let mut install = pip();
        install
            .args(["install", "--no-index", "--find-links"])
            .arg(root.join("ai/downloads").join(plan.cache))
            .arg("--find-links")
            .arg(candidate.join("setup-bootstrap"))
            .args([
                "--require-hashes",
                "--only-binary=:all:",
                "--no-deps",
                "--no-compile",
                "--no-cache-dir",
                "-r",
            ])
            .arg(candidate.join("requirements.lock"));
        run_fixed(install, cancel, Duration::from_secs(900))?;
        progress(2)?;
        let mut check = pip();
        check.arg("check");
        run_fixed(check, cancel, Duration::from_secs(60))?;
        progress(3)?;
        step(
            worker(candidate.clone())?,
            root,
            job,
            job,
            cancel,
            "check_install",
            model,
        )?;
        progress(4)?;
        let activated = step(
            bootstrap(cancel)?,
            root,
            job,
            job,
            cancel,
            "activate_install",
            model,
        )?;
        if activated["environmentId"] != job {
            return Err(error("AI_PROTOCOL_INVALID"));
        }
        progress(5)?;
        Ok(activated)
    })();
    if result.is_err() {
        if managed::environment_for_profile(root, model, portable)
            .ok()
            .flatten()
            .is_some_and(|env| env == candidate)
        {
            return Ok(final_result("INSTALLED", job, model));
        }
        if fs::symlink_metadata(&candidate).is_ok() {
            step(
                bootstrap(&AtomicBool::new(false))?,
                root,
                job,
                job,
                &AtomicBool::new(false),
                "discard_install",
                model,
            )
            .map_err(|_| error("AI_SETUP_CLEANUP_FAILED"))?;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn setup_guard_prevents_overlap_and_releases_after_error_or_completion() {
        let service = Arc::new(SetupService::default());
        assert!(!service.is_active());
        let guard = service.begin().expect("시작");
        assert!(service.is_active() && service.begin().is_err());
        drop(guard);
        assert!(!service.is_active());
        assert!(service.begin().is_ok());
    }
    #[test]
    fn setup_reports_require_exact_stage_fields_and_verified_model() {
        let id = uuid::Uuid::new_v4().to_string();
        let final_value = final_result("INSTALLED", &id, ModelId::BasicPitch);
        validate(&final_value, SetupAction::Activate, ModelId::BasicPitch).expect("검증 성공");
        assert!(validate(&final_value, SetupAction::Prepare, ModelId::BasicPitch).is_err());
        let demucs = final_result("INSTALLED", &id, ModelId::Demucs);
        validate(&demucs, SetupAction::Activate, ModelId::Demucs).expect("분리 검증 성공");
        assert!(validate(&demucs, SetupAction::Activate, ModelId::BasicPitch).is_err());
        assert!(validate(&final_value, SetupAction::Activate, ModelId::Demucs).is_err());
        for (key, value) in [
            ("environmentId", json!("../private")),
            ("modelVersion", json!("other")),
            ("selfTest", json!("NOT_TESTED")),
            ("path", json!("private")),
            ("schemaVersion", json!(2)),
        ] {
            let mut bad = final_value.clone();
            bad[key] = value;
            assert!(validate(&bad, SetupAction::Activate, ModelId::BasicPitch).is_err());
        }
        for (action, state) in [
            (SetupAction::Check, "SELF_TEST_PASSED"),
            (SetupAction::Discard, "DISCARDED"),
        ] {
            let value = json!({"schemaVersion":1,"modelId":"basic-pitch","modelVersion":"0.4.0","state":state});
            validate(&value, action, ModelId::BasicPitch).expect("단계 결과");
            let mut bad = value;
            bad["environmentId"] = json!(id);
            assert!(validate(&bad, action, ModelId::BasicPitch).is_err());
        }
    }
    fn cached_fixture(model: ModelId) -> crate::storage::projects_tests::Fixture {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let source = std::path::PathBuf::from(std::env::var_os("APPDATA").expect("앱 데이터"))
            .join("com.guitarlab.app/ai/downloads")
            .join(model.setup().cache);
        let target = fixture
            .store
            .root
            .join("ai/downloads")
            .join(model.setup().cache);
        fs::create_dir_all(&target).expect("격리 캐시");
        let plan: Value = serde_json::from_str(match model {
            ModelId::BasicPitch => {
                include_str!("../../../ai/models/basic-pitch-0.4.0-windows-cp310.json")
            }
            ModelId::Demucs => {
                include_str!("../../../ai/models/demucs-4.1.0-htdemucs-6s-windows-cp310.json")
            }
        })
        .expect("고정 계획");
        for artifact in plan["artifacts"].as_array().expect("파일") {
            let name = artifact["filename"].as_str().expect("고정 파일명");
            fs::copy(source.join(name), target.join(name)).expect("승인 다운로드 캐시 복사");
        }
        if model == ModelId::Demucs {
            for item in plan["modelFiles"].as_array().expect("모델") {
                let name = item["path"].as_str().expect("고정 모델 파일명");
                fs::copy(source.join(name), target.join(name)).expect("승인 모델 캐시 복사");
            }
        }
        fixture
    }
    fn portable_cache(root: &Path, model: ModelId, build_fork: bool) {
        let cache = model.setup_for(true).cache;
        let source = std::path::PathBuf::from(std::env::var_os("APPDATA").expect("앱 데이터"))
            .join("com.guitarlab.app/ai/downloads");
        let target = root.join("ai/downloads").join(cache);
        fs::create_dir_all(&target).expect("격리 cp312 캐시");
        let plan: Value = serde_json::from_str(match model {
            ModelId::BasicPitch => {
                include_str!("../../../ai/models/basic-pitch-0.4.0-onnx1-windows-cp312.json")
            }
            ModelId::Demucs => {
                include_str!("../../../ai/models/demucs-4.1.0-htdemucs-6s-windows-cp312.json")
            }
        })
        .expect("고정 cp312 계획");
        for artifact in plan["artifacts"].as_array().expect("고정 wheel") {
            if build_fork && artifact["name"] == "basic-pitch" {
                continue;
            }
            let name = artifact["filename"].as_str().expect("파일명");
            fs::copy(source.join(cache).join(name), target.join(name))
                .expect("기존 승인 캐시 복사");
        }
        if model == ModelId::Demucs {
            for item in plan["modelFiles"].as_array().expect("고정 가중치") {
                let name = item["path"].as_str().expect("파일명");
                fs::copy(source.join(cache).join(name), target.join(name))
                    .expect("기존 승인 가중치 복사");
            }
        } else if build_fork {
            let old: Value = serde_json::from_str(include_str!(
                "../../../ai/models/basic-pitch-0.4.0-windows-cp310.json"
            ))
            .expect("고정 원본 계획");
            let original = old["artifacts"]
                .as_array()
                .expect("원본 목록")
                .iter()
                .find(|item| item["name"] == "basic-pitch")
                .expect("원본 wheel");
            let name = original["filename"].as_str().expect("원본 파일명");
            fs::copy(
                source.join(ModelId::BasicPitch.setup().cache).join(name),
                target.join(name),
            )
            .expect("메타데이터용 공식 원본 복사");
        }
    }
    #[test]
    #[ignore = "승인된 cp312 캐시/별도 runtime 후보에서 격리 설치·캐시 정리 후 실제 추론을 검증하며 사용자 캐시는 보존합니다"]
    fn actual_portable_models_install_reuse_transcribe_separate_and_cancel_without_legacy_changes()
    {
        let resources = super::super::bundled::tests::resource_candidate();
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        let source_root = std::path::PathBuf::from(std::env::var_os("APPDATA").expect("앱 데이터"))
            .join("com.guitarlab.app");
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            portable_cache(root, model, model == ModelId::BasicPitch);
            fs::write(
                root.join("ai").join(model.setup().marker),
                b"DEMO preserved legacy marker",
            )
            .expect("이전 marker 모사");
        }
        let cache = super::super::model_cache::download_with_resources(
            root,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
            |_| Ok(()),
            Some(&resources),
        )
        .expect("패키지를 실행하지 않는 실제 ONNX 재패키징/캐시 확인");
        assert_eq!(cache["artifactCount"], 42);
        assert_eq!(cache["totalBytes"], 146364006);
        assert_eq!(cache["reusedFiles"], 41);
        // 재패키징 입력은 CP312 허용 목록 밖이므로 자체 복사본만 제거합니다.
        fs::remove_file(
            root.join("ai/downloads")
                .join(ModelId::BasicPitch.setup_for(true).cache)
                .join("basic_pitch-0.4.0-py2.py3-none-any.whl"),
        )
        .expect("자체 공식 원본 wheel 복사본 정리");
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            let id = uuid::Uuid::new_v4().to_string();
            let result = install_with_resources(
                root,
                &id,
                &AtomicBool::new(false),
                |stage| {
                    eprintln!("cp312 모델 {:?} 설치 단계 {stage}/5", model);
                    Ok(())
                },
                model,
                Some(&resources),
            );
            let result = result.expect("cp312 모델 설치/실제 자체 검증");
            assert_eq!(result["state"], "INSTALLED");
            validate(&result, SetupAction::Activate, model).expect("설치 결과 계약");
            let plan = model.setup_for(true);
            let marker = root.join("ai").join(plan.marker);
            let original = fs::read(&marker).expect("새 별도 marker");
            let verified = super::super::installation::verify_with_resources(
                model,
                root,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(false),
                Some(&resources),
            )
            .expect("관리 환경 선택/설치 파일 검증");
            assert_eq!(verified["pythonVersion"], "3.12.15");
            let source_before = serde_json::to_value(
                super::super::cache_cleanup::inspect(&source_root, model).expect("원래 캐시 조회"),
            )
            .expect("경로 없는 현황");
            let usage = serde_json::to_value(
                super::super::cache_cleanup::inspect(root, model).expect("격리 캐시 조회"),
            )
            .expect("현황");
            let cleared = super::super::cache_cleanup::clear(
                root,
                model,
                usage["revision"].as_str().expect("현재 revision"),
                &AtomicBool::new(false),
                |_| Ok(()),
            )
            .expect("복사한 자체 캐시만 정리");
            let cleared = serde_json::to_value(cleared).expect("정리 결과");
            assert_eq!(cleared["removedFiles"], usage["files"]);
            assert_eq!(cleared["removedBytes"], usage["bytes"]);
            assert!(!root.join("ai/downloads").join(plan.cache).exists());
            assert_eq!(
                serde_json::to_value(
                    super::super::cache_cleanup::inspect(&source_root, model)
                        .expect("원래 캐시 재조회")
                )
                .expect("보존 현황"),
                source_before
            );
            let again = install_with_resources(
                root,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(false),
                |_| Ok(()),
                model,
                Some(&resources),
            )
            .expect("같은 환경 재검증/재사용");
            assert_eq!(again["state"], "ALREADY_ACTIVE");
            assert_eq!(again["environmentId"], result["environmentId"]);
            assert_eq!(fs::read(marker).expect("marker 불변"), original);
            assert_eq!(
                fs::read(root.join("ai").join(model.setup().marker)).expect("이전 marker 보존"),
                b"DEMO preserved legacy marker"
            );
        }
        let project = fixture.project();
        let source = root.join("자체 신호.wav");
        fs::write(&source, include_bytes!("../../../public/fixtures/sine.wav"))
            .expect("자체 fixture");
        let asset = fixture
            .store
            .import_asset(
                &project,
                &source,
                crate::storage::project_model::AssetKind::Original,
                crate::storage::project_model::AssetStorage::Managed,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("자체 음원 import")
            .asset
            .id;
        let request: super::super::transcription::TranscribeRequest=serde_json::from_value(json!({"schemaVersion":1,"projectId":project,"assetId":asset,"tuningMidi":[64,59,55,50,45,40],"syncAnchors":[{"scoreTick":0,"audioTimeMs":0},{"scoreTick":7680,"audioTimeMs":4000}],"grid":240})).expect("카피 요청");
        let draft = super::super::transcription::transcribe_asset_with_resources(
            &fixture.store,
            &request,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
            Some(&resources),
        )
        .expect("실제 앱 카피 경로");
        assert_eq!(draft["notes"].as_array().expect("음표").len(), 8);
        let request = super::super::separation::SeparateRequest {
            schema_version: 1,
            project_id: project,
            asset_id: asset,
        };
        let (separation, _) = super::super::separation::separate_asset_with_resources(
            &fixture.store,
            &request,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
            Some(&resources),
        )
        .expect("실제 앱 분리 경로");
        assert_eq!(separation["frames"], 176400);
        assert_eq!(
            fs::read(source).expect("원본 불변"),
            include_bytes!("../../../public/fixtures/sine.wav")
        );
        let canceled = crate::storage::projects_tests::Fixture::new();
        portable_cache(&canceled.store.root, ModelId::BasicPitch, false);
        let id = uuid::Uuid::new_v4().to_string();
        let cancel = AtomicBool::new(false);
        assert_eq!(
            install_with_resources(
                &canceled.store.root,
                &id,
                &cancel,
                |stage| {
                    if stage == 1 {
                        cancel.store(true, Ordering::Release);
                    }
                    Ok(())
                },
                ModelId::BasicPitch,
                Some(&resources)
            )
            .expect_err("새 환경 설치 전 취소")
            .code,
            "CANCELED"
        );
        assert!(!canceled
            .store
            .root
            .join("ai/environments")
            .join(ModelId::BasicPitch.setup_for(true).folder)
            .join(id)
            .exists());
        assert!(!canceled
            .store
            .root
            .join("ai")
            .join(ModelId::BasicPitch.setup_for(true).marker)
            .exists());
        assert!(canceled
            .store
            .root
            .join("ai/runtimes/cpython-3.12.15-20261013-r1/python/python.exe")
            .is_file());
    }
    #[test]
    #[ignore = "승인된 41개 캐시와 개발 Python을 사용해 격리 환경을 오프라인 설치·재사용·취소합니다"]
    fn actual_offline_setup_reuses_verified_environment_and_cleans_canceled_install() {
        exercise_offline_setup(ModelId::BasicPitch);
    }
    #[test]
    #[ignore = "승인된 Demucs 캐시와 개발 Python을 사용해 격리 설치·실제 분리·재사용·취소합니다"]
    fn actual_demucs_offline_setup_reuses_and_cleans_canceled_install() {
        exercise_offline_setup(ModelId::Demucs);
    }
    #[test]
    #[ignore = "사용자 승인으로 설치한 앱 데이터 두 모델을 재설치 없이 실제 검증합니다"]
    fn actual_managed_models_reverify_without_replacing_markers() {
        let root = std::path::PathBuf::from(std::env::var_os("APPDATA").expect("앱 데이터"))
            .join("com.guitarlab.app");
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            let path = root.join("ai").join(model.setup().marker);
            let before = fs::read(&path).expect("승인 설치된 marker가 먼저 필요합니다");
            let environment = managed::environment_for_profile(&root, model, false)
                .expect("기존 관리 경로")
                .expect("기존 환경");
            let result = install(
                &root,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(false),
                |_| Ok(()),
                model,
            )
            .expect("실제 native 재검증");
            assert_eq!(result["state"], "ALREADY_ACTIVE");
            assert_eq!(result["selfTest"], model.setup().self_test);
            assert_eq!(
                result["environmentId"].as_str(),
                environment.file_name().and_then(|name| name.to_str())
            );
            assert_eq!(fs::read(path).expect("marker 보존"), before);
        }
    }
    fn exercise_offline_setup(model: ModelId) {
        let plan = model.setup();
        let fixture = cached_fixture(model);
        let root = &fixture.store.root;
        let id = uuid::Uuid::new_v4().to_string();
        let stages = std::sync::Mutex::new(Vec::new());
        let result = install(
            root,
            &id,
            &AtomicBool::new(false),
            |stage| {
                stages.lock().expect("단계").push(stage);
                Ok(())
            },
            model,
        )
        .expect("실제 오프라인 설치");
        assert_eq!(result, final_result("INSTALLED", &id, model));
        assert_eq!(*stages.lock().expect("단계"), [0, 1, 2, 3, 4, 5]);
        let marker_path = root.join("ai").join(plan.marker);
        let marker = fs::read(&marker_path).expect("활성화");
        assert!(managed::environment_for(root, model)
            .expect("관리 환경")
            .is_some());
        let again = install(
            root,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
            |_| Ok(()),
            model,
        )
        .expect("기존 재검증");
        assert_eq!(again, final_result("ALREADY_ACTIVE", &id, model));
        assert_eq!(fs::read(&marker_path).expect("같은 marker"), marker);

        let canceled_fixture = cached_fixture(model);
        let root = &canceled_fixture.store.root;
        let canceled_id = uuid::Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        let timer = std::sync::Mutex::new(None);
        let result = install(
            root,
            &canceled_id,
            &cancel,
            |stage| {
                if stage == 1 {
                    let cancel = cancel.clone();
                    *timer.lock().expect("타이머") = Some(thread::spawn(move || {
                        thread::sleep(Duration::from_millis(150));
                        cancel.store(true, Ordering::Release);
                    }));
                }
                Ok(())
            },
            model,
        );
        timer
            .into_inner()
            .expect("타이머")
            .expect("시작")
            .join()
            .expect("취소");
        assert_eq!(result.expect_err("취소").code, "CANCELED");
        assert!(!root.join("ai").join(plan.marker).exists());
        assert!(!root
            .join("ai/environments")
            .join(plan.folder)
            .join(&canceled_id)
            .exists());
        assert_eq!(
            fs::read_dir(root.join("ai/downloads").join(plan.cache))
                .expect("캐시 유지")
                .count(),
            if model == ModelId::BasicPitch { 41 } else { 33 }
        );
    }
}
