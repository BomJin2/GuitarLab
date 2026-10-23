use crate::{
    diagnostics::{Diagnostics, Snapshot},
    ipc::AppError,
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    schema_version: u8,
}
impl Request {
    fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn get_local_diagnostics(
    request: Request,
    diagnostics: tauri::State<'_, Arc<Diagnostics>>,
) -> Result<Snapshot, AppError> {
    request.validate()?;
    let service = diagnostics.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.snapshot())
        .await
        .map_err(|_| {
            AppError::new(
                "DIAGNOSTICS_UNAVAILABLE",
                "로컬 진단을 읽지 못했습니다.",
                true,
            )
        })?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn request_accepts_only_current_version_without_path_or_text() {
        serde_json::from_str::<Request>(r#"{"schemaVersion":1}"#)
            .expect("요청")
            .validate()
            .expect("버전");
        for raw in [
            r#"{"schemaVersion":2}"#,
            r#"{"schemaVersion":1,"path":"private"}"#,
            r#"{"schemaVersion":1,"message":"private"}"#,
        ] {
            assert!(serde_json::from_str::<Request>(raw)
                .map_or(true, |request| request.validate().is_err()));
        }
    }
}
