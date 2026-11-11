//! docs/12 "모니터 AmpliTube 삽입 v1": 장치 출력 callback과 DSP 스레드 사이의 잠금 없는 삽입.
//! 장치 callback은 SPSC 링에 넣고 꺼내기만 합니다. 플러그인 처리는 DSP 스레드에서만 하며,
//! 에디터와 공유하는 잠금은 기다리지 않고(`try_lock`) 못 잡은 블록은 무음으로 둡니다(지연이 늘지 않게).
use crate::audio::monitor::{InsertStats, MonitorInsert};
use ringbuf::{
    traits::{Consumer, Observer, Producer, Split},
    HeapCons, HeapProd, HeapRb,
};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::Duration,
};
use vst3_host::{AudioBuffers, Plugin};

/// DSP 스레드가 한 번에 처리하는 프레임 수.
pub const DSP_BLOCK: usize = 128;
const RING_FRAMES: usize = 16384;

/// 모니터를 끄면 DSP 스레드가 플러그인 참조를 놓은 뒤 부릅니다(서비스의 사용 중 표시 해제).
pub type Finished = Box<dyn FnOnce() + Send>;

pub struct ThreadedInsert {
    to_dsp: HeapProd<f32>,
    from_dsp: HeapCons<[f32; 2]>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    stats: Arc<InsertStats>,
    bypass: Arc<AtomicBool>,
    output: OutputTiming,
    /// 지금까지 본 링 넘침 수(입력·결과). 늘어난 만큼 `OutputTiming.lost`로 넘깁니다.
    seen_dropped: u64,
    /// 서비스가 알려 주는 첫 처리 조각 길이(0이면 모름). 보고 지연과 실제 시작 무음을 같게 합니다.
    prime_hint: Arc<AtomicU32>,
    plugin_latency: u32,
}

/// 장치 쪽 결과 꺼내기: 시작 무음(prime)과, 부족해 무음으로 대신한 만큼 늦게 온 결과를 버리는 몫(debt).
#[derive(Default)]
struct OutputTiming {
    prime: Option<usize>,
    debt: usize,
    /// 링이 넘쳐 영영 오지 않을 결과 수. 그만큼의 부족은 debt로 세지 않습니다(기다리지 않음).
    lost: u64,
}
impl OutputTiming {
    /// 결과를 `left`/`right`에 채우고 부족한 프레임 수를 돌려줍니다(할당·잠금 없음).
    fn fill(
        &mut self,
        first: usize,
        left: &mut [f32],
        right: &mut [f32],
        mut pop: impl FnMut() -> Option<[f32; 2]>,
    ) -> u64 {
        let mut prime = *self.prime.get_or_insert(first + DSP_BLOCK);
        let mut missing = 0;
        for i in 0..left.len().min(right.len()) {
            (left[i], right[i]) = (0.0, 0.0);
            if prime > 0 {
                prime -= 1;
                continue;
            }
            // 이미 무음으로 대신한 시각의 늦은 결과는 버려 기준 지연으로 돌아갑니다.
            while self.debt > 0 {
                if pop().is_none() {
                    break;
                }
                self.debt -= 1;
            }
            match pop() {
                Some([l, r]) => (left[i], right[i]) = (l, r),
                None => {
                    missing += 1;
                    if self.lost > 0 {
                        self.lost -= 1;
                    } else {
                        self.debt += 1;
                    }
                }
            }
        }
        self.prime = Some(prime);
        missing
    }
}

