use super::{
    database::checked_directory,
    project_model::{storage_error, validate_uuid, AssetKind},
    projects::{canceled, extension, ImportResult, ProjectStore},
};
use crate::ipc::AppError;
use std::{
    fs::{self, File, OpenOptions},
    path::Path,
    sync::atomic::AtomicBool,
};
use uuid::Uuid;

pub(crate) fn validate_name(name: &str, kind: AssetKind) -> Result<(), AppError> {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_uppercase();
    let port = stem
        .strip_prefix("COM")
        .or_else(|| stem.strip_prefix("LPT"));
    let reserved = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"].contains(&stem.as_str())
        || port.is_some_and(|suffix| {
            (suffix.len() == 1 && suffix.as_bytes()[0].is_ascii_digit())
                || ["¹", "²", "³"].contains(&suffix)
        });
    if name.is_empty()
        || name.len() > 512
        || name.chars().count() > 200
        || name.trim() != name
        || name.ends_with('.')
        || reserved
        || name
            .chars()
            .any(|c| c.is_control() || "/\\:<>\"|?*".contains(c))
    {
        return Err(AppError::invalid());
    }
    extension(Path::new(name), kind)?;
    Ok(())
}

pub(crate) struct StagedAsset<'a> {
    pub project_id: &'a str,
    pub name: &'a str,
    pub kind: AssetKind,
    pub bytes: u64,
}

impl ProjectStore {
    pub(crate) fn import_staged_asset(
        &self,
        asset: StagedAsset<'_>,
        cancel: &AtomicBool,
        write: impl FnOnce(
            &mut File,
            &mut dyn FnMut(u64, u64) -> Result<(), AppError>,
        ) -> Result<(), AppError>,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<ImportResult, AppError> {
        validate_uuid(asset.project_id)?;
        validate_name(asset.name, asset.kind)?;
        if asset.bytes == 0 || asset.bytes > asset.kind.max_bytes() {
            return Err(AppError::invalid());
        }
        canceled(cancel)?;
        self.open(asset.project_id)?;
        let parent = checked_directory(
            &self.root,
            Path::new(&format!("projects/{}/incoming", asset.project_id)),
        )?;
        if crate::recording::wave::available_bytes(&parent).map_err(|_| storage_error())?
            < asset.bytes * 2 + 1024 * 1024
        {
            return Err(AppError::new(
                "DISK_SPACE_LOW",
                "파일 임시 보관과 관리용 복사를 위한 공간이 부족합니다.",
                true,
            ));
        }
        let folder = parent.join(Uuid::new_v4().to_string());
        fs::create_dir(&folder).map_err(|_| storage_error())?;
        let source = folder.join(asset.name);
        let mut created = false;
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&source)
                .map_err(|_| storage_error())?;
            created = true;
            progress(0, asset.bytes * 2)?;
            write(&mut file, &mut progress)?;
            canceled(cancel)?;
            if file.metadata().map_err(|_| storage_error())?.len() != asset.bytes {
                return Err(AppError::invalid());
            }
            file.sync_all().map_err(|_| storage_error())?;
            drop(file);
            self.import_asset(
                asset.project_id,
                &source,
                asset.kind,
                super::project_model::AssetStorage::Managed,
                cancel,
                |done, total| progress(asset.bytes + done, asset.bytes + total),
            )
        })();
        let file_cleanup = if created {
            fs::remove_file(&source)
        } else {
            Ok(())
        };
        let directory_cleanup = fs::remove_dir(&folder);
        file_cleanup
            .and(directory_cleanup)
            .map_err(|_| storage_error())?;
        result
    }
}
