use super::model::mix_error;
use crate::{ipc::AppError, storage::projects::canceled};
use std::sync::atomic::AtomicBool;

pub struct Pcm {
    pub rate: u32,
    pub channels: u16,
    pub peak: f64,
    pub samples: Vec<f32>,
}
fn u16_at(bytes: &[u8], i: usize) -> Result<u16, AppError> {
    Ok(u16::from_le_bytes(
        bytes
            .get(i..i + 2)
            .ok_or_else(|| mix_error("MIX_FORMAT_UNSUPPORTED"))?
            .try_into()
            .map_err(|_| mix_error("MIX_FORMAT_UNSUPPORTED"))?,
    ))
}
fn u32_at(bytes: &[u8], i: usize) -> Result<u32, AppError> {
    Ok(u32::from_le_bytes(
        bytes
            .get(i..i + 4)
            .ok_or_else(|| mix_error("MIX_FORMAT_UNSUPPORTED"))?
            .try_into()
            .map_err(|_| mix_error("MIX_FORMAT_UNSUPPORTED"))?,
    ))
}
pub fn decode(bytes: &[u8], budget: &mut usize, cancel: &AtomicBool) -> Result<Pcm, AppError> {
    let invalid = || mix_error("MIX_FORMAT_UNSUPPORTED");
    if bytes.get(..4) != Some(b"RIFF")
        || bytes.get(8..12) != Some(b"WAVE")
        || u32_at(bytes, 4)? as usize + 8 != bytes.len()
    {
        return Err(invalid());
    }
    let mut format = None;
    let mut data = None;
    let mut at = 12usize;
    while at + 8 <= bytes.len() {
        canceled(cancel)?;
        let size = u32_at(bytes, at + 4)? as usize;
        let end = at
            .checked_add(8)
            .and_then(|v| v.checked_add(size))
            .filter(|v| *v <= bytes.len())
            .ok_or_else(invalid)?;
        match &bytes[at..at + 4] {
            b"fmt " if format.is_none() && size >= 16 => {
                format = Some((
                    u16_at(bytes, at + 8)?,
                    u16_at(bytes, at + 10)?,
                    u32_at(bytes, at + 12)?,
                    u32_at(bytes, at + 16)?,
                    u16_at(bytes, at + 20)?,
                    u16_at(bytes, at + 22)?,
                ));
            }
            b"data" if data.is_none() => data = Some(&bytes[at + 8..end]),
            b"fmt " | b"data" => return Err(invalid()),
            _ => {}
        }
        at = end.checked_add(size % 2).ok_or_else(invalid)?;
    }
    if at != bytes.len() {
        return Err(invalid());
    }
    let (tag, channels, rate, byte_rate, align, bits) = format.ok_or_else(invalid)?;
    let data = data.ok_or_else(invalid)?;
    if ![1, 2].contains(&channels)
        || !(8000..=192000).contains(&rate)
        || !((tag == 1 && bits == 16) || (tag == 3 && bits == 32))
        || align != channels * (bits / 8)
        || byte_rate != rate * u32::from(align)
        || data.is_empty()
        || !data.len().is_multiple_of(usize::from(align))
    {
        return Err(invalid());
    }
    let frames = data.len() / usize::from(align);
    let needed = frames.checked_mul(4).ok_or_else(invalid)?;
    if needed > *budget || frames as u64 > u64::from(rate) * 600 {
        return Err(mix_error("MIX_LIMIT_EXCEEDED"));
    }
    *budget -= needed;
    let mut samples = Vec::with_capacity(frames);
    let mut peak = 0.0f64;
    for (i, frame) in data.chunks_exact(usize::from(align)).enumerate() {
        if i.is_multiple_of(4096) {
            canceled(cancel)?;
        }
        let mut sum = 0.0f64;
        for c in 0..usize::from(channels) {
            let value = if bits == 16 {
                i16::from_le_bytes(frame[c * 2..c * 2 + 2].try_into().map_err(|_| invalid())?)
                    as f64
                    / 32768.0
            } else {
                f32::from_le_bytes(frame[c * 4..c * 4 + 4].try_into().map_err(|_| invalid())?)
                    as f64
            };
            if !value.is_finite() {
                return Err(invalid());
            }
            peak = peak.max(value.abs());
            sum += value;
        }
        let sample = (sum / f64::from(channels)) as f32;
        if !sample.is_finite() {
            return Err(invalid());
        }
        samples.push(sample);
    }
    Ok(Pcm {
        rate,
        channels,
        peak,
        samples,
    })
}