impl ThreadedInsert {
    pub fn start(plugin: Arc<Mutex<Plugin>>, sample_rate: u32, finished: Finished) -> Option<Self> {
        let plugin_latency = {
            let mut guard = plugin.lock().ok()?;
            guard.start_processing().ok()?;
            guard.latency_samples()
        };
        let (to_dsp, mut dsp_in) = HeapRb::<f32>::new(RING_FRAMES).split();
        let (mut dsp_out, from_dsp) = HeapRb::<[f32; 2]>::new(RING_FRAMES).split();
        let stop = Arc::new(AtomicBool::new(false));
        let stats = Arc::new(InsertStats::default());
        let bypass = Arc::new(AtomicBool::new(false));
        let (worker_stop, worker_bypass, worker_stats) =
            (stop.clone(), bypass.clone(), stats.clone());
        let worker = std::thread::Builder::new()
            .name("guitarlab-monitor-dsp".into())
            .spawn(move || {
                raise_priority();
                let mut buffers = AudioBuffers::new(1, 2, DSP_BLOCK, f64::from(sample_rate));
                let mut mixer = BypassMix::new(plugin_latency as usize);
                let mut dry = [0.0f32; DSP_BLOCK];
                while !worker_stop.load(Ordering::Acquire) {
                    if dsp_in.occupied_len() < DSP_BLOCK {
                        std::thread::sleep(Duration::from_micros(500));
                        continue;
                    }
                    dsp_in.pop_slice(&mut buffers.inputs[0]);
                    mixer.delay(&buffers.inputs[0], &mut dry);
                    for output in &mut buffers.outputs {
                        output.fill(0.0);
                    }
                    // 처리 오류·에디터가 잠금을 쥔 블록은 무음으로 둡니다(원음으로 대신하지 않음).
                    // 잠금 대기는 예정된 동작이라 세지 않고, 처리 오류만 셉니다.
                    let ok = match plugin.try_lock() {
                        Ok(mut p) => {
                            let ok = p.process_audio(&mut buffers).is_ok();
                            if !ok {
                                worker_stats.errors.fetch_add(1, Ordering::Relaxed);
                            }
                            ok
                        }
                        Err(_) => false,
                    };
                    let wet = ok.then_some((&buffers.outputs[0][..], &buffers.outputs[1][..]));
                    let mut lost = 0u64;
                    mixer.mix(worker_bypass.load(Ordering::Relaxed), wet, &dry, |frame| {
                        if dsp_out.try_push(frame).is_err() {
                            lost += 1;
                        }
                    });
                    if lost > 0 {
                        worker_stats.dropped.fetch_add(lost, Ordering::Relaxed);
                    }
                }
                if let Ok(mut p) = plugin.lock() {
                    let _ = p.stop_processing();
                }
                // 마지막 해제는 소유 스레드 몫이므로 참조를 먼저 놓고 알립니다.
                drop(plugin);
                finished();
            })
            .expect("모니터 DSP 스레드");
        Some(Self {
            to_dsp,
            from_dsp,
            stop,
            worker: Some(worker),
            stats,
            bypass,
            output: OutputTiming::default(),
            seen_dropped: 0,
            prime_hint: Arc::new(AtomicU32::new(0)),
            plugin_latency,
        })
    }
}

impl MonitorInsert for ThreadedInsert {
    fn process(&mut self, input: &[f32], left: &mut [f32], right: &mut [f32]) {
        let pushed = self.to_dsp.push_slice(input);
        if pushed < input.len() {
            self.stats
                .dropped
                .fetch_add((input.len() - pushed) as u64, Ordering::Relaxed);
        }
        // 넘쳐 버려진 입력·결과의 몫은 결과가 오지 않으므로 늦은 결과로 기다리지 않습니다.
        let dropped = self.stats.dropped.load(Ordering::Relaxed);
        self.output.lost += dropped.saturating_sub(self.seen_dropped);
        self.seen_dropped = dropped;
        let hint = self.prime_hint.load(Ordering::Acquire) as usize;
        let first = if hint > 0 { hint } else { input.len() };
        let from_dsp = &mut self.from_dsp;
        let missing = self.output.fill(first, left, right, || from_dsp.try_pop());
        if missing > 0 {
            self.stats.underrun.fetch_add(missing, Ordering::Relaxed);
        }
    }
    fn latency_frames(&self) -> u32 {
        DSP_BLOCK as u32 + self.plugin_latency
    }
    fn kind(&self) -> &'static str {
        "AMPLITUBE"
    }
    fn stats(&self) -> Option<Arc<InsertStats>> {
        Some(self.stats.clone())
    }
    fn bypass_flag(&self) -> Option<Arc<AtomicBool>> {
        Some(self.bypass.clone())
    }
    fn prime_hint(&self) -> Option<Arc<AtomicU32>> {
        Some(self.prime_hint.clone())
    }
}

