//! docs/12 "모니터 테이크 재생 v1": 출력 callback이 삽입 앞에서 테이크 DI 하나를 입력 DI에 더합니다.
use crate::ipc::AppError;
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

const STOPPED: u64 = u64::MAX;
const MAX_POSITION_MS: f64 = 600_000.0;

enum Command {
    Load(Arc<[f32]>),
    /// 선택 해제: 클립 참조를 놓습니다(해제 자체는 제어 쪽에서).
    Unload,
    Play(u64),
    Stop,
}

/// 출력 callback 쪽. 할당·잠금 없이 명령을 꺼내고 클립을 더합니다.
pub(super) struct PlaybackVoice {
    commands: HeapCons<Command>,
    clip: Option<Arc<[f32]>>,
    cursor: Option<usize>,
    position: Arc<AtomicU64>,
}
impl PlaybackVoice {
    pub(super) fn mix(&mut self, mono: &mut [f32]) {
        while let Some(command) = self.commands.try_pop() {
            match command {
                // 바뀐 이전 클립은 제어 쪽이 사본을 들고 있어 여기서 해제되지 않습니다.
                Command::Load(clip) => {
                    self.clip = Some(clip);
                    self.cursor = None;
                }
                Command::Unload => {
                    self.clip = None;
                    self.cursor = None;
                }
                Command::Play(frame) => self.cursor = usize::try_from(frame).ok(),
                Command::Stop => self.cursor = None,
            }
        }
        if let (Some(clip), Some(cursor)) = (&self.clip, self.cursor) {
            for (value, sample) in mono.iter_mut().zip(clip.iter().skip(cursor)) {
                if sample.is_finite() {
                    *value += sample;
                }
            }
            let next = cursor.saturating_add(mono.len());
            self.cursor = (next < clip.len()).then_some(next);
        }
        self.position
            .store(self.cursor.map_or(STOPPED, |c| c as u64), Ordering::Release);
    }
}

