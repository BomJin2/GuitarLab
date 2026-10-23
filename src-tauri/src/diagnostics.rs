use crate::{ipc::AppError, storage::database::checked_file};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, OnceLock,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: u64 = 16 * 1024;
const MAX_EVENTS: usize = 64;
const MAX_SAFE: u64 = 9_007_199_254_740_991;
const FILE: &str = "diagnostics/native-v1.json";
static GLOBAL: OnceLock<Arc<Diagnostics>> = OnceLock::new();

fn error() -> AppError {
    AppError::new(
        "DIAGNOSTICS_UNAVAILABLE",
        "로컬 진단 기록을 확인하지 못했습니다.",
        true,
    )
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Code {
    AppStarted,
    AppExited,
    NativePanic,
    StorageInitFailed,
    RecordingRecoveryInitFailed,
    AppStartFailed,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Event {
    unix_ms: u64,
    code: Code,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    schema_version: u8,
    events: Vec<Event>,
}
struct Store(PathBuf);
impl Store {
    fn read(&self) -> Result<Vec<Event>, AppError> {
        let path = checked_file(&self.0, Path::new(FILE)).map_err(|_| error())?;
        let file = match fs::File::open(path) {
            Ok(file) => file,
            Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(_) => return Err(error()),
        };
        let mut bytes = Vec::new();
        file.take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| error())?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(error());
        }
        let journal: Journal = serde_json::from_slice(&bytes).map_err(|_| error())?;
        if journal.schema_version != 1
            || journal.events.len() > MAX_EVENTS
            || journal.events.iter().any(|e| e.unix_ms > MAX_SAFE)
        {
            return Err(error());
        }
        Ok(journal.events)
    }
    fn write(&self, code: Code) -> Result<(), AppError> {
        let mut events = self.read()?;
        if events.len() == MAX_EVENTS {
            events.remove(0);
        }
        let unix_ms = u64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| error())?
                .as_millis(),
        )
        .map_err(|_| error())?;
        if unix_ms > MAX_SAFE {
            return Err(error());
        }
        events.push(Event { unix_ms, code });
        let bytes = serde_json::to_vec(&Journal {
            schema_version: 1,
            events,
        })
        .map_err(|_| error())?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(error());
        }
        let path = checked_file(&self.0, Path::new(FILE)).map_err(|_| error())?;
        let temporary = path.with_file_name(format!("native-{}.part", uuid::Uuid::new_v4()));
        let mut created = false;
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| error())?;
            created = true;
            file.write_all(&bytes).map_err(|_| error())?;
            file.sync_all().map_err(|_| error())?;
            drop(file);
            fs::rename(&temporary, path).map_err(|_| error())
        })();
        if result.is_err() && created {
            fs::remove_file(temporary).map_err(|_| error())?;
        }
        result
    }
}
#[derive(Default)]
struct Status {
    available: AtomicBool,
    dropped: AtomicU64,
}
impl Status {
    fn drop_event(&self) {
        let _ = self
            .dropped
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |value| {
                Some(value.saturating_add(1).min(MAX_SAFE))
            });
    }
}
enum Message {
    Record(Code),
    Flush(mpsc::Sender<()>),
}
pub struct Diagnostics {
    root: PathBuf,
    sender: mpsc::SyncSender<Message>,
    status: Arc<Status>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    schema_version: u8,
    persistence_available: bool,
    dropped_events: u64,
    events: Vec<Event>,
}
impl Diagnostics {
    fn new(root: PathBuf) -> Self {
        let (sender, receiver) = mpsc::sync_channel(32);
        let status = Arc::new(Status::default());
        let writer_status = status.clone();
        let store = Store(root.clone());
        // panic hook과 오디오 스레드는 파일 작업을 하지 않고 고정 코드만 보냅니다.
        if thread::Builder::new()
            .name("local-diagnostics".into())
            .spawn(move || {
                while let Ok(message) = receiver.recv() {
                    match message {
                        Message::Record(code) => {
                            let saved = store.write(code).is_ok();
                            writer_status.available.store(saved, Ordering::Release);
                            if !saved {
                                writer_status.drop_event();
                            }
                        }
                        Message::Flush(done) => {
                            let _ = done.send(());
                        }
                    }
                }
            })
            .is_err()
        {
            status.available.store(false, Ordering::Release);
        }
        Self {
            root,
            sender,
            status,
        }
    }
    pub fn record(&self, code: Code) {
        if self.sender.try_send(Message::Record(code)).is_err() {
            self.status.drop_event();
        }
    }
    fn flush(&self) -> bool {
        let (sender, receiver) = mpsc::channel();
        self.sender.try_send(Message::Flush(sender)).is_ok()
            && receiver.recv_timeout(Duration::from_secs(1)).is_ok()
    }
    pub fn snapshot(&self) -> Result<Snapshot, AppError> {
        Ok(Snapshot {
            schema_version: 1,
            persistence_available: self.status.available.load(Ordering::Acquire),
            dropped_events: self.status.dropped.load(Ordering::Relaxed),
            events: Store(self.root.clone()).read()?,
        })
    }
}
pub fn initialize(root: PathBuf) -> Arc<Diagnostics> {
    GLOBAL
        .get_or_init(|| {
            let service = Arc::new(Diagnostics::new(root));
            // 예외 원문·경로·stack은 저장하거나 기본 hook으로 전달하지 않습니다.
            std::panic::set_hook(Box::new(|_| {
                if let Some(service) = GLOBAL.get() {
                    service.record(Code::NativePanic);
                }
            }));
            service
        })
        .clone()
}
pub fn finish(failed: bool) {
    if let Some(service) = GLOBAL.get() {
        service.record(if failed {
            Code::AppStartFailed
        } else {
            Code::AppExited
        });
        let _ = service.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::projects_tests::Fixture;

    #[test]
    fn journal_retains_only_bounded_fixed_codes_and_rejects_unknown_fields() {
        let fixture = Fixture::new();
        let store = Store(fixture.store.root.clone());
        for _ in 0..70 {
            store.write(Code::AppStarted).expect("자체 기록");
        }
        assert_eq!(store.read().expect("읽기").len(), MAX_EVENTS);
        let path = checked_file(&store.0, Path::new(FILE)).expect("경로");
        let original = fs::read(&path).expect("원본");
        let mut bad: serde_json::Value = serde_json::from_slice(&original).expect("JSON");
        bad["events"][0]["path"] = serde_json::json!("private path");
        fs::write(&path, serde_json::to_vec(&bad).expect("변조 JSON")).expect("자체 변조");
        assert!(store.read().is_err());
        assert!(store.write(Code::NativePanic).is_err());
        assert!(serde_json::from_str::<Event>(r#"{"unixMs":1,"code":"private path"}"#).is_err());
        fs::write(&path, vec![b'x'; MAX_BYTES as usize + 1]).expect("자체 과대 입력");
        assert!(store.read().is_err());
    }
    #[test]
    fn full_queue_never_waits_or_writes_from_producer() {
        let (sender, _receiver) = mpsc::sync_channel(1);
        let service = Diagnostics {
            root: PathBuf::new(),
            sender,
            status: Arc::new(Status::default()),
        };
        service.record(Code::NativePanic);
        service.record(Code::NativePanic);
        assert_eq!(service.status.dropped.load(Ordering::Relaxed), 1);
        assert!(!service.flush());
    }
    #[test]
    fn actual_isolated_panic_hook_excludes_payload_and_flushes_fixed_code() {
        let fixture = Fixture::new();
        let output = std::process::Command::new(std::env::current_exe().expect("검사 실행 파일"))
            .args([
                "diagnostics::tests::panic_hook_child",
                "--ignored",
                "--exact",
                "--nocapture",
            ])
            .env("GUITARLAB_TEST_DIAGNOSTICS_ROOT", &fixture.store.root)
            .output()
            .expect("자체 자식 검사");
        assert!(output.status.success(), "격리 panic 검사 실패");
        let snapshot = Store(fixture.store.root.clone()).read().expect("자식 기록");
        assert!(snapshot.iter().any(|event| event.code == Code::NativePanic));
        let bytes = fs::read(fixture.store.root.join(FILE)).expect("기록 원문");
        assert!(!String::from_utf8_lossy(&bytes).contains("PRIVATE_PANIC_PAYLOAD"));
        assert!(!String::from_utf8_lossy(&output.stderr).contains("PRIVATE_PANIC_PAYLOAD"));
    }
    #[test]
    #[ignore = "부모 검사에서 자체 임시 경로로만 실행하는 격리 panic hook"]
    fn panic_hook_child() {
        let root = PathBuf::from(
            std::env::var_os("GUITARLAB_TEST_DIAGNOSTICS_ROOT").expect("자체 임시 경로"),
        );
        let service = initialize(root);
        assert!(std::panic::catch_unwind(|| panic!("PRIVATE_PANIC_PAYLOAD")).is_err());
        assert!(service.flush());
    }
}
