//! 복원 예약 기록과 공개 결과를 검증하며 현재 실행 중에는 관리 파일을 교체하지 않습니다.
use super::{jobs::StorageJob, project_model::validate_uuid};
use crate::{instance::InstanceGuard, ipc::AppError};
use serde::{
    de::{MapAccess, Visitor},
    Deserialize, Deserializer,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Read},
    path::Path,
    sync::atomic::AtomicBool,
};

fn error() -> AppError {
    AppError::new(
        "RESTORE_RECOVERY_REQUIRED",
        "복원 상태를 확인하지 못했습니다. 예약과 복구 자료를 확인해주세요.",
        true,
    )
}
fn hex(value: &Value) -> bool {
    value.as_str().is_some_and(|v| {
        v.len() == 64
            && v.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}
struct UniqueRecord(Value);
impl<'de> Deserialize<'de> for UniqueRecord {
    fn deserialize<D: Deserializer<'de>>(source: D) -> Result<Self, D::Error> {
        struct Object;
        impl<'de> Visitor<'de> for Object {
            type Value = UniqueRecord;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("중복 키 없는 복원 기록")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut input: A) -> Result<Self::Value, A::Error> {
                let mut fields = serde_json::Map::new();
                while let Some((key, value)) = input.next_entry::<String, Value>()? {
                    if fields.insert(key, value).is_some() {
                        return Err(serde::de::Error::custom("RESTORE_STATE_INVALID"));
                    }
                }
                Ok(UniqueRecord(Value::Object(fields)))
            }
        }
        source.deserialize_map(Object)
    }
}
pub(crate) fn validate(value: &Value, prepared: bool) -> Result<(), AppError> {
    if value["schemaVersion"].as_u64() != Some(1) {
        return Err(error());
    }
    if value["state"] == "IDLE" && value.as_object().is_some_and(|v| v.len() == 2) && !prepared {
        return Ok(());
    }
    let state = value["state"].as_str().ok_or_else(error)?;
    let allowed = if prepared {
        state == "PREPARED"
    } else {
        [
            "SCHEDULED",
            "APPLYING",
            "COMPLETED",
            "ROLLED_BACK",
            "CANCELED",
            "FAILED",
        ]
        .contains(&state)
    };
    if !allowed
        || value
            .as_object()
            .is_none_or(|v| v.len() != if prepared { 10 } else { 9 })
        || value["recoveryId"]
            .as_str()
            .is_none_or(|v| validate_uuid(v).is_err())
        || value["files"]
            .as_u64()
            .is_none_or(|v| !(1..10_000).contains(&v))
        || value["bytes"]
            .as_u64()
            .is_none_or(|v| !(1..=2 * 1024 * 1024 * 1024).contains(&v))
        || value["externalReferencesNotCopied"]
            .as_u64()
            .is_none_or(|v| v > 100_000)
        || value["databaseVersion"]
            .as_u64()
            .is_none_or(|v| ![8, 9, 10].contains(&v))
        || value["restartRequired"].as_bool() != Some(state == "SCHEDULED")
        || prepared && !hex(&value["fingerprint"])
        || match state {
            "FAILED" => !matches!(
                value["errorCode"].as_str(),
                Some("RESTORE_ABORTED" | "RESTORE_PREPARATION_FAILED")
            ),
            "ROLLED_BACK" => value["errorCode"] != "RESTORE_ROLLED_BACK",
            _ => !value.get("errorCode").is_some_and(Value::is_null),
        }
    {
        return Err(error());
    }
    Ok(())
}

