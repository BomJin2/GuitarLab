use super::{
    database::checked_directory,
    project_model::{storage_error, validate_uuid, AssetKind, AssetStorage},
    projects::{canceled, ImportResult, ProjectStore},
};
use crate::ipc::AppError;
use serde::Deserialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::atomic::AtomicBool,
};
use uuid::Uuid;

const MAX_SCORE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreUpload {
    schema_version: u8,
    pub project_id: String,
    name: String,
}

impl ScoreUpload {
    fn validate(&self, bytes: &[u8]) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        let path = Path::new(&self.name);
        let stem = self
            .name
            .split('.')
            .next()
            .unwrap_or_default()
            .trim_end()
            .to_ascii_uppercase();
        let port = stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"));
        let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
            || port.is_some_and(|suffix| {
                (suffix.len() == 1 && suffix.as_bytes()[0].is_ascii_digit())
                    || ["¹", "²", "³"].contains(&suffix)
            });
        if self.schema_version != 1
            || bytes.is_empty()
            || bytes.len() > MAX_SCORE_BYTES
            || self.name.is_empty()
            || self.name.len() > 512
            || self.name.chars().count() > 200
            || self.name.trim() != self.name
            || self.name.ends_with('.')
            || reserved
            || self
                .name
                .chars()
                .any(|c| c.is_control() || "/\\:<>\"|?*".contains(c))
            || !path.file_stem().is_some_and(|v| !v.is_empty())
            || !path.extension().and_then(|v| v.to_str()).is_some_and(|v| {
                ["gp", "gp3", "gp4", "gp5", "gpx", "xml", "musicxml", "json"]
                    .contains(&v.to_ascii_lowercase().as_str())
            })
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }

    pub fn decode(body: &[u8]) -> Result<(Self, &[u8]), AppError> {
        if body.len() < 5 || body.len() > MAX_SCORE_BYTES + 1028 {
            return Err(AppError::invalid());
        }
        let length =
            u32::from_le_bytes(body[..4].try_into().map_err(|_| AppError::invalid())?) as usize;
        if length == 0 || length > 1024 || 4 + length >= body.len() {
            return Err(AppError::invalid());
        }
        let metadata: Self =
            serde_json::from_slice(&body[4..4 + length]).map_err(|_| AppError::invalid())?;
        let bytes = &body[4 + length..];
        metadata.validate(bytes)?;
        Ok((metadata, bytes))
    }
}

