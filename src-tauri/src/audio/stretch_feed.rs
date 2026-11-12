//! docs/12 "네이티브 배속 재생 v1"(R5): 배속일 때 보이스를 곡 위치에서 섞어 늘인 결과를
//! 곡 위치가 붙은 고정 크기 조각으로 출력 callback에 넘깁니다. 늘이기는 할당할 수 있어 이 작업 스레드에서만 합니다.
use super::{
    playback_bus::{mix_voices, VoiceSet},
    stretch::Stretch,
};
use ringbuf::{
    traits::{Observer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread::JoinHandle,
    time::Duration,
};

/// 조각 하나의 출력 프레임 수.
pub const CHUNK: usize = 256;
/// 링 크기(조각 수). 48kHz에서 약 85ms를 미리 만들어 둡니다.
const CHUNKS: usize = 16;

/// 늘인 결과 한 조각. 힙을 쓰지 않아 callback에서 꺼내도 할당·해제가 없습니다.
pub struct Chunk {
    pub generation: u64,
    /// 첫 프레임의 곡 위치(구간 반복 되감기 적용 뒤).
    pub song_frame: f64,
    /// 이 조각이 구간 끝에서 되감은 뒤 첫 조각인지.
    pub wrapped: bool,
    pub left: [f32; CHUNK],
    pub right: [f32; CHUNK],
}

pub fn ring() -> (HeapProd<Chunk>, HeapCons<Chunk>) {
    HeapRb::<Chunk>::new(CHUNKS).split()
}

/// 제어 쪽이 작업 스레드에 바라는 상태.
#[derive(Default)]
pub struct Request {
    pub generation: u64,
    /// 이 세대의 시작 곡 프레임.
    pub start: u64,
    pub rate: f64,
    pub active: bool,
    pub voices: Option<Arc<VoiceSet>>,
    pub looped: Option<(u64, u64)>,
    pub sample_rate: u32,
    /// stream을 새로 만들면 새 링의 쓰기 쪽을 넘깁니다.
    pub output: Option<HeapProd<Chunk>>,
}

struct Shared {
    request: Mutex<Request>,
    wake: Condvar,
    stop: AtomicBool,
    /// 늘이기를 만들거나 처리하지 못해 이 세대를 무음으로 멈췄는지(새 세대에서 다시 시도).
    failed: AtomicBool,
}

/// 같은 비율로 늘이는 입력 하나. 입력 k프레임 = 되감기 전 곡 위치 `start + k × recorded`.
struct Lane {
    /// None이면 1배속 녹음 보이스를 섞은 묶음, Some(i)이면 배속 녹음 보이스 i(R6).
    voice: Option<usize>,
    recorded: f64,
    /// 늘이기 비율(재생 배속 / 녹음 배속). 1이면 늘이지 않고 그대로 씁니다.
    ratio: f64,
    stretch: Option<Stretch>,
    seek_len: usize,
    consumed: u64,
}

/// 실제 늘이기 상태(작업 스레드 또는 검사에서 직접 돌림).
struct Feeder {
    sample_rate: u32,
    generation: u64,
    rate: f64,
    active: bool,
    voices: Option<Arc<VoiceSet>>,
    looped: Option<(u64, u64)>,
    output: Option<HeapProd<Chunk>>,
    /// 시작 위치와 지금까지 낸 출력 프레임 수(시작 기준, 되감기 전 시간축).
    start: u64,
    produced: u64,
    lap: u64,
    failed: bool,
    lanes: Vec<Lane>,
    /// 레인을 다시 만들 때 재사용할 늘이기(만들 때 FFT 준비 비용이 있음).
    spare: Vec<Stretch>,
    in_l: Vec<f32>,
    in_r: Vec<f32>,
    out_l: [f32; CHUNK],
    out_r: [f32; CHUNK],
}

/// 보이스 묶음의 배속 녹음 보이스(번호, 녹음 배속). 바뀌면 레인을 다시 만듭니다.
fn varispeed_voices(set: Option<&Arc<VoiceSet>>) -> Vec<(usize, f64)> {
    set.map_or_else(Vec::new, |set| {
        set.voices
            .iter()
            .enumerate()
            .filter(|(_, v)| v.recorded_rate != 1.0)
            .map(|(i, v)| (i, v.recorded_rate))
            .collect()
    })
}

impl Feeder {
    fn new() -> Self {
        Self {
            sample_rate: 0,
            generation: 0,
            rate: 1.0,
            active: false,
            voices: None,
            looped: None,
            output: None,
            start: 0,
            produced: 0,
            lap: 0,
            failed: false,
            lanes: Vec::new(),
            spare: Vec::new(),
            in_l: Vec::new(),
            in_r: Vec::new(),
            out_l: [0.0; CHUNK],
            out_r: [0.0; CHUNK],
        }
    }
    /// 되감기 전 시간축 위치 → 곡 위치와 회차.
    fn wrap(&self, at: f64) -> (f64, u64) {
        match self.looped {
            Some((s, e)) if at >= e as f64 => {
                let (s, e) = (s as f64, e as f64);
                let lap = ((at - e) / (e - s)).floor() + 1.0;
                (at - lap * (e - s), lap as u64)
            }
            _ => (at, 0),
        }
    }
    /// 레인 입력 [from, from+len)을 `in_*` 앞에 채웁니다(구간 경계에서 나눔).
    fn fill_input(&mut self, lane: usize, from: u64, len: usize) {
        self.in_l.clear();
        self.in_l.resize(len, 0.0);
        self.in_r.clear();
        self.in_r.resize(len, 0.0);
        let Some(set) = self.voices.clone() else {
            return;
        };
        let (voice, recorded) = (self.lanes[lane].voice, self.lanes[lane].recorded);
        if let Some(voice) = voice {
            // 배속 녹음 보이스: 입력 k = 곡 start + k × 녹음 배속 → 보이스 (곡 − 시작) / 녹음 배속 번째 프레임.
            let Some(v) = set.voices.get(voice) else {
                return;
            };
            for k in 0..len {
                let (song, _) = self.wrap(self.start as f64 + (from + k as u64) as f64 * recorded);
                let at = ((song - v.start_frame as f64) / recorded).round();
                if at < 0.0 || at >= v.left.len() as f64 {
                    continue;
                }
                let (l, r) = (v.left[at as usize], v.right[at as usize]);
                if l.is_finite() && r.is_finite() {
                    self.in_l[k] = l * v.gain;
                    self.in_r[k] = r * v.gain;
                }
            }
            return;
        }
        let mut done = 0;
        while done < len {
            let (song, _) = self.wrap((self.start + from + done as u64) as f64);
            let song = song as u64;
            let mut n = len - done;
            if let Some((_, e)) = self.looped {
                if song < e {
                    n = n.min((e - song) as usize);
                }
            }
            mix_voices(
                &set,
                song,
                &mut self.in_l[done..done + n],
                &mut self.in_r[done..done + n],
                1.0,
            );
            done += n;
        }
    }
    /// 지금 위치(start)에서 레인을 새로 만들고 각 늘이기를 첫 출력이 곡 start에 오도록 맞춥니다.
    fn rebuild(&mut self) {
        for lane in self.lanes.drain(..) {
            self.spare.extend(lane.stretch);
        }
        let mut lanes = vec![(None, 1.0)];
        lanes.extend(
            varispeed_voices(self.voices.as_ref())
                .into_iter()
                .map(|(i, r)| (Some(i), r)),
        );
        for (index, (voice, recorded)) in lanes.into_iter().enumerate() {
            let ratio = self.rate / recorded;
            let stretch = if ratio == 1.0 {
                None
            } else {
                match self.spare.pop().or_else(|| Stretch::new(self.sample_rate)) {
                    Some(s) => Some(s),
                    None => {
                        self.failed = true;
                        return;
                    }
                }
            };
            self.lanes.push(Lane {
                voice,
                recorded,
                ratio,
                stretch,
                seek_len: 0,
                consumed: 0,
            });
            if self.lanes[index].stretch.is_none() {
                continue;
            }
            let seek_len = self.lanes[index]
                .stretch
                .as_ref()
                .map_or(0, |s| s.output_seek_length(ratio));
            self.fill_input(index, 0, seek_len);
            let lane = &mut self.lanes[index];
            lane.seek_len = seek_len;
            lane.consumed = seek_len as u64;
            let (l, r) = (&mut self.in_l, &mut self.in_r);
            if let Some(stretch) = lane.stretch.as_mut() {
                if !stretch.output_seek(l, r) {
                    self.failed = true;
                }
            }
        }
    }
    fn apply(&mut self, request: &mut Request) {
        if let Some(output) = request.output.take() {
            self.output = Some(output);
        }
        let layout = varispeed_voices(request.voices.as_ref());
        let changed_layout = layout != varispeed_voices(self.voices.as_ref());
        self.voices = request.voices.clone();
        self.active = request.active;
        if request.sample_rate != self.sample_rate {
            self.sample_rate = request.sample_rate;
            self.spare.clear();
            self.lanes.clear();
            self.generation = u64::MAX;
        }
        if request.generation != self.generation {
            self.generation = request.generation;
            self.rate = request.rate;
            self.looped = request.looped;
            self.start = match self.looped {
                Some((s, e)) if request.start >= e => s,
                _ => request.start,
            };
            self.produced = 0;
            self.lap = 0;
            self.failed = false;
            self.rebuild();
        } else if changed_layout {
            // 같은 세대에 배속 녹음 보이스 구성이 바뀌면(새 믹스) 지금 낼 위치에서 레인을 다시 만듭니다.
            let (song, _) = self.wrap(self.start as f64 + self.produced as f64 * self.rate);
            self.start = song.round() as u64;
            self.produced = 0;
            self.lap = 0;
            self.failed = false;
            self.rebuild();
        }
    }
    /// 링이 찰 때까지 조각을 만듭니다. 만든 조각 수를 돌려줍니다.
    fn fill(&mut self) -> usize {
        if !self.active || self.failed || self.lanes.is_empty() {
            return 0;
        }
        let mut made = 0;
        while self.output.as_ref().is_some_and(|o| o.vacant_len() > 0) {
            let (song, lap) = self.wrap(self.start as f64 + self.produced as f64 * self.rate);
            let mut chunk = Chunk {
                generation: self.generation,
                song_frame: song,
                wrapped: lap > self.lap,
                left: [0.0; CHUNK],
                right: [0.0; CHUNK],
            };
            for index in 0..self.lanes.len() {
                let (ratio, seek_len, consumed) = {
                    let lane = &self.lanes[index];
                    (lane.ratio, lane.seek_len, lane.consumed)
                };
                if self.lanes[index].stretch.is_none() {
                    // 비율 1: 출력 j프레임 = 입력 j프레임.
                    self.fill_input(index, self.produced, CHUNK);
                    for i in 0..CHUNK {
                        chunk.left[i] += self.in_l[i];
                        chunk.right[i] += self.in_r[i];
                    }
                    continue;
                }
                // 출력 j프레임 = 입력 j × 비율. 입력은 그보다 seek_len만큼 앞서 넣습니다.
                let target = seek_len as u64
                    + ((self.produced + CHUNK as u64) as f64 * ratio).round() as u64;
                let need = target.saturating_sub(consumed) as usize;
                self.fill_input(index, consumed, need);
                let lane = &mut self.lanes[index];
                lane.consumed += need as u64;
                let (l, r) = (&mut self.in_l, &mut self.in_r);
                let Some(stretch) = lane.stretch.as_mut() else {
                    continue;
                };
                if !stretch.process(l, r, &mut self.out_l, &mut self.out_r) {
                    self.failed = true;
                    return made;
                }
                for i in 0..CHUNK {
                    chunk.left[i] += self.out_l[i];
                    chunk.right[i] += self.out_r[i];
                }
            }
            self.lap = lap;
            for v in chunk.left.iter_mut().chain(chunk.right.iter_mut()) {
                if !v.is_finite() {
                    *v = 0.0;
                }
            }
            self.produced += CHUNK as u64;
            if let Some(output) = self.output.as_mut() {
                if output.try_push(chunk).is_err() {
                    break;
                }
            }
            made += 1;
        }
        made
    }
}

/// 제어 쪽이 쥐는 작업 스레드 손잡이. 버리면 스레드를 멈추고 기다립니다.
pub struct FeedHandle {
    shared: Arc<Shared>,
    thread: Option<JoinHandle<()>>,
    /// 검사용: 스레드 없이 `pump()`로 직접 돌립니다.
    manual: Option<Feeder>,
}

impl FeedHandle {
    pub fn spawn() -> Option<Self> {
        let shared = Arc::new(Shared {
            request: Mutex::new(Request::default()),
            wake: Condvar::new(),
            stop: AtomicBool::new(false),
            failed: AtomicBool::new(false),
        });
        let worker = shared.clone();
        let thread = std::thread::Builder::new()
            .name("guitarlab-stretch".into())
            .spawn(move || {
                let mut feeder = Feeder::new();
                while !worker.stop.load(Ordering::Acquire) {
                    let Ok(mut request) = worker.request.lock() else {
                        return;
                    };
                    feeder.apply(&mut request);
                    worker.failed.store(feeder.failed, Ordering::Release);
                    if !feeder.active {
                        // 쓰지 않을 때는 깨울 때까지(또는 잠깐) 잡니다.
                        let _ = worker
                            .wake
                            .wait_timeout(request, Duration::from_millis(100));
                        continue;
                    }
                    drop(request);
                    feeder.fill();
                    worker.failed.store(feeder.failed, Ordering::Release);
                    std::thread::sleep(Duration::from_millis(2));
                }
            })
            .ok()?;
        Some(Self {
            shared,
            thread: Some(thread),
            manual: None,
        })
    }
    #[cfg(test)]
    pub fn manual() -> Self {
        Self {
            shared: Arc::new(Shared {
                request: Mutex::new(Request::default()),
                wake: Condvar::new(),
                stop: AtomicBool::new(false),
                failed: AtomicBool::new(false),
            }),
            thread: None,
            manual: Some(Feeder::new()),
        }
    }
    /// 바라는 상태를 바꾸고 작업 스레드를 깨웁니다.
    pub fn update(&self, change: impl FnOnce(&mut Request)) {
        if let Ok(mut request) = self.shared.request.lock() {
            change(&mut request);
        }
        self.shared.wake.notify_one();
    }
    /// 검사용: 바뀐 상태를 반영하고 링을 채웁니다.
    #[cfg(test)]
    pub fn pump(&mut self) -> usize {
        let Some(feeder) = self.manual.as_mut() else {
            return 0;
        };
        if let Ok(mut request) = self.shared.request.lock() {
            feeder.apply(&mut request);
        }
        let made = feeder.fill();
        self.shared.failed.store(feeder.failed, Ordering::Release);
        made
    }
    /// 검사용: 늘이기 실패를 흉내 냅니다.
    #[cfg(test)]
    pub fn fail_for_test(&mut self) {
        if let Some(feeder) = self.manual.as_mut() {
            feeder.failed = true;
        }
    }
    /// 작업 스레드가 늘이기에 실패해 무음으로 멈췄는지.
    pub fn failed(&self) -> bool {
        self.shared.failed.load(Ordering::Acquire)
    }
}

impl Drop for FeedHandle {
    fn drop(&mut self) {
        self.shared.stop.store(true, Ordering::Release);
        self.shared.wake.notify_one();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        let _ = self.manual.take();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::playback_bus::BusVoice;

    /// 큰 입력 성능: 레이어 12개(배속 녹음 3개 포함)를 배속으로 늘일 때 작업 스레드가 실시간보다 충분히 빠른지 잽니다.
    /// 최적화 빌드에서만 의미가 있어 `cargo test --release -- --ignored stretch_feed_keeps_up`으로 돌립니다.
    #[test]
    #[ignore]
    fn stretch_feed_keeps_up_with_many_layers() {
        let rate_hz = 48_000u32;
        let len = rate_hz as usize * 20;
        let mut seed = 1u32;
        let voices = (0..12)
            .map(|i| {
                let mut noise = || {
                    seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                    (seed >> 8) as f32 / (1u32 << 24) as f32 - 0.5
                };
                let left: Arc<[f32]> = (0..len).map(|_| noise()).collect();
                let right: Arc<[f32]> = (0..len).map(|_| noise()).collect();
                BusVoice {
                    left,
                    right,
                    start_frame: i * 1000,
                    gain: 0.1,
                    // R6: 4개 중 1개는 0.75배 녹음 테이크(각자 따로 늘임).
                    recorded_rate: if i % 4 == 0 { 0.75 } else { 1.0 },
                }
            })
            .collect();
        let set = Arc::new(VoiceSet {
            sample_rate: rate_hz,
            voices,
        });
        for rate in [0.5, 1.0, 1.5] {
            let mut feeder = Feeder::new();
            let (prod, mut cons) = ring();
            let mut request = Request {
                generation: 1,
                start: 0,
                rate,
                active: true,
                voices: Some(set.clone()),
                looped: None,
                sample_rate: rate_hz,
                output: Some(prod),
            };
            feeder.apply(&mut request);
            let seconds = 10.0;
            let target = (seconds * rate_hz as f64) as usize / CHUNK;
            let begin = std::time::Instant::now();
            let mut got = 0;
            while got < target {
                feeder.fill();
                while ringbuf::traits::Consumer::try_pop(&mut cons).is_some() {
                    got += 1;
                }
            }
            let speed = seconds / begin.elapsed().as_secs_f64();
            eprintln!("rate {rate}: 실시간의 {speed:.1}배");
            assert!(speed > 4.0, "rate {rate}: 실시간의 {speed:.1}배");
        }
    }
}
