use crate::{ipc::AppError, storage::project_model::validate_uuid};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LayerKind {
    Take,
    LocalAsset,
    Stem,
    ImportedStem,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MixLayer {
    pub kind: LayerKind,
    pub id: String,
    pub gain: f64,
    pub mute: bool,
    pub solo: bool,
    pub offset_ms: f64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MixDocument {
    pub schema_version: u8,
    pub project_id: String,
    pub master_gain: f64,
    pub layers: Vec<MixLayer>,
}
impl MixDocument {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_uuid(&self.project_id)?;
        let mut ids = HashSet::new();
        if self.schema_version != 1
            || !gain_valid(self.master_gain)
            || self.layers.len() > 8
            || self
                .layers
                .iter()
                .filter(|l| l.kind == LayerKind::LocalAsset)
                .count()
                > 1
        {
            return Err(AppError::invalid());
        }
        for layer in &self.layers {
            validate_uuid(&layer.id)?;
            if !ids.insert(&layer.id)
                || !gain_valid(layer.gain)
                || !layer.offset_ms.is_finite()
                || layer.offset_ms.abs() > 60000.0
            {
                return Err(AppError::invalid());
            }
        }
        Ok(())
    }
    pub fn audible(&self, layer: &MixLayer) -> bool {
        !layer.mute && (!self.layers.iter().any(|l| l.solo) || layer.solo)
    }
}
fn gain_valid(value: f64) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}
pub fn mix_error(code: &'static str) -> AppError {
    AppError::new(code, "믹스 작업을 완료하지 못했습니다. 지원 형식·설정·저장 위치를 확인하세요. 원본은 보존됩니다.", true)
}