/// docs/12 "AmpliTube FX 랙·실시간 Bypass v1": 플러그인 지연만큼 늦춘 원음과 처리 결과를 블록 단위로 섞습니다.
struct BypassMix {
    line: Vec<f32>,
    at: usize,
    /// 0 = 처리 결과, 1 = 원음
    gain: f32,
}
impl BypassMix {
    fn new(latency: usize) -> Self {
        Self {
            line: vec![0.0; latency],
            at: 0,
            gain: 0.0,
        }
    }
    /// 입력을 플러그인 지연만큼 늦춰 `dry`에 씁니다.
    fn delay(&mut self, input: &[f32], dry: &mut [f32]) {
        for (x, out) in input.iter().zip(dry.iter_mut()) {
            *out = match self.line.get_mut(self.at) {
                Some(slot) => std::mem::replace(slot, *x),
                None => *x,
            };
            if !self.line.is_empty() {
                self.at = (self.at + 1) % self.line.len();
            }
        }
    }
    /// 바뀐 블록만 선형으로 넘깁니다. 처리 결과가 없으면(오류·잠금) 그 몫은 무음입니다.
    fn mix(
        &mut self,
        bypass: bool,
        wet: Option<(&[f32], &[f32])>,
        dry: &[f32],
        mut push: impl FnMut([f32; 2]),
    ) {
        let (from, to) = (self.gain, if bypass { 1.0 } else { 0.0 });
        let n = dry.len() as f32;
        for (i, d) in dry.iter().enumerate() {
            let g = from + (to - from) * (i + 1) as f32 / n;
            let (l, r) = wet.map_or((0.0, 0.0), |(l, r)| (l[i], r[i]));
            push([l * (1.0 - g) + d * g, r * (1.0 - g) + d * g]);
        }
        self.gain = to;
    }
}

