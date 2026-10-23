use crate::{audio::dsp::Sample, ipc::AppError};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc::{SyncSender, TrySendError},
    Arc, Mutex,
};

#[derive(Clone)]
pub enum RecordingMessage {
    Sample(Sample),
    Boundary,
}
#[derive(Clone)]
pub struct RecordingRoute {
    pub sender: SyncSender<RecordingMessage>,
    pub start_ns: u64,
    pub started: Arc<AtomicBool>,
    pub end_ns: Arc<AtomicU64>,
    pub dropped: Arc<AtomicU64>,
}
impl RecordingRoute {
    pub fn push(&self, sample: Sample) {
        if !self.started.load(Ordering::Acquire) {
            if sample.captured_ns < self.start_ns {
                return;
            }
            self.started.store(true, Ordering::Release);
        }
        if sample.captured_ns >= self.end_ns.load(Ordering::Acquire) {
            let _ = self.sender.try_send(RecordingMessage::Boundary);
            return;
        }
        if let Err(TrySendError::Full(_)) = self.sender.try_send(RecordingMessage::Sample(sample)) {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}
#[derive(Default)]
pub struct RecordingRouter(Mutex<Option<RecordingRoute>>);
impl RecordingRouter {
    pub fn route(&self) -> Result<Option<RecordingRoute>, AppError> {
        Ok(self.0.lock().map_err(|_| AppError::internal())?.clone())
    }
    pub fn attach(&self, route: RecordingRoute) -> Result<(), AppError> {
        let mut active = self.0.lock().map_err(|_| AppError::internal())?;
        if active.is_some() {
            return Err(super::model::record_error("RECORDING_BUSY"));
        }
        *active = Some(route);
        Ok(())
    }
    pub fn detach(&self) -> Result<(), AppError> {
        self.0.lock().map_err(|_| AppError::internal())?.take();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    #[test]
    fn rec_start_filter_does_not_remove_later_index_on_timestamp_overlap() {
        let (sender, receiver) = mpsc::sync_channel(8);
        let route = RecordingRoute {
            sender,
            start_ns: 100,
            started: Arc::new(AtomicBool::new(false)),
            end_ns: Arc::new(AtomicU64::new(u64::MAX)),
            dropped: Arc::new(AtomicU64::new(0)),
        };
        for (index, ns) in [(0, 98), (1, 99), (2, 100), (3, 99), (4, 101)] {
            route.push(Sample {
                index,
                captured_ns: ns,
                value: 0.5,
            });
        }
        for expected in [2, 3, 4] {
            assert!(
                matches!(receiver.try_recv(),Ok(RecordingMessage::Sample(sample)) if sample.index==expected)
            );
        }
        assert!(receiver.try_recv().is_err());
        assert_eq!(route.dropped.load(Ordering::Relaxed), 0);
    }
}
