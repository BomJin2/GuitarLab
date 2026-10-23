//! 승인된 로컬 캐시를 앱과 같은 native 경로로 설치·검증하는 개발 도구입니다.
use guitarlab_lib::{
    ai::{installation, model_cache, setup},
    instance::{InstanceError, InstanceGuard},
    ipc::AppError,
};
use serde_json::json;
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

fn emit(value: serde_json::Value) -> Result<(), AppError> {
    let mut output = io::stdout().lock();
    writeln!(output, "{value}")
        .and_then(|_| output.flush())
        .map_err(|_| AppError::internal())
}

fn run() -> Result<(), AppError> {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    let cancel = Arc::new(AtomicBool::new(false));
    let input_cancel = cancel.clone();
    // 표준 입력에 cancel 한 줄을 보내면 native의 기존 취소·정리 경로를 사용합니다.
    std::thread::spawn(move || {
        if io::stdin().lock().lines().next().is_some() {
            input_cancel.store(true, Ordering::Release);
        }
    });
    if let [action, resources] = arguments.as_slice() {
        let resources = PathBuf::from(resources);
        if action != "inspect" || !resources.is_absolute() || !resources.join("ai-runtime").is_dir()
        {
            return Err(AppError::invalid());
        }
        let result = guitarlab_lib::ai::inspect_with_resources(
            &resources,
            &uuid::Uuid::new_v4().to_string(),
            &cancel,
        )?;
        return emit(serde_json::to_value(result).map_err(|_| AppError::internal())?);
    }
    let [action, model, resources] = arguments.as_slice() else {
        return Err(AppError::invalid());
    };
    if action != "install" && action != "verify" && action != "download" {
        return Err(AppError::invalid());
    }
    let model: installation::ModelId =
        serde_json::from_value(json!(model.to_str().ok_or_else(AppError::invalid)?))
            .map_err(|_| AppError::invalid())?;
    let resources = PathBuf::from(resources);
    let root = PathBuf::from(std::env::var_os("APPDATA").ok_or_else(AppError::invalid)?)
        .join("com.guitarlab.app");
    if !resources.is_absolute() || !root.is_absolute() || !root.is_dir() {
        return Err(AppError::invalid());
    }
    let _instance = InstanceGuard::acquire(&root).map_err(|cause| {
        AppError::new(
            match cause {
                InstanceError::Busy => "INSTANCE_ALREADY_RUNNING",
                InstanceError::Unavailable => "INSTANCE_LOCK_UNAVAILABLE",
            },
            cause.message(),
            true,
        )
    })?;
    let job = uuid::Uuid::new_v4().to_string();
    let result = if action == "download" {
        model_cache::download_model_with_resources(
            &root,
            &job,
            &cancel,
            |percent| emit(json!({"percent":percent})),
            Some(&resources),
            model,
        )?
    } else if action == "install" {
        setup::install_with_resources(
            &root,
            &job,
            &cancel,
            |stage| emit(json!({"stage":stage,"total":5})),
            model,
            Some(&resources),
        )?
    } else {
        installation::verify_with_resources(model, &root, &job, &cancel, Some(&resources))?
    };
    emit(result)
}

fn main() {
    if let Err(cause) = run() {
        let _ = emit(json!({"error":cause.code}));
        std::process::exit(1);
    }
}
