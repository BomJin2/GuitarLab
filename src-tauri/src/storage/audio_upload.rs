use super::{
    asset_staging::{validate_name, StagedAsset},
    jobs::{StorageJob, StorageJobs},
    project_model::{storage_error, validate_uuid, AssetKind},
    projects::{canceled, ImportResult, ProjectStore},
};
use crate::ipc::AppError;
use serde::Deserialize;
use std::{
    io::Write,
    sync::{
        mpsc::{self, Receiver, SyncSender, TrySendError},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

const HEADER: usize = 44;
const MAX_CHUNK: usize = 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioUploadRequest {
    schema_version: u8,
    pub project_id: String,
    name: String,
    bytes: u64,
}
impl AudioUploadRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        if self.schema_version != 1
            || self.bytes == 0
            || self.bytes > AssetKind::Original.max_bytes()
        {
            return Err(AppError::invalid());
        }
        validate_name(&self.name, AssetKind::Original)
    }
}

pub(crate) struct Chunk {
    offset: u64,
    body: Vec<u8>,
    reply: mpsc::Sender<Result<u64, &'static str>>,
}
struct Active {
    job: Arc<StorageJob>,
    sender: SyncSender<Chunk>,
}
#[derive(Default)]
pub struct AudioUploads {
    active: Mutex<Option<Active>>,
}

fn canceled_upload() -> AppError {
    AppError::new("CANCELED", "파일 업로드를 취소했습니다.", false)
}

impl AudioUploads {
    pub(crate) fn reserve(
        &self,
        jobs: &StorageJobs,
    ) -> Result<(Arc<StorageJob>, Receiver<Chunk>), AppError> {
        let mut active = self.active.lock().map_err(|_| storage_error())?;
        if let Some(previous) = active.as_ref() {
            if !["COMPLETED", "CANCELED", "ERROR"].contains(&previous.job.snapshot()?.state) {
                return Err(AppError::new(
                    "STORAGE_BUSY",
                    "다른 파일 작업을 마친 뒤 다시 시도하세요.",
                    true,
                ));
            }
        }
        let job = jobs.start("RUNNING")?;
        let (sender, receiver) = mpsc::sync_channel(1);
        *active = Some(Active {
            job: job.clone(),
            sender,
        });
        Ok((job, receiver))
    }

    pub fn append(&self, body: Vec<u8>) -> Result<(String, u64), AppError> {
        if body.len() <= HEADER || body.len() > HEADER + MAX_CHUNK {
            return Err(AppError::invalid());
        }
        let id = std::str::from_utf8(&body[..36])
            .map_err(|_| AppError::invalid())?
            .to_owned();
        validate_uuid(&id)?;
        let offset = u64::from_le_bytes(
            body[36..HEADER]
                .try_into()
                .map_err(|_| AppError::invalid())?,
        );
        let sender = {
            let active = self.active.lock().map_err(|_| storage_error())?;
            let current = active.as_ref().ok_or_else(AppError::invalid)?;
            if current.job.snapshot()?.job_id != id {
                return Err(AppError::invalid());
            }
            canceled(&current.job.cancel)?;
            current.sender.clone()
        };
        let (reply, received) = mpsc::channel();
        sender
            .try_send(Chunk {
                offset,
                body,
                reply,
            })
            .map_err(|cause| match cause {
                TrySendError::Full(_) => AppError::new(
                    "STORAGE_BUSY",
                    "이전 파일 조각 처리가 끝날 때까지 기다리세요.",
                    true,
                ),
                TrySendError::Disconnected(_) => canceled_upload(),
            })?;
        let done = received
            .recv_timeout(Duration::from_secs(31))
            .map_err(|_| storage_error())?
            .map_err(|code| {
                AppError::new(
                    code,
                    "파일 조각을 처리하지 못했습니다. 원본은 보존했습니다.",
                    true,
                )
            })?;
        Ok((id, done))
    }

