// 장치나 Tauri를 열지 않고 제품의 동일한 DSP 소스를 직접 관측합니다.
#[path = "../../src-tauri/src/audio/dsp.rs"]
mod dsp;

use std::time::{Duration, Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 1 {
        return Err("관측 길이1~300초 하나만 지정하세요.".into());
    }
    let seconds: u64 = args[0].parse()?;
    if !(1..=300).contains(&seconds) {
        return Err("관측 길이는1~300초입니다.".into());
    }
    const RATE: u64 = 48_000;
    const BLOCK: u64 = 480;
    let waveform: Vec<f32> = (0..RATE * 4)
        .map(|index| {
            let t = index as f64 / RATE as f64;
            match index / RATE {
                0 | 1 => {
                    (0.08 * (std::f64::consts::TAU * 82.4069 * t).sin()
                        + 0.22 * (std::f64::consts::TAU * 164.8138 * t).sin()
                        + 0.04 * (std::f64::consts::TAU * 247.2207 * t).sin())
                        as f32
                }
                2 => 0.0,
                _ => (0.3 * (std::f64::consts::TAU * 440.0 * t).sin()) as f32,
            }
        })
        .collect();
    let mut detector = dsp::Detector::new(RATE as u32, -50.0);
    let blocks = seconds * 100;
    let mut timings = Vec::with_capacity(blocks as usize);
    let mut outputs = 0_u64;
    let mut pitches = 0_u64;
    let mut onsets = 0_u64;
    let mut late_blocks = 0_u64;
    let mut max_lateness_ms = 0.0_f64;
    let started = Instant::now();
    for block in 0..blocks {
        let work = Instant::now();
        for index in block * BLOCK..(block + 1) * BLOCK {
            let captured_ns = 1_000_000_000 + index * 1_000_000_000 / RATE;
            if let Some(output) = detector.push(dsp::Sample {
                index,
                captured_ns,
                value: waveform[index as usize % waveform.len()],
            }) {
                outputs += 1;
                assert!(output.level_dbfs.is_finite());
                if let Some(pitch) = output.pitch {
                    assert!(pitch.midi.is_finite() && (0.0..=1.0).contains(&pitch.confidence));
                    pitches += 1;
                }
                onsets += u64::from(output.onset.is_some());
                assert!(detector.judgement_watermark_ns(captured_ns) <= captured_ns);
            }
        }
        timings.push(work.elapsed().as_secs_f64() * 1000.0);
        let deadline = started + Duration::from_millis((block + 1) * 10);
        let now = Instant::now();
        if now > deadline {
            late_blocks += 1;
            max_lateness_ms = max_lateness_ms.max((now - deadline).as_secs_f64() * 1000.0);
        } else {
            std::thread::sleep(deadline - now);
        }
    }
    let elapsed = started.elapsed().as_secs_f64();
    assert_eq!(outputs, seconds * RATE / 1024 - 3);
    assert!(pitches > 0 && onsets > 0);
    assert_eq!(detector.discontinuities, 0);
    assert_eq!(detector.full_scale_frames, 0);
    timings.sort_by(f64::total_cmp);
    let percentile = |percent: usize| timings[(timings.len() * percent).div_ceil(100) - 1];
    println!(
        "{{\"schemaVersion\":1,\"state\":\"SYNTHETIC_DETECTOR_OBSERVED\",\"seconds\":{seconds},\"elapsedSeconds\":{elapsed:.6},\"sampleRate\":{RATE},\"blockFrames\":{BLOCK},\"frames\":{},\"blocks\":{blocks},\"outputs\":{outputs},\"pitchOutputs\":{pitches},\"onsets\":{onsets},\"discontinuities\":{},\"fullScaleFrames\":{},\"blockWorkP50Ms\":{:.6},\"blockWorkP95Ms\":{:.6},\"blockWorkMaxMs\":{:.6},\"lateBlocks\":{late_blocks},\"maxLatenessMs\":{max_lateness_ms:.6}}}",
        seconds * RATE,
        detector.discontinuities,
        detector.full_scale_frames,
        percentile(50),
        percentile(95),
        timings[timings.len() - 1],
    );
    Ok(())
}