pub(crate) fn status(root: &Path) -> Result<Value, AppError> {
    let path = root.join(".local-restore-request.json");
    let info = match fs::symlink_metadata(&path) {
        Ok(info) => info,
        Err(cause) if cause.kind() == io::ErrorKind::NotFound => {
            return Ok(json!({"schemaVersion":1,"state":"IDLE"}))
        }
        Err(_) => return Err(error()),
    };
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if info.file_attributes() & 0x400 != 0 {
            return Err(error());
        }
    }
    if !info.is_file() || info.file_type().is_symlink() || info.len() > 4096 {
        return Err(error());
    }
    let mut input = fs::OpenOptions::new();
    input.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        input.custom_flags(0x00200000).share_mode(1);
    }
    let mut bytes = Vec::new();
    input
        .open(path)
        .map_err(|_| error())?
        .take(4097)
        .read_to_end(&mut bytes)
        .map_err(|_| error())?;
    if bytes.len() > 4096 {
        return Err(error());
    }
    let record = serde_json::from_slice::<UniqueRecord>(&bytes)
        .map_err(|_| error())?
        .0;
    let fields = [
        "schemaVersion",
        "kind",
        "phase",
        "recoveryId",
        "rootSha256",
        "fingerprint",
        "files",
        "bytes",
        "externalReferencesNotCopied",
        "databaseVersion",
        "errorCode",
    ];
    if record
        .as_object()
        .is_none_or(|r| r.len() != 11 || fields.iter().any(|k| !r.contains_key(*k)))
        || record["kind"] != "GUITARLAB_LOCAL_RESTORE_REQUEST"
        || !hex(&record["fingerprint"])
    {
        return Err(error());
    }
    let root = root
        .canonicalize()
        .map_err(|_| error())?
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();
    let plain = if let Some(unc) = root.strip_prefix("\\\\?\\unc\\") {
        format!("\\\\{unc}")
    } else {
        root.strip_prefix("\\\\?\\").unwrap_or(&root).to_owned()
    };
    if ![root, plain].iter().any(|v| {
        record["rootSha256"] == super::projects::hex(Sha256::digest(v.as_bytes()).as_ref())
    }) {
        return Err(error());
    }
    let value = json!({"schemaVersion":record["schemaVersion"],"state":record["phase"],"recoveryId":record["recoveryId"],"files":record["files"],"bytes":record["bytes"],"externalReferencesNotCopied":record["externalReferencesNotCopied"],"databaseVersion":record["databaseVersion"],"restartRequired":record["phase"]=="SCHEDULED","errorCode":record["errorCode"]});
    validate(&value, false)?;
    Ok(value)
}

pub(crate) fn run(
    root: &Path,
    resources: &Path,
    guard: &InstanceGuard,
    mode: &str,
    args: &[&std::ffi::OsStr],
    job: Option<&StorageJob>,
) -> Result<Value, AppError> {
    if !["prepare", "schedule", "cancel", "startup"].contains(&mode) {
        return Err(AppError::invalid());
    }
    let cancel = AtomicBool::new(false);
    let mut command =
        crate::ai::local_restore_request_command(resources, job.map_or(&cancel, |j| &j.cancel))?;
    command.arg(mode).arg(root).args(args);
    let value = super::restore_state::run_command(&mut command, guard, job)?;
    validate(&value, mode == "prepare")?;
    Ok(value)
}

