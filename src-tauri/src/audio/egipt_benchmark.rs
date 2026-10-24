//! 고정 공개 DI의 비점수 관측입니다. 파일 라벨은 연속 음정/주법 정답이 아닙니다.
use super::{pitch_track::analyze_pitch_track, technique_benchmark::read};
use crate::storage::projects::hash;
use serde_json::{json, Value};
use std::{fs, io::Write, path::Path, sync::atomic::AtomicBool, time::Instant};

const PLAN: &[u8] = include_bytes!("../../../fixtures/egipt-technique-sample-v1.json");
const PLAN_HASH: &str = "6da7035d1d8b121c0c9038201d0715ae25e4784dbd23426c1716512c12f51766";
const MANIFEST_HASH: &str = "71e721ef7039c65d944a34770ebbf116d0838c3fee8304fd60c8a6f2371c03ff";
const RATE: usize = 96000;

fn pcm24(raw: &[u8]) -> Option<Vec<f32>> {
    if raw.get(..4)? != b"RIFF"
        || raw.get(8..12)? != b"WAVE"
        || u32::from_le_bytes(raw.get(4..8)?.try_into().ok()?) as usize + 8 != raw.len()
    {
        return None;
    }
    let mut offset = 12;
    let mut format = false;
    let mut data = None;
    while offset < raw.len() {
        let kind = raw.get(offset..offset + 4)?;
        let size = u32::from_le_bytes(raw.get(offset + 4..offset + 8)?.try_into().ok()?) as usize;
        offset += 8;
        let body = raw.get(offset..offset.checked_add(size)?)?;
        if kind == b"fmt " {
            if format
                || body.len() < 16
                || body[..16] != [1, 0, 1, 0, 0, 119, 1, 0, 0, 101, 4, 0, 3, 0, 24, 0]
            {
                return None;
            }
            format = true;
        } else if kind == b"data" {
            if data.is_some() || size == 0 || !size.is_multiple_of(3) || size > RATE * 30 * 3 {
                return None;
            }
            data = Some(body);
        }
        offset = offset.checked_add(size + size % 2)?;
        if offset > raw.len() {
            return None;
        }
    }
    if !format {
        return None;
    }
    Some(
        data?
            .as_chunks::<3>()
            .0
            .iter()
            .map(|v| i32::from_le_bytes([0, v[0], v[1], v[2]]) as f32 / 2147483648.0)
            .collect(),
    )
}

#[test]
fn pcm24_keeps_exact_polarity_and_rejects_wrong_format_truncated_or_duplicate_data() {
    let mut raw = b"RIFF\0\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\0\x77\x01\0\0\x65\x04\0\x03\0\x18\0data\x09\0\0\0".to_vec();
    raw.extend_from_slice(&[0, 0, 128, 0, 0, 64, 255, 255, 127, 0]);
    let len = (raw.len() - 8) as u32;
    raw[4..8].copy_from_slice(&len.to_le_bytes());
    assert_eq!(
        pcm24(&raw).expect("자체 PCM24"),
        vec![-1.0, 0.5, 8388607.0 / 8388608.0]
    );
    for index in [0, 8, 20, 22, 24, 28, 32, 34, 40] {
        let mut bad = raw.clone();
        bad[index] ^= 1;
        assert!(pcm24(&bad).is_none(), "잘못된 헤더 {index}");
    }
    let mut truncated = raw.clone();
    truncated.pop();
    assert!(pcm24(&truncated).is_none());
    let mut duplicate = raw.clone();
    duplicate.extend_from_slice(&raw[36..]);
    let len = (duplicate.len() - 8) as u32;
    duplicate[4..8].copy_from_slice(&len.to_le_bytes());
    assert!(pcm24(&duplicate).is_none());
}

