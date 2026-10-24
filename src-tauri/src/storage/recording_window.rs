use super::projects::{canceled, hex, ProjectStore};
use crate::{
    ipc::AppError,
    recording::{
        model::{record_error, RecordedTake, RecordingState},
        wave,
    },
};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, sync::atomic::AtomicBool};

impl ProjectStore {
    pub(crate) fn recording_window(
        &self,
        take: &RecordedTake,
        start_frame: u64,
        frames: u32,
        cancel: &AtomicBool,
        progress: impl Fn(u64, u64) -> Result<(), AppError>,
    ) -> Result<Vec<f32>, AppError> {
        canceled(cancel)?;
        let current = self.take(&take.project_id, &take.id)?;
        // 읽기 전 불변 WAV 메타데이터를 대조해 오래된 스냅샷의 분석을 막습니다.
        if current.state != RecordingState::Ready
            || current.dropped_frames > 0
            || !current.warning_intervals.is_empty()
            || current.frames != take.frames
            || current.sample_rate != take.sample_rate
            || current.sha256 != take.sha256
        {
            return Err(record_error("CHORD_TAKE_UNVERIFIED"));
        }
        if frames == 0
            || frames > take.sample_rate
            || start_frame
                .checked_add(u64::from(frames))
                .is_none_or(|end| end > take.frames)
        {
            return Err(AppError::invalid());
        }
        let path = self.recording_path(&current, false)?;
        let mut file = File::open(path).map_err(|_| record_error("TAKE_FILE_MISSING"))?;
        let len = wave::HEADER_BYTES + take.frames * 4;
        if file
            .metadata()
            .map_err(|_| record_error("WAV_INVALID"))?
            .len()
            != len
            || len > wave::MAX_BYTES
        {
            return Err(record_error("WAV_INVALID"));
        }
        progress(0, len)?;
        let mut header = [0; wave::HEADER_BYTES as usize];
        file.read_exact(&mut header)
            .map_err(|_| record_error("WAV_INVALID"))?;
        if header
            != wave::header(take.sample_rate, take.frames)
                .map_err(|_| record_error("WAV_INVALID"))?
        {
            return Err(record_error("WAV_INVALID"));
        }
        let mut hash = Sha256::new();
        hash.update(header);
        let start = wave::HEADER_BYTES + start_frame * 4;
        let end = start + u64::from(frames) * 4;
        let mut pcm = Vec::with_capacity(frames as usize);
        let mut completed = wave::HEADER_BYTES;
        let mut buffer = [0_u8; 65536];
        while completed < len {
            canceled(cancel)?;
            let size = (len - completed).min(buffer.len() as u64) as usize;
            file.read_exact(&mut buffer[..size])
                .map_err(|_| record_error("WAV_INVALID"))?;
            hash.update(&buffer[..size]);
            let from = start.saturating_sub(completed).min(size as u64) as usize;
            let to = end.saturating_sub(completed).min(size as u64) as usize;
            for bytes in buffer[from..to].as_chunks::<4>().0 {
                let value = f32::from_le_bytes(*bytes);
                if !value.is_finite() {
                    return Err(record_error("WAV_INVALID"));
                }
                pcm.push(value);
            }
            completed += size as u64;
            progress(completed, len)?;
        }
        let mut extra = [0_u8; 1];
        if file
            .read(&mut extra)
            .map_err(|_| record_error("WAV_INVALID"))?
            != 0
            || Some(hex(hash.finalize().as_ref())) != take.sha256
            || pcm.len() != frames as usize
        {
            return Err(record_error("WAV_INVALID"));
        }
        canceled(cancel)?;
        Ok(pcm)
    }
}
