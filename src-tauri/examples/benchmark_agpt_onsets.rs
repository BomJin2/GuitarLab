//! 고정 공개 자료의 기존 타격 검출 기준선입니다. 실제 입력/점수·주법 판정을 실행하지 않습니다.

use guitarlab_lib::audio::dsp::{Detector, Sample};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    error::Error,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::Instant,
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;
const RATE: u32 = 48000;
const PLAN: &[u8] = include_bytes!("../../fixtures/agpt-onset-sample-v1.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Benchmark {
    schema_version: u8,
    state: String,
    source: String,
    license: String,
    plan_sha256: String,
    source_manifest_sha256: String,
    metadata_manifest_sha256: String,
    reference_policy: String,
    pitch_evaluation_enabled: bool,
    reference_pitch_issues: BTreeMap<PitchStatus, usize>,
    noise_gate_dbfs: f64,
    gain_normalized: bool,
    tail_padding_frames: u32,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Case {
    clip_id: String,
    file: String,
    frames: u32,
    sha256: String,
    references: Vec<Reference>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reference {
    sample: u32,
    raw_pitch_midi: String,
    pitch_reference_status: PitchStatus,
    source_seconds: String,
}
#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum PitchStatus {
    Missing,
    InvalidNumeric,
    OutsideMidiRange,
    UnverifiedRangeOnly,
}
#[derive(Deserialize)]
struct Plan {
    samples: Vec<PlannedSample>,
}
#[derive(Deserialize)]
struct PlannedSample {
    filename: String,
    frames: u32,
    bytes: u64,
    sha256: String,
    notes: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Detection {
    onset_sample: u64,
    emitted_sample: u64,
    pitch_midi: Option<f64>,
    confidence: Option<f64>,
}

fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn sha(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn read_file(project: &Path, path: &Path, limit: u64) -> Result<Vec<u8>> {
    let relative = path.strip_prefix(project)?;
    if !relative.starts_with("fixtures/external/agpt-audio-10159492")
        || !relative
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
    {
        return Err("고정 공개 자료 경로가 아닙니다.".into());
    }
    let mut current = project.to_path_buf();
    for part in relative.components() {
        current.push(part);
        let metadata = fs::symlink_metadata(&current)?;
        #[cfg(windows)]
        let reparse = {
            use std::os::windows::fs::MetadataExt;
            metadata.file_attributes() & 0x400 != 0
        };
        #[cfg(not(windows))]
        let reparse = metadata.file_type().is_symlink();
        if reparse {
            return Err("공개 자료 링크는 허용하지 않습니다.".into());
        }
    }
    if !path.is_file() || fs::metadata(path)?.len() > limit {
        return Err("공개 자료 파일 크기 오류".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err("공개 자료 읽기 한도 초과".into());
    }
    Ok(bytes)
}

fn measure(samples: &[f32]) -> Result<(Vec<Detection>, u64, f64)> {
    let mut detector = Detector::new(RATE, -50.0);
    let mut detections = Vec::new();
    for (index, value) in samples.iter().enumerate() {
        if let Some(output) = detector.push(Sample {
            value: *value,
            index: index as u64,
            captured_ns: index as u64 * 1_000_000_000 / u64::from(RATE),
        }) {
            if let Some((attack, pitch)) = output.onset {
                if pitch.is_some_and(|p| {
                    !p.midi.is_finite()
                        || !p.confidence.is_finite()
                        || !(0.0..=1.0).contains(&p.confidence)
                }) {
                    return Err("검출기의 비유한 음정/신뢰도".into());
                }
                detections.push(Detection {
                    onset_sample: attack.index,
                    emitted_sample: index as u64,
                    pitch_midi: pitch.map(|p| p.midi),
                    confidence: pitch.map(|p| p.confidence),
                });
            }
        }
    }
    let processed_ns = samples.len().saturating_sub(1) as u64 * 1_000_000_000 / u64::from(RATE);
    Ok((
        detections,
        detector.discontinuities,
        detector.judgement_watermark_ns(processed_ns) as f64 / 1e6,
    ))
}

fn run() -> Result<()> {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    let [manifest] = arguments.as_slice() else {
        return Err("공개 benchmark.json의 절대 경로가 필요합니다.".into());
    };
    let manifest = PathBuf::from(manifest);
    let project = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("프로젝트 경로 오류")?;
    let raw = read_file(project, &manifest, 2 * 1024 * 1024)?;
    let benchmark: Benchmark = serde_json::from_slice(&raw)?;
    let plan: Plan = serde_json::from_slice(PLAN)?;
    if benchmark.schema_version != 1
        || benchmark.state != "AGPT_ONSET_BENCHMARK_PREPARED"
        || benchmark.source != "AG-PT-set10159492"
        || benchmark.license != "cc-by-4.0"
        || benchmark.plan_sha256 != hash(PLAN)
        || !sha(&benchmark.source_manifest_sha256)
        || !sha(&benchmark.metadata_manifest_sha256)
        || benchmark.reference_policy != "onset-sample-column-only-v1"
        || benchmark.pitch_evaluation_enabled
        || benchmark.noise_gate_dbfs != -50.0
        || benchmark.gain_normalized
        || benchmark.tail_padding_frames != 0
        || benchmark.cases.len() != 8
        || plan.samples.len() != 8
    {
        return Err("고정 검증 입력 계약 오류".into());
    }
    let mut pitch_issues = BTreeMap::new();
    for reference in benchmark.cases.iter().flat_map(|case| &case.references) {
        *pitch_issues
            .entry(reference.pitch_reference_status)
            .or_insert(0) += 1;
    }
    if pitch_issues != benchmark.reference_pitch_issues {
        return Err("음정 참조 보류 분모 오류".into());
    }
    let root = manifest.parent().ok_or("검증 입력 폴더 오류")?;
    let source = root.parent().ok_or("공개 원문 폴더 오류")?;
    let origin = read_file(project, &source.join("manifest.json"), 128 * 1024)?;
    if hash(&origin) != benchmark.source_manifest_sha256 {
        return Err("원문 manifest 지문 오류".into());
    }
    let mut clips = Vec::new();
    for (index, (case, planned)) in benchmark.cases.iter().zip(&plan.samples).enumerate() {
        if case.clip_id != planned.filename
            || case.frames != planned.frames
            || !(1..=RATE * 60).contains(&case.frames)
            || case.file != format!("case-{index:05}.f32")
            || !sha(&case.sha256)
            || case.references.len() != planned.notes
            || case.references.iter().any(|r| {
                let seconds = r.source_seconds.parse::<f64>().unwrap_or(f64::NAN);
                r.sample >= case.frames
                    || r.raw_pitch_midi.is_empty()
                    || r.raw_pitch_midi.len() > 128
                    || !seconds.is_finite()
                    || seconds < 0.0
                    || (seconds * f64::from(RATE) - f64::from(r.sample)).abs() > 2.0
            })
            || case
                .references
                .windows(2)
                .any(|r| r[0].sample >= r[1].sample)
        {
            return Err("고정 검증 조각/참조 오류".into());
        }
        let original = read_file(project, &source.join(&planned.filename), planned.bytes)?;
        if original.len() as u64 != planned.bytes || hash(&original) != planned.sha256 {
            return Err("공개 WAV 원문 SHA 오류".into());
        }
        let bytes = read_file(
            project,
            &root.join("cases").join(&case.file),
            u64::from(case.frames) * 4,
        )?;
        if bytes.len() != case.frames as usize * 4 || hash(&bytes) != case.sha256 {
            return Err("파생 float32 지문 오류".into());
        }
        let samples: Vec<_> = bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| f32::from_le_bytes(*b))
            .collect();
        if samples.iter().any(|v| !v.is_finite() || v.abs() > 1.0) {
            return Err("파생 PCM 범위 오류".into());
        }
        let started = Instant::now();
        let (events, discontinuities, watermark_ms) = measure(&samples)?;
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        println!(
            "{}",
            json!({"completed":index+1,"total":8,"detections":events.len()})
        );
        clips.push(
            json!({"clipId":case.clip_id,"frames":case.frames,"processingMs":elapsed_ms,
            "discontinuities":discontinuities,"finalWatermarkMs":watermark_ms,"events":events}),
        );
    }
    let result = json!({"schemaVersion":1,"state":"COMPLETED","benchmarkSha256":hash(&raw),
        "sampleRate":RATE,"noiseGateDbfs":-50.0,"coldStart":true,"tailPaddingFrames":0,
        "actualDeviceLatencyMeasured":false,"actualAppJudgements":false,
        "referencePolicy":benchmark.reference_policy,"pitchEvaluationEnabled":false,
        "referencePitchIssues":benchmark.reference_pitch_issues,"clips":clips});
    let destination = root.join(format!("detections-{}.json", uuid::Uuid::new_v4()));
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)?;
    output.write_all(&serde_json::to_vec_pretty(&result)?)?;
    output.sync_all()?;
    println!("{}", destination.display());
    Ok(())
}

fn main() {
    if let Err(cause) = run() {
        eprintln!("공개 기준선 실패: {cause}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_attack_preserves_attack_time_and_reports_separate_emission_time() {
        let samples: Vec<_> = (0..RATE)
            .map(|index| {
                if index < RATE / 10 {
                    0.0
                } else {
                    (0.2 * (std::f64::consts::TAU * 329.6276 * f64::from(index) / f64::from(RATE))
                        .sin()) as f32
                }
            })
            .collect();
        let (events, discontinuities, watermark) = measure(&samples).expect("합성 기준선");
        assert_eq!(events.len(), 1);
        assert_eq!(discontinuities, 0);
        assert!((4800..=5280).contains(&events[0].onset_sample));
        assert!(events[0].emitted_sample >= events[0].onset_sample + 4096);
        assert!(events[0].emitted_sample <= events[0].onset_sample + 10080);
        assert!((events[0].pitch_midi.expect("합성 단음") - 64.0).abs() < 0.1);
        assert!(watermark > 700.0 && watermark < 1000.0);
    }
}
