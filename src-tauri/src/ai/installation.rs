use super::{error, run_request};
use crate::ipc::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::atomic::AtomicBool, time::Duration};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum ModelId {
    #[serde(rename = "basic-pitch")]
    BasicPitch,
    #[serde(rename = "htdemucs_6s")]
    Demucs,
}
impl ModelId {
    pub fn version(self) -> &'static str {
        match self {
            Self::BasicPitch => "0.4.0",
            Self::Demucs => "4.1.0",
        }
    }
    pub fn setup(self) -> ModelSetupPlan {
        match self {
            Self::BasicPitch => ModelSetupPlan {
                id: "basic-pitch",
                version: "0.4.0",
                folder: "basic-pitch-0.4.0-cp310",
                cache: "basic-pitch-0.4.0-windows-cp310",
                marker: "basic-pitch-active.json",
                plan_hash: "55a4a2252034be7389673313f35b36ea7cfd49c54984b0827bd6b29699218c2a",
                self_test: "OWNED_8_NOTES_PASSED",
                development: ".venv-basic-pitch",
            },
            Self::Demucs => ModelSetupPlan {
                id: "htdemucs_6s",
                version: "4.1.0",
                folder: "demucs-4.1.0-cp310",
                cache: "demucs-4.1.0-htdemucs-6s-windows-cp310",
                marker: "demucs-active.json",
                plan_hash: "0b4407faad80689e6b0a0c51816a1077eb7650cb20ec094ee1dc6132adc5e33d",
                self_test: "OWNED_STEM_SPLIT_PASSED",
                development: ".venv-demucs",
            },
        }
    }
    pub fn setup_for(self, portable: bool) -> ModelSetupPlan {
        let mut plan = self.setup();
        if portable {
            match self {
                Self::BasicPitch => {
                    plan.folder = "basic-pitch-0.4.0-onnx1-cp312";
                    plan.cache = "basic-pitch-0.4.0-onnx1-windows-cp312";
                    plan.marker = "basic-pitch-cp312-active.json";
                    plan.plan_hash =
                        "e4d75fa2a10e92de7dbb1c828d2102bc0bd76092f766892e41ddb7cde44989f1";
                }
                Self::Demucs => {
                    plan.folder = "demucs-4.1.0-cp312";
                    plan.cache = "demucs-4.1.0-htdemucs-6s-windows-cp312";
                    plan.marker = "demucs-cp312-active.json";
                    plan.plan_hash =
                        "2d7760f72cc5cc07aa25cf120b7d478b720941c2513109393d78b3014c70a5e7";
                }
            }
        }
        plan
    }
}
pub struct ModelSetupPlan {
    pub id: &'static str,
    pub version: &'static str,
    pub folder: &'static str,
    pub cache: &'static str,
    pub marker: &'static str,
    pub plan_hash: &'static str,
    pub self_test: &'static str,
    pub development: &'static str,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallationInfo {
    schema_version: u8,
    model_id: ModelId,
    model_version: String,
    python_version: String,
    state: String,
}
pub fn validate(value: &Value, model: ModelId) -> Result<(), AppError> {
    let info: InstallationInfo =
        serde_json::from_value(value.clone()).map_err(|_| error("AI_PROTOCOL_INVALID"))?;
    if info.schema_version != 1
        || info.model_id != model
        || info.model_version != model.version()
        || info.state != "FILES_VERIFIED"
        || !(info.python_version == "3.12.15"
            || info
                .python_version
                .strip_prefix("3.10.")
                .is_some_and(|patch| {
                    !patch.is_empty()
                        && patch.len() <= 3
                        && patch.bytes().all(|c| c.is_ascii_digit())
                }))
    {
        return Err(error("AI_PROTOCOL_INVALID"));
    }
    Ok(())
}
pub fn verify(
    model: ModelId,
    root: &std::path::Path,
    job_id: &str,
    cancel: &AtomicBool,
) -> Result<Value, AppError> {
    verify_with_resources(model, root, job_id, cancel, None)
}
pub fn verify_with_resources(
    model: ModelId,
    root: &std::path::Path,
    job_id: &str,
    cancel: &AtomicBool,
    resources: Option<&std::path::Path>,
) -> Result<Value, AppError> {
    let command = super::managed::model_command_with_resources(root, model, resources, cancel)?;
    run_request(
        command,
        job_id,
        cancel,
        Duration::from_secs(10),
        json!({"protocolVersion":1,"type":"start","jobId":job_id,"action":"verify_model","modelId":model}),
        |_| Ok(()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installation_report_requires_exact_model_version_and_no_quality_claim() {
        let value = json!({"schemaVersion":1,"modelId":"basic-pitch","modelVersion":"0.4.0","pythonVersion":"3.10.8","state":"FILES_VERIFIED"});
        validate(&value, ModelId::BasicPitch).expect("설치 파일 검증 응답");
        let mut supported = value.clone();
        supported["pythonVersion"] = json!("3.12.15");
        validate(&supported, ModelId::BasicPitch).expect("고정 cp312 설치 확인");
        assert!(validate(&value, ModelId::Demucs).is_err());
        for (field, bad) in [
            ("state", json!("READY")),
            ("modelVersion", json!("0.5.0")),
            ("pythonVersion", json!("private/path")),
            ("pythonVersion", json!("3.10.")),
            ("pythonVersion", json!("3.12.14")),
            ("pythonVersion", json!("3.12.16")),
            ("pythonVersion", json!("3.11.15")),
            ("usable", json!(true)),
        ] {
            let mut invalid = value.clone();
            invalid[field] = bad;
            assert!(validate(&invalid, ModelId::BasicPitch).is_err());
        }
    }
    #[test]
    fn model_verification_protocol_rejects_foreign_report_and_early_completion() {
        let mut protocol = super::super::Protocol {
            action: super::super::Action::Verify(ModelId::BasicPitch),
            ..Default::default()
        };
        let completed = json!({"protocolVersion":1,"jobId":"fixture","type":"completed","result":{
            "schemaVersion":1,"modelId":"htdemucs_6s","modelVersion":"4.1.0","pythonVersion":"3.10.8","state":"FILES_VERIFIED"}});
        assert!(protocol
            .receive(&serde_json::to_vec(&completed).expect("응답"), "fixture")
            .is_err());
        let progress = json!({"protocolVersion":1,"jobId":"fixture","type":"progress","stage":"environment","percent":100});
        protocol
            .receive(&serde_json::to_vec(&progress).expect("진행"), "fixture")
            .expect("진행 검증");
        assert!(protocol
            .receive(&serde_json::to_vec(&completed).expect("응답"), "fixture")
            .is_err());
        assert!(serde_json::from_value::<ModelId>(json!("private/path")).is_err());
    }
    #[test]
    #[ignore = "승인 설치된 두 개발 환경이 필요하며 추론/다운로드하지 않습니다"]
    fn actual_installed_files_are_verified_without_inference() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        for model in [ModelId::BasicPitch, ModelId::Demucs] {
            let result = verify(
                model,
                &root,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(false),
            )
            .expect("실제 설치 검증");
            validate(&result, model).expect("정확한 결과");
        }
        assert_eq!(
            verify(
                ModelId::BasicPitch,
                &root,
                &uuid::Uuid::new_v4().to_string(),
                &AtomicBool::new(true)
            )
            .expect_err("취소")
            .code,
            "CANCELED"
        );
    }
}
