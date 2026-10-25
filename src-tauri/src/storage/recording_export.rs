use super::{
    export_file::save_new_file_with_progress,
    projects::{canceled, ProjectStore},
};
use crate::{
    ipc::AppError,
    recording::{model::record_error, wave},
};
use serde::Serialize;
use std::{path::Path, sync::atomic::AtomicBool};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingExport {
    schema_version: u8,
    state: &'static str,
    project_id: String,
    take_id: String,
    bytes: u64,
    sha256: String,
}

impl ProjectStore {
    pub fn export_recording(
        &self,
        project_id: &str,
        take_id: &str,
        path: &Path,
        cancel: &AtomicBool,
        progress: impl Fn(u64, u64) -> Result<(), AppError>,
    ) -> Result<RecordingExport, AppError> {
        canceled(cancel)?;
        let take = self.take(project_id, take_id)?;
        let sha256 = take
            .sha256
            .clone()
            .ok_or_else(|| record_error("TAKE_NOT_READY"))?;
        let parent = path
            .parent()
            .ok_or_else(AppError::invalid)?
            .canonicalize()
            .map_err(|_| AppError::invalid())?;
        if !path.is_absolute()
            || parent.starts_with(self.root.canonicalize().map_err(|_| AppError::invalid())?)
        {
            return Err(AppError::invalid());
        }
        progress(0, wave::HEADER_BYTES + take.frames * 4)?;
        let bytes = self.recording_bytes(project_id, take_id, cancel)?;
        if bytes.get(..wave::HEADER_BYTES as usize)
            != Some(
                wave::header(take.sample_rate, take.frames)
                    .map_err(|_| record_error("WAV_INVALID"))?
                    .as_slice(),
            )
        {
            return Err(record_error("WAV_INVALID"));
        }
        save_new_file_with_progress(path, &bytes, "wav", cancel, progress)?;
        Ok(RecordingExport {
            schema_version: 1,
            state: "RECORDING_EXPORTED",
            project_id: take.project_id,
            take_id: take.id,
            bytes: bytes.len() as u64,
            sha256,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        recording::model::RecordingTransport,
        storage::{
            project_model::{AssetKind, AssetStorage},
            projects_tests::Fixture,
            recordings_tests::{prepared, write_part},
        },
    };
    use std::{fs, sync::atomic::Ordering};

    #[test]
    fn exports_original_bytes_at_half_speed_and_keeps_metadata() {
        let f = Fixture::new();
        let no = AtomicBool::new(false);
        let mut take = prepared(&f);
        let destination = f.store.root.parent().expect("자체 경로").join("녹음.wav");
        let audio = destination.with_file_name("반주.wav");
        let mut writer = wave::create(&audio, 48000).expect("자체 반주");
        writer.push(0.2).expect("샘플");
        wave::finish(writer).expect("WAV");
        let asset = f
            .store
            .import_asset(
                &take.project_id,
                &audio,
                AssetKind::Original,
                AssetStorage::Managed,
                &no,
                |_, _| Ok(()),
            )
            .expect("반주");
        take.transport = Some(RecordingTransport {
            playback_epoch: 1,
            rate: 0.5,
            backing_asset_id: asset.asset.id,
        });
        take.song_start_ms = Some(1000.0);
        take.alignment_offset_ms = 123.0;
        write_part(&f, &mut take, 48000, true);
        f.store.finalize_take(&mut take).expect("READY");
        let original = f
            .store
            .recording_bytes(&take.project_id, &take.id, &no)
            .expect("원본");
        let before = serde_json::to_value(&take).expect("메타데이터");
        let done = std::cell::Cell::new(0);
        let result = f
            .store
            .export_recording(&take.project_id, &take.id, &destination, &no, |n, total| {
                assert!(n >= done.get() && n <= total);
                done.set(n);
                Ok(())
            })
            .expect("출력");
        assert_eq!(fs::read(&destination).expect("복사"), original);
        assert_eq!(result.sha256, take.sha256.clone().expect("SHA"));
        assert_eq!(result.bytes, done.get());
        assert_eq!(
            serde_json::to_value(f.store.take(&take.project_id, &take.id).expect("원본 유지"))
                .expect("JSON"),
            before
        );
        assert_eq!(
            f.store
                .recording_bytes(&take.project_id, &take.id, &no)
                .expect("SHA 유지"),
            original
        );
    }

    #[test]
    fn export_refuses_collision_internal_path_foreign_take_and_removes_canceled_partials() {
        let f = Fixture::new();
        let no = AtomicBool::new(false);
        let mut take = prepared(&f);
        write_part(&f, &mut take, 48000, true);
        f.store.finalize_take(&mut take).expect("READY");
        let folder = f.store.root.parent().expect("자체 경로").join("출력");
        fs::create_dir(&folder).expect("새 폴더");
        let destination = folder.join("take.wav");
        for late in [false, true] {
            let cancel = AtomicBool::new(!late);
            assert_eq!(
                f.store
                    .export_recording(
                        &take.project_id,
                        &take.id,
                        &destination,
                        &cancel,
                        |n, total| {
                            if n == total {
                                cancel.store(true, Ordering::Release);
                            }
                            Ok(())
                        }
                    )
                    .expect_err("초기/게시 전 취소")
                    .code,
                "CANCELED"
            );
            assert_eq!(fs::read_dir(&folder).expect("정리").count(), 0);
        }
        assert!(f
            .store
            .export_recording(&take.project_id, &take.id, &destination, &no, |n, _| {
                if n > 0 {
                    Err(AppError::invalid())
                } else {
                    Ok(())
                }
            })
            .is_err());
        assert_eq!(fs::read_dir(&folder).expect("진행 오류 정리").count(), 0);
        assert_eq!(
            f.store
                .export_recording(&take.project_id, &take.id, &destination, &no, |n, total| {
                    if n == total {
                        fs::write(&destination, b"keep").expect("동시 목적지 생성");
                    }
                    Ok(())
                })
                .expect_err("게시 시점 충돌")
                .code,
            "EXPORT_DESTINATION_EXISTS"
        );
        assert_eq!(fs::read_dir(&folder).expect("임시 파일 정리").count(), 1);
        assert_eq!(
            fs::read(&destination).expect("동시 생성 파일 보존"),
            b"keep"
        );
        assert_eq!(
            f.store
                .export_recording(&take.project_id, &take.id, &destination, &no, |_, _| Ok(()))
                .expect_err("충돌")
                .code,
            "EXPORT_DESTINATION_EXISTS"
        );
        assert_eq!(fs::read(&destination).expect("불변"), b"keep");
        assert!(f
            .store
            .export_recording(
                &take.project_id,
                &take.id,
                &f.store.root.join("new.wav"),
                &no,
                |_, _| Ok(())
            )
            .is_err());
        let foreign = f.project();
        assert!(f
            .store
            .export_recording(
                &foreign,
                &take.id,
                &folder.join("foreign.wav"),
                &no,
                |_, _| Ok(())
            )
            .is_err());
        let revision = f
            .store
            .list()
            .expect("프로젝트")
            .into_iter()
            .find(|p| p.id == take.project_id)
            .expect("항목")
            .revision;
        f.store
            .trash_project(&take.project_id, revision, &no)
            .expect("보관");
        assert!(f
            .store
            .export_recording(
                &take.project_id,
                &take.id,
                &folder.join("trash.wav"),
                &no,
                |_, _| Ok(())
            )
            .is_err());
        assert_eq!(fs::read_dir(folder).expect("기존만 유지").count(), 1);
    }

    #[test]
    fn export_does_not_publish_corrupt_missing_or_unfinished_originals() {
        use sha2::{Digest, Sha256};
        let f = Fixture::new();
        let no = AtomicBool::new(false);
        let mut take = prepared(&f);
        write_part(&f, &mut take, 48000, true);
        let destination = f.store.root.parent().expect("자체 경로").join("new.wav");
        assert!(f
            .store
            .export_recording(&take.project_id, &take.id, &destination, &no, |_, _| Ok(()))
            .is_err());
        f.store.finalize_take(&mut take).expect("READY");
        let path = f.store.recording_path(&take, false).expect("원본");
        let mut bytes = fs::read(&path).expect("원본");
        bytes[0] = b'X';
        fs::write(&path, &bytes).expect("자체 손상");
        assert_eq!(
            f.store
                .export_recording(&take.project_id, &take.id, &destination, &no, |_, _| Ok(()))
                .expect_err("SHA 거부")
                .code,
            "WAV_INVALID"
        );
        take.sha256 = Some(crate::storage::projects::hex(
            Sha256::digest(&bytes).as_ref(),
        ));
        f.store.save_take(&take).expect("손상 헤더와 맞는 SHA");
        assert_eq!(
            f.store
                .export_recording(&take.project_id, &take.id, &destination, &no, |_, _| Ok(()))
                .expect_err("헤더 거부")
                .code,
            "WAV_INVALID"
        );
        assert!(!destination.exists());
        assert_eq!(fs::read(&path).expect("손상 원본 유지"), bytes);
        fs::remove_file(&path).expect("자체 누락 주입");
        assert_eq!(
            f.store
                .export_recording(&take.project_id, &take.id, &destination, &no, |_, _| Ok(()))
                .expect_err("누락")
                .code,
            "TAKE_FILE_MISSING"
        );
        assert!(!destination.exists());
    }
}
