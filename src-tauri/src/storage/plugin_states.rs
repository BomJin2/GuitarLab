//! docs/12 "프로젝트 AmpliTube 톤 v1": 프로젝트마다 플러그인 상태 blob 하나를 저장합니다.
use crate::{
    ipc::AppError,
    storage::{
        database::connect,
        project_model::{storage_error, validate_uuid},
        projects::{hash, ProjectStore},
    },
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

const STATE_FORMAT: &str = "VST3_HOST_SNAPSHOT";
const MAX_STATE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginStateRequest {
    pub schema_version: u8,
    pub project_id: String,
}
impl PluginStateRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != 1 {
            return Err(AppError::invalid());
        }
        validate_uuid(&self.project_id)
    }
}

/// 화면에 주는 요약입니다(blob은 보내지 않음).
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPluginState {
    pub schema_version: u8,
    pub project_id: String,
    pub saved: bool,
    pub class_id: Option<String>,
    pub plugin_version: Option<String>,
    pub bytes: Option<u64>,
}

#[derive(Debug)]
pub struct StoredPluginState {
    pub class_id: String,
    pub plugin_version: String,
    pub state: Vec<u8>,
}
impl StoredPluginState {
    pub fn summary(project_id: &str, value: Option<&Self>) -> ProjectPluginState {
        ProjectPluginState {
            schema_version: 1,
            project_id: project_id.to_string(),
            saved: value.is_some(),
            class_id: value.map(|v| v.class_id.clone()),
            plugin_version: value.map(|v| v.plugin_version.clone()),
            bytes: value.map(|v| v.state.len() as u64),
        }
    }
    fn valid(&self) -> bool {
        self.class_id.len() == 32
            && self.class_id.bytes().all(|b| b.is_ascii_hexdigit())
            && (1..=64).contains(&self.plugin_version.len())
            && !self.plugin_version.chars().any(char::is_control)
            && (1..=MAX_STATE_BYTES).contains(&self.state.len())
    }
}

impl ProjectStore {
    pub fn plugin_state(&self, project_id: &str) -> Result<Option<StoredPluginState>, AppError> {
        validate_uuid(project_id)?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        let row = db
            .query_row(
                "SELECT class_id,plugin_version,state_format,state,state_sha256 FROM project_plugin_states WHERE project_id=?1",
                [project_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Vec<u8>>(3)?,
                        r.get::<_, String>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(|_| storage_error())?;
        row.map(|(class_id, plugin_version, format, state, digest)| {
            let value = StoredPluginState {
                class_id,
                plugin_version,
                state,
            };
            // 손상된 blob은 플러그인에 넣지 않습니다.
            if format != STATE_FORMAT || !value.valid() || hash(&value.state) != digest {
                return Err(storage_error());
            }
            Ok(value)
        })
        .transpose()
    }
    pub fn save_plugin_state(
        &self,
        project_id: &str,
        value: &StoredPluginState,
    ) -> Result<(), AppError> {
        validate_uuid(project_id)?;
        if value.state.len() > MAX_STATE_BYTES {
            return Err(AppError::new(
                "PLUGIN_STATE_TOO_LARGE",
                "AmpliTube 상태가 8MB보다 커서 저장하지 않았습니다.",
                true,
            ));
        }
        if !value.valid() {
            return Err(AppError::new(
                "PLUGIN_STATE_FAILED",
                "AmpliTube 상태를 받지 못했습니다.",
                true,
            ));
        }
        let _guard = self.writer.lock().map_err(|_| storage_error())?;
        let db = connect(&self.root)?;
        self.summary(&db, project_id)?;
        db.execute(
            "INSERT INTO project_plugin_states(project_id,class_id,plugin_version,state_format,state,state_sha256) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(project_id) DO UPDATE SET class_id=excluded.class_id,plugin_version=excluded.plugin_version,state_format=excluded.state_format,state=excluded.state,state_sha256=excluded.state_sha256",
            params![project_id, value.class_id, value.plugin_version, STATE_FORMAT, value.state, hash(&value.state)],
        )
        .map_err(|_| storage_error())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::projects_tests::Fixture;

    fn stored(state: Vec<u8>) -> StoredPluginState {
        StoredPluginState {
            class_id: "56535441746235616D706C6974756265".into(),
            plugin_version: "5.10.4".into(),
            state,
        }
    }
    #[test]
    fn state_round_trips_per_project_and_rejects_bad_or_corrupt_rows() {
        let f = Fixture::new();
        let (a, b) = (f.project(), f.project());
        assert!(f.store.plugin_state(&a).expect("없음").is_none());
        f.store
            .save_plugin_state(&a, &stored(vec![1, 2, 3]))
            .expect("저장");
        f.store
            .save_plugin_state(&a, &stored(vec![4, 5]))
            .expect("덮어쓰기");
        assert_eq!(
            f.store.plugin_state(&a).expect("읽기").expect("있음").state,
            [4, 5]
        );
        assert!(f.store.plugin_state(&b).expect("다른 프로젝트").is_none());
        assert_eq!(
            f.store
                .save_plugin_state(&a, &stored(vec![0; MAX_STATE_BYTES + 1]))
                .expect_err("큼")
                .code,
            "PLUGIN_STATE_TOO_LARGE"
        );
        assert_eq!(
            f.store
                .save_plugin_state(&a, &stored(Vec::new()))
                .expect_err("빈 상태")
                .code,
            "PLUGIN_STATE_FAILED"
        );
        let mut bad = stored(vec![1]);
        bad.class_id = "../x".into();
        assert!(f.store.save_plugin_state(&a, &bad).is_err());
        let missing = uuid::Uuid::new_v4().to_string();
        assert!(f
            .store
            .save_plugin_state(&missing, &stored(vec![1]))
            .is_err());
        let summary = StoredPluginState::summary(&a, Some(&stored(vec![4, 5])));
        assert_eq!(summary.bytes, Some(2));
        assert!(serde_json::to_value(&summary)
            .expect("직렬화")
            .get("state")
            .is_none());
        // 바이트가 바뀌면 SHA가 맞지 않아 읽지 않습니다.
        let db = connect(&f.store.root).expect("DB");
        db.execute(
            "UPDATE project_plugin_states SET state=X'0405FF' WHERE project_id=?1",
            [&a],
        )
        .expect("손상 fixture");
        assert_eq!(
            f.store.plugin_state(&a).expect_err("손상").code,
            "STORAGE_ERROR"
        );
        assert!(serde_json::from_str::<PluginStateRequest>(
            r#"{"schemaVersion":1,"projectId":"x","state":"AA=="}"#
        )
        .is_err());
    }
}
