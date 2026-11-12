//! docs/12 "네이티브 재생 v1"(재생 Rust 이전 R2): 믹스를 Rust 재생 버스로 1배속 재생합니다.
use crate::{
    audio::AudioService,
    ipc::AppError,
    mixer::{model::MixDocument, native::NativeMix},
    storage::projects::ProjectStore,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{atomic::AtomicBool, Arc, Mutex};

/// 지금 버스에 올린 믹스(레이어 PCM). 음량·mute·solo·offset만 바뀌면 다시 풀지 않습니다.
#[derive(Default)]
pub struct NativePlayback(Mutex<Option<NativeMix>>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareNativeRequest {
    pub schema_version: u8,
    pub output_device_id: String,
    pub mix: MixDocument,
    /// 화면의 현재 반주(로컬 음원 id). 없으면 믹스의 반주 레이어로 확인합니다.
    #[serde(default)]
    pub backing_asset_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateNativeRequest {
    pub schema_version: u8,
    pub mix: MixDocument,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeLoop {
    pub start_ms: f64,
    pub end_ms: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeTransportRequest {
    pub schema_version: u8,
    pub playing: bool,
    /// 없으면 위치를 그대로 둡니다(음량·구간만 바꿀 때 끊김 없이).
    pub position_ms: Option<f64>,
    pub volume: f32,
    pub r#loop: Option<NativeLoop>,
    /// R5 재생 속도(0.5~1.5, 피치 유지). 없으면 지금 속도를 유지합니다.
    #[serde(default)]
    pub rate: Option<f64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTransportSnapshot {
    pub schema_version: u8,
    pub prepared: bool,
    pub playing: bool,
    pub position_ms: f64,
    pub sample_rate: u32,
    /// 구간 끝에서 되감은 누적 횟수.
    pub loop_count: u64,
    /// R5 재생 속도.
    pub rate: f64,
    pub error_code: Option<&'static str>,
}

const MAX_MS: f64 = 1_200_000.0;
fn frame(ms: f64, rate: u32) -> Result<u64, AppError> {
    if !ms.is_finite() || !(0.0..=MAX_MS).contains(&ms) {
        return Err(AppError::invalid());
    }
    Ok((ms * f64::from(rate) / 1000.0).round() as u64)
}
fn not_prepared() -> AppError {
    AppError::new(
        "NATIVE_NOT_PREPARED",
        "네이티브 재생이 준비되지 않았습니다. 믹스를 다시 준비하세요.",
        true,
    )
}

#[tauri::command]
pub async fn prepare_native_playback(
    request: PrepareNativeRequest,
    audio: tauri::State<'_, Arc<AudioService>>,
    store: tauri::State<'_, Arc<ProjectStore>>,
    native: tauri::State<'_, Arc<NativePlayback>>,
) -> Result<Value, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let (audio, store, native) = (
        audio.inner().clone(),
        store.inner().clone(),
        native.inner().clone(),
    );
    tauri::async_runtime::spawn_blocking(move || {
        request.mix.validate()?;
        let rate = audio.with_monitor(|m| m.start_output(&request.output_device_id))??;
        let ready = (|| {
            let loaded = crate::mixer::native::load(
                &store,
                &request.mix,
                rate,
                request.backing_asset_id.as_deref(),
                &AtomicBool::new(false),
            )?;
            let voices = loaded.voices(&request.mix)?;
            let duration_ms = loaded.duration_ms(&request.mix);
            audio.with_monitor(|m| -> Result<(), AppError> {
                let bus = m.bus().ok_or_else(AppError::internal)?;
                // 다른 샘플레이트로 바뀌었으면(모니터가 그 사이 켜짐) 다시 준비하게 합니다.
                if bus.sample_rate() != rate {
                    return Err(not_prepared());
                }
                bus.pause()?;
                bus.set_voices(voices)
            })??;
            Ok::<_, AppError>((loaded, duration_ms))
        })();
        let (loaded, duration_ms) = match ready {
            Ok(ready) => ready,
            Err(error) => {
                // 이번 준비가 연 재생 출력은 닫습니다(MP3 등으로 기존 재생에 넘길 때 장치를 붙잡지 않게).
                let _ = audio.with_monitor(release_output);
                return Err(error);
            }
        };
        *native.0.lock().map_err(|_| AppError::internal())? = Some(loaded);
        Ok(json!({"schemaVersion":1,"sampleRate":rate,"durationMs":duration_ms}))
    })
    .await
    .map_err(|_| AppError::internal())?
}

#[tauri::command]
pub async fn update_native_mix(
    request: UpdateNativeRequest,
    audio: tauri::State<'_, Arc<AudioService>>,
    native: tauri::State<'_, Arc<NativePlayback>>,
) -> Result<(), AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    let voices = native
        .0
        .lock()
        .map_err(|_| AppError::internal())?
        .as_ref()
        .ok_or_else(not_prepared)?
        .voices(&request.mix)?;
    audio.with_monitor(|m| {
        let bus = m
            .bus()
            .filter(|b| b.has_voices() && b.sample_rate() == voices.sample_rate)
            .ok_or_else(not_prepared)?;
        bus.set_voices(voices)
    })?
}

#[tauri::command]
pub async fn set_native_transport(
    request: NativeTransportRequest,
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<NativeTransportSnapshot, AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    audio.with_monitor(|m| {
        let bus = m
            .bus()
            .filter(|b| b.has_voices())
            .ok_or_else(not_prepared)?;
        let rate = bus.sample_rate();
        let range = match &request.r#loop {
            Some(l) => Some((frame(l.start_ms, rate)?, frame(l.end_ms, rate)?)),
            None => None,
        };
        let position = request.position_ms.map(|ms| frame(ms, rate)).transpose()?;
        bus.set_master(request.volume)?;
        if let Some(speed) = request.rate {
            bus.set_rate(speed)?;
        }
        bus.set_loop(range)?;
        let (current, playing) = bus.position();
        match (request.playing, position) {
            (true, Some(at)) => bus.play(at)?,
            (true, None) if !playing => bus.play(current)?,
            (true, None) => {}
            (false, at) => {
                bus.pause()?;
                if let Some(at) = at {
                    bus.seek(at)?;
                }
            }
        }
        Ok(snapshot(m))
    })?
}

#[tauri::command]
pub async fn get_native_transport(
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<NativeTransportSnapshot, AppError> {
    audio.with_monitor(|m| {
        // 재생만 하는 stream의 출력 실패만 반영합니다(모니터 상태 검사는 입력 세대가 필요해 하지 않음).
        m.check_output();
        // 모니터 stream이 계속 도는 경우 callback이 놓은 이전 PCM을 주기적으로 해제합니다.
        if let Some(bus) = m.bus() {
            bus.release();
        }
        snapshot(m)
    })
}

#[tauri::command]
pub async fn release_native_playback(
    audio: tauri::State<'_, Arc<AudioService>>,
    native: tauri::State<'_, Arc<NativePlayback>>,
) -> Result<(), AppError> {
    native.0.lock().map_err(|_| AppError::internal())?.take();
    audio.with_monitor(release_output)?
}
/// 보이스를 비우고 재생 출력을 끕니다(모니터 stream은 유지).
pub(crate) fn release_output(
    m: &mut crate::audio::monitor::MonitorService,
) -> Result<(), AppError> {
    if let Some(bus) = m.bus() {
        bus.clear()?;
    }
    m.stop_output()?;
    // 재생만 하던 stream을 버렸으면 callback이 들고 있던 이전 PCM도 여기서 해제됩니다.
    if let Some(bus) = m.bus() {
        bus.release();
    }
    Ok(())
}

fn snapshot(m: &mut crate::audio::monitor::MonitorService) -> NativeTransportSnapshot {
    let output_error = m.output_error();
    match m.bus() {
        Some(bus) => {
            let error_code = output_error
                .or_else(|| bus.stretch_failed().then_some("NATIVE_STRETCH_UNAVAILABLE"));
            let (position, playing) = bus.position();
            let rate = bus.sample_rate();
            NativeTransportSnapshot {
                schema_version: 1,
                prepared: bus.has_voices() && error_code.is_none(),
                playing,
                position_ms: position as f64 * 1000.0 / f64::from(rate.max(1)),
                sample_rate: rate,
                loop_count: bus.loop_count(),
                rate: bus.rate(),
                error_code,
            }
        }
        None => NativeTransportSnapshot {
            schema_version: 1,
            prepared: false,
            playing: false,
            position_ms: 0.0,
            sample_rate: 0,
            loop_count: 0,
            rate: 1.0,
            error_code: output_error,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_reject_unknown_fields_and_bad_positions() {
        assert!(serde_json::from_value::<NativeTransportRequest>(json!({
            "schemaVersion":1,"playing":true,"positionMs":0,"volume":1,"loop":null,"extra":1
        }))
        .is_err());
        let ok: NativeTransportRequest = serde_json::from_value(json!({
            "schemaVersion":1,"playing":false,"positionMs":10,"volume":0.5,"loop":{"startMs":1,"endMs":2}
        }))
        .expect("요청");
        assert!(ok.r#loop.is_some() && ok.rate.is_none(), "rate는 선택");
        let fast: NativeTransportRequest = serde_json::from_value(json!({
            "schemaVersion":1,"playing":true,"positionMs":null,"volume":1,"loop":null,"rate":1.25
        }))
        .expect("배속 요청");
        assert_eq!(fast.rate, Some(1.25));
        for bad in [-1.0, f64::NAN, MAX_MS + 1.0] {
            assert!(frame(bad, 48000).is_err());
        }
        assert_eq!(frame(1000.0, 48000).expect("1초"), 48000);
    }
}

/// docs/12 "네이티브 재생 v1" R3: 메트로놈(재생 중 박마다 클릭)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeMetronomeRequest {
    pub schema_version: u8,
    pub enabled: bool,
    pub origin_ms: f64,
    pub beat_ms: f64,
    pub numerator: u32,
    pub volume: f32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeCountInRequest {
    pub schema_version: u8,
    pub count: u32,
    pub interval_ms: f64,
    pub numerator: u32,
    pub volume: f32,
}
fn ms_frames(ms: f64, rate: u32) -> Result<f64, AppError> {
    if !ms.is_finite() || ms.abs() > MAX_MS {
        return Err(AppError::invalid());
    }
    Ok(ms * f64::from(rate) / 1000.0)
}

#[tauri::command]
pub async fn set_native_metronome(
    request: NativeMetronomeRequest,
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<(), AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    audio.with_monitor(|m| {
        let bus = m
            .bus()
            .filter(|b| b.has_voices())
            .ok_or_else(not_prepared)?;
        let rate = bus.sample_rate();
        let spec = if request.enabled {
            Some(crate::audio::playback_bus::MetronomeSpec {
                origin_frame: ms_frames(request.origin_ms, rate)?,
                beat_frames: ms_frames(request.beat_ms, rate)?,
                numerator: request.numerator,
                volume: request.volume,
            })
        } else {
            None
        };
        bus.set_metronome(spec)
    })?
}

#[tauri::command]
pub async fn native_count_in(
    request: NativeCountInRequest,
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<(), AppError> {
    if request.schema_version != 1 {
        return Err(AppError::invalid());
    }
    audio.with_monitor(|m| {
        let bus = m
            .bus()
            .filter(|b| b.has_voices())
            .ok_or_else(not_prepared)?;
        let rate = bus.sample_rate();
        bus.count_in(crate::audio::playback_bus::CountInSpec {
            count: request.count,
            interval_frames: ms_frames(request.interval_ms, rate)?,
            numerator: request.numerator,
            volume: request.volume,
        })
    })?
}

/// R3 녹음 정렬: 입력 시계(`get_audio_clock`)와 같은 값에, 그 순간 장치에서 들리는 곡 위치를 더합니다.
#[tauri::command]
pub async fn get_native_clock(
    audio: tauri::State<'_, Arc<AudioService>>,
) -> Result<Value, AppError> {
    let audio = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let clock = audio.clock()?;
        let now: u64 = clock
            .monotonic_ns
            .parse()
            .map_err(|_| AppError::internal())?;
        let song = audio.with_monitor(|m| m.bus().and_then(|b| b.song_ms_at(now)))?;
        let mut value = serde_json::to_value(&clock).map_err(|_| AppError::internal())?;
        value["songTimeMs"] = json!(song);
        Ok(value)
    })
    .await
    .map_err(|_| AppError::internal())?
}
