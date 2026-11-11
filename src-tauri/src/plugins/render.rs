//! docs/12 "테이크 Freeze v1": 테이크 DI를 플러그인으로 오프라인 처리합니다(실시간보다 빠르게).
use super::dsp::DSP_BLOCK;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

/// 좌우 모두 이보다 작으면 조용한 프레임(-90dBFS).
const QUIET: f32 = 3.162_277_7e-5;
const MAX_TAIL_SECONDS: u32 = 10;
/// 정착 판정에 쓰는 연속 탐침 수. 탐침 간격 250ms면 첫·끝 사이 1.5초로, 실측 로드 변화(0.6~1.0초)를 넘깁니다.
const STABLE_PROBES: usize = 7;

/// mono 블록을 받아 좌우를 채우고 실패하면 false인 처리기.
pub type BlockProcess<'a> = dyn FnMut(&[f32], &mut [f32], &mut [f32]) -> bool + 'a;

pub struct Rendered {
    pub left: Vec<f32>,
    pub right: Vec<f32>,
    pub tail_frames: u64,
}

/// `process`는 mono 블록을 받아 좌우를 채우고 실패하면 false입니다.
/// 무음 1초로 남은 잔향을 비우고, 출력 앞쪽을 `latency`만큼 잘라 DI와 시점을 맞추며,
/// DI 뒤 tail은 조용한 상태가 0.5초 이어지거나 10초가 되면 끝냅니다(끝의 조용한 구간은 자름).
pub fn render_offline(
    process: &mut BlockProcess<'_>,
    input: &[f32],
    sample_rate: u32,
    latency: usize,
    cancel: &AtomicBool,
    progress: &AtomicU64,
) -> Result<Rendered, &'static str> {
    let rate = sample_rate as usize;
    let (mut block, mut left, mut right) = (
        [0.0f32; DSP_BLOCK],
        [0.0f32; DSP_BLOCK],
        [0.0f32; DSP_BLOCK],
    );
    let mut run = |block: &[f32], left: &mut [f32], right: &mut [f32]| {
        if cancel.load(Ordering::Relaxed) {
            return Err("CANCELED");
        }
        left.fill(0.0);
        right.fill(0.0);
        if !process(block, left, right) {
            return Err("RENDER_FAILED");
        }
        for v in left.iter_mut().chain(right.iter_mut()) {
            if !v.is_finite() {
                *v = 0.0;
            }
        }
        Ok(())
    };
    // 무음 1초로 남은 잔향(정착 탐침·모니터)을 비웁니다.
    for _ in 0..rate.div_ceil(DSP_BLOCK) {
        run(&block, &mut left, &mut right)?;
    }
    let mut out_l = Vec::with_capacity(input.len() + rate);
    let mut out_r = Vec::with_capacity(input.len() + rate);
    // 출력에서 버릴 앞쪽(플러그인 지연)과 DI 끝 이후 무음을 넣은 프레임 수
    let mut skip = latency;
    let (mut fed_silence, mut quiet) = (0usize, 0usize);
    let max_tail = rate * MAX_TAIL_SECONDS as usize;
    let mut at = 0usize;
    loop {
        let take = input.len().saturating_sub(at).min(DSP_BLOCK);
        block[..take].copy_from_slice(&input[at..at + take]);
        block[take..].fill(0.0);
        at += take;
        if take < DSP_BLOCK {
            fed_silence += DSP_BLOCK - take;
        }
        run(&block, &mut left, &mut right)?;
        progress.store(at as u64, Ordering::Relaxed);
        for i in 0..DSP_BLOCK {
            if skip > 0 {
                skip -= 1;
                continue;
            }
            out_l.push(left[i]);
            out_r.push(right[i]);
            if out_l.len() > input.len() {
                quiet = if left[i].abs() < QUIET && right[i].abs() < QUIET {
                    quiet + 1
                } else {
                    0
                };
            }
        }
        let tail = out_l.len().saturating_sub(input.len());
        if at >= input.len()
            && (quiet >= rate / 2
                || tail >= max_tail
                || fed_silence > max_tail + latency + DSP_BLOCK)
        {
            break;
        }
    }
    // DI 길이는 그대로 두고 tail 끝의 조용한 구간만 자릅니다.
    let keep = (out_l.len() - quiet.min(out_l.len().saturating_sub(input.len()))).max(input.len());
    out_l.truncate(keep);
    out_r.truncate(keep);
    Ok(Rendered {
        tail_frames: (keep - input.len().min(keep)) as u64,
        left: out_l,
        right: out_r,
    })
}