impl ProjectStore {
    pub fn import_score_upload(
        &self,
        request: &ScoreUpload,
        bytes: &[u8],
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<ImportResult, AppError> {
        request.validate(bytes)?;
        canceled(cancel)?;
        self.open(&request.project_id)?;
        let parent = checked_directory(
            &self.root,
            Path::new(&format!("projects/{}/incoming", request.project_id)),
        )?;
        let folder = parent.join(Uuid::new_v4().to_string());
        fs::create_dir(&folder).map_err(|_| storage_error())?;
        let source = folder.join(&request.name);
        let mut created = false;
        let size = bytes.len() as u64;
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&source)
                .map_err(|_| storage_error())?;
            created = true;
            progress(0, size * 2)?;
            let mut done = 0;
            for chunk in bytes.chunks(65536) {
                canceled(cancel)?;
                file.write_all(chunk).map_err(|_| storage_error())?;
                done += chunk.len() as u64;
                progress(done, size * 2)?;
            }
            file.sync_all().map_err(|_| storage_error())?;
            drop(file);
            canceled(cancel)?;
            self.import_asset(
                &request.project_id,
                &source,
                AssetKind::ScoreImport,
                AssetStorage::Managed,
                cancel,
                |done, total| progress(size + done, size + total),
            )
        })();
        // 이번 호출이 만든 임시 파일과 빈 UUID 폴더만 정리합니다.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{database::connect, projects_tests::Fixture};
    use serde_json::{json, Value};
    use std::sync::atomic::Ordering;

    fn body(metadata: Value, bytes: &[u8]) -> Vec<u8> {
        let json = serde_json::to_vec(&metadata).expect("자체 메타데이터");
        let mut result = (json.len() as u32).to_le_bytes().to_vec();
        result.extend(json);
        result.extend(bytes);
        result
    }

    #[test]
    fn envelope_rejects_paths_versions_unknown_fields_empty_and_oversized_payloads() {
        let valid = json!({"schemaVersion":1,"projectId":Uuid::new_v4().to_string(),"name":"기타.musicxml"});
        assert!(ScoreUpload::decode(&body(valid.clone(), b"<score/>")).is_ok());
        for name in [
            "../x.musicxml",
            "C:\\x.musicxml",
            "x/y.musicxml",
            "CON.musicxml",
            "CON .musicxml",
            "COM¹.xml",
            "LPT1.xml",
            "x.wav",
            "a\n.musicxml",
            " a.xml",
            "a.xml.",
        ] {
            let mut invalid = valid.clone();
            invalid["name"] = json!(name);
            assert!(
                ScoreUpload::decode(&body(invalid, b"<score/>")).is_err(),
                "{name}"
            );
        }
        for (key, value) in [
            ("schemaVersion", json!(2)),
            ("projectId", json!("../escape")),
            ("path", json!("private.xml")),
        ] {
            let mut invalid = valid.clone();
            invalid[key] = value;
            assert!(ScoreUpload::decode(&body(invalid, b"<score/>")).is_err());
        }
        for bytes in [vec![], vec![0; MAX_SCORE_BYTES + 1]] {
            assert!(ScoreUpload::decode(&body(valid.clone(), &bytes)).is_err());
        }
        for invalid in [
            vec![],
            vec![1, 0, 0],
            vec![0, 0, 0, 0, 1],
            vec![1, 4, 0, 0, 1],
            vec![255; 1028],
        ] {
            assert!(ScoreUpload::decode(&invalid).is_err());
        }
    }

    #[test]
    fn upload_preserves_basename_and_original_bytes_and_reuses_duplicate_without_changing_head() {
        let f = Fixture::new();
        let project = f.project();
        let bytes = include_bytes!("../../../fixtures/blank.musicxml");
        let raw = body(
            json!({"schemaVersion":1,"projectId":project,"name":"내 악보.musicxml"}),
            bytes,
        );
        let (request, data) = ScoreUpload::decode(&raw).expect("정상 계약");
        let cancel = AtomicBool::new(false);
        let imported = f
            .store
            .import_score_upload(&request, data, &cancel, |done, total| {
                assert!(done <= total);
                assert_eq!(total, 2 * bytes.len() as u64);
                Ok(())
            })
            .expect("drop 복사");
        assert!(!imported.duplicate);
        assert_eq!(imported.asset.name, "내 악보.musicxml");
        assert_eq!(imported.asset.storage, AssetStorage::Managed);
        assert_eq!(
            f.store
                .read_asset(&project, &imported.asset.id, &cancel, |_, _| Ok(()))
                .expect("관리용 원본"),
            bytes
        );
        let duplicate = f
            .store
            .import_score_upload(&request, data, &cancel, |_, _| Ok(()))
            .expect("중복");
        assert!(duplicate.duplicate);
        assert_eq!(duplicate.asset.id, imported.asset.id);
        let (summary, revision, assets) = f.store.open(&project).expect("다시 열기");
        assert_eq!(summary.revision, 0);
        assert!(revision.is_none());
        assert_eq!(assets.len(), 1);
        assert_eq!(
            fs::read_dir(f.store.root.join(format!("projects/{project}/incoming")))
                .expect("임시 정리")
                .count(),
            0
        );
    }

    #[test]
    fn canceled_invalid_or_failed_upload_cleans_only_its_staging_and_new_asset() {
        for mode in 0..4 {
            let f = Fixture::new();
            let project = f.project();
            let incoming = checked_directory(
                &f.store.root,
                Path::new(&format!("projects/{project}/incoming")),
            )
            .expect("자체 폴더");
            fs::write(incoming.join("다른 작업.part"), b"keep").expect("다른 파일");
            let bytes = if mode == 1 {
                b"invalid".as_slice()
            } else {
                b"<score-partwise/>".as_slice()
            };
            let raw = body(
                json!({"schemaVersion":1,"projectId":project,"name":"기타.xml"}),
                bytes,
            );
            let (request, data) = ScoreUpload::decode(&raw).expect("정상 외피");
            if mode == 3 {
                connect(&f.store.root).expect("자체 DB").execute_batch("CREATE TRIGGER reject_upload BEFORE INSERT ON project_assets BEGIN SELECT RAISE(ABORT, 'test'); END;").expect("DB 실패");
            }
            let cancel = AtomicBool::new(false);
            let error = f
                .store
                .import_score_upload(&request, data, &cancel, |_, _| {
                    if mode == 0 {
                        cancel.store(true, Ordering::Release);
                    }
                    if mode == 2 {
                        return Err(storage_error());
                    }
                    Ok(())
                })
                .err()
                .expect("실패/취소");
            assert_eq!(
                error.code,
                match mode {
                    0 => "CANCELED",
                    1 => "FILE_INVALID",
                    _ => "STORAGE_ERROR",
                }
            );
            assert!(f.store.assets(&project).expect("자산 미생성").is_empty());
            assert_eq!(
                fs::read_dir(&incoming).expect("다른 파일만 유지").count(),
                1
            );
            assert_eq!(
                fs::read(incoming.join("다른 작업.part")).expect("내용 보존"),
                b"keep"
            );
        }
    }
}
