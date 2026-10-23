use crate::{ipc::AppError, recording::wave, storage::projects::canceled};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::atomic::AtomicBool,
};
use uuid::Uuid;

fn export_error(code: &'static str) -> AppError {
    AppError::new(
        code,
        "새 파일을 저장하지 못했습니다. 기존 파일은 보존했습니다.",
        true,
    )
}
pub fn save_new_file(
    path: &Path,
    bytes: &[u8],
    extension: &str,
    cancel: &AtomicBool,
) -> Result<(), AppError> {
    canceled(cancel)?;
    if !["wav", "json", "musicxml"].contains(&extension)
        || !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|v| v.eq_ignore_ascii_case(extension))
    {
        return Err(AppError::invalid());
    }
    if fs::symlink_metadata(path).is_ok() {
        return Err(export_error("EXPORT_DESTINATION_EXISTS"));
    }
    let parent = path
        .parent()
        .ok_or_else(AppError::invalid)?
        .canonicalize()
        .map_err(|_| export_error("EXPORT_IO"))?;
    if wave::available_bytes(&parent).map_err(|_| export_error("EXPORT_IO"))?
        < bytes.len() as u64 + 1024 * 1024
    {
        return Err(export_error("DISK_SPACE_LOW"));
    }
    let destination = parent.join(path.file_name().ok_or_else(AppError::invalid)?);
    let partial = parent.join(format!(".guitarlab-export-{}.part", Uuid::new_v4()));
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial)
        .map_err(|_| export_error("EXPORT_IO"))?;
    let result = (|| {
        for chunk in bytes.chunks(65536) {
            canceled(cancel)?;
            output
                .write_all(chunk)
                .map_err(|_| export_error("EXPORT_IO"))?;
        }
        output.flush().map_err(|_| export_error("EXPORT_IO"))?;
        output.sync_all().map_err(|_| export_error("EXPORT_IO"))?;
        drop(output);
        canceled(cancel)?;
        // 완성 파일만 공개하며 동시 생성된 목적지도 덮어쓰지 않습니다.
        fs::hard_link(&partial, &destination).map_err(|e| {
            export_error(if e.kind() == std::io::ErrorKind::AlreadyExists {
                "EXPORT_DESTINATION_EXISTS"
            } else {
                "EXPORT_IO"
            })
        })?;
        Ok(())
    })();
    if fs::remove_file(&partial).is_err() {
        eprintln!("GuitarLab 출력 임시 파일 정리 실패: EXPORT_TEMP_CLEANUP_FAILED");
    }
    result
}