/// 제어 쪽(모니터 잠금 안에서만 씀).
pub(super) struct PlaybackControl {
    commands: HeapProd<Command>,
    position: Arc<AtomicU64>,
    /// callback이 쓰는 클립과 아직 돌려받지 못한 이전 클립의 사본.
    clips: Vec<Arc<[f32]>>,
    take_id: Option<String>,
    sample_rate: u32,
    lead_frames: u64,
}
pub(super) fn pair(sample_rate: u32) -> (PlaybackControl, PlaybackVoice) {
    let (commands, consumer) = HeapRb::<Command>::new(16).split();
    let position = Arc::new(AtomicU64::new(STOPPED));
    (
        PlaybackControl {
            commands,
            position: position.clone(),
            clips: Vec::new(),
            take_id: None,
            sample_rate,
            lead_frames: 0,
        },
        PlaybackVoice {
            commands: consumer,
            clip: None,
            cursor: None,
            position,
        },
    )
}
fn busy() -> AppError {
    AppError::new(
        "PLAYBACK_BUSY",
        "재생 명령이 밀려 있습니다. 잠시 뒤 다시 시도하세요.",
        true,
    )
}
impl PlaybackControl {
    /// callback이 놓은 이전 클립을 해제합니다(모니터 상태 조회 때 부름).
    pub(super) fn release(&mut self) {
        self.clips.retain(|clip| Arc::strong_count(clip) > 1);
    }
    pub(super) fn set_lead(&mut self, frames: u64) {
        self.lead_frames = frames;
    }
    pub(super) fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    fn send(&mut self, command: Command) -> Result<(), AppError> {
        self.commands.try_push(command).map_err(|_| busy())
    }
    pub(super) fn load(
        &mut self,
        take_id: Option<String>,
        clip: Option<Vec<f32>>,
    ) -> Result<(), AppError> {
        // callback이 놓은 이전 클립(사본만 남음)만 여기서 해제합니다.
        self.clips.retain(|clip| Arc::strong_count(clip) > 1);
        match clip {
            Some(samples) => {
                let clip: Arc<[f32]> = samples.into();
                self.send(Command::Load(clip.clone()))?;
                self.clips.push(clip);
            }
            None => self.send(Command::Unload)?,
        }
        self.take_id = take_id;
        Ok(())
    }
    pub(super) fn set(&mut self, playing: bool, position_ms: f64) -> Result<(), AppError> {
        if !position_ms.is_finite() || !(0.0..=MAX_POSITION_MS).contains(&position_ms) {
            return Err(AppError::invalid());
        }
        if self.take_id.is_none() {
            return Err(AppError::new(
                "PLAYBACK_NOT_LOADED",
                "AmpliTube로 재생할 테이크가 없습니다. 모니터를 켠 뒤 다시 선택하세요.",
                true,
            ));
        }
        if playing {
            let frame = (position_ms * f64::from(self.sample_rate) / 1000.0).round() as u64;
            self.send(Command::Play(frame + self.lead_frames))
        } else {
            self.send(Command::Stop)
        }
    }
    pub(super) fn snapshot(&self) -> MonitorPlaybackSnapshot {
        let rate = f64::from(self.sample_rate.max(1));
        let duration = self
            .take_id
            .as_ref()
            .and(self.clips.last())
            .map(|clip| clip.len() as f64 * 1000.0 / rate);
        let position = self.position.load(Ordering::Acquire);
        let playing = self.take_id.is_some() && position != STOPPED;
        MonitorPlaybackSnapshot {
            take_id: self.take_id.clone(),
            playing,
            position_ms: playing
                .then(|| position.saturating_sub(self.lead_frames) as f64 * 1000.0 / rate),
            duration_ms: duration,
            ..MonitorPlaybackSnapshot::empty(self.lead_frames)
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadPlaybackRequest {
    pub schema_version: u8,
    pub project_id: String,
    pub take_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetPlaybackRequest {
    pub schema_version: u8,
    pub playing: bool,
    pub position_ms: f64,
}
#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorPlaybackSnapshot {
    pub schema_version: u8,
    pub take_id: Option<String>,
    pub playing: bool,
    pub position_ms: Option<f64>,
    pub duration_ms: Option<f64>,
    pub lead_frames: u64,
}
impl MonitorPlaybackSnapshot {
    pub fn empty(lead_frames: u64) -> Self {
        Self {
            schema_version: 1,
            take_id: None,
            playing: false,
            position_ms: None,
            duration_ms: None,
            lead_frames,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn voice_adds_clip_from_lead_position_and_stops_at_end() {
        let (mut control, mut voice) = pair(1000);
        control.set_lead(2);
        assert_eq!(
            control.set(true, 0.0).map_err(|e| e.code),
            Err("PLAYBACK_NOT_LOADED")
        );
        control
            .load(
                Some("t".into()),
                Some(vec![1.0, 2.0, 3.0, f32::NAN, 5.0, 6.0]),
            )
            .expect("load");
        let mut block = [0.5; 2];
        voice.mix(&mut block);
        assert_eq!(block, [0.5, 0.5], "불러오기만으로는 재생하지 않음");
        // 0ms 요청 → 선행 2프레임부터 시작
        control.set(true, 0.0).expect("play");
        voice.mix(&mut block);
        assert_eq!(block, [3.5, 0.5], "NaN은 더하지 않음");
        let snap = control.snapshot();
        assert!(snap.playing);
        assert_eq!(snap.position_ms, Some(2.0));
        assert_eq!(snap.duration_ms, Some(6.0));
        let mut tail = [0.0; 4];
        voice.mix(&mut tail);
        assert_eq!(tail, [5.0, 6.0, 0.0, 0.0]);
        assert!(!control.snapshot().playing, "끝에 닿으면 정지");
    }
    #[test]
    fn replaced_clip_is_released_on_control_side_only() {
        let (mut control, mut voice) = pair(1000);
        control
            .load(Some("a".into()), Some(vec![1.0; 4]))
            .expect("a");
        voice.mix(&mut [0.0; 1]);
        control
            .load(Some("b".into()), Some(vec![2.0; 4]))
            .expect("b");
        voice.mix(&mut [0.0; 1]);
        // callback이 a를 놓았으므로 다음 불러오기에서 제어 쪽이 해제합니다.
        assert_eq!(control.clips.len(), 2);
        control.load(None, None).expect("clear");
        assert_eq!(control.clips.len(), 1);
        // 선택 해제는 callback이 b도 놓게 하고, 다음 상태 조회의 release에서 마지막 PCM까지 해제됩니다.
        let weak = Arc::downgrade(control.clips.last().expect("b"));
        voice.mix(&mut [0.0; 1]);
        control.release();
        assert!(weak.upgrade().is_none(), "선택 해제 뒤 PCM이 남지 않음");
        assert!(control.clips.is_empty());
        assert_eq!(control.snapshot(), MonitorPlaybackSnapshot::empty(0));
        assert_eq!(
            control.set(false, 0.0).map_err(|e| e.code),
            Err("PLAYBACK_NOT_LOADED")
        );
    }
    #[test]
    fn position_and_request_are_validated() {
        let (mut control, _voice) = pair(48000);
        control
            .load(Some("t".into()), Some(vec![0.0; 8]))
            .expect("load");
        for bad in [-1.0, f64::NAN, f64::INFINITY, 600_001.0] {
            assert!(control.set(true, bad).is_err());
        }
        assert!(
            serde_json::from_value::<SetPlaybackRequest>(serde_json::json!({
                "schemaVersion": 1, "playing": true, "positionMs": 0, "extra": 1
            }))
            .is_err()
        );
    }
}
