//! docs/12 "MP3 반주 디코딩 v1"(재생 Rust 이전 R4): MP3를 WAV와 같은 `Pcm`으로 풉니다.
//! LAME/Xing 헤더의 앞뒤 무음(gapless) 정보를 적용합니다. 처음부터 재생할 때의 WebView2 위치와 같습니다
//! (2026-11-11 실측: 헤더 있으면 앞 무음 제거, 없으면 1,105샘플 남음 — 두 경우 모두 일치).
use super::{model::mix_error, pcm::Pcm};
use crate::{ipc::AppError, storage::projects::canceled, storage::take_renders::MAX_SECONDS};
use std::{io::Cursor, sync::atomic::AtomicBool};
use symphonia::core::{
    audio::{AudioBufferRef, Signal},
    codecs::{DecoderOptions, CODEC_TYPE_MP3},
    errors::Error,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

/// 업로드 판정(`storage/projects.rs`)과 같은 MP3 첫 바이트 확인.
pub fn looks_like_mp3(bytes: &[u8]) -> bool {
    bytes.starts_with(b"ID3")
        || (bytes.first() == Some(&255) && bytes.get(1).is_some_and(|v| v & 224 == 224))
}

/// `stereo`이고 파일이 2채널이면 좌(`samples`)·우를 따로, 아니면 채널 평균 mono를 돌려줍니다.
/// 풀기 전엔 길이를 모르므로 조각마다 예산과 길이(`MAX_SECONDS`)를 확인해 넘으면 바로 멈춥니다.
pub fn decode(
    bytes: &[u8],
    budget: &mut usize,
    cancel: &AtomicBool,
    stereo: bool,
) -> Result<(Pcm, Option<Vec<f32>>), AppError> {
    let invalid = || mix_error("MIX_FORMAT_UNSUPPORTED");
    // shortcut: symphonia 입력은 소유한 버퍼여야 해서 한 번 복사합니다. 큰 MP3가 잦으면 호출부가 Vec을 넘기게 바꿉니다.
    let source = MediaSourceStream::new(Box::new(Cursor::new(bytes.to_vec())), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("mp3");
    let mut format = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            // gapless는 직접 적용합니다. 라이브러리 gapless는 Xing/VBRI가 없을 때 비트레이트로 추정한 길이에서
            // 끝을 잘라, 헤더 없는 VBR 파일의 뒷부분을 잃을 수 있습니다(리뷰 R2-2).
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| invalid())?
        .format;
    let track = format
        .default_track()
        .filter(|t| t.codec_params.codec == CODEC_TYPE_MP3)
        .ok_or_else(invalid)?;
    let track_id = track.id;
    let rate = track.codec_params.sample_rate.ok_or_else(invalid)?;
    let channels = track.codec_params.channels.ok_or_else(invalid)?.count();
    // LAME 헤더의 앞 무음(인코더+디코더 지연)과 뒤 채움. 헤더가 없으면 둘 다 0입니다.
    let delay = track.codec_params.delay.unwrap_or(0) as usize;
    let padding = track.codec_params.padding.unwrap_or(0) as usize;
    // 끝 채움은 헤더가 선언한 전체 길이까지 다 풀었을 때만 뺍니다. 잘린 파일의 끝은 채움이 아니라 소리입니다(리뷰 R3-1).
    let declared = track.codec_params.n_frames;
    if !(8000..=192_000).contains(&rate) || !(1..=2).contains(&channels) {
        return Err(invalid());
    }
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| invalid())?;
    let split = stereo && channels == 2;
    let frame_bytes = if split { 8 } else { 4 };
    let max_frames = (*budget / frame_bytes).min((u64::from(rate) * MAX_SECONDS) as usize);
    let mut left: Vec<f32> = Vec::new();
    let mut right: Vec<f32> = Vec::new();
    let mut peak = 0.0f64;
    loop {
        canceled(cancel)?;
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(_) => return Err(invalid()),
        };
        if packet.track_id() != track_id {
            continue;
        }
        // 디코딩할 수 없는 프레임은 건너뛰지 않습니다(무음이 끼어 싱크가 밀리는 것을 숨기지 않음).
        // shortcut: 헤더가 깨진 프레임은 디먹서가 알리지 않고 넘어가 감지하지 못합니다(WebView와 같음). 손상 파일이 문제 되면 프레임 구조를 직접 훑어 거부합니다.
        let decoded = decoder.decode(&packet).map_err(|_| invalid())?;
        let AudioBufferRef::F32(buf) = decoded else {
            return Err(invalid());
        };
        if buf.spec().rate != rate || buf.spec().channels.count() != channels {
            return Err(invalid());
        }
        let n = buf.frames();
        let needed = left.len() + n;
        if needed > max_frames {
            return Err(mix_error("MIX_LIMIT_EXCEEDED"));
        }
        // 예산을 넘는 용량을 잡지 않도록 늘릴 크기를 직접 정합니다(두 배씩, 상한은 max_frames).
        for v in [&mut left, &mut right]
            .into_iter()
            .take(if split { 2 } else { 1 })
        {
            if v.capacity() < needed {
                let target = (v.capacity() * 2).max(needed).min(max_frames);
                v.reserve_exact(target - v.len());
            }
        }
        let l = buf.chan(0);
        let r = buf.chan(channels - 1);
        for i in 0..n {
            let (a, b) = (l[i], r[i]);
            if !a.is_finite() || !b.is_finite() {
                return Err(invalid());
            }
            peak = peak.max(f64::from(a.abs())).max(f64::from(b.abs()));
            if split {
                left.push(a);
                right.push(b);
            } else {
                left.push(if channels == 2 { (a + b) * 0.5 } else { a });
            }
        }
    }
    let reached_end = declared.is_some_and(|n| left.len() as u64 >= n);
    for v in [&mut left, &mut right] {
        let end = if reached_end {
            v.len().saturating_sub(padding)
        } else {
            v.len()
        };
        v.truncate(end);
        v.drain(..delay.min(end));
    }
    if left.is_empty() {
        return Err(invalid());
    }
    *budget -= left.len() * frame_bytes;
    left.shrink_to_fit();
    right.shrink_to_fit();
    Ok((
        Pcm {
            rate,
            channels: channels as u16,
            peak,
            samples: left,
        },
        split.then_some(right),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    // 자체 생성 1.5초 파일(1.000초에 클릭 하나, ffmpeg libmp3lame). 생성 방법은 docs/progress/PLAYBACK-RUST-R4.md.
    const MONO_LAME: &[u8] = include_bytes!("testdata/click-mono-lame.mp3");
    const MONO_NOXING: &[u8] = include_bytes!("testdata/click-mono-noxing.mp3");
    const STEREO_LEFT: &[u8] = include_bytes!("testdata/click-stereo-left.mp3");
    /// 앞 0.5초 잡음(높은 비트레이트)·뒤 무음, 2.000초 클릭, 2.5초. Xing/VBRI 없는 VBR(`-q:a 2 -write_xing 0`).
    const VBR_NOXING: &[u8] = include_bytes!("testdata/click-mono-vbr-noxing.mp3");
    fn peak_at(s: &[f32]) -> usize {
        (0..s.len())
            .max_by(|a, b| s[*a].abs().total_cmp(&s[*b].abs()))
            .unwrap_or(0)
    }
    #[test]
    fn mp3_start_matches_webview_with_and_without_lame_header() {
        let no = AtomicBool::new(false);
        let mut budget = usize::MAX / 2;
        let before = budget;
        let (pcm, right) = decode(MONO_LAME, &mut budget, &no, true).expect("LAME");
        assert_eq!((pcm.rate, pcm.channels, right.is_none()), (44100, 1, true));
        // 헤더의 앞뒤 무음을 지워 원본 길이·클릭 위치 그대로
        assert_eq!(pcm.samples.len(), 66150);
        assert_eq!(peak_at(&pcm.samples), 44100);
        assert_eq!(before - budget, 66150 * 4);
        // 헤더가 없으면 WebView2도 앞 무음 1,105샘플을 그대로 재생합니다.
        let (pcm, _) = decode(MONO_NOXING, &mut usize::MAX.clone(), &no, false).expect("헤더 없음");
        assert_eq!(peak_at(&pcm.samples), 44100 + 1105);
    }
    #[test]
    fn stereo_mp3_splits_channels_or_averages_to_mono() {
        let no = AtomicBool::new(false);
        let (left, right) = decode(STEREO_LEFT, &mut (usize::MAX / 2), &no, true).expect("stereo");
        let right = right.expect("우 채널");
        assert_eq!((left.rate, left.channels), (48000, 2));
        // 손실 압축이라 피크가 1샘플 흔들릴 수 있습니다(Chromium 디코딩도 같음).
        assert!(peak_at(&left.samples).abs_diff(48000) <= 1);
        assert!(right.iter().all(|v| v.abs() < 0.01), "우는 무음");
        let (mono, none) = decode(STEREO_LEFT, &mut (usize::MAX / 2), &no, false).expect("mono");
        assert!(none.is_none());
        assert!((mono.samples[48000] - (left.samples[48000] + right[48000]) * 0.5).abs() < 1e-6);
    }
    #[test]
    fn mp3_budget_garbage_and_cancel_are_refused() {
        let no = AtomicBool::new(false);
        let mut small = 66150 * 4 - 1;
        assert_eq!(
            decode(MONO_LAME, &mut small, &no, false)
                .map(|_| ())
                .map_err(|e| e.code),
            Err("MIX_LIMIT_EXCEEDED")
        );
        assert_eq!(small, 66150 * 4 - 1, "실패하면 예산을 쓰지 않음");
        let mut garbage = b"ID3".to_vec();
        garbage.extend_from_slice(&[7u8; 64]);
        assert_eq!(
            decode(&garbage, &mut (usize::MAX / 2), &no, false)
                .map(|_| ())
                .map_err(|e| e.code),
            Err("MIX_FORMAT_UNSUPPORTED")
        );
        assert_eq!(
            decode(
                MONO_LAME,
                &mut (usize::MAX / 2),
                &AtomicBool::new(true),
                false
            )
            .map(|_| ())
            .map_err(|e| e.code),
            Err("CANCELED")
        );
    }
    #[test]
    fn truncated_mp3_plays_up_to_the_last_whole_frame_without_shifting() {
        // 리뷰 R1-2: 끝이 잘린 MP3는 WebView처럼 풀리는 데까지 씁니다(정상 끝과 같은 EOF라 구분 불가).
        let no = AtomicBool::new(false);
        let (full, _) = decode(MONO_LAME, &mut (usize::MAX / 2), &no, false).expect("전체");
        let (cut, _) = decode(
            &MONO_LAME[..MONO_LAME.len() / 2 + 17],
            &mut (usize::MAX / 2),
            &no,
            false,
        )
        .expect("잘린 파일");
        assert!(!cut.samples.is_empty() && cut.samples.len() < full.samples.len());
        assert_eq!(cut.samples[..], full.samples[..cut.samples.len()]);
        // 헤더: 앞 지연 1,105·끝 채움 713. 잘린 쪽은 앞 지연만 빼고 마지막 온전한 프레임(1,152샘플)까지 다 씁니다(리뷰 R3-1).
        assert_eq!((full.samples.len() + 1105 + 713) % 1152, 0);
        assert_eq!(
            (cut.samples.len() + 1105) % 1152,
            0,
            "{}",
            cut.samples.len()
        );
    }
    #[test]
    fn headerless_vbr_mp3_keeps_its_tail() {
        // 리뷰 R2-2: 앞 프레임이 커서 비트레이트 추정 길이가 실제보다 짧아도 끝까지 풉니다.
        let (pcm, _) = decode(
            VBR_NOXING,
            &mut (usize::MAX / 2),
            &AtomicBool::new(false),
            false,
        )
        .expect("VBR");
        assert!(pcm.samples.len() >= 110_250, "길이 {}", pcm.samples.len());
        // 헤더가 없으면 WebView처럼 앞 1,105샘플이 남습니다.
        let at = peak_at(&pcm.samples[66_150..]) + 66_150;
        assert!((at as i64 - (88_200 + 1_105)).abs() < 40, "클릭 {at}");
    }
    #[test]
    fn mix_decoder_routes_mp3_bytes_to_this_decoder() {
        let pcm =
            super::super::pcm::decode(MONO_LAME, &mut (usize::MAX / 2), &AtomicBool::new(false))
                .expect("믹스 디코더의 MP3");
        assert_eq!((pcm.rate, pcm.samples.len()), (44100, 66150));
    }
    /// 큰 입력 성능: 1.5초 파일을 380번 이어 붙인 약 10분 MP3를 푸는 시간을 잽니다(측정용, `--ignored`).
    #[test]
    #[ignore]
    fn ten_minute_mp3_decode_time() {
        let long: Vec<u8> = MONO_NOXING.repeat(380);
        let begin = std::time::Instant::now();
        let (pcm, _) =
            decode(&long, &mut (usize::MAX / 2), &AtomicBool::new(false), true).expect("10분");
        let seconds = pcm.samples.len() as f64 / f64::from(pcm.rate);
        eprintln!(
            "MP3 {seconds:.0}초 mono 풀기: {:.2}초",
            begin.elapsed().as_secs_f64()
        );
        assert!(seconds > 570.0);
    }
}
