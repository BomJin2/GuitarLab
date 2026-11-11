//! docs/plugin/PLAYBACK-RUST-DESIGN.md R1: 출력 callback 안에서 여러 stereo 보이스를 곡 위치에 맞춰 섞는 재생 버스.
//! callback 쪽(`Bus`)은 할당·잠금·해제를 하지 않습니다. 보이스 묶음 해제는 제어 쪽(`BusControl`)만 합니다.
use crate::ipc::AppError;
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
    Arc,
};

/// 곡 위의 한 소리(반주·테이크·스템 등). 좌우 길이가 같고 엔진 샘플레이트로 맞춰져 있습니다.
pub struct BusVoice {
    pub left: Arc<[f32]>,
    pub right: Arc<[f32]>,
    /// 곡 시작 기준 이 보이스의 첫 프레임(음수면 앞부분이 곡 시작 전).
    pub start_frame: i64,
    pub gain: f32,
}
pub struct VoiceSet {
    pub sample_rate: u32,
    pub voices: Vec<BusVoice>,
}
/// R3: 곡 박자에 맞춘 메트로놈(재생 중에만 울림).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MetronomeSpec {
    pub origin_frame: f64,
    pub beat_frames: f64,
    pub numerator: u32,
    pub volume: f32,
}
/// R3: 카운트인 클릭(재생과 무관하게 지금부터 울림).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CountInSpec {
    pub count: u32,
    pub interval_frames: f64,
    pub numerator: u32,
    pub volume: f32,
}
const MAX_STARTS: usize = 16;
#[derive(Clone, Copy, Default)]
struct Click {
    remaining: u32,
    phase: f32,
    step: f32,
    gain: f32,
}

enum Command {
    Voices(Arc<VoiceSet>),
    Play { seq: u64, frame: u64 },
    Pause,
    Seek { seq: u64, frame: u64 },
    Loop(Option<(u64, u64)>),
    Metronome(Option<MetronomeSpec>),
    CountIn(CountInSpec),
}

struct Shared {
    position: AtomicU64,
    playing: AtomicBool,
    master: AtomicU32,
    /// callback이 적용한 마지막 위치 명령 번호.
    applied: AtomicU64,
    /// R3: 마지막 블록 첫 프레임의 곡 프레임과 그 소리가 장치에서 나는 시각(QPC ns, 0이면 없음).
    anchor_frame: AtomicU64,
    anchor_ns: AtomicU64,
    /// 구간 끝에서 되감은 누적 횟수(화면이 반복 회차를 셈).
    loops: AtomicU64,
    /// 기준점(프레임·시각) 쓰기 세대. 홀수면 쓰는 중입니다(잠금 없이 두 값을 함께 읽기 위함).
    anchor_seq: AtomicU64,
}

/// 출력 callback 쪽.
pub struct Bus {
    commands: HeapCons<Command>,
    shared: Arc<Shared>,
    voices: Option<Arc<VoiceSet>>,
    position: u64,
    playing: bool,
    looped: Option<(u64, u64)>,
    sample_rate: u32,
    metronome: Option<MetronomeSpec>,
    /// 남은 카운트인: (다음 클릭까지 프레임, 남은 수, 지금 박 번호, 설정)
    count_in: Option<(f64, u32, u32, CountInSpec)>,
    click: Click,
    starts: [(usize, bool, f32); MAX_STARTS],
}

/// 제어 쪽(서비스 잠금 안에서만 씀).
pub struct BusControl {
    commands: HeapProd<Command>,
    shared: Arc<Shared>,
    sample_rate: u32,
    /// callback이 쓰는 묶음과 아직 놓지 않은 이전 묶음의 사본.
    sets: Vec<Arc<VoiceSet>>,
    current: Option<Arc<VoiceSet>>,
    playing: bool,
    looped: Option<(u64, u64)>,
    seq: u64,
    /// 마지막 위치 명령(번호, 프레임). stream을 다시 만들 때 아직 적용되지 않았으면 이 값을 씁니다.
    requested: Option<(u64, u64)>,
    metronome: Option<MetronomeSpec>,
}

