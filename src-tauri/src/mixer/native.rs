//! docs/12 "네이티브 재생 v1"(재생 Rust 이전 R2): 믹스의 모든 레이어를 엔진 샘플레이트 stereo로 풀어 재생 버스 보이스로 만듭니다.
use super::{
    model::{mix_error, LayerKind, MixDocument},
    pcm,
    render::{layer_source, validate_sources, INPUT_BUDGET},
};
use crate::{
    audio::playback_bus::{BusVoice, VoiceSet},
    ipc::AppError,
    storage::projects::{canceled, ProjectStore},
};
use std::sync::{atomic::AtomicBool, Arc};

struct NativeLayer {
    id: String,
    left: Arc<[f32]>,
    right: Arc<[f32]>,
    /// 레이어 offset을 뺀 곡 위 시작 시각(ms). offset만 바뀌면 다시 풀지 않습니다.
    base_ms: f64,
}
pub struct NativeMix {
    pub project_id: String,
    pub sample_rate: u32,
    layers: Vec<NativeLayer>,
}

/// 변환 결과가 새로 차지할 바이트(예산 안이어야 함).
fn extra_budget(
    len: usize,
    from: u32,
    to: u32,
    channels: usize,
    budget: usize,
) -> Result<usize, AppError> {
    resampled_len(len, from, to)
        .checked_mul(4 * channels)
        .filter(|n| *n <= budget)
        .ok_or_else(|| mix_error("MIX_LIMIT_EXCEEDED"))
}
fn resampled_len(len: usize, from: u32, to: u32) -> usize {
    if from == to {
        return len;
    }
    (len as u64 * u64::from(to)).div_ceil(u64::from(from)) as usize
}
/// 선형 보간 변환(출력 믹스와 같은 방식).
fn resample(source: Vec<f32>, from: u32, to: u32) -> Vec<f32> {
    if from == to || source.is_empty() {
        return source;
    }
    let frames = resampled_len(source.len(), from, to);
    let step = f64::from(from) / f64::from(to);
    (0..frames)
        .map(|i| {
            let pos = i as f64 * step;
            let index = (pos.floor() as usize).min(source.len() - 1);
            let a = source[index];
            let b = *source.get(index + 1).unwrap_or(&a);
            a + (b - a) * (pos - index as f64) as f32
        })
        .collect()
}

pub fn load(
    store: &ProjectStore,
    mix: &MixDocument,
    sample_rate: u32,
    // 화면의 현재 반주(로컬 음원). 테이크·분리 음원이 이 반주 기준인지 확인합니다(docs/12 믹스 준비).
    backing: Option<&str>,
    cancel: &AtomicBool,
) -> Result<NativeMix, AppError> {
    validate_sources(store, mix, cancel)?;
    let frozen: Vec<String> = store
        .take_freezes(&mix.project_id)?
        .into_iter()
        .map(|f| f.take_id)
        .collect();
    // 테이크는 이 믹스의 반주로 녹음한 것이어야 합니다(화면 믹스 준비와 같은 규칙, docs/12).
    let backing = backing.or_else(|| {
        mix.layers
            .iter()
            .find(|l| l.kind == LayerKind::LocalAsset)
            .map(|l| l.id.as_str())
    });
    if let Some(backing) = backing {
        for layer in mix.layers.iter().filter(|l| l.kind == LayerKind::Take) {
            if store
                .take(&mix.project_id, &layer.id)?
                .transport
                .is_some_and(|t| t.backing_asset_id != backing)
            {
                return Err(mix_error("RECORDING_REFERENCE_INVALID"));
            }
        }
    }
    let mut budget = INPUT_BUDGET;
    let mut layers = Vec::with_capacity(mix.layers.len());
    // 음소거·음량 0 레이어도 풀어 두어야 재생 중 켜고 끌 때 다시 읽지 않습니다.
    for layer in &mix.layers {
        canceled(cancel)?;
        let (bytes, start_ms, _) =
            layer_source(store, mix, layer, &frozen, budget, backing, cancel)?;
        let (left, right) = pcm::decode_stereo(&bytes, &mut budget, cancel)?;
        drop(bytes);
        let rate = left.rate;
        // 변환 결과도 할당 전에 예산에서 뺍니다(8kHz 원본을 192kHz로 늘리는 경우 등).
        // 같은 샘플레이트면 디코딩 때 이미 뺐으므로 추가로 검사하지 않습니다.
        if rate != sample_rate {
            let channels = if right.is_some() { 2 } else { 1 };
            budget -= extra_budget(left.samples.len(), rate, sample_rate, channels, budget)?;
        }
        let left: Arc<[f32]> = resample(left.samples, rate, sample_rate).into();
        let right = match right {
            Some(right) => resample(right, rate, sample_rate).into(),
            None => left.clone(),
        };
        layers.push(NativeLayer {
            id: layer.id.clone(),
            left,
            right,
            base_ms: start_ms - layer.offset_ms,
        });
    }
    Ok(NativeMix {
        project_id: mix.project_id.clone(),
        sample_rate,
        layers,
    })
}