/// AmpliTube는 불러온 직후·톤을 바꾼 직후 약 1초 동안 앰프·캐비닛을 비동기로 불러와 결과가 다릅니다
/// (2026-11-07 실측: 로드 후 0.6~1.0초 사이에 RMS 0.955 → 0.252로 바뀐 뒤 고정).
/// 짧은 탐침의 RMS가 `wait` 간격으로 `STABLE_PROBES`번 연속(250ms 간격이면 1.5초) 0.5dB 폭 안에 들면 정착한 것으로 보고,
/// (세 번만 보면 로드 직후 0.5초의 안정 구간을 정착으로 오인함, 리뷰 R11-1)
/// `max_tries`번이 지나면 그대로 진행합니다(모듈레이션 이펙트처럼 계속 변하는 톤도 막지 않음). 시도 횟수를 돌려줍니다.
pub fn settle(
    process: &mut BlockProcess<'_>,
    sample_rate: u32,
    cancel: &AtomicBool,
    mut wait: impl FnMut(),
    max_tries: u32,
) -> Result<u32, &'static str> {
    let frames = (sample_rate as usize / 8).div_ceil(DSP_BLOCK) * DSP_BLOCK;
    let (mut left, mut right) = ([0.0f32; DSP_BLOCK], [0.0f32; DSP_BLOCK]);
    let mut levels: Vec<f64> = Vec::new();
    for attempt in 1..=max_tries {
        let mut energy = 0.0f64;
        for start in (0..frames).step_by(DSP_BLOCK) {
            if cancel.load(Ordering::Relaxed) {
                return Err("CANCELED");
            }
            let block: Vec<f32> = (start..start + DSP_BLOCK)
                .map(|i| {
                    (i as f32 * 110.0 / sample_rate as f32 * std::f32::consts::TAU).sin() * 0.3
                })
                .collect();
            if !process(&block, &mut left, &mut right) {
                return Err("RENDER_FAILED");
            }
            energy += left.iter().map(|v| f64::from(*v).powi(2)).sum::<f64>();
        }
        levels.push((energy / frames as f64).sqrt().max(1e-9));
        if let Some(window) = levels
            .len()
            .checked_sub(STABLE_PROBES)
            .map(|i| &levels[i..])
        {
            let (lo, hi) = window
                .iter()
                .fold((f64::MAX, 0.0f64), |(lo, hi), v| (lo.min(*v), hi.max(*v)));
            if 20.0 * (hi / lo).log10() < 0.5 {
                return Ok(attempt);
            }
        }
        if attempt < max_tries {
            wait();
        }
    }
    Ok(max_tries)
}

