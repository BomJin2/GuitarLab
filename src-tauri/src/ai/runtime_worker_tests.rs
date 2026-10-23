use super::{
    installation::{self, ModelId},
    run_request,
};
use crate::storage::projects::hash;
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

fn write_new(path: &Path, bytes: &[u8]) {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .expect("새 검증 파일");
    file.write_all(bytes).expect("검증 자료 기록");
    file.sync_all().expect("검증 자료 동기화");
}

fn snapshot(source: &Path, target: &Path, extension: &str) {
    fs::create_dir(target).expect("새 worker snapshot");
    for entry in fs::read_dir(source).expect("자체 소스 목록") {
        let entry = entry.expect("소스 항목");
        let kind = entry.file_type().expect("소스 유형");
        assert!(!kind.is_symlink(), "소스 링크 거부");
        if kind.is_dir() && entry.file_name() != "__pycache__" {
            snapshot(&entry.path(), &target.join(entry.file_name()), extension);
        } else if kind.is_file()
            && entry
                .path()
                .extension()
                .is_some_and(|value| value == extension)
        {
            write_new(
                &target.join(entry.file_name()),
                &fs::read(entry.path()).expect("자체 소스"),
            );
        }
    }
}

fn checked_existing(root: &Path, path: &Path) -> PathBuf {
    let absolute = path.canonicalize().expect("기존 검증 경로");
    assert!(absolute.starts_with(root.canonicalize().expect("검증 루트")));
    assert!(!fs::symlink_metadata(path)
        .expect("유형 확인")
        .file_type()
        .is_symlink());
    absolute
}

