use crate::{ipc::AppError, storage::projects::canceled};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};
mod bundled;
pub(crate) fn local_backup_command(
    resources: &std::path::Path,
    cancel: &AtomicBool,
) -> Result<Command, AppError> {
    bundled::backup_command(&resources.join("ai-runtime"), cancel)
}
pub(crate) fn local_restore_command(
    resources: &std::path::Path,
    cancel: &AtomicBool,
) -> Result<Command, AppError> {
    bundled::restore_command(&resources.join("ai-runtime"), cancel)
}
pub(crate) fn local_restore_request_command(
    resources: &std::path::Path,
    cancel: &AtomicBool,
) -> Result<Command, AppError> {
    bundled::restore_request_command(&resources.join("ai-runtime"), cancel)
}
pub mod drafts;
pub mod installation;
pub mod managed;
pub mod model_cache;
#[cfg(test)]
mod runtime_worker_tests;
pub mod separation;
pub mod setup;
pub mod stem_store;
pub mod transcription;

fn error(code: &'static str) -> AppError {
    AppError::new(
        code,
        "AI 작업을 완료하지 못했습니다. 프로젝트와 원본은 유지했습니다.",
        true,
    )
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeInfo {
    schema_version: u8,
    python_version: String,
    models: Vec<ModelInfo>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ModelInfo {
    id: String,
    package_version: Option<String>,
    state: String,
    usable: bool,
}
impl RuntimeInfo {
    fn validate(&self) -> Result<(), AppError> {
        let version = |s: &str| {
            !s.is_empty()
                && s.len() <= 128
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"._+-".contains(&c))
        };
        if self.schema_version != 1 || !version(&self.python_version) || self.models.len() != 2 {
            return Err(error("AI_PROTOCOL_INVALID"));
        }
        for (model, id) in self.models.iter().zip(["basic-pitch", "audio-separator"]) {
            if model.id != id
                || model.usable
                || match &model.package_version {
                    Some(v) => !version(v) || model.state != "UNVERIFIED",
                    None => model.state != "PACKAGE_MISSING",
                }
            {
                return Err(error("AI_PROTOCOL_INVALID"));
            }
        }
        Ok(())
    }
}
#[derive(Default, Clone, Copy, PartialEq, Eq)]
enum Action {
    #[default]
    Inspect,
    Transcribe,
    Separate,
    Verify(installation::ModelId),
    Download(installation::ModelId),
    Setup(setup::SetupAction, installation::ModelId),
}
impl Action {
    fn stage(self) -> &'static str {
        match self {
            Self::Inspect => "environment",
            Self::Verify(_) => "environment",
            Self::Download(_) => "download",
            Self::Setup(_, _) => "installation",
            Self::Transcribe => "transcription",
            Self::Separate => "separation",
        }
    }
}
#[derive(Default)]
struct Protocol {
    percent: u64,
    terminal: bool,
    result: Option<Value>,
    action: Action,
}
impl Protocol {
    fn receive(&mut self, bytes: &[u8], job_id: &str) -> Result<(), AppError> {
        let invalid = || error("AI_PROTOCOL_INVALID");
        let value: Value = serde_json::from_slice(bytes).map_err(|_| invalid())?;
        let object = value.as_object().ok_or_else(invalid)?;
        if self.terminal
            || value["protocolVersion"].as_u64() != Some(1)
            || value["jobId"].as_str() != Some(job_id)
        {
            return Err(invalid());
        }
        let kind = value["type"].as_str().ok_or_else(invalid)?;
        let keys: &[&str] = match kind {
            "progress" => &["protocolVersion", "type", "jobId", "stage", "percent"],
            "completed" => &["protocolVersion", "type", "jobId", "result"],
            "failed" => &["protocolVersion", "type", "jobId", "error"],
            "canceled" => &["protocolVersion", "type", "jobId"],
            _ => return Err(invalid()),
        };
        if object.len() != keys.len() || keys.iter().any(|k| !object.contains_key(*k)) {
            return Err(invalid());
        }
        match kind {
            "progress" => {
                let percent = value["percent"].as_u64().ok_or_else(invalid)?;
                if value["stage"] != self.action.stage() || percent < self.percent || percent > 100
                {
                    return Err(invalid());
                }
                self.percent = percent;
            }
            "completed" => {
                if self.percent != 100 {
                    return Err(invalid());
                }
                if let Action::Setup(action, model) = self.action {
                    setup::validate(&value["result"], action, model)?;
                } else if let Action::Download(model) = self.action {
                    model_cache::validate_for(&value["result"], model)?;
                } else if let Action::Verify(model) = self.action {
                    installation::validate(&value["result"], model)?;
                } else if self.action != Action::Inspect {
                    let result = value["result"].as_object().ok_or_else(invalid)?;
                    let (id, version, path) = if self.action == Action::Separate {
                        ("htdemucs_6s", "4.1.0", "separationPath")
                    } else {
                        ("basic-pitch", "0.4.0", "notesPath")
                    };
                    if result.len() != 3
                        || result.get("modelId") != Some(&json!(id))
                        || result.get("modelVersion") != Some(&json!(version))
                        || !result.get(path).is_some_and(|p| {
                            p.as_str().is_some_and(|s| !s.is_empty() && s.len() <= 4096)
                        })
                    {
                        return Err(invalid());
                    }
                } else {
                    let models = value["result"]["models"].as_array().ok_or_else(invalid)?;
                    if models.iter().any(|m| {
                        !m.as_object()
                            .is_some_and(|o| o.len() == 4 && o.contains_key("packageVersion"))
                    }) {
                        return Err(invalid());
                    }
                    let result: RuntimeInfo =
                        serde_json::from_value(value["result"].clone()).map_err(|_| invalid())?;
                    result.validate()?;
                }
                self.result = Some(value["result"].clone());
                self.terminal = true;
            }
            "canceled" => return Err(error("CANCELED")),
            "failed" => {
                let failure = value["error"].as_object().ok_or_else(invalid)?;
                if failure.len() != 2
                    || !failure
                        .get("message")
                        .is_some_and(|m| m.as_str().is_some_and(|s| s.len() <= 1024))
                {
                    return Err(invalid());
                }
                return Err(error(match value["error"]["code"].as_str() {
                    Some("AI_PROTOCOL_INVALID") => "AI_PROTOCOL_INVALID",
                    Some("AI_WORKER_FAILED") => "AI_WORKER_FAILED",
                    Some("AI_MODEL_MISSING") => "AI_MODEL_MISSING",
                    Some("AI_MODEL_VERSION") => "AI_MODEL_VERSION",
                    Some("AI_MODEL_INTEGRITY") => "AI_MODEL_INTEGRITY",
                    Some("AI_INPUT_INVALID") => "AI_INPUT_INVALID",
                    Some("AI_OUTPUT_INVALID") => "AI_OUTPUT_INVALID",
                    Some("AI_TRANSCRIPTION_EMPTY") => "AI_TRANSCRIPTION_EMPTY",
                    Some("AI_SEPARATION_EMPTY") => "AI_SEPARATION_EMPTY",
                    Some("AI_DOWNLOAD_FAILED") => "AI_DOWNLOAD_FAILED",
                    Some("AI_CACHE_INTEGRITY") => "AI_CACHE_INTEGRITY",
                    Some("AI_CACHE_CLEANUP_FAILED") => "AI_CACHE_CLEANUP_FAILED",
                    Some("AI_DISK_SPACE") => "AI_DISK_SPACE",
                    Some("AI_SETUP_VERSION") => "AI_SETUP_VERSION",
                    Some("AI_SETUP_PATH") => "AI_SETUP_PATH",
                    Some("AI_SETUP_MARKER_INVALID") => "AI_SETUP_MARKER_INVALID",
                    Some("AI_SETUP_SELF_TEST_FAILED") => "AI_SETUP_SELF_TEST_FAILED",
                    Some("AI_SETUP_FIXTURE_INVALID") => "AI_SETUP_FIXTURE_INVALID",
                    _ => return Err(invalid()),
                }));
            }
            _ => return Err(invalid()),
        }
        Ok(())
    }
}