/// stereo float32 WAV(IEEE float, 포맷 3) 바이트.
pub fn stereo_wav(left: &[f32], right: &[f32], sample_rate: u32) -> Vec<u8> {
    let data = (left.len() * 8) as u32;
    let mut bytes = Vec::with_capacity(44 + data as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&3u16.to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * 8).to_le_bytes());
    bytes.extend_from_slice(&8u16.to_le_bytes());
    bytes.extend_from_slice(&32u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data.to_le_bytes());
    for (l, r) in left.iter().zip(right) {
        bytes.extend_from_slice(&l.to_le_bytes());
        bytes.extend_from_slice(&r.to_le_bytes());
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 지연 `delay`프레임의 가짜 플러그인: 좌는 입력, 우는 입력의 절반, 입력이 끝나도 `ring`프레임 울림.
    fn fake(delay: usize, ring: usize) -> impl FnMut(&[f32], &mut [f32], &mut [f32]) -> bool {
        let mut line = std::collections::VecDeque::from(vec![0.0f32; delay]);
        let mut last = 0.0f32;
        let mut ringing = 0usize;
        move |input, left, right| {
            for i in 0..input.len() {
                line.push_back(input[i]);
                let mut v = line.pop_front().unwrap_or(0.0);
                if v != 0.0 {
                    last = v;
                    ringing = ring;
                } else if ringing > 0 {
                    ringing -= 1;
                    v = last * 0.5;
                }
                left[i] = v;
                right[i] = v * 0.5;
            }
            true
        }
    }
    #[test]
    fn offline_render_aligns_latency_keeps_tail_and_trims_silence() {
        let input: Vec<f32> = (0..1000)
            .map(|i| if i % 100 == 0 { 0.5 } else { 0.1 })
            .collect();
        let (cancel, progress) = (AtomicBool::new(false), AtomicU64::new(0));
        let out =
            render_offline(&mut fake(7, 300), &input, 8000, 7, &cancel, &progress).expect("렌더");
        // 지연을 잘라 DI와 같은 시점부터 시작합니다.
        assert_eq!(&out.left[..1000], &input[..]);
        assert_eq!(out.right[0], 0.25);
        // 울림 300프레임이 tail로 남고, 그 뒤 조용한 구간은 잘립니다.
        assert_eq!(out.tail_frames, 300);
        assert_eq!(out.left.len(), 1300);
        assert_eq!(progress.load(Ordering::Relaxed), 1000);
        // 울림이 없으면 DI 길이 그대로입니다.
        let dry =
            render_offline(&mut fake(0, 0), &input, 8000, 0, &cancel, &progress).expect("렌더");
        assert_eq!((dry.left.len(), dry.tail_frames), (1000, 0));
    }
    #[test]
    fn offline_render_stops_on_cancel_failure_or_endless_tail_and_cleans_non_finite() {
        let input = vec![0.2f32; 500];
        let progress = AtomicU64::new(0);
        assert_eq!(
            render_offline(
                &mut fake(0, 0),
                &input,
                8000,
                0,
                &AtomicBool::new(true),
                &progress
            )
            .err(),
            Some("CANCELED")
        );
        let mut broken = |_: &[f32], _: &mut [f32], _: &mut [f32]| false;
        assert_eq!(
            render_offline(
                &mut broken,
                &input,
                8000,
                0,
                &AtomicBool::new(false),
                &progress
            )
            .err(),
            Some("RENDER_FAILED")
        );
        // 끝없이 울리는 플러그인도 10초 tail에서 멈춥니다.
        let mut endless = |_: &[f32], l: &mut [f32], r: &mut [f32]| {
            l.fill(0.3);
            r.fill(f32::NAN);
            true
        };
        let out = render_offline(
            &mut endless,
            &input,
            8000,
            0,
            &AtomicBool::new(false),
            &progress,
        )
        .expect("렌더");
        assert!(out.tail_frames >= 8000 * 10 && out.tail_frames < 8000 * 10 + DSP_BLOCK as u64 * 2);
        assert!(out.right.iter().all(|v| *v == 0.0));
    }
    #[test]
    fn settle_waits_until_level_stops_changing_and_gives_up_after_max_tries() {
        // 세 번째 호출 묶음부터 출력이 1/4로 바뀌는(비동기 로드가 끝나는) 가짜 플러그인
        let mut calls = 0u32;
        let frames_per_try = (48000usize / 8).div_ceil(DSP_BLOCK) as u32;
        let mut loading = |input: &[f32], l: &mut [f32], r: &mut [f32]| {
            calls += 1;
            let gain = if calls <= frames_per_try * 2 {
                1.0
            } else {
                0.25
            };
            for i in 0..input.len() {
                l[i] = input[i] * gain;
                r[i] = l[i];
            }
            true
        };
        let mut waits = 0;
        let tries = settle(
            &mut loading,
            48000,
            &AtomicBool::new(false),
            || waits += 1,
            32,
        )
        .expect("정착");
        // 바뀐 뒤(3번째)부터 7번 연속 같아야 정착
        assert_eq!((tries, waits), (9, 8));
        // 리뷰 R11-1: 처음 세 번 안정(로드 전 소리)이었다가 바뀌어도 그 안정 구간을 정착으로 보지 않습니다.
        let mut calls = 0u32;
        let mut late = |input: &[f32], l: &mut [f32], r: &mut [f32]| {
            calls += 1;
            let gain = if calls <= frames_per_try * 3 {
                0.955
            } else {
                0.252
            };
            for i in 0..input.len() {
                l[i] = input[i] * gain;
                r[i] = l[i];
            }
            true
        };
        assert_eq!(
            settle(&mut late, 48000, &AtomicBool::new(false), || {}, 32),
            Ok(10)
        );
        // 계속 바뀌는 톤이어도 상한에서 진행합니다.
        let mut level = 1.0f32;
        let mut wobble = |input: &[f32], l: &mut [f32], r: &mut [f32]| {
            level *= 0.97;
            for i in 0..input.len() {
                l[i] = input[i] * level;
                r[i] = l[i];
            }
            true
        };
        assert_eq!(
            settle(&mut wobble, 48000, &AtomicBool::new(false), || {}, 6),
            Ok(6)
        );
        assert_eq!(
            settle(&mut wobble, 48000, &AtomicBool::new(true), || {}, 6),
            Err("CANCELED")
        );
    }
    #[test]
    fn stereo_wav_round_trips_through_mix_decoder_as_mono_average() {
        let bytes = stereo_wav(&[0.5, -0.5], &[0.25, 0.25], 48000);
        let mut budget = 1 << 20;
        let pcm = crate::mixer::pcm::decode(&bytes, &mut budget, &AtomicBool::new(false))
            .expect("디코드");
        assert_eq!((pcm.rate, pcm.channels), (48000, 2));
        assert_eq!(pcm.samples, [0.375, -0.125]);
    }
}