pub(crate) fn startup(
    root: &Path,
    resources: &Path,
    guard: &InstanceGuard,
) -> Result<&'static str, AppError> {
    let value = run(root, resources, guard, "startup", &[], None)?;
    match value["state"].as_str() {
        Some("COMPLETED") => Ok("LOCAL_DATA_RESTORED"),
        Some("ROLLED_BACK") => Ok("LOCAL_DATA_ROLLED_BACK"),
        Some("FAILED") => Ok("LOCAL_DATA_RESTORE_FAILED"),
        _ => Err(error()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_status_rejects_paths_unknown_fields_and_false_success() {
        assert!(serde_json::from_str::<UniqueRecord>(
            r#"{"phase":"APPLYING","phase":"COMPLETED"}"#
        )
        .is_err());
        let value = json!({"schemaVersion":1,"state":"SCHEDULED","recoveryId":"00000000-0000-4000-8000-000000000001","files":1,"bytes":1,"externalReferencesNotCopied":0,"databaseVersion":10,"restartRequired":true,"errorCode":null});
        validate(&value, false).expect("예약 계약");
        for (key, change) in [
            ("files", json!(true)),
            ("bytes", json!(2147483649_u64)),
            ("state", json!("UNKNOWN")),
            ("restartRequired", json!(false)),
            ("path", json!("private")),
            ("errorCode", json!("arbitrary")),
            ("databaseVersion", json!(11)),
        ] {
            let mut changed = value.clone();
            changed[key] = change;
            assert!(validate(&changed, false).is_err());
        }
        let mut failed = value;
        failed["state"] = json!("FAILED");
        failed["restartRequired"] = json!(false);
        assert!(validate(&failed, false).is_err());
        failed["errorCode"] = json!("RESTORE_PREPARATION_FAILED");
        validate(&failed, false).expect("적용 전 실패 결과");
    }

    #[test]
    #[ignore = "검증한 번들 Python으로 자체 DB의 예약·취소·재시작 실제 교체를 검사합니다"]
    fn bundled_request_lifecycle_preserves_latest_backup_and_unmanaged_files() {
        use crate::storage::{project_model::ProjectMode, projects_tests::Fixture};
        let resources = std::path::PathBuf::from(
            std::env::var_os("GUITARLAB_BACKUP_RESOURCES").expect("번들 리소스"),
        );
        let fixture = Fixture::new();
        let root = &fixture.store.root;
        fixture.project();
        fs::create_dir_all(root.join("ai/models")).expect("자체 모델 폴더");
        fs::write(root.join("ai/models/keep.bin"), b"keep model").expect("자체 모델");
        let archive = root
            .parent()
            .expect("자체 테스트 상위")
            .join("own-backup.zip");
        let guard = InstanceGuard::acquire(root).expect("부모 소유 잠금");
        let mut command = crate::ai::local_restore_command(&resources, &AtomicBool::new(false))
            .expect("번들 worker");
        let source = format!("{}\ndef _worker_recover():\n root=_root(Path(sys.argv[1])); _require_inherited_lock(root); backup.backup(root, root.parent / 'own-backup.zip', consent=True, guard=lambda:None); print(json.dumps({{'schemaVersion':1,'state':'RESTORE_NOT_PENDING'}}),flush=True)\n", include_str!("../../../scripts/restore_local_data.py"));
        command
            .env("GUITARLAB_INTERNAL_RESTORE_SOURCE", source)
            .arg(root);
        let output = command
            .stdin(guard.child_stdin().expect("상속 잠금"))
            .output()
            .expect("자체 백업 자식");
        assert!(
            output.status.success(),
            "자체 백업 오류: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let jobs = super::super::jobs::StorageJobs::default();
        let job = jobs.start("RUNNING").expect("검사 작업");
        let prepare = || {
            run(
                root,
                &resources,
                &guard,
                "prepare",
                &[archive.as_os_str()],
                Some(&job),
            )
            .expect("준비")
        };
        let plan = prepare();
        let id = plan["recoveryId"].as_str().expect("UUID");
        let fingerprint = plan["fingerprint"].as_str().expect("지문");
        run(
            root,
            &resources,
            &guard,
            "schedule",
            &[id.as_ref(), fingerprint.as_ref()],
            Some(&job),
        )
        .expect("예약");
        assert!(super::super::restore_state::pending(root).expect("예약 시작 보호"));
        assert_eq!(
            status(root).expect("경로 지문과 한글 root 상태")["state"],
            "SCHEDULED"
        );
        run(
            root,
            &resources,
            &guard,
            "cancel",
            &[id.as_ref()],
            Some(&job),
        )
        .expect("예약 해제");
        assert!(!super::super::restore_state::pending(root).expect("해제 뒤 정상 시작"));
        let plan = prepare();
        let id = plan["recoveryId"].as_str().expect("UUID");
        let fingerprint = plan["fingerprint"].as_str().expect("지문");
        run(
            root,
            &resources,
            &guard,
            "schedule",
            &[id.as_ref(), fingerprint.as_ref()],
            Some(&job),
        )
        .expect("새 예약");
        fixture
            .store
            .create("예약 뒤 추가 자료".into(), None, ProjectMode::Copy)
            .expect("최신 현재 자료");
        assert_eq!(
            startup(root, &resources, &guard).expect("다음 시작 교체"),
            "LOCAL_DATA_RESTORED"
        );
        assert!(!super::super::restore_state::pending(root).expect("완료 상태"));
        assert_eq!(fixture.store.list().expect("복원 DB").len(), 1);
        assert_eq!(
            fs::read(root.join("ai/models/keep.bin")).expect("모델 보존"),
            b"keep model"
        );
        assert_eq!(status(root).expect("완료 결과")["state"], "COMPLETED");
        let vault = root
            .parent()
            .expect("자체 상위")
            .join(format!(".guitarlab-restore-{id}"));
        assert!(vault.join("previous.zip").is_file());
        let db = rusqlite::Connection::open_with_flags(
            vault.join("previous/guitarlab.sqlite"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .expect("이전 DB");
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get::<_, i64>(0))
                .expect("최신 자료 백업"),
            2
        );
    }
}