const COMMANDS: usize = 64;

fn busy() -> AppError {
    AppError::new(
        "PLAYBACK_BUSY",
        "재생 명령이 밀려 있습니다. 잠시 뒤 다시 시도하세요.",
        true,
    )
}

pub fn pair(sample_rate: u32) -> (BusControl, Bus) {
    let shared = Arc::new(Shared {
        position: AtomicU64::new(0),
        playing: AtomicBool::new(false),
        master: AtomicU32::new(1.0f32.to_bits()),
        applied: AtomicU64::new(0),
        anchor_frame: AtomicU64::new(0),
        anchor_ns: AtomicU64::new(0),
        loops: AtomicU64::new(0),
        anchor_seq: AtomicU64::new(0),
    });
    let (commands, consumer) = HeapRb::<Command>::new(COMMANDS).split();
    (
        BusControl {
            commands,
            shared: shared.clone(),
            sample_rate,
            sets: Vec::new(),
            current: None,
            playing: false,
            looped: None,
            seq: 0,
            requested: None,
            metronome: None,
        },
        Bus::new(consumer, shared, sample_rate),
    )
}

impl Bus {
    fn new(commands: HeapCons<Command>, shared: Arc<Shared>, sample_rate: u32) -> Self {
        Self {
            commands,
            shared,
            voices: None,
            position: 0,
            playing: false,
            looped: None,
            sample_rate,
            metronome: None,
            count_in: None,
            click: Click::default(),
            starts: [(0, false, 0.0); MAX_STARTS],
        }
    }
    fn push_start(
        count: &mut usize,
        starts: &mut [(usize, bool, f32); MAX_STARTS],
        at: usize,
        accent: bool,
        volume: f32,
    ) {
        if *count < MAX_STARTS {
            starts[*count] = (at, accent, volume);
            *count += 1;
        }
    }
    /// 버스 소리를 좌우 블록에 더합니다.
    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.render_at(left, right, None);
    }
    /// `playback_ns`: 이 블록 첫 프레임이 장치에서 소리 나는 시각(QPC ns). 녹음 정렬 기준점에 씁니다.
    pub fn render_at(&mut self, left: &mut [f32], right: &mut [f32], playback_ns: Option<u64>) {
        while let Some(command) = self.commands.try_pop() {
            match command {
                // 바뀐 이전 묶음은 제어 쪽이 사본을 들고 있어 여기서 해제되지 않습니다.
                Command::Voices(set) => self.voices = Some(set),
                Command::Play { seq, frame } => {
                    self.position = frame;
                    self.playing = true;
                    self.shared.applied.store(seq, Ordering::Release);
                }
                // 정지는 남은 카운트인 클릭도 지웁니다(준비 취소).
                Command::Pause => {
                    self.playing = false;
                    self.count_in = None;
                }
                Command::Seek { seq, frame } => {
                    self.position = frame;
                    self.shared.applied.store(seq, Ordering::Release);
                }
                Command::Loop(range) => self.looped = range,
                Command::Metronome(spec) => self.metronome = spec,
                Command::CountIn(spec) => self.count_in = Some((0.0, spec.count, 0, spec)),
            }
        }
        let mut starts = 0usize;
        if self.playing {
            if let Some(ns) = playback_ns {
                let mut frame = self.position;
                if let Some((start, end)) = self.looped {
                    if frame >= end {
                        frame = start;
                    }
                }
                self.shared.anchor_seq.fetch_add(1, Ordering::AcqRel);
                self.shared.anchor_frame.store(frame, Ordering::Release);
                self.shared.anchor_ns.store(ns.max(1), Ordering::Release);
                self.shared.anchor_seq.fetch_add(1, Ordering::AcqRel);
            }
        } else {
            self.shared.anchor_ns.store(0, Ordering::Release);
        }
        let master = f32::from_bits(self.shared.master.load(Ordering::Relaxed));
        let total = left.len().min(right.len());
        let mut done = 0;
        while self.playing && done < total {
            if let Some((start, end)) = self.looped {
                if self.position >= end {
                    self.position = start;
                    self.shared.loops.fetch_add(1, Ordering::Relaxed);
                }
            }
            let mut count = total - done;
            if let Some((_, end)) = self.looped {
                if self.position < end {
                    count = count.min((end - self.position) as usize);
                }
            }
            if let Some(set) = &self.voices {
                for voice in &set.voices {
                    let gain = voice.gain * master;
                    // 이 구간에서 보이스와 겹치는 범위만 더합니다.
                    let from = self.position as i64 - voice.start_frame;
                    let len = voice.left.len() as i64;
                    let skip = (-from).clamp(0, count as i64);
                    let first = from + skip;
                    if first >= len {
                        continue;
                    }
                    let n = (count as i64 - skip).min(len - first).max(0) as usize;
                    let (a, b) = (first as usize, done + skip as usize);
                    for i in 0..n {
                        let (l, r) = (voice.left[a + i], voice.right[a + i]);
                        if l.is_finite() && r.is_finite() {
                            left[b + i] += l * gain;
                            right[b + i] += r * gain;
                        }
                    }
                }
            }
            if let Some(m) = self.metronome {
                // 이 구간 [position, position+count)에 드는 박마다 클릭을 시작합니다.
                let from = self.position as f64;
                let mut k = ((from - m.origin_frame) / m.beat_frames).ceil();
                loop {
                    let at = m.origin_frame + k * m.beat_frames;
                    if at >= from + count as f64 {
                        break;
                    }
                    let accent = (k as i64).rem_euclid(i64::from(m.numerator)) == 0;
                    let offset = ((at - from).max(0.0) as usize).min(count - 1);
                    Self::push_start(
                        &mut starts,
                        &mut self.starts,
                        done + offset,
                        accent,
                        m.volume,
                    );
                    k += 1.0;
                }
            }
            self.position = self.position.saturating_add(count as u64);
            done += count;
        }
        if let Some((mut next, mut left_count, mut index, spec)) = self.count_in {
            while left_count > 0 && next < total as f64 {
                let accent = index % spec.numerator == 0;
                Self::push_start(
                    &mut starts,
                    &mut self.starts,
                    next as usize,
                    accent,
                    spec.volume,
                );
                index += 1;
                left_count -= 1;
                next += spec.interval_frames;
            }
            self.count_in =
                (left_count > 0).then_some((next - total as f64, left_count, index, spec));
        }
        self.synthesize_clicks(left, right, total, starts);
        self.shared.position.store(self.position, Ordering::Release);
        self.shared.playing.store(self.playing, Ordering::Release);
    }
    /// 40ms 사인 클릭(강박 1200Hz·약박 800Hz, 끝 2ms 페이드). WebAudio 메트로놈과 같은 소리입니다.
    fn synthesize_clicks(
        &mut self,
        left: &mut [f32],
        right: &mut [f32],
        total: usize,
        starts: usize,
    ) {
        if starts == 0 && self.click.remaining == 0 {
            return;
        }
        let mut next = 0;
        let rate = self.sample_rate.max(1) as f32;
        let fade = (rate * 0.002).max(1.0);
        for i in 0..total {
            while next < starts && self.starts[next].0 == i {
                let (_, accent, volume) = self.starts[next];
                self.click = Click {
                    remaining: (rate * 0.04) as u32,
                    phase: 0.0,
                    step: std::f32::consts::TAU * if accent { 1200.0 } else { 800.0 } / rate,
                    gain: volume,
                };
                next += 1;
            }
            if self.click.remaining > 0 {
                let envelope = (self.click.remaining as f32 / fade).min(1.0);
                let value = self.click.phase.sin() * self.click.gain * envelope;
                left[i] += value;
                right[i] += value;
                self.click.phase = (self.click.phase + self.click.step) % std::f32::consts::TAU;
                self.click.remaining -= 1;
            }
        }
    }
}