#[test]
#[ignore = "승인한 cp312 호환성 성공 환경 두 개가 필요하며 자체 음원만 JSONL로 분석합니다"]
fn actual_cp312_public_workers_verify_transcribe_separate_cancel_and_timeout() {
    let ai = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../ai")
        .canonicalize()
        .expect("AI 소스");
    let validation = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/runtime-validation");
    let mut jobs: Vec<_> = fs::read_dir(validation.join("jobs"))
        .expect("호환성 검증 작업")
        .map(|entry| entry.expect("작업").path())
        .collect();
    jobs.sort();
    let job = jobs
        .into_iter()
        .find(|path| path.join("compatibility.json").is_file())
        .expect("성공한 호환성 환경");
    let job = checked_existing(&validation.join("jobs"), &job);
    let receipt: Value =
        serde_json::from_slice(&fs::read(job.join("compatibility.json")).expect("호환성 결과"))
            .expect("결과 JSON");
    assert_eq!(receipt["state"], "COMPATIBILITY_PASSED");
    assert_eq!(receipt["pythonVersion"], "3.12.15");
    assert_eq!(receipt["nativeActivated"], false);
    assert_eq!(
        receipt["runtimeArchiveSha256"],
        "7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad"
    );
    let bootstrap: Value =
        serde_json::from_slice(&fs::read(job.join("runtime-bootstrap.json")).expect("런타임 결과"))
            .expect("런타임 JSON");
    let runtime = checked_existing(
        &validation,
        Path::new(bootstrap["runtimePath"].as_str().expect("런타임 경로")),
    );
    let proof = job.join(format!("worker-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&proof).expect("새 실제 worker 검증 폴더");
    let sources = proof.join("snapshot");
    fs::create_dir(&sources).expect("snapshot 루트");
    snapshot(
        &ai.join("guitarlab_ai"),
        &sources.join("guitarlab_ai"),
        "py",
    );
    snapshot(&ai.join("models"), &sources.join("models"), "json");
    let launcher = sources.join("launch_worker.py");
    write_new(&launcher, br#"from pathlib import Path
import runpy, sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
assert sys.flags.isolated == 1 and sys.dont_write_bytecode
assert sys.version_info[:3] == (3, 12, 15)
try:
    runpy.run_module('guitarlab_ai.worker', run_name='__main__')
finally:
    from guitarlab_ai.runtime_probe import check_module_origins
    allowed = [Path(__file__).resolve().parent, Path(sys.prefix).resolve(), Path(sys.base_prefix).resolve(), Path.cwd().resolve()]
    assert check_module_origins(dict(sys.modules), allowed)[0]
    assert all(any(Path(path).resolve().is_relative_to(root) for root in allowed) for path in sys.path)
"#);
    let original = include_bytes!("../../../public/fixtures/sine.wav");
    assert_eq!(
        hash(original),
        "7d519e32205014966c602feab05b5cae21e57ef66c60576781880013f2e8d386"
    );
    let windows = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows 시스템 경로"));
    let mut reports = Vec::new();
    for model in [ModelId::BasicPitch, ModelId::Demucs] {
        let id = model.setup().id;
        let environment = checked_existing(
            &job.join("environments"),
            Path::new(receipt["environments"][id].as_str().expect("검증된 환경")),
        );
        let python = checked_existing(&environment, &environment.join("Scripts/python.exe"));
        let work = proof.join(format!("자체 음원-{id}"));
        fs::create_dir(&work).expect("자체 음원 작업 폴더");
        let source = work.join("input.wav");
        write_new(&source, original);
        let command = || {
            let mut command = Command::new(&python);
            command
                .args(["-I", "-B", "-X", "utf8", "-u"])
                .arg(&launcher)
                .current_dir(&work)
                .env(
                    "PATH",
                    std::env::join_paths([windows.join("System32"), windows.clone()])
                        .expect("최소 시스템 PATH"),
                )
                .env_remove("PYTHONPATH")
                .env_remove("PYTHONHOME")
                .env("NUMBA_CACHE_DIR", work.join("numba-cache"))
                .env("TEMP", &work)
                .env("TMP", &work)
                .env("HF_HUB_OFFLINE", "1")
                .env("HF_HUB_DISABLE_TELEMETRY", "1");
            command
        };
        let job_id = uuid::Uuid::new_v4().to_string();
        let verify = run_request(command(), &job_id, &AtomicBool::new(false), Duration::from_secs(15),
            json!({"protocolVersion":1,"type":"start","jobId":job_id,"action":"verify_model","modelId":id}), |_| Ok(())).expect("cp312 공개 설치 확인");
        installation::validate(&verify, model).expect("Rust 설치 확인 계약");
        assert_eq!(verify["pythonVersion"], "3.12.15");
        let action = if model == ModelId::BasicPitch {
            "transcribe"
        } else {
            "separate"
        };
        let mut request = json!({"protocolVersion":1,"type":"start","jobId":job_id,"action":action,"input":{"assetPath":source,"workDir":work}});
        if model == ModelId::BasicPitch {
            request["options"] = json!({"tuningMidi":[64,59,55,50,45,40],"syncAnchors":[{"scoreTick":0,"audioTimeMs":0},{"scoreTick":7680,"audioTimeMs":4000}],"grid":240});
        }
        let result = run_request(
            command(),
            &job_id,
            &AtomicBool::new(false),
            Duration::from_secs(120),
            request.clone(),
            |_| Ok(()),
        )
        .expect("공개 worker 실제 분석");
        let output = work.join(if model == ModelId::BasicPitch {
            "notes.json"
        } else {
            "separation.json"
        });
        let payload: Value =
            serde_json::from_slice(&fs::read(&output).expect("분석 결과 파일")).expect("분석 JSON");
        if model == ModelId::BasicPitch {
            assert_eq!(result["notesPath"], json!(output));
            let draft: super::transcription::DraftFile =
                serde_json::from_value(payload.clone()).expect("Rust 음표 계약");
            let typed_request: super::transcription::TranscribeRequest = serde_json::from_value(json!({"schemaVersion":1,"projectId":uuid::Uuid::new_v4().to_string(),"assetId":uuid::Uuid::new_v4().to_string(),"tuningMidi":[64,59,55,50,45,40],"syncAnchors":[{"scoreTick":0,"audioTimeMs":0},{"scoreTick":7680,"audioTimeMs":4000}],"grid":240})).expect("정규화 요청");
            draft.validate(&typed_request).expect("운지·음정·시간 검증");
            assert_eq!(draft.notes.len(), 8);
            for (index, note) in draft.notes.iter().enumerate() {
                assert_eq!(note.pitch_midi, [64, 67, 69, 71][index % 4]);
            }
        } else {
            assert_eq!(result["separationPath"], json!(output));
            assert_eq!(payload["frames"], 176400);
            assert_eq!(payload["weightsSha256"], super::separation::WEIGHTS);
            let outputs = payload["outputs"].as_array().expect("두 stem");
            assert_eq!(outputs.len(), 2);
            for (item, (name, role)) in outputs.iter().zip([
                ("guitar.wav", "GUITAR_FULL"),
                ("accompaniment.wav", "ACCOMPANIMENT"),
            ]) {
                assert_eq!(item["path"], json!(work.join(name)));
                assert_eq!(item["role"], role);
                let bytes = fs::read(work.join(name)).expect("실제 stem WAV");
                assert_eq!(item["sha256"], hash(&bytes));
                super::separation::validate_wav(&bytes, 176400, &AtomicBool::new(false))
                    .expect("실제 PCM 검증");
            }
        }
        assert_eq!(fs::read(&source).expect("원본 보존"), original);
        let canceled_work = work.join("취소 검사");
        fs::create_dir(&canceled_work).expect("취소 작업 폴더");
        write_new(&canceled_work.join("input.wav"), original);
        request["input"] =
            json!({"assetPath":canceled_work.join("input.wav"),"workDir":canceled_work});
        let cancel = AtomicBool::new(false);
        let started = Instant::now();
        assert_eq!(
            run_request(
                command(),
                &job_id,
                &cancel,
                Duration::from_secs(10),
                request.clone(),
                |_| {
                    cancel.store(true, Ordering::Release);
                    Ok(())
                }
            )
            .expect_err("실제 진행 중 취소")
            .code,
            "CANCELED"
        );
        assert!(started.elapsed() < Duration::from_secs(5));
        for name in [
            "notes.json",
            "separation.json",
            "guitar.wav",
            "accompaniment.wav",
        ] {
            assert!(!canceled_work.join(name).exists());
        }
        fs::write(canceled_work.join("input.wav"), b"DEMO invalid WAV").expect("잘못된 자체 입력");
        assert_eq!(
            run_request(
                command(),
                &job_id,
                &AtomicBool::new(false),
                Duration::from_secs(10),
                request.clone(),
                |_| Ok(())
            )
            .expect_err("손상 입력 거부")
            .code,
            "AI_INPUT_INVALID"
        );
        assert_eq!(
            run_request(
                command(),
                &job_id,
                &AtomicBool::new(false),
                Duration::ZERO,
                request,
                |_| Ok(())
            )
            .expect_err("시간 제한 종료")
            .code,
            "AI_WORKER_TIMEOUT"
        );
        reports.push(json!({"modelId":id,"pythonVersion":"3.12.15","installation":"FILES_VERIFIED","inference":"PASSED","cancel":"PASSED","invalidInput":"PASSED","timeout":"PASSED"}));
    }
    assert!(runtime.join("python.exe").is_file());
    write_new(&proof.join("worker-proof.json"), &serde_json::to_vec(&json!({"schemaVersion":1,"state":"PUBLIC_WORKER_PASSED","nativeActivated":false,"results":reports})).expect("검증 보고서"));
}
