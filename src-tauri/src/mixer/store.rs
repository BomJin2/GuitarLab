use super::{model::*, render::validate_sources};
use crate::{
    ipc::AppError,
    storage::{
        database::connect,
        project_model::{storage_error, validate_uuid},
        projects::{hash, ProjectStore},
    },
};
use rusqlite::{params, OptionalExtension};

impl ProjectStore {
    pub fn mix(&self, project_id: &str) -> Result<Option<MixDocument>, AppError> {
        validate_uuid(project_id)?;
        self.open(project_id)?;
        let db = connect(&self.root)?;
        let row: Option<(String, String)> = db
            .query_row(
                "SELECT document_json,document_sha256 FROM project_mixes WHERE project_id=?1",
                [project_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|_| storage_error())?;
        row.map(|(json, digest)| {
            if json.len() > 16384 || hash(json.as_bytes()) != digest {
                return Err(storage_error());
            }
            let mix: MixDocument = serde_json::from_str(&json).map_err(|_| storage_error())?;
            mix.validate().map_err(|_| storage_error())?;
            if mix.project_id != project_id {
                return Err(storage_error());
            }
            Ok(mix)
        })
        .transpose()
    }
    pub fn save_mix(&self, mix: &MixDocument) -> Result<(), AppError> {
        validate_sources(self, mix, &std::sync::atomic::AtomicBool::new(false))?;
        let _guard = self.writer.lock().map_err(|_| storage_error())?;
        let db = connect(&self.root)?;
        self.summary(&db, &mix.project_id)?;
        let json = serde_json::to_string(mix).map_err(|_| storage_error())?;
        db.execute("INSERT INTO project_mixes(project_id,document_json,document_sha256) VALUES(?1,?2,?3) ON CONFLICT(project_id) DO UPDATE SET document_json=excluded.document_json,document_sha256=excluded.document_sha256",params![mix.project_id,json,hash(json.as_bytes())]).map_err(|_|storage_error())?;
        Ok(())
    }
}