impl BusControl {
    fn send(&mut self, command: Command) -> Result<(), AppError> {
        self.commands.try_push(command).map_err(|_| busy())
    }
    /// callback이 놓은 이전 묶음을 해제합니다(제어 쪽에서만).
    pub fn release(&mut self) {
        self.sets.retain(|set| Arc::strong_count(set) > 1);
    }
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    pub fn set_voices(&mut self, set: VoiceSet) -> Result<(), AppError> {
        if set.sample_rate != self.sample_rate
            || set.voices.iter().any(|v| {
                v.left.len() != v.right.len()
                    || !v.gain.is_finite()
                    || !(0.0..=2.0).contains(&v.gain)
            })
        {
            return Err(AppError::invalid());
        }
        self.release();
        let set = Arc::new(set);
        self.send(Command::Voices(set.clone()))?;
        self.sets.push(set.clone());
        self.current = Some(set);
        Ok(())
    }
    pub fn play(&mut self, frame: u64) -> Result<(), AppError> {
        self.seq += 1;
        self.send(Command::Play {
            seq: self.seq,
            frame,
        })?;
        self.requested = Some((self.seq, frame));
        self.playing = true;
        Ok(())
    }
    pub fn pause(&mut self) -> Result<(), AppError> {
        self.send(Command::Pause)?;
        self.playing = false;
        Ok(())
    }
    pub fn seek(&mut self, frame: u64) -> Result<(), AppError> {
        self.seq += 1;
        self.send(Command::Seek {
            seq: self.seq,
            frame,
        })?;
        self.requested = Some((self.seq, frame));
        Ok(())
    }
    pub fn set_loop(&mut self, range: Option<(u64, u64)>) -> Result<(), AppError> {
        if range.is_some_and(|(a, b)| a >= b) {
            return Err(AppError::invalid());
        }
        self.send(Command::Loop(range))?;
        self.looped = range;
        Ok(())
    }
    pub fn set_metronome(&mut self, spec: Option<MetronomeSpec>) -> Result<(), AppError> {
        if spec.is_some_and(|m| {
            !m.origin_frame.is_finite()
                || !m.beat_frames.is_finite()
                || m.beat_frames < 1.0
                || !(1..=32).contains(&m.numerator)
                || !m.volume.is_finite()
                || !(0.0..=1.0).contains(&m.volume)
        }) {
            return Err(AppError::invalid());
        }
        self.send(Command::Metronome(spec))?;
        self.metronome = spec;
        Ok(())
    }
    pub fn count_in(&mut self, spec: CountInSpec) -> Result<(), AppError> {
        if !(1..=64).contains(&spec.count)
            || !spec.interval_frames.is_finite()
            || spec.interval_frames < 1.0
            || !(1..=32).contains(&spec.numerator)
            || !spec.volume.is_finite()
            || !(0.0..=1.0).contains(&spec.volume)
        {
            return Err(AppError::invalid());
        }
        self.send(Command::CountIn(spec))
    }
    /// R3: 장치에서 `now_ns`(QPC ns)에 들리는 곡 위치(ms). 재생 중이 아니거나 기준점이 없으면 `None`.
    pub fn song_ms_at(&self, now_ns: u64) -> Option<f64> {
        // 프레임과 시각이 같은 블록에서 나온 값일 때만 씁니다(쓰는 중이거나 그 사이 바뀌면 다시 읽음).
        let (anchor, anchor_ns) = (0..8).find_map(|_| {
            let before = self.shared.anchor_seq.load(Ordering::Acquire);
            if before % 2 == 1 {
                return None;
            }
            let frame = self.shared.anchor_frame.load(Ordering::Acquire);
            let ns = self.shared.anchor_ns.load(Ordering::Acquire);
            (self.shared.anchor_seq.load(Ordering::Acquire) == before).then_some((frame, ns))
        })?;
        if anchor_ns == 0 || !self.shared.playing.load(Ordering::Acquire) {
            return None;
        }
        let rate = f64::from(self.sample_rate);
        let anchor = anchor as f64;
        let mut frame = anchor + (now_ns as f64 - anchor_ns as f64) * rate / 1e9;
        if let Some((start, end)) = self.looped {
            let (start, end) = (start as f64, end as f64);
            if anchor < end && frame >= end {
                frame = start + (frame - start) % (end - start);
            } else if anchor >= start
                && anchor < end
                && frame < start
                && self.shared.loops.load(Ordering::Acquire) > 0
            {
                // 다음 회차 블록을 이미 냈지만 장치에서는 아직 이전 회차 끝부분이 들리는 동안입니다.
                frame = end - (start - frame) % (end - start);
            }
        }
        (frame >= 0.0).then(|| frame * 1000.0 / rate)
    }
    pub fn set_master(&self, gain: f32) -> Result<(), AppError> {
        if !gain.is_finite() || !(0.0..=1.0).contains(&gain) {
            return Err(AppError::invalid());
        }
        self.shared.master.store(gain.to_bits(), Ordering::Relaxed);
        Ok(())
    }
    pub fn loop_count(&self) -> u64 {
        self.shared.loops.load(Ordering::Relaxed)
    }
    /// callback이 마지막으로 공개한 곡 프레임과 재생 여부.
    pub fn position(&self) -> (u64, bool) {
        (
            self.shared.position.load(Ordering::Acquire),
            self.shared.playing.load(Ordering::Acquire),
        )
    }
    /// 이전 stream을 버린 뒤 같은 상태로 새 callback 쪽을 만듭니다.
    /// 샘플레이트가 바뀌면 보이스를 비우고 정지합니다(`has_voices()`가 false가 되어 다시 불러와야 함).
    pub fn respawn(&mut self, sample_rate: u32) -> Bus {
        let mut position = match self.requested {
            Some((seq, frame)) if self.shared.applied.load(Ordering::Acquire) < seq => frame,
            _ => self.shared.position.load(Ordering::Acquire),
        };
        self.requested = None;
        let (commands, consumer) = HeapRb::<Command>::new(COMMANDS).split();
        self.commands = commands;
        if sample_rate != self.sample_rate {
            self.sample_rate = sample_rate;
            self.current = None;
            self.playing = false;
            position = 0;
        }
        // 이전 callback은 이미 버려졌으므로 사본은 현재 묶음만 남깁니다.
        self.sets = self.current.iter().cloned().collect();
        self.shared.position.store(position, Ordering::Release);
        self.shared.playing.store(self.playing, Ordering::Release);
        let mut bus = Bus::new(consumer, self.shared.clone(), sample_rate);
        bus.voices = self.current.clone();
        bus.position = position;
        bus.playing = self.playing;
        bus.looped = self.looped;
        bus.metronome = self.metronome;
        bus
    }
    /// 보이스를 비우고 멈춥니다. stream이 이미 버려졌어도 공개 상태가 멈춤이 되게 합니다.
    pub fn clear(&mut self) -> Result<(), AppError> {
        self.release();
        let empty = Arc::new(VoiceSet {
            sample_rate: self.sample_rate,
            voices: Vec::new(),
        });
        self.send(Command::Voices(empty.clone()))?;
        self.sets.push(empty);
        self.send(Command::Pause)?;
        self.current = None;
        self.playing = false;
        self.requested = None;
        self.shared.playing.store(false, Ordering::Release);
        Ok(())
    }
    pub fn has_voices(&self) -> bool {
        self.current.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn voice(l: &[f32], r: &[f32], start: i64, gain: f32) -> BusVoice {
        BusVoice {
            left: l.into(),
            right: r.into(),
            start_frame: start,
            gain,
        }
    }
    fn block(bus: &mut Bus, n: usize) -> (Vec<f32>, Vec<f32>) {
        let (mut l, mut r) = (vec![0.0; n], vec![0.0; n]);
        bus.render(&mut l, &mut r);
        (l, r)
    }
    #[test]
    fn voices_mix_at_song_position_with_gain_offset_and_skip_non_finite() {
        let (mut c, mut bus) = pair(1000);
        c.set_voices(VoiceSet {
            sample_rate: 1000,
            voices: vec![
                voice(&[1.0, 2.0, 3.0], &[10.0, 20.0, 30.0], 0, 1.0),
                // 곡 2프레임부터, 반 음량, NaN 프레임은 건너뜀
                voice(&[4.0, f32::NAN, 8.0], &[4.0, 6.0, 8.0], 2, 0.5),
                // 앞부분이 곡 시작 전
                voice(&[100.0, 1.0], &[100.0, 1.0], -1, 1.0),
            ],
        })
        .expect("voices");
        assert_eq!(block(&mut bus, 2).0, vec![0.0, 0.0], "재생 전에는 무음");
        c.play(0).expect("play");
        let (l, r) = block(&mut bus, 5);
        assert_eq!(l, vec![2.0, 2.0, 5.0, 0.0, 4.0]);
        assert_eq!(r, vec![11.0, 20.0, 32.0, 0.0, 4.0]);
        assert_eq!(c.position(), (5, true));
        c.pause().expect("pause");
        assert_eq!(block(&mut bus, 2).0, vec![0.0, 0.0]);
        assert_eq!(c.position(), (5, false));
        c.seek(1).expect("seek");
        c.play(1).expect("play");
        c.set_master(0.5).expect("master");
        assert_eq!(block(&mut bus, 2).0, vec![1.0, 2.5]);
    }
    #[test]
    fn metronome_clicks_on_beats_with_accent_and_count_in_runs_without_transport() {
        let (mut c, mut bus) = pair(1000);
        c.set_voices(VoiceSet {
            sample_rate: 1000,
            voices: vec![],
        })
        .expect("voices");
        assert!(c
            .set_metronome(Some(MetronomeSpec {
                origin_frame: 0.0,
                beat_frames: 0.5,
                numerator: 4,
                volume: 1.0
            }))
            .is_err());
        // 1000Hz에서 박 간격 100프레임, 4/4, 원점 50
        c.set_metronome(Some(MetronomeSpec {
            origin_frame: 50.0,
            beat_frames: 100.0,
            numerator: 4,
            volume: 1.0,
        }))
        .expect("metronome");
        assert!(
            block(&mut bus, 200).0.iter().all(|v| *v == 0.0),
            "정지 중에는 울리지 않음"
        );
        c.play(0).expect("play");
        let (l, r) = block(&mut bus, 200);
        assert_eq!(l, r);
        let sounding = |i: usize| l[i] != 0.0 || l.get(i + 1).is_some_and(|v| *v != 0.0);
        assert!(
            !sounding(10) && sounding(50) && sounding(150),
            "50·150프레임에서 시작"
        );
        // 박 50은 k=0(강박), 150은 k=1(약박): 강박 주파수가 더 높아 첫 반주기가 짧습니다.
        let zero = |from: usize| {
            (from + 1..from + 40)
                .find(|&i| l[i - 1] > 0.0 && l[i] <= 0.0)
                .expect("영점")
        };
        assert!(zero(50) - 50 < zero(150) - 150);
        c.set_metronome(None).expect("off");
        c.pause().expect("pause");
        block(&mut bus, 100);
        c.count_in(CountInSpec {
            count: 2,
            interval_frames: 300.0,
            numerator: 4,
            volume: 0.5,
        })
        .expect("count-in");
        let (l, _) = block(&mut bus, 200);
        assert!(l[0] != 0.0 || l[1] != 0.0, "정지 중에도 바로 클릭");
        assert!(l[150..].iter().all(|v| *v == 0.0));
        let (l, _) = block(&mut bus, 200);
        assert!(l[100] != 0.0 || l[101] != 0.0, "300프레임 뒤 두 번째 클릭");
        let (l, _) = block(&mut bus, 400);
        assert!(l.iter().all(|v| *v == 0.0), "두 번만");
        // 첫 클릭 뒤 정지하면 남은 클릭이 나지 않습니다.
        c.count_in(CountInSpec {
            count: 3,
            interval_frames: 300.0,
            numerator: 4,
            volume: 0.5,
        })
        .expect("count-in");
        block(&mut bus, 100);
        c.pause().expect("cancel");
        let (l, _) = block(&mut bus, 800);
        assert!(l.iter().all(|v| *v == 0.0), "취소 뒤 무음");
        assert!(l.iter().all(|v| v.abs() <= 1.0));
    }
    #[test]
    fn song_time_follows_device_playback_instant_and_loop() {
        let (mut c, mut bus) = pair(1000);
        c.set_voices(VoiceSet {
            sample_rate: 1000,
            voices: vec![],
        })
        .expect("voices");
        let (mut l, mut r) = (vec![0.0; 100], vec![0.0; 100]);
        bus.render_at(&mut l, &mut r, Some(5_000_000_000));
        assert_eq!(c.song_ms_at(5_000_000_000), None, "정지 중에는 없음");
        c.play(1000).expect("play");
        // 이 블록 첫 프레임(곡 1000프레임=1초)은 장치에서 5.05초에 들림
        bus.render_at(&mut l, &mut r, Some(5_050_000_000));
        assert_eq!(c.song_ms_at(5_050_000_000), Some(1000.0));
        assert_eq!(c.song_ms_at(5_000_000_000), Some(950.0), "출력 지연만큼 앞");
        c.set_loop(Some((1000, 1100))).expect("loop");
        bus.render_at(&mut l, &mut r, Some(5_150_000_000));
        let t = c.song_ms_at(5_250_000_000).expect("구간");
        assert!((1000.0..1100.0).contains(&t), "구간 안으로 되감음: {t}");
        // 되감은 블록(곡 1000)을 냈지만 장치에서는 아직 이전 회차 끝부분(1475ms 근처)이 들리는 시각
        let (mut l2, mut r2) = (vec![0.0; 50], vec![0.0; 50]);
        bus.render_at(&mut l2, &mut r2, Some(5_350_000_000));
        bus.render_at(&mut l2, &mut r2, Some(5_400_000_000));
        assert!(c.loop_count() > 0);
        let back = c.song_ms_at(5_375_000_000).expect("이전 회차");
        assert!(
            (1000.0..1100.0).contains(&back),
            "구간 밖(975 등)이 아님: {back}"
        );
        // 기준점을 쓰는 중(세대 홀수)이면 섞인 값을 쓰지 않고 기준점 없음으로 둡니다.
        c.shared.anchor_seq.fetch_add(1, Ordering::AcqRel);
        assert_eq!(c.song_ms_at(5_375_000_000), None);
        c.shared.anchor_seq.fetch_add(1, Ordering::AcqRel);
        assert!(c.song_ms_at(5_375_000_000).is_some());
        c.pause().expect("pause");
        bus.render_at(&mut l, &mut r, Some(5_500_000_000));
        assert_eq!(c.song_ms_at(5_500_000_000), None);
    }
    #[test]
    fn loop_wraps_inside_a_block() {
        let (mut c, mut bus) = pair(1000);
        let ramp: Vec<f32> = (0..10).map(|i| i as f32).collect();
        c.set_voices(VoiceSet {
            sample_rate: 1000,
            voices: vec![voice(&ramp, &ramp, 0, 1.0)],
        })
        .expect("voices");
        c.set_loop(Some((2, 5))).expect("loop");
        assert!(c.set_loop(Some((5, 5))).is_err());
        c.play(3).expect("play");
        assert_eq!(block(&mut bus, 6).0, vec![3.0, 4.0, 2.0, 3.0, 4.0, 2.0]);
        c.set_loop(None).expect("unloop");
        assert_eq!(block(&mut bus, 3).0, vec![3.0, 4.0, 5.0]);
    }
    #[test]
    fn replaced_sets_are_released_on_control_side_only() {
        let (mut c, mut bus) = pair(1000);
        let set = |v: f32| VoiceSet {
            sample_rate: 1000,
            voices: vec![voice(&[v], &[v], 0, 1.0)],
        };
        c.set_voices(set(1.0)).expect("a");
        block(&mut bus, 1);
        c.set_voices(set(2.0)).expect("b");
        block(&mut bus, 1);
        assert_eq!(
            c.sets.len(),
            2,
            "callback이 a를 놓은 뒤에도 사본은 제어 쪽에"
        );
        c.set_voices(set(3.0)).expect("c");
        assert_eq!(c.sets.len(), 2, "놓인 a는 제어 쪽에서 해제");
        assert!(c
            .set_voices(VoiceSet {
                sample_rate: 48000,
                voices: vec![]
            })
            .is_err());
        assert!(c
            .set_voices(VoiceSet {
                sample_rate: 1000,
                voices: vec![voice(&[1.0], &[1.0, 2.0], 0, 1.0)]
            })
            .is_err());
    }
    #[test]
    fn respawn_keeps_voices_position_play_state_and_pending_seek() {
        let (mut c, mut bus) = pair(1000);
        let ramp: Vec<f32> = (0..20).map(|i| i as f32).collect();
        c.set_voices(VoiceSet {
            sample_rate: 1000,
            voices: vec![voice(&ramp, &ramp, 0, 1.0)],
        })
        .expect("voices");
        c.play(0).expect("play");
        block(&mut bus, 4);
        drop(bus);
        let mut bus = c.respawn(1000);
        assert_eq!(
            block(&mut bus, 2).0,
            vec![4.0, 5.0],
            "위치·재생 상태 이어감"
        );
        // 적용되지 않은 이동 명령은 새 버스가 이어받습니다.
        c.seek(10).expect("seek");
        drop(bus);
        let mut bus = c.respawn(1000);
        assert_eq!(block(&mut bus, 2).0, vec![10.0, 11.0]);
        drop(bus);
        let mut bus = c.respawn(48000);
        assert!(!c.has_voices(), "샘플레이트가 바뀌면 다시 불러와야 함");
        assert_eq!(block(&mut bus, 2).0, vec![0.0, 0.0]);
        assert_eq!(c.sample_rate(), 48000);
        // 비우면 공개 상태도 바로 멈춤·보이스 없음
        c.set_voices(VoiceSet {
            sample_rate: 48000,
            voices: vec![voice(&[1.0], &[1.0], 0, 1.0)],
        })
        .expect("voices");
        c.play(0).expect("play");
        block(&mut bus, 1);
        assert!(c.position().1);
        c.clear().expect("clear");
        assert!(!c.has_voices() && !c.position().1);
        assert_eq!(block(&mut bus, 1).0, vec![0.0]);
        assert!(!c.position().1);
        // stream(callback)을 버린 뒤 release하면 마지막 PCM이 해제됩니다.
        let weak = c.sets.first().map(Arc::downgrade).expect("이전 묶음");
        drop(bus);
        c.release();
        assert!(weak.upgrade().is_none(), "해제 뒤 PCM이 남지 않음");
        assert!(c.sets.is_empty());
    }
}
