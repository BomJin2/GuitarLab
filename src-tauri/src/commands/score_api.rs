use crate::{
    ipc::AppError,
    recording::service::RecordingService,
    storage::{
        export_file::save_new_file,
        jobs::{JobSnapshot, StorageJobs},
        project_model::{ScoreDocument, ScoreRenderSource, MAX_SCORE_BYTES},
        projects::canceled,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Clone, Copy, Serialize, Deserialize)]
pub enum ExportFormat {
    #[serde(rename = "JSON")]
    Json,
    #[serde(rename = "MUSICXML")]
    MusicXml,
}
impl ExportFormat {
    fn extension(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::MusicXml => "musicxml",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportScoreRequest {
    schema_version: u8,
    format: ExportFormat,
    document: ScoreDocument,
    music_xml: Option<String>,
}
impl ExportScoreRequest {
    fn encode(&self) -> Result<Vec<u8>, AppError> {
        self.document.validate()?;
        if self.schema_version != 1
            || !matches!(
                self.document.render_source,
                Some(ScoreRenderSource::Normalized)
            )
        {
            return Err(AppError::invalid());
        }
        let document =
            serde_json::to_vec_pretty(&self.document).map_err(|_| AppError::invalid())?;
        if document.len() > MAX_SCORE_BYTES {
            return Err(AppError::invalid());
        }
        match self.format {
            ExportFormat::Json => {
                if self.music_xml.is_some() {
                    return Err(AppError::invalid());
                }
                Ok(document)
            }
            ExportFormat::MusicXml => {
                let xml = self.music_xml.as_ref().ok_or_else(AppError::invalid)?;
                if xml.len() > MAX_SCORE_BYTES || !xml.starts_with("<?xml version=\"1.0\" encoding=\"utf-8\"?><score-partwise version=\"4.0\">") || !xml.ends_with("</score-partwise>") || xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") { return Err(AppError::invalid()); }
                Ok(xml.as_bytes().to_vec())
            }
        }
    }
}
#[tauri::command]
pub async fn export_score_file(
    app: tauri::AppHandle,
    request: ExportScoreRequest,
    jobs: tauri::State<'_, Arc<StorageJobs>>,
    recording: tauri::State<'_, Arc<RecordingService>>,
) -> Result<JobSnapshot, AppError> {
    if recording.is_active() {
        return Err(AppError::new(
            "RECORDING_BUSY",
            "녹음을 저장한 뒤 악보를 출력하세요.",
            true,
        ));
    }
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let recording = recording.inner().clone();
    let job = jobs.start("PICKING")?;
    let initial = job.snapshot()?;
    super::storage_api::launch(job, move |job| {
        canceled(&job.cancel)?;
        let bytes = request.encode()?;
        canceled(&job.cancel)?;
        let extension = request.format.extension();
        let mut picker = app
            .dialog()
            .file()
            .set_title("새 악보 파일 저장")
            .add_filter("악보", &[extension])
            .set_file_name(format!("GuitarLab-score.{extension}"));
        if let Some(parent) = app.get_webview_window("main") {
            picker = picker.set_parent(&parent);
        }
        let path = picker
            .blocking_save_file()
            .ok_or_else(|| AppError::new("CANCELED", "악보 파일 출력을 취소했습니다.", false))?
            .into_path()
            .map_err(|_| AppError::invalid())?;
        canceled(&job.cancel)?;
        if recording.is_active() {
            return Err(AppError::new(
                "RECORDING_BUSY",
                "녹음을 저장한 뒤 악보를 출력하세요.",
                true,
            ));
        }
        job.progress(0, bytes.len() as u64)?;
        save_new_file(&path, &bytes, extension, &job.cancel)?;
        job.progress(bytes.len() as u64, bytes.len() as u64)?;
        Ok(json!({"schemaVersion":1,"format":request.format,"bytes":bytes.len()}))
    });
    Ok(initial)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::projects_tests::{score, Fixture};
    use std::{fs, sync::atomic::AtomicBool};

    fn request(format: ExportFormat, music_xml: Option<String>) -> ExportScoreRequest {
        let mut document = score();
        document.render_source = Some(ScoreRenderSource::Normalized);
        ExportScoreRequest {
            schema_version: 1,
            format,
            document,
            music_xml,
        }
    }
    #[test]
    fn export_contract_validates_document_format_xml_and_rejects_path_injection() {
        let valid = request(ExportFormat::Json, None);
        let bytes = valid.encode().expect("JSON 출력");
        let decoded: ScoreDocument = serde_json::from_slice(&bytes).expect("JSON 재입력");
        assert_eq!(
            decoded.tracks[0].notes[0].pitch_midi,
            valid.document.tracks[0].notes[0].pitch_midi
        );
        assert!(matches!(
            decoded.render_source,
            Some(ScoreRenderSource::Normalized)
        ));
        let xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?><score-partwise version=\"4.0\"><part-list/></score-partwise>";
        assert_eq!(
            request(ExportFormat::MusicXml, Some(xml.into()))
                .encode()
                .expect("XML 경계"),
            xml.as_bytes()
        );
        for invalid in [
            None,
            Some("not xml".into()),
            Some(xml.replace(
                "<part-list/>",
                "<!DOCTYPE score SYSTEM \"file:///private\">",
            )),
            Some(xml.replace(
                "<part-list/>",
                "<!ENTITY x SYSTEM \"https://example.invalid\">",
            )),
        ] {
            assert!(request(ExportFormat::MusicXml, invalid).encode().is_err());
        }
        assert!(request(ExportFormat::Json, Some(xml.into()))
            .encode()
            .is_err());
        let mut invalid = request(ExportFormat::Json, None);
        invalid.document.tracks[0].notes[0].pitch_midi = 200;
        assert!(invalid.encode().is_err());
        for extra in [
            json!({"schemaVersion":1,"format":"WAV","document":valid.document}),
            json!({"schemaVersion":1,"format":"JSON","document":score(),"path":"C:/outside.json"}),
        ] {
            assert!(serde_json::from_value::<ExportScoreRequest>(extra).is_err());
        }
    }
    #[test]
    fn new_json_and_xml_export_preserve_sources_refuse_collision_and_cancel() {
        let fixture = Fixture::new();
        let source = fixture.store.root.join("source.musicxml");
        let original = b"<?xml version=\"1.0\"?><score-partwise/>";
        fs::write(&source, original).expect("자체 원본");
        let bytes = request(ExportFormat::Json, None)
            .encode()
            .expect("출력 데이터");
        let path = fixture.store.root.join("new.json");
        save_new_file(&path, &bytes, "json", &AtomicBool::new(false)).expect("새 파일");
        assert_eq!(fs::read(&path).expect("검증"), bytes);
        assert_eq!(
            save_new_file(&path, b"overwrite", "json", &AtomicBool::new(false))
                .expect_err("덮어쓰기 거부")
                .code,
            "EXPORT_DESTINATION_EXISTS"
        );
        assert_eq!(fs::read(&path).expect("보존"), bytes);
        let xml_path = fixture.store.root.join("new.musicxml");
        save_new_file(&xml_path, original, "musicxml", &AtomicBool::new(false))
            .expect("새 XML 파일");
        assert_eq!(fs::read(&xml_path).expect("XML 파일 검증"), original);
        let canceled_path = fixture.store.root.join("canceled.musicxml");
        assert_eq!(
            save_new_file(&canceled_path, b"xml", "musicxml", &AtomicBool::new(true))
                .expect_err("취소")
                .code,
            "CANCELED"
        );
        assert!(!canceled_path.exists());
        assert!(save_new_file(
            &fixture.store.root.join("wrong.exe"),
            &bytes,
            "json",
            &AtomicBool::new(false)
        )
        .is_err());
        assert_eq!(fs::read(&source).expect("원본 보존"), original);
    }
}
