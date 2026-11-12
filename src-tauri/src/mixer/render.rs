use super::{
    model::*,
    pcm::{self, Pcm},
};
use crate::{
    ipc::AppError,
    recording::{model::RecordingState, wave},
    storage::{
        project_model::AssetKind,
        projects::{canceled, ProjectStore},
    },
};
use serde::Serialize;
use std::{io::Cursor, sync::atomic::AtomicBool};

/// docs/12 "믹스 입력 한도 v2": 디코딩한 mono f32 합계. 화면 믹스 준비(읽은 바이트 합계)와 같은 값입니다.
pub const INPUT_BUDGET: usize = 512 * 1024 * 1024;
// 10분 반주 + 10분 테이크(48kHz)가 들어가야 합니다.
const _: () = assert!(INPUT_BUDGET >= 2 * 48_000 * 600 * 4);
pub const OUTPUT_RATE: u32 = 48000;
struct Input {
    pcm: Pcm,
    start_ms: f64,
    gain: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixStats {
    pub schema_version: u8,
    pub frames: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub peak: f64,
    pub limited_frames: u64,
    pub bytes: usize,
    /// Freeze 캐시를 쓴 TAKE 레이어 수.
    pub frozen_layers: u32,
}

pub fn validate_sources(
    store: &ProjectStore,
    mix: &MixDocument,
    cancel: &AtomicBool,
) -> Result<(), AppError> {
    canceled(cancel)?;
    mix.validate()?;
    store.open(&mix.project_id)?;
    let assets = store.assets(&mix.project_id)?;
    for layer in &mix.layers {
        canceled(cancel)?;
        match layer.kind {
            LayerKind::Take => {
                if store.take(&mix.project_id, &layer.id)?.state != RecordingState::Ready {
                    return Err(mix_error("MIX_TAKE_NOT_READY"));
                }
            }
            LayerKind::LocalAsset => {
                if !assets
                    .iter()
                    .any(|a| a.id == layer.id && a.kind == AssetKind::Original && a.available)
                {
                    return Err(mix_error("MIX_SOURCE_UNAVAILABLE"));
                }
            }
            LayerKind::Stem => {
                crate::ai::stem_store::read_stem(store, &mix.project_id, &layer.id, None, cancel)?;
            }
            LayerKind::ImportedStem => {
                store.read_imported_guitar_stem(&mix.project_id, &layer.id, cancel)?;
            }
            LayerKind::Render => {
                store.read_take_bounce(&mix.project_id, &layer.id, cancel)?;
            }
        }
    }
    Ok(())
}
pub fn render(
    store: &ProjectStore,
    mix: &MixDocument,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64, u64) -> Result<(), AppError>,
) -> Result<(Vec<u8>, MixStats), AppError> {
    canceled(cancel)?;
    validate_sources(store, mix, cancel)?;
    let mut budget = INPUT_BUDGET;
    let mut inputs = Vec::new();
    let frozen: Vec<String> = store
        .take_freezes(&mix.project_id)?
        .into_iter()
        .map(|f| f.take_id)
        .collect();
    let mut frozen_layers = 0u32;
    for layer in &mix.layers {
        canceled(cancel)?;
        if !mix.audible(layer) || layer.gain == 0.0 {
            continue;
        }
        let (bytes, start_ms, used_freeze, recorded_rate) =
            layer_source(store, mix, layer, &frozen, budget, None, cancel)?;
        // 배속 녹음 테이크의 WAV 내보내기는 지원하지 않습니다(R6 결정 2, 재생만 Rust가 늘임).
        if recorded_rate != 1.0 {
            return Err(mix_error("MIX_RATE_UNSUPPORTED"));
        }
        if used_freeze {
            frozen_layers += 1;
        }
        inputs.push(Input {
            pcm: pcm::decode(&bytes, &mut budget, cancel)?,
            start_ms,
            gain: layer.gain,
        });
    }
    let duration = inputs
        .iter()
        .map(|i| i.start_ms + i.pcm.samples.len() as f64 / f64::from(i.pcm.rate) * 1000.0)
        .fold(0.0, f64::max);
    let frames = (duration / 1000.0 * f64::from(OUTPUT_RATE)).ceil() as u64;
    if frames == 0 {
        return Err(mix_error("MIX_EMPTY"));
    }
    if frames > wave::frame_limit(OUTPUT_RATE) {
        return Err(mix_error("MIX_LIMIT_EXCEEDED"));
    }
    let mut writer = wave::WaveWriter::new(
        Cursor::new(Vec::with_capacity((frames * 4 + 58) as usize)),
        OUTPUT_RATE,
    )
    .map_err(|_| mix_error("MIX_RENDER_FAILED"))?;
    let mut peak = 0.0f64;
    let mut limited = 0;
    for frame in 0..frames {
        if frame.is_multiple_of(4096) {
            canceled(cancel)?;
            progress(frame * 4, frames * 4)?;
        }
        let time = frame as f64 / f64::from(OUTPUT_RATE) * 1000.0;
        let mut value = 0.0;
        for input in &inputs {
            let pos = (time - input.start_ms) / 1000.0 * f64::from(input.pcm.rate);
            if pos < 0.0 || pos >= input.pcm.samples.len() as f64 {
                continue;
            }
            let index = pos.floor() as usize;
            let a = f64::from(input.pcm.samples[index]);
            let b = f64::from(
                *input
                    .pcm
                    .samples
                    .get(index + 1)
                    .unwrap_or(&input.pcm.samples[index]),
            );
            value += (a + (b - a) * (pos - index as f64)) * input.gain;
        }
        value *= mix.master_gain;
        peak = peak.max(value.abs());
        if value.abs() > 1.0 {
            limited += 1;
        }
        writer
            .push(value.clamp(-1.0, 1.0) as f32)
            .map_err(|_| mix_error("MIX_RENDER_FAILED"))?;
    }
    canceled(cancel)?;
    let bytes = writer
        .finish()
        .map_err(|_| mix_error("MIX_RENDER_FAILED"))?
        .into_inner();
    progress(frames * 4, frames * 4)?;
    let stats = MixStats {
        schema_version: 1,
        frames,
        sample_rate: OUTPUT_RATE,
        channels: 1,
        peak,
        limited_frames: limited,
        bytes: bytes.len(),
        frozen_layers,
    };
    Ok((bytes, stats))
}
/// 레이어 하나의 원본 바이트와 곡 위 시작 시각(ms), Freeze 캐시 사용 여부, 녹음 배속(테이크·Bounce가 아니면 1).
/// 출력 믹스와 네이티브 재생이 함께 씁니다.
pub(crate) fn layer_source(
    store: &ProjectStore,
    mix: &MixDocument,
    layer: &MixLayer,
    frozen: &[String],
    budget: usize,
    // 분리 음원(STEM)은 이 반주에서 만든 것만 받습니다(None이면 확인하지 않음).
    stem_asset: Option<&str>,
    cancel: &AtomicBool,
) -> Result<(Vec<u8>, f64, bool, f64), AppError> {
    Ok(match layer.kind {
        LayerKind::ImportedStem => (
            store
                .read_imported_guitar_stem(&mix.project_id, &layer.id, cancel)?
                .1,
            layer.offset_ms,
            false,
            1.0,
        ),
        LayerKind::Stem => (
            crate::ai::stem_store::read_stem(
                store,
                &mix.project_id,
                &layer.id,
                stem_asset,
                cancel,
            )?,
            layer.offset_ms,
            false,
            1.0,
        ),
        LayerKind::Take => {
            let take = store.take(&mix.project_id, &layer.id)?;
            let recorded = take.transport.as_ref().map_or(1.0, |t| t.rate);
            if take.frames as usize > budget / 4 {
                return Err(mix_error("MIX_LIMIT_EXCEEDED"));
            }
            let start =
                take.song_start_ms.unwrap_or(0.0) + take.alignment_offset_ms + layer.offset_ms;
            // docs/12 "테이크 Freeze v1": Freeze된 테이크는 처리된 캐시(tail 포함)를 씁니다.
            if frozen.contains(&layer.id) {
                (
                    store
                        .read_take_freeze(&mix.project_id, &layer.id, cancel)?
                        .1,
                    start,
                    true,
                    recorded,
                )
            } else {
                (
                    store.recording_bytes(&mix.project_id, &layer.id, cancel)?,
                    start,
                    false,
                    recorded,
                )
            }
        }
        LayerKind::Render => {
            // 시작 시각은 원본 테이크와 같은 규칙입니다.
            let (meta, bytes) = store.read_take_bounce(&mix.project_id, &layer.id, cancel)?;
            let take = store.take(&mix.project_id, &meta.take_id)?;
            (
                bytes,
                take.song_start_ms.unwrap_or(0.0) + take.alignment_offset_ms + layer.offset_ms,
                false,
                take.transport.as_ref().map_or(1.0, |t| t.rate),
            )
        }
        LayerKind::LocalAsset => {
            let info = store
                .assets(&mix.project_id)?
                .into_iter()
                .find(|a| a.id == layer.id)
                .ok_or_else(|| mix_error("MIX_SOURCE_UNAVAILABLE"))?;
            if info.bytes > INPUT_BUDGET as u64 {
                return Err(mix_error("MIX_LIMIT_EXCEEDED"));
            }
            (
                store.read_asset(&mix.project_id, &layer.id, cancel, |_, _| Ok(()))?,
                layer.offset_ms,
                false,
                1.0,
            )
        }
    })
}
