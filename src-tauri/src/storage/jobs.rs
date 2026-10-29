use super::project_model::{storage_error, validate_uuid};
use crate::ipc::AppError;
use serde::Serialize;
use serde_json::Value;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub schema_version: u8,
    pub job_id: String,
    pub state: &'static str,
    pub completed_bytes: u64,
    pub total_bytes: u64,
    pub result: Option<Value>,
    pub error_code: Option<&'static str>,
}
pub struct StorageJob {
    pub cancel: AtomicBool,
    status: Mutex<JobSnapshot>,
    binary: Mutex<Option<Vec<u8>>>,
}
impl StorageJob {
    pub fn progress(&self, completed: u64, total: u64) -> Result<(), AppError> {
        self.progress_with_limit(completed, total, 256 * 1024 * 1024)
    }
    pub(crate) fn progress_with_limit(
        &self,
        completed: u64,
        total: u64,
        byte_limit: u64,
    ) -> Result<(), AppError> {
        let mut state = self.status.lock().map_err(|_| storage_error())?;
        if completed > total || total > byte_limit {
            return Err(AppError::invalid());
        }
        state.completed_bytes = completed;
        state.total_bytes = total;
        if !self.cancel.load(Ordering::Acquire) {
            state.state = "RUNNING";
        }
        Ok(())
    }
    pub fn finish(&self, result: Result<Value, AppError>) -> Result<(), AppError> {
        let mut state = self.status.lock().map_err(|_| storage_error())?;
        match result {
            Ok(value) => {
                state.state = "COMPLETED";
                state.result = Some(value);
                state.error_code = None;
            }
            Err(error) => {
                state.state = if error.code == "CANCELED" {
                    "CANCELED"
                } else {
                    "ERROR"
                };
                state.error_code = Some(error.code);
            }
        }
        Ok(())
    }
    pub fn set_binary(&self, bytes: Vec<u8>) -> Result<(), AppError> {
        if bytes.len() > 256 * 1024 * 1024 {
            return Err(AppError::invalid());
        }
        *self.binary.lock().map_err(|_| storage_error())? = Some(bytes);
        Ok(())
    }
    pub fn snapshot(&self) -> Result<JobSnapshot, AppError> {
        self.status
            .lock()
            .map(|state| state.clone())
            .map_err(|_| storage_error())
    }
}
#[derive(Default)]
pub struct StorageJobs {
    current: Mutex<Option<Arc<StorageJob>>>,
}
impl StorageJobs {
    pub fn is_active(&self) -> bool {
        self.current.lock().map_or(true, |current| {
            current.as_ref().is_some_and(|job| {
                job.snapshot().map_or(true, |status| {
                    !["COMPLETED", "CANCELED", "ERROR"].contains(&status.state)
                })
            })
        })
    }
    pub fn start(&self, state: &'static str) -> Result<Arc<StorageJob>, AppError> {
        let mut current = self.current.lock().map_err(|_| storage_error())?;
        if let Some(job) = current.as_ref() {
            if !["COMPLETED", "CANCELED", "ERROR"].contains(&job.snapshot()?.state) {
                return Err(AppError::new(
                    "STORAGE_BUSY",
                    "다른 파일 작업을 마치거나 파일 선택 창을 취소하세요.",
                    true,
                ));
            }
        }
        let job = Arc::new(StorageJob {
            cancel: AtomicBool::new(false),
            status: Mutex::new(JobSnapshot {
                schema_version: 1,
                job_id: Uuid::new_v4().to_string(),
                state,
                completed_bytes: 0,
                total_bytes: 0,
                result: None,
                error_code: None,
            }),
            binary: Mutex::new(None),
        });
        *current = Some(job.clone());
        Ok(job)
    }
    fn get(&self, id: &str) -> Result<Arc<StorageJob>, AppError> {
        validate_uuid(id)?;
        let job = self.current.lock().map_err(|_| storage_error())?.clone();
        if let Some(job) = job {
            if job.snapshot()?.job_id == id {
                return Ok(job);
            }
        }
        Err(AppError::new(
            "JOB_NOT_FOUND",
            "파일 작업을 찾을 수 없습니다.",
            false,
        ))
    }
    pub fn snapshot(&self, id: &str) -> Result<JobSnapshot, AppError> {
        self.get(id)?.snapshot()
    }
    pub fn cancel(&self, id: &str) -> Result<JobSnapshot, AppError> {
        let job = self.get(id)?;
        let mut status = job.status.lock().map_err(|_| storage_error())?;
        if !["COMPLETED", "CANCELED", "ERROR"].contains(&status.state) {
            job.cancel.store(true, Ordering::Release);
            status.state = "CANCELING";
        }
        Ok(status.clone())
    }
    pub fn take_binary(&self, id: &str) -> Result<Vec<u8>, AppError> {
        let job = self.get(id)?;
        if job.snapshot()?.state != "COMPLETED" {
            return Err(AppError::invalid());
        }
        let bytes = job
            .binary
            .lock()
            .map_err(|_| storage_error())?
            .take()
            .ok_or_else(AppError::invalid)?;
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canceled_picker_blocks_duplicate_until_finished_and_stale_cancel_does_not_touch_new_job() {
        let jobs = StorageJobs::default();
        assert!(!jobs.is_active());
        let first = jobs.start("PICKING").expect("선택 시작");
        assert!(jobs.is_active());
        let id = first.snapshot().expect("상태").job_id;
        assert_eq!(jobs.cancel(&id).expect("취소 요청").state, "CANCELING");
        assert!(jobs.is_active());
        assert!(jobs.start("PICKING").is_err());
        first
            .finish(Err(AppError::new("CANCELED", "취소", false)))
            .expect("실제 창 종료");
        assert!(!jobs.is_active());
        let second = jobs.start("RUNNING").expect("다음 시작");
        assert!(jobs.cancel(&id).is_err());
        assert!(!second.cancel.load(Ordering::Acquire));
    }
    #[test]
    fn late_cancel_cannot_claim_committed_data_rolled_back_and_binary_is_consumed_once() {
        let jobs = StorageJobs::default();
        let job = jobs.start("RUNNING").expect("시작");
        let id = job.snapshot().expect("상태").job_id;
        job.set_binary(vec![1, 2, 3]).expect("binary");
        job.progress(3, 3).expect("진행");
        jobs.cancel(&id).expect("늦은 취소");
        job.finish(Ok(Value::Null)).expect("이미 커밋 성공");
        assert_eq!(jobs.snapshot(&id).expect("완료").state, "COMPLETED");
        assert_eq!(jobs.take_binary(&id).expect("전송"), vec![1, 2, 3]);
        assert!(jobs.take_binary(&id).is_err());
    }
}
