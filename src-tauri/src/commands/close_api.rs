use crate::{
    close_guard::{self, CloseGuard},
    ipc::AppError,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnableRequest {
    schema_version: u8,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveRequest {
    schema_version: u8,
    request_id: Uuid,
    has_unsaved_score: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    schema_version: u8,
    state: &'static str,
}
fn validate(version: u8) -> Result<(), AppError> {
    if version != 1 {
        return Err(AppError::invalid());
    }
    Ok(())
}
#[tauri::command]
pub fn enable_close_guard(
    request: EnableRequest,
    guard: tauri::State<'_, CloseGuard>,
) -> Result<Reply, AppError> {
    validate(request.schema_version)?;
    guard.enable()?;
    Ok(Reply {
        schema_version: 1,
        state: "ENABLED",
    })
}
#[tauri::command]
pub fn resolve_close_request(
    request: ResolveRequest,
    app: tauri::AppHandle,
    guard: tauri::State<'_, CloseGuard>,
) -> Result<Reply, AppError> {
    validate(request.schema_version)?;
    if guard.resolve(request.request_id, request.has_unsaved_score)? {
        close_guard::confirm_close(&app, request.request_id, false);
        Ok(Reply {
            schema_version: 1,
            state: "CONFIRMING",
        })
    } else {
        close_guard::finish_close(&app, request.request_id, true)?;
        Ok(Reply {
            schema_version: 1,
            state: "CLOSE_REQUESTED",
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strict_close_contract_rejects_unknown_fields_versions_and_bad_ids() {
        validate(
            serde_json::from_str::<EnableRequest>(r#"{"schemaVersion":1}"#)
                .expect("활성화 요청")
                .schema_version,
        )
        .expect("현재 버전");
        for raw in [
            r#"{"schemaVersion":2}"#,
            r#"{"schemaVersion":1,"path":"private"}"#,
        ] {
            assert!(serde_json::from_str::<EnableRequest>(raw)
                .map_or(true, |r| validate(r.schema_version).is_err()));
        }
        let valid = serde_json::json!({"schemaVersion":1,"requestId":Uuid::new_v4(),"hasUnsavedScore":true});
        let request: ResolveRequest = serde_json::from_value(valid.clone()).expect("현재 계약");
        validate(request.schema_version).expect("버전");
        for (key, value) in [
            ("schemaVersion", serde_json::json!(2)),
            ("requestId", serde_json::json!("bad")),
            ("hasUnsavedScore", serde_json::Value::Null),
            ("path", serde_json::json!("private")),
        ] {
            let mut bad = valid.clone();
            bad[key] = value;
            assert!(serde_json::from_value::<ResolveRequest>(bad)
                .map_or(true, |r| validate(r.schema_version).is_err()));
        }
    }
}