    pub(crate) fn release(&self, id: &str) -> Result<(), AppError> {
        let mut active = self.active.lock().map_err(|_| storage_error())?;
        if let Some(value) = active.as_ref() {
            if value.job.snapshot()?.job_id == id {
                *active = None;
            }
        }
        Ok(())
    }
}

pub(crate) fn receive_audio(
    store: &ProjectStore,
    request: AudioUploadRequest,
    job: &StorageJob,
    receiver: Receiver<Chunk>,
) -> Result<ImportResult, AppError> {
    receive_audio_with_timeout(store, request, job, receiver, Duration::from_secs(30))
}

fn receive_audio_with_timeout(
    store: &ProjectStore,
    request: AudioUploadRequest,
    job: &StorageJob,
    receiver: Receiver<Chunk>,
    idle_timeout: Duration,
) -> Result<ImportResult, AppError> {
    request.validate()?;
    let size = request.bytes;
    store.import_staged_asset(
        StagedAsset {
            project_id: &request.project_id,
            name: &request.name,
            kind: AssetKind::Original,
            bytes: size,
        },
        &job.cancel,
        |file, progress| {
            let mut written = 0;
            let mut last = Instant::now();
            while written < size {
                canceled(&job.cancel)?;
                if last.elapsed() >= idle_timeout {
                    return Err(AppError::new(
                        "UPLOAD_TIMEOUT",
                        "파일 전송이 중단되어 임시 파일을 정리했습니다.",
                        true,
                    ));
                }
                let chunk = match receiver.recv_timeout(Duration::from_millis(100)) {
                    Ok(chunk) => chunk,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return Err(canceled_upload()),
                };
                let data = &chunk.body[HEADER..];
                let result = (|| {
                    canceled(&job.cancel)?;
                    if chunk.offset != written || data.len() as u64 > size - written {
                        return Err(AppError::invalid());
                    }
                    file.write_all(data).map_err(|_| storage_error())?;
                    written += data.len() as u64;
                    progress(written, size * 2)?;
                    Ok(written)
                })();
                if chunk
                    .reply
                    .send(result.as_ref().copied().map_err(|error| error.code))
                    .is_err()
                {
                    return Err(canceled_upload());
                }
                result?;
                last = Instant::now();
            }
            drop(receiver);
            Ok(())
        },
        |done, total| job.progress(done / 2, total / 2),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{
        database::{checked_directory, connect},
        projects_tests::Fixture,
    };
    use serde_json::json;
    use std::{fs, path::Path, sync::atomic::Ordering};

    fn request(project: &str, bytes: usize) -> AudioUploadRequest {
        serde_json::from_value(
            json!({"schemaVersion":1,"projectId":project,"name":"내 반주.wav","bytes":bytes}),
        )
        .expect("자체 계약")
    }
    fn body(id: &str, offset: u64, bytes: &[u8]) -> Vec<u8> {
        let mut value = id.as_bytes().to_vec();
        value.extend(offset.to_le_bytes());
        value.extend(bytes);
        value
    }
    fn wave(bytes: usize) -> Vec<u8> {
        let mut value = vec![0; bytes];
        value[..4].copy_from_slice(b"RIFF");
        value[8..12].copy_from_slice(b"WAVE");
        value
    }

    #[test]
    fn contract_rejects_paths_wrong_versions_unknown_fields_and_size_boundaries() {
        let base = json!({"schemaVersion":1,"projectId":uuid::Uuid::new_v4().to_string(),"name":"반주.mp3","bytes":268435456});
        let valid: AudioUploadRequest = serde_json::from_value(base.clone()).expect("상한 계약");
        valid.validate().expect("기존 음원 상한");
        for (key, value) in [
            ("schemaVersion", json!(2)),
            ("projectId", json!("../outside")),
            ("name", json!("../audio.wav")),
            ("name", json!("CON.wav")),
            ("name", json!("score.xml")),
            ("bytes", json!(0)),
            ("bytes", json!(268435457)),
        ] {
            let mut bad = base.clone();
            bad[key] = value;
            assert!(serde_json::from_value::<AudioUploadRequest>(bad)
                .expect("형식")
                .validate()
                .is_err());
        }
        for (key, value) in [
            ("sourcePath", json!("private.wav")),
            ("bytes", json!(-1)),
            ("bytes", json!(true)),
            ("bytes", json!("1")),
        ] {
            let mut bad = base.clone();
            bad[key] = value;
            assert!(serde_json::from_value::<AudioUploadRequest>(bad).is_err());
        }
    }

    #[test]
    fn multiple_chunks_keep_one_job_preserve_exact_bytes_and_reuse_the_original_asset() {
        let f = Fixture::new();
        let project = f.project();
        let uploads = AudioUploads::default();
        let jobs = StorageJobs::default();
        let bytes = wave(MAX_CHUNK * 2 + 7);
        let mut previous = None;
        for duplicate in [false, true] {
            let (job, receiver) = uploads.reserve(&jobs).expect("전송 시작");
            let id = job.snapshot().expect("job").job_id;
            let imported = std::thread::scope(|scope| {
                let worker = scope.spawn(|| {
                    receive_audio(&f.store, request(&project, bytes.len()), &job, receiver)
                });
                for (index, chunk) in bytes.chunks(MAX_CHUNK).enumerate() {
                    let offset = index * MAX_CHUNK;
                    let (same, done) = uploads
                        .append(body(&id, offset as u64, chunk))
                        .expect("조각 저장 확인");
                    assert_eq!(same, id);
                    assert_eq!(done, (offset + chunk.len()) as u64);
                    assert!(jobs.is_active());
                    assert!(jobs.start("RUNNING").is_err());
                }
                worker.join().expect("worker 종료").expect("원본 commit")
            });
            uploads.release(&id).expect("전송 연결 정리");
            assert_eq!(imported.duplicate, duplicate);
            assert_eq!(imported.asset.name, "내 반주.wav");
            if let Some(previous) = previous.as_ref() {
                assert_eq!(&imported.asset.id, previous);
            }
            previous = Some(imported.asset.id.clone());
            assert_eq!(
                f.store
                    .read_asset(&project, &imported.asset.id, &job.cancel, |_, _| Ok(()))
                    .expect("동일 원본"),
                bytes
            );
            assert_eq!(
                job.snapshot().expect("진행").completed_bytes,
                bytes.len() as u64
            );
            job.finish(Ok(json!({"schemaVersion":1})))
                .expect("실제 종료 후 완료");
            assert!(!jobs.is_active());
        }
        assert_eq!(f.store.assets(&project).expect("중복 미추가").len(), 1);
        assert_eq!(
            f.store.open(&project).expect("저장 head 보존").0.revision,
            0
        );
        assert_eq!(
            fs::read_dir(f.store.root.join(format!("projects/{project}/incoming")))
                .expect("임시 정리")
                .count(),
            0
        );
    }

    #[test]
    fn cancellation_bad_offset_overflow_or_database_failure_removes_only_own_staging() {
        for mode in 0..4 {
            let f = Fixture::new();
            let project = f.project();
            let uploads = AudioUploads::default();
            let jobs = StorageJobs::default();
            let incoming = checked_directory(
                &f.store.root,
                Path::new(&format!("projects/{project}/incoming")),
            )
            .expect("자체 폴더");
            fs::write(incoming.join("다른 작업.part"), b"keep").expect("타 작업 표본");
            if mode == 3 {
                connect(&f.store.root).expect("자체 DB").execute_batch("CREATE TRIGGER reject_audio BEFORE INSERT ON project_assets BEGIN SELECT RAISE(ABORT, 'test'); END;").expect("DB 실패");
            }
            let bytes = wave(64);
            let size = if mode == 2 { 63 } else { 64 };
            let (job, receiver) = uploads.reserve(&jobs).expect("시작");
            let id = job.snapshot().expect("job").job_id;
            if mode == 0 {
                job.cancel.store(true, Ordering::Release);
            }
            let error = std::thread::scope(|scope| {
                let worker = scope
                    .spawn(|| receive_audio(&f.store, request(&project, size), &job, receiver));
                if mode != 0 {
                    let result = uploads.append(body(&id, if mode == 1 { 1 } else { 0 }, &bytes));
                    if mode == 3 {
                        assert!(result.is_ok(), "최종 수신 확인은 DB commit 완료가 아닙니다");
                    } else {
                        assert!(result.is_err());
                    }
                }
                worker.join().expect("worker").err().expect("실패 정리")
            });
            assert_eq!(
                error.code,
                match mode {
                    0 => "CANCELED",
                    1 | 2 => "INVALID_INPUT",
                    _ => "STORAGE_ERROR",
                }
            );
            uploads.release(&id).expect("연결 정리");
            job.finish(Err(error)).expect("실패 종료");
            assert!(!jobs.is_active());
            assert!(f.store.assets(&project).expect("기존 DB 보존").is_empty());
            assert_eq!(fs::read_dir(&incoming).expect("다른 파일 보존").count(), 1);
            assert_eq!(
                fs::read(incoming.join("다른 작업.part")).expect("보존 내용"),
                b"keep"
            );
        }
    }

    #[test]
    fn disconnected_or_timed_out_transfers_finish_without_an_asset() {
        for timeout in [false, true] {
            let f = Fixture::new();
            let project = f.project();
            let uploads = AudioUploads::default();
            let jobs = StorageJobs::default();
            let (job, receiver) = uploads.reserve(&jobs).expect("시작");
            let id = job.snapshot().expect("job").job_id;
            if !timeout {
                uploads.release(&id).expect("송신 연결 종료");
            }
            let result = receive_audio_with_timeout(
                &f.store,
                request(&project, 64),
                &job,
                receiver,
                if timeout {
                    Duration::ZERO
                } else {
                    Duration::from_secs(30)
                },
            );
            assert_eq!(
                result.err().expect("정리 후 오류").code,
                if timeout {
                    "UPLOAD_TIMEOUT"
                } else {
                    "CANCELED"
                }
            );
            uploads.release(&id).expect("연결 정리");
            assert!(f.store.assets(&project).expect("미생성").is_empty());
            assert_eq!(
                fs::read_dir(f.store.root.join(format!("projects/{project}/incoming")))
                    .expect("자체 임시 정리")
                    .count(),
                0
            );
        }
    }

    #[test]
    fn wrong_id_empty_or_large_chunk_and_full_queue_do_not_expand_the_buffer() {
        let uploads = AudioUploads::default();
        let jobs = StorageJobs::default();
        let (job, _receiver) = uploads.reserve(&jobs).expect("시작");
        let id = job.snapshot().expect("job").job_id;
        for invalid in [
            vec![],
            body(&id, 0, &[]),
            body(&id, 0, &vec![0; MAX_CHUNK + 1]),
            body(&uuid::Uuid::new_v4().to_string(), 0, b"x"),
        ] {
            assert!(uploads.append(invalid).is_err());
        }
        let (reply, _ack) = mpsc::channel();
        uploads
            .active
            .lock()
            .expect("자체 큐")
            .as_ref()
            .expect("전송")
            .sender
            .try_send(Chunk {
                offset: 0,
                body: body(&id, 0, b"x"),
                reply,
            })
            .expect("대기 조각 하나");
        assert_eq!(
            uploads
                .append(body(&id, 0, b"x"))
                .expect_err("큐 상한")
                .code,
            "STORAGE_BUSY"
        );
        uploads.release(&id).expect("연결 정리");
    }
}
