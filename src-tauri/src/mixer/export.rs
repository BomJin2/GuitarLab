use super::model::mix_error;
use crate::{ipc::AppError, storage::export_file::save_new_file};
use std::{path::Path, sync::atomic::AtomicBool};

pub fn save_new_wav(path: &Path, bytes: &[u8], cancel: &AtomicBool) -> Result<(), AppError> {
    save_new_file(path, bytes, "wav", cancel).map_err(|error| match error.code {
        "EXPORT_DESTINATION_EXISTS" => mix_error("MIX_DESTINATION_EXISTS"),
        "EXPORT_IO" => mix_error("MIX_EXPORT_IO"),
        _ => error,
    })
}