impl Drop for ThreadedInsert {
    fn drop(&mut self) {
        // 출력 stream을 정리하는 제어 스레드에서 불립니다(장치 callback 아님).
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(windows)]
fn raise_priority() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL,
    };
    // 실패해도 계속 처리합니다(우선순위는 끊김을 줄이는 보조 수단).
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
    }
}
#[cfg(not(windows))]
fn raise_priority() {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn late_results_after_underrun_are_dropped_to_restore_base_latency() {
        // 리뷰 R9-2: 결과가 늦어 무음으로 대신한 만큼 늦게 온 결과는 버립니다.
        use std::collections::VecDeque;
        let mut timing = OutputTiming::default();
        let mut queue: VecDeque<[f32; 2]> = VecDeque::new();
        let (mut l, mut r) = (vec![9.0; 4], vec![9.0; 4]);
        // 시작 무음 = 첫 조각(2) + DSP_BLOCK
        let mut t = 0f32;
        let mut feed = |q: &mut VecDeque<[f32; 2]>, n: usize| {
            for _ in 0..n {
                q.push_back([t, t]);
                t += 1.0;
            }
        };
        let (mut pl, mut pr) = (vec![0.0; 2], vec![0.0; 2]);
        for _ in 0..(2 + DSP_BLOCK) / 2 {
            assert_eq!(timing.fill(2, &mut pl, &mut pr, || queue.pop_front()), 0);
        }
        let primed = timing.prime == Some(0);
        assert!(primed);
        // 정상: 결과 0,1,2,3
        feed(&mut queue, 4);
        assert_eq!(timing.fill(2, &mut l, &mut r, || queue.pop_front()), 0);
        assert_eq!(l, [0.0, 1.0, 2.0, 3.0]);
        // DSP 정지: 4프레임 부족(무음), 그 시각 결과(4..8)는 늦게 옴
        assert_eq!(timing.fill(2, &mut l, &mut r, || queue.pop_front()), 4);
        assert_eq!(l, [0.0; 4]);
        feed(&mut queue, 8);
        // 복구: 늦은 4..8은 버리고 제 시각의 8..12를 냄(지연이 쌓이지 않음)
        assert_eq!(timing.fill(2, &mut l, &mut r, || queue.pop_front()), 0);
        assert_eq!(l, [8.0, 9.0, 10.0, 11.0]);
    }
    #[test]
    fn lost_frames_from_ring_overflow_are_not_waited_for() {
        // 리뷰 R10-1: 링이 넘쳐 버려진 몫은 늦은 결과로 기다리지 않아, 처리가 돌아오면 바로 소리가 납니다.
        let mut timing = OutputTiming {
            prime: Some(0),
            ..OutputTiming::default()
        };
        let (mut l, mut r) = (vec![9.0; 4], vec![9.0; 4]);
        // 입력 4프레임이 넘쳐 버려짐 → 그 시각은 부족(무음)이지만 결과는 영영 오지 않음
        timing.lost += 4;
        assert_eq!(timing.fill(4, &mut l, &mut r, || None), 4);
        assert_eq!(timing.debt, 0);
        let mut next = 100.0f32;
        let mut pop = || {
            next += 1.0;
            Some([next, next])
        };
        assert_eq!(timing.fill(4, &mut l, &mut r, &mut pop), 0);
        assert_eq!(l, [101.0, 102.0, 103.0, 104.0], "버리지 않고 바로 냄");
    }
    #[test]
    fn prime_uses_the_reported_first_chunk_not_the_callback_size() {
        // 리뷰 R9-3: 시작 무음은 서비스가 알려 준 첫 조각 길이 + DSP_BLOCK(보고 지연과 같음).
        let mut timing = OutputTiming::default();
        let (mut l, mut r) = (vec![0.0; 1024], vec![0.0; 1024]);
        timing.fill(1024, &mut l, &mut r, || Some([1.0, 1.0]));
        let (mut l, mut r) = (vec![0.0; 1024], vec![0.0; 1024]);
        timing.fill(1024, &mut l, &mut r, || Some([1.0, 1.0]));
        // 1024 + 128 = 1152프레임 무음 뒤 소리
        assert_eq!(l[127], 0.0);
        assert_eq!(l[128], 1.0);
    }
    #[test]
    fn bypass_keeps_latency_aligned_ramps_once_and_survives_missing_wet() {
        let mut mix = BypassMix::new(3);
        let input: Vec<f32> = (1..=8).map(|v| v as f32).collect();
        let mut dry = vec![0.0; 8];
        mix.delay(&input, &mut dry);
        // 플러그인 지연(3)만큼 늦어져 처리 결과와 같은 시점에 맞습니다.
        assert_eq!(dry, [0.0, 0.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0]);
        let wet = vec![10.0f32; 8];
        let mut out = Vec::new();
        mix.mix(false, Some((&wet, &wet)), &dry, |f| out.push(f));
        assert!(out.iter().all(|f| *f == [10.0, 10.0]));
        out.clear();
        mix.mix(true, Some((&wet, &wet)), &dry, |f| out.push(f));
        // 한 블록 동안 선형으로 넘어가 마지막 프레임은 원음입니다.
        assert!(out[0][0] > 8.0 && out[0][0] < 10.0);
        assert_eq!(out[7], [5.0, 5.0]);
        out.clear();
        // Bypass 중에는 처리 결과가 없어도(잠금·오류) 원음이 나옵니다.
        mix.mix(true, None, &dry, |f| out.push(f));
        assert_eq!(out[3], [1.0, 1.0]);
        let mut zero = BypassMix::new(0);
        let mut same = vec![0.0; 8];
        zero.delay(&input, &mut same);
        assert_eq!(same, input);
    }
}