#[test]
#[ignore = "명시적으로 받은 EG-IPT 고정 DI8개가 필요하며 주법 정확도/점수를 검사하지 않습니다"]
fn public_egipt_pitch_motion_observations() {
    let allowed = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("프로젝트")
        .join("fixtures/external/egipt-15205644")
        .canonicalize()
        .expect("공개 EG-IPT");
    let manifest = std::path::PathBuf::from(
        std::env::var_os("GUITARLAB_EGIPT_SAMPLE").expect("고정 manifest"),
    )
    .canonicalize()
    .expect("manifest 경로");
    assert!(manifest.starts_with(&allowed));
    let raw = read(&allowed, &manifest, 32768);
    assert_eq!(hash(&raw), MANIFEST_HASH);
    assert_eq!(hash(PLAN), PLAN_HASH);
    let source: Value = serde_json::from_slice(&raw).expect("고정 수신 결과");
    let plan: Value = serde_json::from_slice(PLAN).expect("고정 선택 계획");
    assert_eq!(source["state"], "DI_FILES_VERIFIED_NOT_ANALYZED");
    assert_eq!(source["planSha256"], PLAN_HASH);
    assert_eq!(source["continuousPitchGroundTruthVerified"], false);
    let files = source["files"].as_array().expect("8개 원본");
    let planned = plan["samples"].as_array().expect("8개 조건");
    assert_eq!(files.len(), 8);
    assert_eq!(planned.len(), 8);
    let root = manifest.parent().expect("원본 root");
    let mut observations = Vec::new();
    let mut exclusions = Vec::new();
    for (file, selected) in files.iter().zip(planned) {
        for key in [
            "member",
            "bytes",
            "compressedBytes",
            "crc32",
            "headerOffset",
        ] {
            assert_eq!(file[key], selected[key]);
        }
        let name = file["name"].as_str().expect("원본 파일명");
        assert_eq!(
            Path::new(name).file_name().and_then(|s| s.to_str()),
            Some(name)
        );
        assert!(!name.contains(['/', '\\', ':']));
        let path = root.join(name);
        let original = read(&allowed, &path, 12 * 1024 * 1024);
        assert_eq!(hash(&original), file["sha256"].as_str().expect("원본 SHA"));
        let samples = pcm24(&original).expect("mono PCM24/96kHz 원본");
        assert_eq!(
            samples.len() as u64,
            file["frames"].as_u64().expect("원본 프레임")
        );
        let full_windows = samples.len() / RATE;
        exclusions.push(json!({"file":name,"fullWindows":full_windows,"unusedTailFrames":samples.len()%RATE,
            "fileExcluded":full_windows==0,"reason":if full_windows==0 {"SHORTER_THAN_ONE_SECOND"} else {"TRAILING_PARTIAL_SECOND"}}));
        for (index, window) in samples.as_chunks::<RATE>().0.iter().enumerate() {
            let started = Instant::now();
            let result = analyze_pitch_track(window, RATE as u32, &AtomicBool::new(false))
                .expect("공개 DI 관측");
            observations.push(json!({"file":name,"fileLabel":selected["variant"],"startMs":index*1000,
                "motion":format!("{:?}",result.motion),"coverage":result.coverage,"deltaCents":result.delta_cents,
                "rmsDbfs":result.rms_dbfs,"minConfidence":result.min_confidence,"oscillation":result.oscillation,
                "warnings":result.warnings,"elapsedMs":started.elapsed().as_secs_f64()*1000.0,
                "points":result.points.iter().map(|p|json!({"timeMs":p.time_ms,"midi":p.pitch.map(|v|v.midi),"confidence":p.pitch.map(|v|v.confidence)})).collect::<Vec<_>>()}));
        }
        assert_eq!(
            hash(&read(&allowed, &path, 12 * 1024 * 1024)),
            hash(&original)
        );
    }
    assert_eq!(observations.len(), 31);
    assert_eq!(hash(&read(&allowed, &manifest, 32768)), MANIFEST_HASH);
    let result = json!({"schemaVersion":1,"state":"EGIPT_PITCH_MOTION_OBSERVED","source":plan["source"],
        "sourceManifestSha256":MANIFEST_HASH,"planSha256":PLAN_HASH,"windowPolicy":"all-complete-nonoverlapping-1s-from-zero-v1",
        "gainNormalized":false,"resampled":false,"padded":false,"continuousPitchGroundTruthVerified":false,
        "actualAppJudgements":false,"independentPerformerEvaluation":false,"observations":observations,"exclusions":exclusions});
    let destination = root.join(format!("pitch-observations-{}.json", uuid::Uuid::new_v4()));
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .expect("새 관측 파일");
    output
        .write_all(
            serde_json::to_string_pretty(&result)
                .expect("관측 JSON")
                .as_bytes(),
        )
        .expect("관측 보존");
    println!("EG-IPT 비점수 관측 결과: {}", destination.display());
}
