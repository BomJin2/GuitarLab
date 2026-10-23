use crate::ipc::AppError;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use uuid::Uuid;

const MAX_BYTES: u64 = 65536;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MonitorEnvironment {
    Headphones,
    Speakers,
    Other,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileKey {
    pub device_id: String,
    pub sample_rate: u32,
    pub sample_format: String,
    pub channels: u16,
    pub channel_index: u16,
    pub buffer_frames: u64,
    pub monitor_environment: MonitorEnvironment,
}
impl ProfileKey {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.device_id.is_empty()
            || self.device_id.len() > 512
            || !(8000..=192000).contains(&self.sample_rate)
            || !["f32", "i16", "i32", "u16"].contains(&self.sample_format.as_str())
            || !(1..=32).contains(&self.channels)
            || self.channel_index >= self.channels
            || self.buffer_frames == 0
            || self.buffer_frames > 192000
        {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeviceProfile {
    pub id: String,
    pub key: ProfileKey,
    pub bias_real_ms: f64,
    pub method: String,
    pub jitter_real_ms: Option<f64>,
    pub samples_used: Option<u8>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileDocument {
    pub schema_version: u8,
    pub revision: u64,
    pub profiles: Vec<DeviceProfile>,
}
impl Default for ProfileDocument {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            profiles: Vec::new(),
        }
    }
}
impl ProfileDocument {
    pub(crate) fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1
            || self.revision > 9_007_199_254_740_991
            || self.profiles.len() > 128
        {
            return Err(storage_error());
        }
        let mut ids = std::collections::HashSet::new();
        for profile in &self.profiles {
            profile.key.validate().map_err(|_| storage_error())?;
            if Uuid::parse_str(&profile.id).is_err()
                || !ids.insert(&profile.id)
                || !profile.bias_real_ms.is_finite()
                || profile.bias_real_ms.abs() > 500.0
                || !match profile.method.as_str() {
                    "MANUAL" => profile.jitter_real_ms.is_none() && profile.samples_used.is_none(),
                    "MEASURED" => {
                        profile.jitter_real_ms.is_some_and(|value| {
                            value.is_finite() && (0.0..=750.0).contains(&value)
                        }) && profile
                            .samples_used
                            .is_some_and(|value| (8..=16).contains(&value))
                    }
                    _ => false,
                }
            {
                return Err(storage_error());
            }
        }
        if self.profiles.iter().enumerate().any(|(index, profile)| {
            self.profiles[index + 1..]
                .iter()
                .any(|other| profile.key == other.key)
        }) {
            return Err(storage_error());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveManualRequest {
    pub schema_version: u8,
    pub expected_revision: u64,
    pub expected_stream_generation: u64,
    pub bias_real_ms: f64,
    pub monitor_environment: MonitorEnvironment,
}
fn storage_error() -> AppError {
    AppError::new(
        "STORAGE_ERROR",
        "보정값을 읽거나 저장할 수 없습니다. 기존 파일을 보존했습니다.",
        true,
    )
}

pub struct ProfileStore {
    root: PathBuf,
    writer: Mutex<()>,
}
impl ProfileStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            writer: Mutex::new(()),
        }
    }
    fn directory(&self) -> Result<PathBuf, AppError> {
        if !self.root.is_absolute() {
            return Err(storage_error());
        }
        fs::create_dir_all(&self.root).map_err(|_| storage_error())?;
        let root = self.root.canonicalize().map_err(|_| storage_error())?;
        let directory = self.root.join("settings");
        fs::create_dir_all(&directory).map_err(|_| storage_error())?;
        let metadata = fs::symlink_metadata(&directory).map_err(|_| storage_error())?;
        if metadata.file_type().is_symlink()
            || !directory
                .canonicalize()
                .map_err(|_| storage_error())?
                .starts_with(&root)
        {
            return Err(storage_error());
        }
        Ok(directory)
    }
    fn read_file(path: &Path) -> Result<ProfileDocument, AppError> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(ProfileDocument::default())
            }
            Err(_) => return Err(storage_error()),
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > MAX_BYTES {
            return Err(storage_error());
        }
        let mut bytes = Vec::new();
        fs::File::open(path)
            .map_err(|_| storage_error())?
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| storage_error())?;
        if bytes.len() > MAX_BYTES as usize {
            return Err(storage_error());
        }
        let document: ProfileDocument =
            serde_json::from_slice(&bytes).map_err(|_| storage_error())?;
        document.validate()?;
        Ok(document)
    }
    pub fn list(&self) -> Result<ProfileDocument, AppError> {
        let _guard = self.writer.lock().map_err(|_| storage_error())?;
        Self::read_file(&self.directory()?.join("input-calibrations.json"))
    }
    pub fn save_manual(
        &self,
        key: ProfileKey,
        request: SaveManualRequest,
    ) -> Result<ProfileDocument, AppError> {
        key.validate()?;
        if request.schema_version != 1
            || request.expected_stream_generation == 0
            || request.expected_stream_generation > 9_007_199_254_740_991
            || !request.bias_real_ms.is_finite()
            || request.bias_real_ms.abs() > 500.0
            || request.monitor_environment != key.monitor_environment
        {
            return Err(AppError::invalid());
        }
        self.save_profile(
            DeviceProfile {
                id: Uuid::new_v4().to_string(),
                key,
                bias_real_ms: request.bias_real_ms,
                method: "MANUAL".into(),
                jitter_real_ms: None,
                samples_used: None,
            },
            request.expected_revision,
        )
    }
    pub fn save_measured(
        &self,
        key: ProfileKey,
        estimate: crate::judgement::calibration::CalibrationEstimate,
        expected_revision: u64,
    ) -> Result<ProfileDocument, AppError> {
        key.validate()?;
        let samples_used = u8::try_from(estimate.samples_used).map_err(|_| AppError::invalid())?;
        let updated = DeviceProfile {
            id: Uuid::new_v4().to_string(),
            key,
            bias_real_ms: estimate.bias_real_ms,
            method: "MEASURED".into(),
            jitter_real_ms: Some(estimate.jitter_real_ms),
            samples_used: Some(samples_used),
        };
        ProfileDocument {
            schema_version: 1,
            revision: 0,
            profiles: vec![updated.clone()],
        }
        .validate()?;
        self.save_profile(updated, expected_revision)
    }
    fn save_profile(
        &self,
        mut updated: DeviceProfile,
        expected_revision: u64,
    ) -> Result<ProfileDocument, AppError> {
        let _guard = self.writer.lock().map_err(|_| storage_error())?;
        let directory = self.directory()?;
        let destination = directory.join("input-calibrations.json");
        let mut document = Self::read_file(&destination)?;
        if document.revision != expected_revision {
            return Err(AppError::new(
                "REVISION_CONFLICT",
                "보정값이 변경되었습니다. 새로 읽은 뒤 저장하세요.",
                true,
            ));
        }
        if let Some(profile) = document
            .profiles
            .iter_mut()
            .find(|profile| profile.key == updated.key)
        {
            updated.id.clone_from(&profile.id);
            *profile = updated;
        } else {
            if document.profiles.len() >= 128 {
                return Err(storage_error());
            }
            document.profiles.push(updated);
        }
        document.revision += 1;
        document.validate()?;
        let bytes = serde_json::to_vec(&document).map_err(|_| storage_error())?;
        if bytes.len() > MAX_BYTES as usize {
            return Err(storage_error());
        }
        let temporary = directory.join(format!("input-calibrations.{}.part", Uuid::new_v4()));
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| storage_error())?;
            file.write_all(&bytes).map_err(|_| storage_error())?;
            file.sync_all().map_err(|_| storage_error())?;
            drop(file);
            fs::rename(&temporary, &destination).map_err(|_| storage_error())
        })();
        if result.is_err() && temporary.is_file() {
            fs::remove_file(&temporary).map_err(|_| storage_error())?;
        }
        result?;
        Ok(document)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        root: PathBuf,
        store: ProfileStore,
    }
    impl Fixture {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("target/profile-fixtures")
                .join(Uuid::new_v4().to_string());
            Self {
                store: ProfileStore::new(root.clone()),
                root,
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/profile-fixtures");
            if self.root.exists() {
                // 정리 오류로 최초 테스트 실패를 이중 panic으로 덮지 않습니다.
                match (self.root.canonicalize(), base.canonicalize()) {
                    (Ok(root), Ok(base)) if root.parent() == Some(base.as_path()) => {
                        if fs::remove_dir_all(root).is_err() {
                            eprintln!("자체 fixture 정리 실패: TEST_FIXTURE_CLEANUP_FAILED");
                        }
                    }
                    _ => {
                        eprintln!(
                            "fixture 경로 검증 실패로 정리 생략: TEST_FIXTURE_CLEANUP_SKIPPED"
                        );
                    }
                }
            }
        }
    }
    fn key() -> ProfileKey {
        ProfileKey {
            device_id: "local-test-input".into(),
            sample_rate: 48000,
            sample_format: "f32".into(),
            channels: 1,
            channel_index: 0,
            buffer_frames: 256,
            monitor_environment: MonitorEnvironment::Headphones,
        }
    }
    fn request(revision: u64, bias: f64) -> SaveManualRequest {
        SaveManualRequest {
            schema_version: 1,
            expected_revision: revision,
            expected_stream_generation: 1,
            bias_real_ms: bias,
            monitor_environment: MonitorEnvironment::Headphones,
        }
    }
    #[test]
    fn saves_reloads_and_preserves_profile_identity() {
        let fixture = Fixture::new();
        assert_eq!(fixture.store.list().expect("빈 설정").revision, 0);
        let first = fixture
            .store
            .save_manual(key(), request(0, 30.0))
            .expect("저장");
        let second = fixture
            .store
            .save_manual(key(), request(1, 35.0))
            .expect("수정");
        assert_eq!(first.profiles[0].id, second.profiles[0].id);
        let loaded = fixture.store.list().expect("재읽기");
        assert_eq!(loaded.revision, 2);
        assert_eq!(loaded.profiles[0].bias_real_ms, 35.0);
    }
    #[test]
    fn measured_profile_roundtrip_and_manual_override_clear_measurement_stats() {
        let fixture = Fixture::new();
        let measured = fixture
            .store
            .save_measured(
                key(),
                crate::judgement::calibration::estimate(&[30.0; 16]).expect("fixture 추정"),
                0,
            )
            .expect("측정 저장");
        let loaded = fixture.store.list().expect("재읽기");
        assert_eq!(loaded.profiles[0].method, "MEASURED");
        assert_eq!(loaded.profiles[0].samples_used, Some(16));
        assert_eq!(loaded.profiles[0].jitter_real_ms, Some(0.0));
        assert!(fixture.store.save_manual(key(), request(0, 10.0)).is_err());
        let manual = fixture
            .store
            .save_manual(key(), request(1, 10.0))
            .expect("수동 수정");
        assert_eq!(manual.profiles[0].id, measured.profiles[0].id);
        assert_eq!(manual.profiles[0].method, "MANUAL");
        assert!(manual.profiles[0].samples_used.is_none());
        assert!(manual.profiles[0].jitter_real_ms.is_none());
    }
    #[test]
    fn conflict_and_invalid_request_preserve_original_file() {
        let fixture = Fixture::new();
        fixture
            .store
            .save_manual(key(), request(0, 30.0))
            .expect("저장");
        assert!(fixture.store.save_manual(key(), request(0, 45.0)).is_err());
        assert!(fixture
            .store
            .save_manual(key(), request(1, f64::NAN))
            .is_err());
        assert_eq!(
            fixture.store.list().expect("보존").profiles[0].bias_real_ms,
            30.0
        );
    }
    #[test]
    fn corrupt_json_is_never_overwritten() {
        let fixture = Fixture::new();
        let directory = fixture.store.directory().expect("fixture 폴더");
        let path = directory.join("input-calibrations.json");
        fs::write(&path, b"invalid-original").expect("손상 fixture");
        assert!(fixture.store.save_manual(key(), request(0, 30.0)).is_err());
        assert_eq!(fs::read(path).expect("원본 확인"), b"invalid-original");
    }

    #[test]
    fn oversized_file_and_invalid_request_contract_are_rejected() {
        let fixture = Fixture::new();
        let directory = fixture.store.directory().expect("fixture 폴더");
        let path = directory.join("input-calibrations.json");
        fs::write(&path, vec![b' '; MAX_BYTES as usize + 1]).expect("크기 초과 fixture");
        assert!(fixture.store.save_manual(key(), request(0, 30.0)).is_err());
        assert_eq!(fs::metadata(path).expect("원본 크기").len(), MAX_BYTES + 1);
        assert!(serde_json::from_str::<SaveManualRequest>(r#"{"schemaVersion":1,"expectedRevision":0,"expectedStreamGeneration":1,"biasRealMs":30,"monitorEnvironment":"HEADPHONES","path":"arbitrary"}"#).is_err());
        assert!(serde_json::from_str::<SaveManualRequest>(r#"{"schemaVersion":1,"expectedRevision":0,"expectedStreamGeneration":1,"biasRealMs":30,"monitorEnvironment":"HEADPHONES"}"#).is_ok());
    }
}
