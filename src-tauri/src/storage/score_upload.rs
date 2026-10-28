use super::{
    asset_staging::{validate_name, StagedAsset},
    project_model::{validate_uuid, AssetKind},
    projects::{canceled, ImportResult, ProjectStore},
};
use crate::ipc::AppError;
use serde::Deserialize;
use std::{io::Write, sync::atomic::AtomicBool};

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
        if self.schema_version != 1 || bytes.is_empty() || bytes.len() > MAX_SCORE_BYTES {
            return Err(AppError::invalid());
        }
        validate_name(&self.name, AssetKind::ScoreImport)
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
        progress: impl FnMut(u64, u64) -> Result<(), AppError>,
    ) -> Result<ImportResult, AppError> {
        request.validate(bytes)?;
        let size = bytes.len() as u64;
        self.import_staged_asset(
            StagedAsset {
                project_id: &request.project_id,
                name: &request.name,
                kind: AssetKind::ScoreImport,
                bytes: size,
            },
            cancel,
            |file, progress| {
                let mut done = 0;
                for chunk in bytes.chunks(65536) {
                    canceled(cancel)?;
                    file.write_all(chunk)
                        .map_err(|_| super::project_model::storage_error())?;
                    done += chunk.len() as u64;
                    progress(done, size * 2)?;
                }
                Ok(())
            },
            progress,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{
        database::{checked_directory, connect},
        project_model::{storage_error, AssetStorage},
        projects_tests::Fixture,
    };
    use serde_json::{json, Value};
    use std::sync::atomic::Ordering;
    use std::{fs, path::Path};
    use uuid::Uuid;

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
