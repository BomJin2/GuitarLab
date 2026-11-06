use super::installation::ModelId;
use super::{error, python_at, python_environment};
use crate::{ipc::AppError, storage::database::checked_file};
use serde::Deserialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

const BOOTSTRAP_HASH: &str = "0d33c374d41c7863419fc8f6c10bfe25b7b498aa34164d135c622e52580c6b16";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActiveEnvironment {
    schema_version: u8,
    model_id: String,
    model_version: String,
    environment_id: String,
    plan_sha256: String,
    bootstrap_sha256: String,
    self_test: String,
}
pub fn environment(root: &Path) -> Result<Option<PathBuf>, AppError> {
    environment_for(root, ModelId::BasicPitch)
}
pub fn environment_for(root: &Path, model: ModelId) -> Result<Option<PathBuf>, AppError> {
    if let Some(environment) = environment_for_profile(root, model, true)? {
        return Ok(Some(environment));
    }
    environment_for_profile(root, model, false)
}
pub fn environment_for_profile(
    root: &Path,
    model: ModelId,
    portable: bool,
) -> Result<Option<PathBuf>, AppError> {
    let Some(id) = active_id(root, model, portable)? else {
        return Ok(None);
    };
    let relative = Path::new("ai")
        .join(model.setup_for(portable).folder)
        .join(id);
    let executable = relative.join("Scripts/python.exe");
    if !root.join(&executable).is_file() {
        return Err(error("AI_MODEL_MISSING"));
    }
    checked_file(root, &executable).map_err(|_| error("AI_MODEL_INTEGRITY"))?;
    Ok(Some(root.join(relative)))
}
/// 표식을 고정 계획으로 검증하고 환경 UUID만 돌려줍니다.
fn active_id(root: &Path, model: ModelId, portable: bool) -> Result<Option<String>, AppError> {
    let plan = model.setup_for(portable);
    let relative = Path::new("ai").join(plan.marker);
    match fs::symlink_metadata(root.join(&relative)) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(error("AI_MODEL_INTEGRITY")),
        Ok(_) => {}
    }
    let marker = checked_file(root, &relative).map_err(|_| error("AI_MODEL_INTEGRITY"))?;
    if fs::metadata(&marker)
        .map_err(|_| error("AI_MODEL_INTEGRITY"))?
        .len()
        > 4096
    {
        return Err(error("AI_MODEL_INTEGRITY"));
    }
    let value: ActiveEnvironment =
        serde_json::from_slice(&fs::read(marker).map_err(|_| error("AI_MODEL_INTEGRITY"))?)
            .map_err(|_| error("AI_MODEL_INTEGRITY"))?;
    if value.schema_version != 1
        || value.model_id != plan.id
        || value.model_version != plan.version
        || value.plan_sha256 != plan.plan_hash
        || value.bootstrap_sha256
            != if portable {
                "7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad"
            } else {
                BOOTSTRAP_HASH
            }
        || value.self_test != plan.self_test
        || crate::storage::project_model::validate_uuid(&value.environment_id).is_err()
    {
        return Err(error("AI_MODEL_INTEGRITY"));
    }
    Ok(Some(value.environment_id))
}
/// docs/12 "이전 cp312 설치 옮기기": `4e05ce4` 이전 폴더의 배포 환경을 짧은 경로로 옮깁니다.
/// 조건이 하나라도 맞지 않으면 아무것도 바꾸지 않습니다. `runtime`은 준비된 고정 런타임 폴더입니다.
pub fn migrate_legacy_portable(
    root: &Path,
    model: ModelId,
    runtime: &Path,
) -> Result<(), AppError> {
    match environment_for_profile(root, model, true) {
        Err(e) if e.code == "AI_MODEL_MISSING" => {}
        _ => return Ok(()),
    }
    let Some(id) = active_id(root, model, true)? else {
        return Ok(());
    };
    let legacy = Path::new("ai")
        .join(match model {
            ModelId::BasicPitch => "environments/basic-pitch-0.4.0-onnx1-cp312",
            ModelId::Demucs => "environments/demucs-4.1.0-cp312",
        })
        .join(&id);
    let folder = Path::new("ai").join(model.setup_for(true).folder);
    let is_dir = |p: &Path| fs::symlink_metadata(p).is_ok_and(|m| m.is_dir());
    if !is_dir(&root.join(&legacy))
        || fs::symlink_metadata(root.join(&folder).join(&id)).is_ok()
        || !root.join(&legacy).join("Scripts/python.exe").is_file()
        || !root.join(&legacy).join("pyvenv.cfg").is_file()
    {
        return Ok(());
    }
    fn path<E>(_: E) -> AppError {
        error("AI_SETUP_PATH")
    }
    // 링크·정션이나 앱 데이터 밖으로 이어지는 폴더는 옮기지 않습니다.
    let old = crate::storage::database::checked_directory(root, &legacy).map_err(path)?;
    checked_file(root, &legacy.join("Scripts/python.exe")).map_err(path)?;
    let cfg = checked_file(root, &legacy.join("pyvenv.cfg")).map_err(path)?;
    let python = runtime.join("python").canonicalize().map_err(path)?;
    let text = fs::read_to_string(&cfg).map_err(path)?;
    let lines: Vec<String> = text
        .lines()
        .map(|line| match line.split_once('=').map(|(k, _)| k.trim()) {
            Some("home") => format!("home = {}", python.display()),
            Some("executable") => format!("executable = {}", python.join("python.exe").display()),
            _ => line.to_owned(),
        })
        .collect();
    fs::write(&cfg, lines.join("\n") + "\n").map_err(path)?;
    let parent = crate::storage::database::checked_directory(root, &folder).map_err(path)?;
    fs::rename(old, parent.join(&id)).map_err(path)
}
/// docs/12 "AI 모델 설치 상태 조회 v1": 표식과 환경 폴더만 확인하고 실행하지 않습니다.
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct ModelStatus {
    pub id: ModelId,
    pub state: &'static str,
}
pub fn model_status(root: &Path) -> Vec<ModelStatus> {
    [ModelId::BasicPitch, ModelId::Demucs]
        .into_iter()
        .map(|id| ModelStatus {
            id,
            state: match environment_for(root, id) {
                Ok(Some(_)) => "INSTALLED",
                Ok(None) => "MISSING",
                // 표식은 있지만 기대한 위치에 실행 환경이 없으면(예: 폴더 배치 변경) 다시 설치해야 합니다.
                Err(e) if e.code == "AI_MODEL_MISSING" => "MISSING",
                Err(_) => "DAMAGED",
            },
        })
        .collect()
}
pub fn basic_command(root: &Path) -> Result<Command, AppError> {
    model_command(root, ModelId::BasicPitch)
}
pub fn model_command(root: &Path, model: ModelId) -> Result<Command, AppError> {
    model_command_with_resources(
        root,
        model,
        None,
        &std::sync::atomic::AtomicBool::new(false),
    )
}
pub fn model_command_with_resources(
    root: &Path,
    model: ModelId,
    resources: Option<&Path>,
    cancel: &std::sync::atomic::AtomicBool,
) -> Result<Command, AppError> {
    if let Some(environment) = environment_for_profile(root, model, true)? {
        return super::bundled::persistent_command(
            resources.ok_or_else(|| error("AI_RUNTIME_UNAVAILABLE"))?,
            root,
            Some(&environment),
            cancel,
        );
    }
    if resources.is_some() && !cfg!(debug_assertions) {
        return Err(error("AI_MODEL_MISSING"));
    }
    match environment_for_profile(root, model, false)? {
        Some(environment) => python_at(environment, "AI_MODEL_MISSING"),
        None => python_environment(model.setup().development, "AI_MODEL_MISSING"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const PLAN_HASH: &str = "55a4a2252034be7389673313f35b36ea7cfd49c54984b0827bd6b29699218c2a";
    #[test]
    #[cfg(not(debug_assertions))]
    fn bundled_release_without_active_model_reports_missing_without_development_fallback() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            let cause = model_command_with_resources(
                root,
                model,
                Some(root),
                &std::sync::atomic::AtomicBool::new(false),
            )
            .expect_err("초기 미설치는 개발 환경을 실행하지 않음");
            assert_eq!(cause.code, "AI_MODEL_MISSING");
        }
    }
    #[test]
    fn portable_marker_wins_without_overwriting_legacy_and_corruption_never_falls_back() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            let mut paths = Vec::new();
            for portable in [false, true] {
                let plan = model.setup_for(portable);
                let id = uuid::Uuid::new_v4().to_string();
                let relative = Path::new("ai").join(plan.folder).join(&id);
                let file = checked_file(root, &relative.join("Scripts/python.exe"))
                    .expect("실행하지 않는 DEMO 환경");
                fs::write(file, b"DEMO").expect("DEMO 파일");
                let marker =
                    checked_file(root, &Path::new("ai").join(plan.marker)).expect("별도 marker");
                let value = json!({"schemaVersion":1,"modelId":plan.id,"modelVersion":plan.version,"environmentId":id,"planSha256":plan.plan_hash,"bootstrapSha256":if portable {"7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad"} else {BOOTSTRAP_HASH},"selfTest":plan.self_test});
                fs::write(&marker, value.to_string()).expect("검증 marker 모사");
                paths.push((root.join(relative), marker, value.to_string()));
            }
            assert_eq!(
                environment_for(root, model).expect("새 환경 우선"),
                Some(paths[1].0.clone())
            );
            fs::write(&paths[1].1, b"DEMO damaged").expect("손상 모사");
            assert_eq!(
                environment_for(root, model)
                    .expect_err("구형 환경으로 조용한 폴백 금지")
                    .code,
                "AI_MODEL_INTEGRITY"
            );
            assert_eq!(
                fs::read_to_string(&paths[0].1).expect("기존 marker 보존"),
                paths[0].2
            );
        }
    }
    #[test]
    fn demucs_marker_is_independent_and_never_accepts_basic_pitch_receipt() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        let model = ModelId::Demucs.setup();
        assert!(environment_for(root, ModelId::Demucs)
            .expect("이전 환경 호환")
            .is_none());
        let id = uuid::Uuid::new_v4().to_string();
        let executable = checked_file(
            root,
            &Path::new("ai")
                .join(model.folder)
                .join(&id)
                .join("Scripts/python.exe"),
        )
        .expect("DEMO 경로");
        fs::write(executable, b"DEMO").expect("실행하지 않는 파일");
        let marker = checked_file(root, &Path::new("ai").join(model.marker)).expect("marker 경로");
        let value = json!({"schemaVersion":1,"modelId":model.id,"modelVersion":model.version,"environmentId":id,"planSha256":model.plan_hash,"bootstrapSha256":BOOTSTRAP_HASH,"selfTest":model.self_test});
        fs::write(&marker, value.to_string()).expect("분리 marker");
        assert!(environment_for(root, ModelId::Demucs)
            .expect("관리 환경")
            .is_some());
        assert!(environment(root).expect("다른 모델 영향 없음").is_none());
        let mut wrong = value;
        wrong["selfTest"] = json!("OWNED_8_NOTES_PASSED");
        fs::write(&marker, wrong.to_string()).expect("교차 모델 검증");
        assert_eq!(
            environment_for(root, ModelId::Demucs)
                .expect_err("조용한 폴백 금지")
                .code,
            "AI_MODEL_INTEGRITY"
        );
    }
    #[test]
    fn model_status_reports_missing_damaged_and_installed_without_paths() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        let states = |r: &Path| -> Vec<&str> { model_status(r).iter().map(|m| m.state).collect() };
        assert_eq!(states(root), ["MISSING", "MISSING"]);
        let marker =
            checked_file(root, Path::new("ai/basic-pitch-active.json")).expect("앱 데이터");
        fs::write(&marker, b"{broken").expect("손상 표식");
        assert_eq!(states(root), ["DAMAGED", "MISSING"]);
        let id = uuid::Uuid::new_v4().to_string();
        let value = json!({"schemaVersion":1,"modelId":"basic-pitch","modelVersion":"0.4.0","environmentId":id,"planSha256":PLAN_HASH,"bootstrapSha256":BOOTSTRAP_HASH,"selfTest":"OWNED_8_NOTES_PASSED"});
        fs::write(&marker, value.to_string()).expect("표식");
        // 표식은 있어도 실행 파일이 없으면 다시 설치할 대상입니다.
        assert_eq!(states(root), ["MISSING", "MISSING"]);
        let exe = checked_file(
            root,
            &Path::new("ai/environments/basic-pitch-0.4.0-cp310")
                .join(&id)
                .join("Scripts/python.exe"),
        )
        .expect("DEMO 환경");
        fs::write(exe, b"DEMO").expect("실행하지 않는 DEMO 파일");
        assert_eq!(states(root), ["INSTALLED", "MISSING"]);
        let text = serde_json::to_string(&model_status(root)).expect("직렬화");
        assert_eq!(
            text,
            r#"[{"id":"basic-pitch","state":"INSTALLED"},{"id":"htdemucs_6s","state":"MISSING"}]"#
        );
    }
    #[test]
    fn legacy_portable_environment_moves_once_and_points_at_stable_runtime() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        let runtime = checked_directory_for_test(root, "ai/runtimes/cpython-3.12.15-test/python")
            .parent()
            .expect("런타임")
            .to_path_buf();
        let model = ModelId::BasicPitch;
        let plan = model.setup_for(true);
        let id = uuid::Uuid::new_v4().to_string();
        let legacy = Path::new("ai/environments/basic-pitch-0.4.0-onnx1-cp312").join(&id);
        // 표식이 없으면 이전 폴더가 있어도 옮기지 않습니다.
        let exe = checked_file(root, &legacy.join("Scripts/python.exe")).expect("DEMO");
        fs::write(exe, b"DEMO").expect("실행하지 않는 DEMO 파일");
        let cfg = checked_file(root, &legacy.join("pyvenv.cfg")).expect("cfg");
        fs::write(&cfg, "home = C:\\old\\python\nversion = 3.12.15\nexecutable = C:\\old\\python\\python.exe\ncommand = keep\n").expect("cfg");
        migrate_legacy_portable(root, model, &runtime).expect("표식 없음");
        assert!(root.join(&legacy).is_dir());
        let marker = checked_file(root, &Path::new("ai").join(plan.marker)).expect("marker");
        fs::write(&marker, json!({"schemaVersion":1,"modelId":plan.id,"modelVersion":plan.version,"environmentId":id,"planSha256":plan.plan_hash,"bootstrapSha256":"7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad","selfTest":plan.self_test}).to_string()).expect("검증 marker 모사");
        assert_eq!(states(root), ["MISSING", "MISSING"]);
        migrate_legacy_portable(root, model, &runtime).expect("옮기기");
        let moved = root.join("ai").join(plan.folder).join(&id);
        assert!(!root.join(&legacy).exists());
        assert_eq!(
            environment_for(root, model).expect("새 경로"),
            Some(moved.clone())
        );
        assert_eq!(states(root), ["INSTALLED", "MISSING"]);
        let python = runtime.join("python").canonicalize().expect("런타임 경로");
        assert_eq!(
            fs::read_to_string(moved.join("pyvenv.cfg")).expect("cfg"),
            format!(
                "home = {}\nversion = 3.12.15\nexecutable = {}\ncommand = keep\n",
                python.display(),
                python.join("python.exe").display()
            )
        );
        // 이미 옮긴 뒤나 다른 모델은 바꾸지 않습니다.
        migrate_legacy_portable(root, model, &runtime).expect("다시 실행");
        migrate_legacy_portable(root, ModelId::Demucs, &runtime).expect("다른 모델");
        assert!(moved.join("Scripts/python.exe").is_file());
    }
    #[test]
    fn legacy_portable_environment_never_overwrites_existing_target() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        let runtime = checked_directory_for_test(root, "ai/runtimes/rt/python")
            .parent()
            .expect("런타임")
            .to_path_buf();
        let plan = ModelId::Demucs.setup_for(true);
        let id = uuid::Uuid::new_v4().to_string();
        let legacy = Path::new("ai/environments/demucs-4.1.0-cp312").join(&id);
        for name in ["Scripts/python.exe", "pyvenv.cfg"] {
            fs::write(
                checked_file(root, &legacy.join(name)).expect("DEMO"),
                b"DEMO",
            )
            .expect("DEMO");
        }
        let target = checked_directory_for_test(root, &format!("ai/{}/{id}", plan.folder));
        let marker = checked_file(root, &Path::new("ai").join(plan.marker)).expect("marker");
        fs::write(&marker, json!({"schemaVersion":1,"modelId":plan.id,"modelVersion":plan.version,"environmentId":id,"planSha256":plan.plan_hash,"bootstrapSha256":"7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad","selfTest":plan.self_test}).to_string()).expect("marker");
        migrate_legacy_portable(root, ModelId::Demucs, &runtime).expect("건너뜀");
        assert_eq!(
            fs::read(root.join(&legacy).join("pyvenv.cfg")).expect("보존"),
            b"DEMO"
        );
        assert!(target.read_dir().expect("대상").next().is_none());
    }
    fn states(root: &Path) -> Vec<&'static str> {
        model_status(root).iter().map(|m| m.state).collect()
    }
    fn checked_directory_for_test(root: &Path, relative: &str) -> PathBuf {
        crate::storage::database::checked_directory(root, Path::new(relative)).expect("폴더")
    }
    #[test]
    fn marker_requires_verified_fixed_model_and_never_uses_an_arbitrary_path() {
        let fixture = crate::storage::projects_tests::Fixture::new();
        let root = &fixture.store.root;
        assert!(environment(root).expect("이전 환경 호환").is_none());
        let marker =
            checked_file(root, Path::new("ai/basic-pitch-active.json")).expect("앱 데이터");
        let id = uuid::Uuid::new_v4().to_string();
        let value = json!({"schemaVersion":1,"modelId":"basic-pitch","modelVersion":"0.4.0","environmentId":id,"planSha256":PLAN_HASH,"bootstrapSha256":BOOTSTRAP_HASH,"selfTest":"OWNED_8_NOTES_PASSED"});
        fs::write(&marker, value.to_string()).expect("marker");
        assert_eq!(
            environment(root).expect_err("파일 누락").code,
            "AI_MODEL_MISSING"
        );
        let path = checked_file(
            root,
            &Path::new("ai/environments/basic-pitch-0.4.0-cp310")
                .join(&id)
                .join("Scripts/python.exe"),
        )
        .expect("DEMO 환경");
        fs::write(path, b"DEMO").expect("실행하지 않는 DEMO 파일");
        assert_eq!(
            environment(root).expect("검증한 경로"),
            Some(
                root.join("ai/environments/basic-pitch-0.4.0-cp310")
                    .join(&id)
            )
        );
        for (key, invalid) in [
            ("environmentId", json!("../outside")),
            ("planSha256", json!("wrong")),
            ("selfTest", json!("NOT_TESTED")),
            ("path", json!("private")),
        ] {
            let mut bad = value.clone();
            bad[key] = invalid;
            fs::write(&marker, bad.to_string()).expect("잘못된 marker");
            assert_eq!(
                environment(root).expect_err("폴백 금지").code,
                "AI_MODEL_INTEGRITY"
            );
        }
    }
    #[test]
    #[ignore = "앱 데이터의 승인 설치 환경에서 자체 fixture만 분석합니다"]
    fn actual_managed_worker_transcribes_owned_fixture() {
        use std::{sync::atomic::AtomicBool, time::Duration};
        let root = PathBuf::from(std::env::var_os("APPDATA").expect("앱 데이터"))
            .join("com.guitarlab.app");
        let resources = environment_for_profile(&root, ModelId::BasicPitch, true)
            .expect("설치 프로필")
            .map(|_| super::super::bundled::tests::resource_candidate());
        let command = model_command_with_resources(
            &root,
            ModelId::BasicPitch,
            resources.as_deref(),
            &AtomicBool::new(false),
        )
        .expect("관리 환경 선택");
        assert!(Path::new(command.get_program())
            .canonicalize()
            .expect("실제 실행 경로")
            .starts_with(root.canonicalize().expect("앱 데이터 경로")));
        let fixture = crate::storage::projects_tests::Fixture::new();
        let work = &fixture.store.root;
        let input = work.join("input.wav");
        fs::write(&input, include_bytes!("../../../public/fixtures/sine.wav"))
            .expect("자체 fixture");
        let id = uuid::Uuid::new_v4().to_string();
        let result = super::super::run_request(command, &id, &AtomicBool::new(false), Duration::from_secs(180),
            json!({"protocolVersion":1,"type":"start","jobId":id,"action":"transcribe","input":{"assetPath":input,"workDir":work},"options":{"tuningMidi":[64,59,55,50,45,40],"syncAnchors":[{"scoreTick":0,"audioTimeMs":0},{"scoreTick":7680,"audioTimeMs":4000}],"grid":240}}), |_| Ok(())).expect("관리 환경 실제 추론");
        assert_eq!(
            result["notesPath"].as_str().map(Path::new),
            Some(work.join("notes.json").as_path())
        );
        let notes: serde_json::Value =
            serde_json::from_slice(&fs::read(work.join("notes.json")).expect("결과"))
                .expect("JSON");
        let pitches: Vec<_> = notes["notes"]
            .as_array()
            .expect("음표")
            .iter()
            .map(|n| n["pitchMidi"].as_i64().expect("MIDI"))
            .collect();
        assert_eq!(pitches, [64, 67, 69, 71, 64, 67, 69, 71]);
    }
}
