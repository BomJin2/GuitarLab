use super::{
    jobs::StorageJob,
    project_model::storage_error,
    projects::{canceled, ProjectStore},
};
use crate::{ipc::AppError, recording::service::RecordingService};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::Stdio,
    sync::{atomic::Ordering, mpsc},
    thread,
    time::{Duration, Instant},
};

fn error(code: &'static str) -> AppError {
    AppError::new(
        code,
        "백업을 완료하지 못했습니다. 원본과 기존 목적지는 보존했습니다.",
        true,
    )
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupResult {
    schema_version: u8,
    state: String,
    files: u64,
    bytes: u64,
    external_references_not_copied: u64,
    restore_supported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_data_replaced: Option<bool>,
}
impl BackupResult {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || !["COMPLETED", "VERIFIED", "RESTORED_TO_NEW_FOLDER"].contains(&self.state.as_str())
            || !(1..10000).contains(&self.files)
            || !(1..=256 * 1024 * 1024).contains(&self.bytes)
            || self.external_references_not_copied > 100000
            || self.restore_supported
            || if self.state == "RESTORED_TO_NEW_FOLDER" {
                self.app_data_replaced != Some(false)
            } else {
                self.app_data_replaced.is_some()
            }
        {
            return Err(error("BACKUP_PROTOCOL_INVALID"));
        }
        Ok(())
    }
}

fn message(
    bytes: &[u8],
    job: &StorageJob,
    expected_state: &str,
) -> Result<Option<BackupResult>, AppError> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| error("BACKUP_PROTOCOL_INVALID"))?;
    if value["schemaVersion"] != 1 {
        return Err(error("BACKUP_PROTOCOL_INVALID"));
    }
    match value["state"].as_str() {
        Some("PROGRESS") if value.as_object().is_some_and(|o| o.len() == 4) => {
            let done = value["completedBytes"]
                .as_u64()
                .ok_or_else(|| error("BACKUP_PROTOCOL_INVALID"))?;
            let total = value["totalBytes"]
                .as_u64()
                .ok_or_else(|| error("BACKUP_PROTOCOL_INVALID"))?;
            job.progress(done, total)?;
            Ok(None)
        }
        Some("COMPLETED" | "VERIFIED" | "RESTORED_TO_NEW_FOLDER") => {
            let fields = if expected_state == "RESTORED_TO_NEW_FOLDER" {
                7
            } else {
                6
            };
            if !value.as_object().is_some_and(|o| o.len() == fields) {
                return Err(error("BACKUP_PROTOCOL_INVALID"));
            }
            let result: BackupResult =
                serde_json::from_value(value).map_err(|_| error("BACKUP_PROTOCOL_INVALID"))?;
            result.validate()?;
            if result.state != expected_state {
                return Err(error("BACKUP_PROTOCOL_INVALID"));
            }
            Ok(Some(result))
        }
        Some("CANCELED" | "FAILED") if value.as_object().is_some_and(|o| o.len() == 3) => {
            let code = match value["errorCode"].as_str() {
                Some("CANCELED") => "CANCELED",
                Some("DISK_SPACE_LOW") => "DISK_SPACE_LOW",
                Some("BACKUP_LIMIT_EXCEEDED") => "BACKUP_LIMIT_EXCEEDED",
                Some("BACKUP_SOURCE_CHANGED") => "BACKUP_SOURCE_CHANGED",
                Some("BACKUP_DATABASE_VERSION") => "BACKUP_DATABASE_VERSION",
                Some("BACKUP_RECORDING_ACTIVE") => "RECORDING_BUSY",
                Some("BACKUP_DESTINATION_INVALID") => "EXPORT_DESTINATION_EXISTS",
                Some("BACKUP_MANIFEST_INVALID") => "BACKUP_MANIFEST_INVALID",
                Some("BACKUP_PATH_INVALID") => "BACKUP_PATH_INVALID",
                Some("BACKUP_HASH_INVALID") => "BACKUP_HASH_INVALID",
                Some("BACKUP_DATABASE_INVALID") => "BACKUP_DATABASE_INVALID",
                _ => "BACKUP_FAILED",
            };
            Err(error(code))
        }
        _ => Err(error("BACKUP_PROTOCOL_INVALID")),
    }
}