fn dev_command() -> Result<Command, AppError> {
    python_environment(".venv", "AI_RUNTIME_UNAVAILABLE")
}
fn python_environment(name: &str, missing: &'static str) -> Result<Command, AppError> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../ai");
    python_at(root.join(name), missing)
}
fn python_at(environment: std::path::PathBuf, missing: &'static str) -> Result<Command, AppError> {
    if !cfg!(debug_assertions) {
        return Err(error("AI_RUNTIME_UNAVAILABLE"));
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../ai");
    let executable = environment.join(if cfg!(windows) {
        "Scripts/python.exe"
    } else {
        "bin/python"
    });
    if !executable.is_file() {
        return Err(error(missing));
    }
    let mut command = Command::new(executable);
    command
        .current_dir(root)
        .args(["-s", "-u", "-m", "guitarlab_ai.worker"])
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .env("PYTHONUTF8", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1");
    Ok(command)
}

pub fn inspect(job_id: &str, cancel: &AtomicBool) -> Result<RuntimeInfo, AppError> {
    run(dev_command()?, job_id, cancel, Duration::from_secs(10))
}
pub fn inspect_with_resources(
    resources: &std::path::Path,
    job_id: &str,
    cancel: &AtomicBool,
) -> Result<RuntimeInfo, AppError> {
    let root = resources.join("ai-runtime");
    if std::fs::symlink_metadata(&root).is_ok() {
        run(
            bundled::command(&root, cancel)?,
            job_id,
            cancel,
            Duration::from_secs(10),
        )
    } else if cfg!(debug_assertions) {
        inspect(job_id, cancel)
    } else {
        Err(error("AI_RUNTIME_UNAVAILABLE"))
    }
}

fn run(
    command: Command,
    job_id: &str,
    cancel: &AtomicBool,
    timeout: Duration,
) -> Result<RuntimeInfo, AppError> {
    let value = run_request(
        command,
        job_id,
        cancel,
        timeout,
        json!({"protocolVersion":1,"type":"start","jobId":job_id,"action":"inspect"}),
        |_| Ok(()),
    )?;
    serde_json::from_value(value).map_err(|_| error("AI_PROTOCOL_INVALID"))
}
fn run_request(
    mut command: Command,
    job_id: &str,
    cancel: &AtomicBool,
    timeout: Duration,
    request: Value,
    progress: impl Fn(u64) -> Result<(), AppError>,
) -> Result<Value, AppError> {
    canceled(cancel)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| error("AI_RUNTIME_UNAVAILABLE"))?;
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error("AI_WORKER_FAILED"));
    };
    let (sender, receiver) = mpsc::sync_channel(16);
    let reader = thread::spawn(move || {
        let mut input = BufReader::new(stdout);
        let mut total = 0;
        for _ in 0..64 {
            let mut line = Vec::new();
            match input.by_ref().take(65537).read_until(b'\n', &mut line) {
                Ok(0) => {
                    let _ = sender.send(Ok(None));
                    return;
                }
                Ok(_) if line.len() <= 65536 && line.ends_with(b"\n") => {
                    total += line.len();
                    if total > 262144 {
                        break;
                    }
                    if sender.send(Ok(Some(line))).is_err() {
                        return;
                    }
                }
                _ => break,
            }
        }
        let _ = sender.send(Err(()));
    });
    let result = (|| {
        writeln!(
            child
                .stdin
                .as_mut()
                .ok_or_else(|| error("AI_WORKER_FAILED"))?,
            "{request}"
        )
        .map_err(|_| error("AI_WORKER_FAILED"))?;
        let started = Instant::now();
        let mut cancel_started = None;
        let mut protocol = Protocol {
            action: match request["action"].as_str() {
                Some("transcribe") => Action::Transcribe,
                Some("separate") => Action::Separate,
                Some("download_model") => Action::Download(
                    serde_json::from_value(request["modelId"].clone())
                        .map_err(|_| error("AI_PROTOCOL_INVALID"))?,
                ),
                Some(
                    action @ ("prepare_install" | "check_install" | "activate_install"
                    | "discard_install"),
                ) => Action::Setup(
                    match action {
                        "prepare_install" => setup::SetupAction::Prepare,
                        "check_install" => setup::SetupAction::Check,
                        "activate_install" => setup::SetupAction::Activate,
                        _ => setup::SetupAction::Discard,
                    },
                    serde_json::from_value(request["modelId"].clone())
                        .map_err(|_| error("AI_PROTOCOL_INVALID"))?,
                ),
                Some("verify_model") => Action::Verify(
                    serde_json::from_value(request["modelId"].clone())
                        .map_err(|_| error("AI_PROTOCOL_INVALID"))?,
                ),
                _ => Action::Inspect,
            },
            ..Protocol::default()
        };
        let mut closed = false;
        loop {
            if cancel.load(Ordering::Acquire) && cancel_started.is_none() {
                cancel_started = Some(Instant::now());
                if let Some(stdin) = child.stdin.as_mut() {
                    let cancel_request =
                        json!({"protocolVersion":1,"type":"cancel","jobId":job_id});
                    let _ = writeln!(stdin, "{cancel_request}");
                }
            }
            if cancel_started.is_some_and(|t| t.elapsed() >= Duration::from_secs(1)) {
                return Err(error("CANCELED"));
            }
            if started.elapsed() >= timeout {
                return Err(error(if cancel_started.is_some() {
                    "CANCELED"
                } else {
                    "AI_WORKER_TIMEOUT"
                }));
            }
            if !closed {
                match receiver.recv_timeout(Duration::from_millis(20)) {
                    Ok(Ok(Some(line))) => {
                        protocol.receive(&line, job_id)?;
                        if !protocol.terminal {
                            progress(protocol.percent)?;
                        }
                        if protocol.terminal {
                            child.stdin.take();
                        }
                    }
                    Ok(Ok(None)) => closed = true,
                    Ok(Err(())) => return Err(error("AI_PROTOCOL_INVALID")),
                    Err(mpsc::RecvTimeoutError::Disconnected) => closed = true,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
            } else {
                thread::sleep(Duration::from_millis(10));
            }
            if closed {
                if let Some(status) = child.try_wait().map_err(|_| error("AI_WORKER_FAILED"))? {
                    canceled(cancel)?;
                    if !status.success() {
                        return Err(error("AI_WORKER_FAILED"));
                    }
                    return protocol.result.ok_or_else(|| error("AI_PROTOCOL_INVALID"));
                }
            }
        }
    })();
    child.stdin.take();
    if !matches!(child.try_wait(), Ok(Some(_))) {
        let _ = child.kill();
    }
    let waited = child.wait();
    drop(receiver);
    let joined = reader.join();
    if waited.is_err() || joined.is_err() {
        return Err(error("AI_WORKER_FAILED"));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn result() -> Value {
        json!({"schemaVersion":1,"pythonVersion":"3.10.8","models":[
            {"id":"basic-pitch","packageVersion":null,"state":"PACKAGE_MISSING","usable":false},
            {"id":"audio-separator","packageVersion":"1.0","state":"UNVERIFIED","usable":false}]})
    }
    fn progress(value: u64) -> Value {
        json!({"protocolVersion":1,"jobId":"fixture","type":"progress","stage":"environment","percent":value})
    }
    #[test]
    fn separation_protocol_requires_own_stage_model_and_result_path() {
        let mut protocol = Protocol {
            action: Action::Separate,
            ..Protocol::default()
        };
        let feed = |p: &mut Protocol, v: Value| {
            p.receive(&serde_json::to_vec(&v).expect("메시지"), "fixture")
        };
        assert!(feed(&mut protocol, progress(0)).is_err());
        feed(&mut protocol, json!({"protocolVersion":1,"jobId":"fixture","type":"progress","stage":"separation","percent":100})).expect("분리 완료 진행");
        assert!(feed(&mut protocol, json!({"protocolVersion":1,"jobId":"fixture","type":"completed","result":{"notesPath":"fixture","modelId":"basic-pitch","modelVersion":"0.4.0"}})).is_err());
        feed(&mut protocol, json!({"protocolVersion":1,"jobId":"fixture","type":"completed","result":{"separationPath":"fixture","modelId":"htdemucs_6s","modelVersion":"4.1.0"}})).expect("분리 결과");
        assert!(protocol.terminal);
    }
    #[test]
    fn protocol_checks_versions_ids_progress_terminal_and_unverified_models() {
        let completed =
            json!({"protocolVersion":1,"jobId":"fixture","type":"completed","result":result()});
        let feed = |p: &mut Protocol, v: &Value| {
            p.receive(&serde_json::to_vec(v).expect("메시지"), "fixture")
        };
        let mut valid = Protocol::default();
        feed(&mut valid, &progress(0)).expect("시작");
        feed(&mut valid, &progress(100)).expect("진행");
        feed(&mut valid, &completed).expect("완료");
        assert!(valid.result.is_some());
        assert!(feed(&mut valid, &completed).is_err());
        let mut bad = completed.clone();
        bad["protocolVersion"] = json!(2);
        let mut p = Protocol {
            percent: 100,
            ..Protocol::default()
        };
        assert!(feed(&mut p, &bad).is_err());
        for field in ["jobId", "type"] {
            let mut bad = completed.clone();
            bad[field] = json!("wrong");
            assert!(feed(
                &mut Protocol {
                    percent: 100,
                    ..Protocol::default()
                },
                &bad
            )
            .is_err());
        }
        let mut bad = completed.clone();
        bad["result"]["models"][0]["usable"] = json!(true);
        assert!(feed(
            &mut Protocol {
                percent: 100,
                ..Protocol::default()
            },
            &bad
        )
        .is_err());
        let mut bad = completed.clone();
        bad["path"] = json!("private");
        assert!(feed(
            &mut Protocol {
                percent: 100,
                ..Protocol::default()
            },
            &bad
        )
        .is_err());
        let mut p = Protocol {
            percent: 50,
            ..Protocol::default()
        };
        assert!(feed(&mut p, &progress(49)).is_err());
        assert!(p.receive(b"invalid", "fixture").is_err());
    }
    #[test]
    #[ignore = "개발 Python 가상환경이 필요하며 모델은 로드하지 않습니다"]
    fn actual_dev_worker_and_failure_timeout_cancel_are_bounded() {
        let id = uuid::Uuid::new_v4().to_string();
        let result = inspect(&id, &AtomicBool::new(false)).expect("실제 개발 worker");
        result.validate().expect("검증");
        assert_eq!(
            inspect(&id, &AtomicBool::new(true)).expect_err("취소").code,
            "CANCELED"
        );
        for (script, expected) in [
            ("print('not json', flush=True)", "AI_PROTOCOL_INVALID"),
            ("print('x'*70000, flush=True)", "AI_PROTOCOL_INVALID"),
            ("import sys; sys.exit(2)", "AI_WORKER_FAILED"),
            ("import time; time.sleep(5)", "AI_WORKER_TIMEOUT"),
        ] {
            let base = dev_command().expect("개발 명령");
            let mut command = Command::new(base.get_program());
            command.args(["-u", "-c", script]);
            assert_eq!(
                run(
                    command,
                    &id,
                    &AtomicBool::new(false),
                    Duration::from_millis(500)
                )
                .expect_err("실패 격리")
                .code,
                expected
            );
        }
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        let trigger = cancel.clone();
        let thread = thread::spawn(move || {
            thread::sleep(Duration::from_millis(100));
            trigger.store(true, Ordering::Release);
        });
        let base = dev_command().expect("개발 명령");
        let mut command = Command::new(base.get_program());
        command.args(["-u", "-c", "import time; time.sleep(5)"]);
        assert_eq!(
            run(command, &id, &cancel, Duration::from_secs(3))
                .expect_err("실행 중 취소")
                .code,
            "CANCELED"
        );
        thread.join().expect("취소 스레드");
    }
}
pub mod cache_cleanup;