impl NativeMix {
    /// 같은 레이어 구성의 믹스 설정(음량·mute·solo·offset)으로 보이스 묶음을 만듭니다. 구성이 바뀌면 거부합니다.
    pub fn voices(&self, mix: &MixDocument) -> Result<VoiceSet, AppError> {
        mix.validate()?;
        if mix.project_id != self.project_id
            || mix.layers.len() != self.layers.len()
            || mix
                .layers
                .iter()
                .zip(&self.layers)
                .any(|(a, b)| a.id != b.id)
        {
            return Err(AppError::new(
                "NATIVE_MIX_CHANGED",
                "믹스 레이어 구성이 바뀌었습니다. 믹스를 다시 준비하세요.",
                true,
            ));
        }
        let rate = f64::from(self.sample_rate);
        Ok(VoiceSet {
            sample_rate: self.sample_rate,
            voices: mix
                .layers
                .iter()
                .zip(&self.layers)
                .map(|(layer, native)| BusVoice {
                    left: native.left.clone(),
                    right: native.right.clone(),
                    start_frame: ((native.base_ms + layer.offset_ms) * rate / 1000.0).round()
                        as i64,
                    gain: if mix.audible(layer) {
                        (layer.gain * mix.master_gain) as f32
                    } else {
                        0.0
                    },
                })
                .collect(),
        })
    }
    pub fn duration_ms(&self, mix: &MixDocument) -> f64 {
        mix.layers
            .iter()
            .zip(&self.layers)
            .map(|(layer, n)| {
                n.base_ms
                    + layer.offset_ms
                    + n.left.len() as f64 * 1000.0 / f64::from(self.sample_rate)
            })
            .fold(0.0, f64::max)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resample_keeps_endpoints_and_length_ratio() {
        assert_eq!(resample(vec![1.0, 2.0], 1000, 1000), vec![1.0, 2.0]);
        let up = resample(vec![0.0, 1.0, 2.0, 3.0], 1000, 2000);
        assert_eq!(up.len(), 8);
        assert_eq!(&up[..4], &[0.0, 0.5, 1.0, 1.5]);
        let down = resample(vec![0.0, 1.0, 2.0, 3.0], 2000, 1000);
        assert_eq!(down, vec![0.0, 2.0]);
        // 8kHz 10분 mono(원본 약 19MB)를 192kHz로 늘리면 약 461MB라, 두 개만 돼도 예산(512MiB)을 넘습니다(할당 없이 크기만 계산).
        let grown = resampled_len(8000 * 600, 8000, 192_000) * 4;
        assert!(grown < super::INPUT_BUDGET && grown * 2 > super::INPUT_BUDGET);
        assert_eq!(resampled_len(48000, 48000, 48000), 48000);
        assert!(extra_budget(8000 * 600, 8000, 192_000, 1, grown).is_ok());
        assert_eq!(
            extra_budget(8000 * 600, 8000, 192_000, 1, grown - 1).map_err(|e| e.code),
            Err("MIX_LIMIT_EXCEEDED")
        );
    }
}