pub fn create(
    store: &ProjectStore,
    recording: &RecordingService,
    resources: &Path,
    destination: &Path,
    job: &StorageJob,
) -> Result<BackupResult, AppError> {
    run(
        store,
        recording,
        resources,
        destination,
        job,
        Operation::Create,
    )
}
pub fn verify(
    store: &ProjectStore,
    recording: &RecordingService,
    resources: &Path,
    archive: &Path,
    job: &StorageJob,
) -> Result<BackupResult, AppError> {
    run(store, recording, resources, archive, job, Operation::Verify)
}
pub fn preview(
    store: &ProjectStore,
    recording: &RecordingService,
    resources: &Path,
    archive: &Path,
    destination: &Path,
    job: &StorageJob,
) -> Result<BackupResult, AppError> {
    run(
        store,
        recording,
        resources,
        archive,
        job,
        Operation::Preview(destination),
    )
}
#[derive(Clone, Copy)]
enum Operation<'a> {
    Create,
    Verify,
    Preview(&'a Path),
}
fn run(
    store: &ProjectStore,
    recording: &RecordingService,
    resources: &Path,
    file: &Path,
    job: &StorageJob,
    operation: Operation<'_>,
) -> Result<BackupResult, AppError> {
    canceled(&job.cancel)?;
    if !file.is_absolute()
        || file
            .extension()
            .is_none_or(|s| !s.eq_ignore_ascii_case("zip"))
    {
        return Err(AppError::invalid());
    }
    let mut command = crate::ai::local_backup_command(resources, &job.cancel)?;
    let expected_state = match operation {
        Operation::Create => {
            command
                .arg("app-backup")
                .arg(&store.root)
                .arg("--destination")
                .arg(file)
                .arg("--consent-local-media-and-private-metadata");
            "COMPLETED"
        }
        Operation::Verify => {
            command.arg("app-verify").arg(file);
            "VERIFIED"
        }
        Operation::Preview(destination) => {
            if !destination.is_absolute() || destination.exists() {
                return Err(error("EXPORT_DESTINATION_EXISTS"));
            }
            let parent = destination
                .parent()
                .ok_or_else(AppError::invalid)?
                .canonicalize()
                .map_err(|_| AppError::invalid())?;
            let app_data = store.root.canonicalize().map_err(|_| storage_error())?;
            let target = parent.join(destination.file_name().ok_or_else(AppError::invalid)?);
            if target.starts_with(&app_data) || app_data.starts_with(&target) {
                return Err(AppError::invalid());
            }
            command
                .arg("app-preview")
                .arg(file)
                .arg("--destination")
                .arg(target)
                .arg("--consent-local-media-and-private-metadata");
            "RESTORED_TO_NEW_FOLDER"
        }
    };
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    recording.while_idle(|| {
        let _writer = if matches!(operation, Operation::Create) {
            Some(store.writer.lock().map_err(|_| storage_error())?)
        } else {
            None
        };
        canceled(&job.cancel)?;
        let mut child = command
            .spawn()
            .map_err(|_| error("BACKUP_WORKER_UNAVAILABLE"))?;
        let mut input = child
            .stdin
            .take()
            .ok_or_else(|| error("BACKUP_WORKER_UNAVAILABLE"))?;
        let output = child
            .stdout
            .take()
            .ok_or_else(|| error("BACKUP_WORKER_UNAVAILABLE"))?;
        let (send, receive) = mpsc::sync_channel(8);
        let reader = thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = Vec::new();
                let read = reader.by_ref().take(8193).read_until(b'\n', &mut line);
                let result = match read {
                    Ok(0) => break,
                    Ok(_) if line.len() <= 8192 => Ok(line),
                    _ => Err(()),
                };
                let failed = result.is_err();
                if send.send(result).is_err() || failed {
                    break;
                }
            }
        });
        let started = Instant::now();
        let mut cancel_sent = false;
        let mut cancel_time = None;
        let result = loop {
            if job.cancel.load(Ordering::Acquire) || started.elapsed() > Duration::from_secs(300) {
                if !cancel_sent {
                    let _ = input.write_all(b"cancel\n");
                    cancel_sent = true;
                    cancel_time = Some(Instant::now());
                }
                if cancel_time.is_some_and(|t| t.elapsed() > Duration::from_secs(5)) {
                    break Err(error("BACKUP_CLEANUP_UNCONFIRMED"));
                }
            }
            match receive.recv_timeout(Duration::from_millis(50)) {
                Ok(Ok(line)) => match message(&line, job, expected_state) {
                    Ok(Some(result)) => break Ok(result),
                    Ok(None) => {}
                    Err(cause) => break Err(cause),
                },
                Ok(Err(())) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break Err(error("BACKUP_PROTOCOL_INVALID"))
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
        };
        drop(input);
        drop(receive);
        // 오류/취소 때도 직접 자식 종료를 기다린 뒤 저장 잠금을 해제합니다.
        let wait = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) if wait.elapsed() <= Duration::from_secs(5) => {
                    thread::sleep(Duration::from_millis(20))
                }
                _ => {
                    child
                        .kill()
                        .map_err(|_| error("BACKUP_CLEANUP_UNCONFIRMED"))?;
                    child
                        .wait()
                        .map_err(|_| error("BACKUP_CLEANUP_UNCONFIRMED"))?;
                    break Err(error("BACKUP_CLEANUP_UNCONFIRMED"));
                }
            }
        };
        reader
            .join()
            .map_err(|_| error("BACKUP_PROTOCOL_INVALID"))?;
        let status = status?;
        if result.is_ok() && !status.success() {
            return Err(error("BACKUP_FAILED"));
        }
        if started.elapsed() > Duration::from_secs(300)
            && !job.cancel.load(Ordering::Acquire)
            && result.as_ref().is_err_and(|cause| cause.code == "CANCELED")
        {
            return Err(error("BACKUP_TIMEOUT"));
        }
        result
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        audio::AudioService,
        storage::{
            calibration::ProfileStore, project_model::AssetStorage, projects_tests::Fixture,
        },
    };
    use std::sync::{atomic::AtomicBool, Arc};

    fn recorder(f: &Fixture) -> RecordingService {
        RecordingService::new(
            Arc::new(AudioService::default()),
            Arc::new(ProjectStore::new(f.store.root.clone())),
            Arc::new(ProfileStore::new(f.store.root.clone())),
        )
    }
    #[test]
    fn backup_failure_preserves_path_and_manifest_codes_without_private_details() {
        let jobs = super::super::jobs::StorageJobs::default();
        let job = jobs.start("RUNNING").expect("오류 계약 작업");
        for (code, expected) in [
            ("BACKUP_PATH_INVALID", "BACKUP_PATH_INVALID"),
            ("BACKUP_MANIFEST_INVALID", "BACKUP_MANIFEST_INVALID"),
            ("C:/private/user.zip", "BACKUP_FAILED"),
        ] {
            let bytes = serde_json::to_vec(&serde_json::json!({
                "schemaVersion": 1, "state": "FAILED", "errorCode": code
            }))
            .expect("오류 메시지");
            let cause = message(&bytes, &job, "COMPLETED").expect_err("백업 실패");
            assert_eq!(cause.code, expected);
            assert!(!cause.message.contains("private"));
        }
    }
    #[test]
    fn backup_idle_guard_blocks_recording_start_and_releases_after_failure() {
        use crate::recording::model::{RecordSource, StartRecordingRequest};
        use crate::storage::calibration::MonitorEnvironment;
        let f = Fixture::new();
        let service = recorder(&f);
        let result: Result<(), AppError> = service.while_idle(|| {
            assert!(service.storage_busy());
            let request = StartRecordingRequest {
                schema_version: 1,
                project_id: uuid::Uuid::new_v4().to_string(),
                score_revision_id: uuid::Uuid::new_v4().to_string(),
                target_score_track_id: "guitar".into(),
                expected_stream_generation: 1,
                monitor_environment: MonitorEnvironment::Headphones,
                source: RecordSource::InputOnly,
                transport: None,
                reference_take_ids: vec![],
                defer_transport: false,
            };
            assert_eq!(
                service.start(request).err().expect("백업 중 REC 차단").code,
                "RECORDING_BUSY"
            );
            Err(error("BACKUP_FAILED"))
        });
        assert!(result.is_err());
        assert!(!service.storage_busy());
        service.while_idle(|| Ok(())).expect("다음 백업 허용");
    }

    #[test]
    #[ignore = "검증된 번들 Python 리소스 경로를 명시하는 자체 데이터 백업/worker 실행 검사"]
    fn actual_bundled_backup_and_runtime_worker_preserve_original_and_new_zip() {
        let resources = std::path::PathBuf::from(
            std::env::var_os("GUITARLAB_BACKUP_RESOURCES").expect("검증된 번들 상위 경로"),
        );
        let f = Fixture::new();
        let project = f.project();
        f.asset(&project, AssetStorage::Managed);
        let mut archived_take = super::super::recordings_tests::prepared(&f);
        super::super::recordings_tests::write_part(&f, &mut archived_take, 4800, true);
        f.store
            .finalize_take(&mut archived_take)
            .expect("자체 READY 녹음");
        let archived_project = archived_take.project_id.clone();
        let json_source = f
            .store
            .root
            .parent()
            .expect("자체 경로")
            .join("직접 작성.json");
        let json_bytes = include_bytes!("../../../fixtures/manual-score-v1.json");
        std::fs::write(&json_source, json_bytes).expect("자체 JSON");
        let json_asset = f
            .store
            .import_asset(
                &archived_project,
                &json_source,
                super::super::project_model::AssetKind::ScoreImport,
                AssetStorage::Managed,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("JSON 보관 원본")
            .asset
            .id;
        let archived_asset = f
            .store
            .revision(&archived_project, &archived_take.score_revision_id)
            .expect("보관 전 악보")
            .score_asset_id;
        let archived_wave = f
            .store
            .recording_bytes(
                &archived_project,
                &archived_take.id,
                &AtomicBool::new(false),
            )
            .expect("보관 전 녹음");
        let archived_bytes = f
            .store
            .read_asset(
                &archived_project,
                &archived_asset,
                &AtomicBool::new(false),
                |_, _| Ok(()),
            )
            .expect("보관 전 원본");
        let archived = f
            .store
            .trash_project(&archived_project, 1, &AtomicBool::new(false))
            .expect("자체 보관 자료");
        let service = recorder(&f);
        let destination = f
            .store
            .root
            .parent()
            .expect("자체 검사 폴더")
            .join("새 자체 백업.zip");
        let jobs = super::super::jobs::StorageJobs::default();
        let job = jobs.start("RUNNING").expect("작업");
        let original = f.store.list().expect("기존 목록");
        let result =
            create(&f.store, &service, &resources, &destination, &job).expect("실제 번들 백업");
        assert!(result.files >= 2 && result.bytes > 0);
        assert!(destination.is_file());
        let check_jobs = super::super::jobs::StorageJobs::default();
        let check_job = check_jobs.start("RUNNING").expect("검사 작업");
        let checked = verify(&f.store, &service, &resources, &destination, &check_job)
            .expect("실제 번들 지문 검사");
        assert_eq!(checked.state, "VERIFIED");
        assert_eq!((checked.files, checked.bytes), (result.files, result.bytes));
        let preview_target = destination.with_file_name("GuitarLab-backup-preview");
        let archive_before = std::fs::read(&destination).expect("원본 ZIP");
        let restored = preview(
            &f.store,
            &service,
            &resources,
            &destination,
            &preview_target,
            &check_job,
        )
        .expect("실제 번들 새 폴더 추출");
        assert_eq!(restored.state, "RESTORED_TO_NEW_FOLDER");
        assert_eq!(restored.app_data_replaced, Some(false));
        let restored_db = rusqlite::Connection::open_with_flags(
            preview_target.join("guitarlab.sqlite"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .expect("새 DB 읽기");
        assert_eq!(
            restored_db
                .query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .expect("버전"),
            9
        );
        assert_eq!(
            restored_db
                .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get::<_, i64>(0))
                .expect("프로젝트"),
            i64::try_from(original.len() + 1).expect("일반/보관 프로젝트 합계")
        );
        assert_eq!(
            restored_db
                .query_row(
                    "SELECT trash_id FROM project_trash WHERE project_id=?1",
                    [&archived_project],
                    |r| r.get::<_, String>(0)
                )
                .expect("보관 marker"),
            archived.trash_id
        );
        assert_eq!(
            std::fs::read(preview_target.join(format!(
                "projects/{archived_project}/assets/{archived_asset}.musicxml"
            )))
            .expect("보관 원본 복사"),
            archived_bytes
        );
        assert_eq!(
            std::fs::read(preview_target.join(format!(
                "projects/{archived_project}/recordings/{}/dry.wav",
                archived_take.id
            )))
            .expect("보관 녹음 복사"),
            archived_wave
        );
        drop(restored_db);
        assert_eq!(
            std::fs::read(preview_target.join(format!(
                "projects/{archived_project}/assets/{json_asset}.json"
            )))
            .expect("JSON 복원 복사"),
            json_bytes
        );
        assert_eq!(
            std::fs::read(json_source).expect("JSON 외부 원본 보존"),
            json_bytes
        );
        assert_eq!(
            std::fs::read(&destination).expect("보존 ZIP"),
            archive_before
        );
        assert_eq!(
            preview(
                &f.store,
                &service,
                &resources,
                &destination,
                &preview_target,
                &check_job
            )
            .expect_err("기존 복원 폴더 보존")
            .code,
            "EXPORT_DESTINATION_EXISTS"
        );
        let forbidden = f.store.root.join("GuitarLab-backup-preview");
        assert!(preview(
            &f.store,
            &service,
            &resources,
            &destination,
            &forbidden,
            &check_job
        )
        .is_err());
        assert!(!forbidden.exists());
        let broken = destination.with_file_name("손상된 자체 백업.zip");
        std::fs::write(&broken, b"not a zip").expect("자체 손상 입력");
        assert_eq!(
            verify(&f.store, &service, &resources, &broken, &check_job)
                .expect_err("손상 검사 실패")
                .code,
            "BACKUP_FAILED"
        );
        assert_eq!(f.store.list().expect("보존된 목록").len(), original.len());
        assert!(!service.storage_busy());
        assert_eq!(
            create(&f.store, &service, &resources, &destination, &job)
                .expect_err("기존 ZIP 보존")
                .code,
            "EXPORT_DESTINATION_EXISTS"
        );
        let runtime = crate::ai::inspect_with_resources(
            &resources,
            &uuid::Uuid::new_v4().to_string(),
            &AtomicBool::new(false),
        )
        .expect("원래 worker 회귀");
        assert_eq!(
            serde_json::to_value(runtime).expect("환경 결과")["pythonVersion"],
            "3.12.15"
        );
        let large = f
            .store
            .root
            .join("projects")
            .join(&project)
            .join("자체 취소 검사.bin");
        std::fs::write(&large, vec![7_u8; 64 * 1024 * 1024]).expect("자체 큰 파일");
        let cancel_jobs = super::super::jobs::StorageJobs::default();
        let cancel_job = cancel_jobs.start("RUNNING").expect("취소 검사 작업");
        let target = f
            .store
            .root
            .parent()
            .expect("자체 상위")
            .join("취소 검사.zip");
        let observer = cancel_job.clone();
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = stopped.clone();
        let canceler = thread::spawn(move || {
            while !stop.load(Ordering::Acquire) {
                if observer.snapshot().expect("진행 관측").total_bytes > 0 {
                    observer.cancel.store(true, Ordering::Release);
                    break;
                }
                thread::sleep(Duration::from_millis(5));
            }
        });
        let outcome = create(&f.store, &service, &resources, &target, &cancel_job);
        stopped.store(true, Ordering::Release);
        canceler.join().expect("취소 관측 종료");
        match outcome {
            Err(cause) => {
                assert_eq!(cause.code, "CANCELED");
                assert!(!target.exists());
                println!("실제 자식 취소/새 staging 정리 확인");
            }
            Ok(result) => {
                result.validate().expect("취소보다 먼저 완료");
                assert!(target.is_file());
                println!("늦은 취소: 이미 게시한 ZIP 보존");
            }
        }
        assert!(!service.storage_busy());
        assert!(std::fs::read_dir(f.store.root.parent().expect("자체 상위"))
            .expect("정리 목록")
            .all(|entry| !entry
                .expect("항목")
                .file_name()
                .to_string_lossy()
                .starts_with(".guitarlab-backup-")));
    }
    #[test]
    fn strict_backup_protocol_rejects_overflow_private_path_unknown_fields_and_fake_success() {
        let jobs = super::super::jobs::StorageJobs::default();
        let job = jobs.start("RUNNING").expect("작업");
        message(
            br#"{"schemaVersion":1,"state":"PROGRESS","completedBytes":2,"totalBytes":3}"#,
            &job,
            "COMPLETED",
        )
        .expect("진행");
        let valid = serde_json::json!({"schemaVersion":1,"state":"COMPLETED","files":3,"bytes":500,"externalReferencesNotCopied":0,"restoreSupported":false});
        message(
            &serde_json::to_vec(&valid).expect("JSON"),
            &job,
            "COMPLETED",
        )
        .expect("완료");
        let mut verified = valid.clone();
        verified["state"] = serde_json::json!("VERIFIED");
        let raw = serde_json::to_vec(&verified).expect("검사 JSON");
        assert!(message(&raw, &job, "COMPLETED").is_err());
        message(&raw, &job, "VERIFIED").expect("검사 완료");
        let mut restored = valid.clone();
        restored["state"] = serde_json::json!("RESTORED_TO_NEW_FOLDER");
        assert!(message(
            &serde_json::to_vec(&restored).expect("JSON"),
            &job,
            "RESTORED_TO_NEW_FOLDER"
        )
        .is_err());
        restored["appDataReplaced"] = serde_json::json!(false);
        let preview = serde_json::to_vec(&restored).expect("JSON");
        message(&preview, &job, "RESTORED_TO_NEW_FOLDER").expect("새 폴더 결과");
        assert!(message(&preview, &job, "VERIFIED").is_err());
        restored["appDataReplaced"] = serde_json::json!(true);
        assert!(message(
            &serde_json::to_vec(&restored).expect("JSON"),
            &job,
            "RESTORED_TO_NEW_FOLDER"
        )
        .is_err());
        for (key, value) in [
            ("schemaVersion", serde_json::json!(2)),
            ("bytes", serde_json::json!(268435457)),
            ("files", serde_json::json!(0)),
            ("restoreSupported", serde_json::json!(true)),
            ("path", serde_json::json!("private")),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(message(&serde_json::to_vec(&bad).expect("JSON"), &job, "COMPLETED").is_err());
        }
        assert_eq!(
            message(
                br#"{"schemaVersion":1,"state":"CANCELED","errorCode":"CANCELED"}"#,
                &job,
                "COMPLETED"
            )
            .expect_err("취소")
            .code,
            "CANCELED"
        );
    }
}
