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

pub const INPUT_BUDGET: usize = 64 * 1024 * 1024;
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
    for layer in &mix.layers {
        canceled(cancel)?;
        if !mix.audible(layer) || layer.gain == 0.0 {
            continue;
        }
        let (bytes, start_ms) = match layer.kind {
            LayerKind::ImportedStem => (
                store
                    .read_imported_guitar_stem(&mix.project_id, &layer.id, cancel)?
                    .1,
                layer.offset_ms,
            ),
            LayerKind::Stem => (
                crate::ai::stem_store::read_stem(store, &mix.project_id, &layer.id, None, cancel)?,
                layer.offset_ms,
            ),
            LayerKind::Take => {
                let take = store.take(&mix.project_id, &layer.id)?;
                if take
                    .transport
                    .as_ref()
                    .is_some_and(|t| (t.rate - 1.0).abs() > f64::EPSILON)
                {
                    return Err(mix_error("MIX_RATE_UNSUPPORTED"));
                }
                if take.frames as usize > budget / 4 {
                    return Err(mix_error("MIX_LIMIT_EXCEEDED"));
                }
                (
                    store.recording_bytes(&mix.project_id, &layer.id, cancel)?,
                    take.song_start_ms.unwrap_or(0.0) + take.alignment_offset_ms + layer.offset_ms,
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
                )
            }
        };
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
    };
    Ok((bytes, stats))
}
