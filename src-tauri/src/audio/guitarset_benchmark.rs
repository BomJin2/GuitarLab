//! 공개 참조의 좁은 오프라인 기준선입니다. 실제 주법·점수의 정답 검사로 사용하지 않습니다.

use super::{pitch_track::analyze_pitch_track, polyphonic::analyze_window};
use crate::storage::projects::hash;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::Instant,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Benchmark {
    schema_version: u8,
    source: String,
    license: String,
    source_manifest_sha256: String,
    reference_policy: String,
    reference_issues: BTreeMap<String, u64>,
    cases: Vec<Case>,
}
#[derive(Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum Kind {
    Track,
    Spectrum,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Case {
    clip_id: String,
    kind: Kind,
    start_ms: f64,
    sample_rate: u32,
    frames: u32,
    file: String,
    sha256: String,
    references: Vec<Option<Vec<f64>>>,
}

fn matches(expected: &[f64], detected: &[f64]) -> usize {
    let mut masks = [false; 64];
    masks[0] = true;
    for target in expected {
        let mut next = masks;
        for (mask, valid) in masks.iter().enumerate().take(1 << detected.len()) {
            if !valid {
                continue;
            }
            for (i, candidate) in detected.iter().enumerate() {
                if mask & (1 << i) == 0 && (target - candidate).abs() * 100.0 <= 50.0 {
                    next[mask | (1 << i)] = true;
                }
            }
        }
        masks = next;
    }
    masks
        .iter()
        .enumerate()
        .filter(|(_, valid)| **valid)
        .map(|(mask, _)| mask.count_ones() as usize)
        .max()
        .unwrap_or(0)
}

#[derive(Default)]
struct Metrics {
    track_windows: u64,
    track_points: u64,
    unstable_points: u64,
    mono_points: u64,
    mono_detected: u64,
    mono_matched: u64,
    poly_points: u64,
    poly_detected_single: u64,
    silent_points: u64,
    silent_candidates: u64,
    errors: Vec<f64>,
    track_ms: Vec<f64>,
    spectrum_ms: Vec<f64>,
    spectrum_windows: u64,
    unstable_spectra: u64,
    stable_spectra: u64,
    expected: u64,
    detected: u64,
    matched: u64,
    silent_spectra: u64,
    silent_spectrum_candidates: u64,
    motions: BTreeMap<String, u64>,
}
fn ratio(top: u64, bottom: u64) -> Option<f64> {
    (bottom > 0).then(|| top as f64 / bottom as f64)
}
fn distribution(values: &[f64]) -> Value {
    if values.is_empty() {
        return Value::Null;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    json!({"count":sorted.len(), "median":sorted[sorted.len()/2],
        "p95":sorted[(sorted.len()*95).div_ceil(100)-1], "max":sorted[sorted.len()-1]})
}
impl Metrics {
    fn summary(&self) -> Value {
        let precision = ratio(self.matched, self.detected);
        let recall = ratio(self.matched, self.expected);
        let f1 = ratio(self.matched * 2, self.detected + self.expected);
        json!({"track":{"windows":self.track_windows,"points":self.track_points,
            "excludedReferencePoints":self.unstable_points,"monoReferencePoints":self.mono_points,
            "monoCandidatePoints":self.mono_detected,"monoMatchesWithin50Cents":self.mono_matched,
            "monoCandidateCoverage":ratio(self.mono_detected,self.mono_points),
            "monoHitRateIncludingMissing":ratio(self.mono_matched,self.mono_points),
            "monoConditionalAccuracy":ratio(self.mono_matched,self.mono_detected),
            "absoluteErrorCents":distribution(&self.errors),"polyReferencePoints":self.poly_points,
            "polyPointsWithSingleCandidate":self.poly_detected_single,
            "polySingleCandidateRate":ratio(self.poly_detected_single,self.poly_points),
            "unvoicedReferencePoints":self.silent_points,"unvoicedPointsWithCandidate":self.silent_candidates,
            "motions":self.motions,"processingMs":distribution(&self.track_ms)},
            "spectrum":{"windows":self.spectrum_windows,"unstableOrUnsupportedReferences":self.unstable_spectra,
            "stableWindows":self.stable_spectra,"expectedPitches":self.expected,"detectedPitches":self.detected,
            "matchedPitches":self.matched,"precision":precision,"recall":recall,"f1":f1,
            "stableUnvoicedWindows":self.silent_spectra,"unvoicedWindowCandidates":self.silent_spectrum_candidates,
            "processingMs":distribution(&self.spectrum_ms)}})
    }
    fn evaluate(&mut self, case: &Case, pcm: &[f32]) -> Option<Value> {
        let cancel = AtomicBool::new(false);
        let start = Instant::now();
        if case.kind == Kind::Track {
            let result =
                analyze_pitch_track(pcm, case.sample_rate, &cancel).expect("공개 단음 궤적");
            self.track_ms.push(start.elapsed().as_secs_f64() * 1000.0);
            self.track_windows += 1;
            *self
                .motions
                .entry(format!("{:?}", result.motion))
                .or_default() += 1;
            assert!(result.points.is_empty() || result.points.len() == case.references.len());
            for (index, expected) in case.references.iter().enumerate() {
                self.track_points += 1;
                let detected = result.points.get(index).and_then(|point| point.pitch);
                match expected {
                    None => self.unstable_points += 1,
                    Some(pitches) if pitches.is_empty() => {
                        self.silent_points += 1;
                        self.silent_candidates += u64::from(detected.is_some());
                    }
                    Some(pitches) if pitches.len() == 1 => {
                        self.mono_points += 1;
                        if let Some(detected) = detected {
                            self.mono_detected += 1;
                            let error = (detected.midi - pitches[0]).abs() * 100.0;
                            self.errors.push(error);
                            self.mono_matched += u64::from(error <= 50.0);
                        }
                    }
                    Some(_) => {
                        self.poly_points += 1;
                        self.poly_detected_single += u64::from(detected.is_some());
                    }
                }
            }
            Some(
                json!({"clipId":case.clip_id,"startMs":case.start_ms,"warnings":result.warnings,
                "points":case.references.iter().enumerate().map(|(index, reference)| {
                    let point = result.points.get(index);
                    let pitch = point.and_then(|p| p.pitch);
                    json!({"index":index,"timeMs":point.map(|p| p.time_ms),"referenceMidi":reference,
                        "detectedMidi":pitch.map(|p| p.midi),"periodicity":pitch.map(|p| p.confidence)})
                }).collect::<Vec<_>>() }),
            )
        } else {
            let result =
                analyze_window(pcm, case.sample_rate, &cancel).expect("공개 스펙트럼 후보");
            self.spectrum_ms
                .push(start.elapsed().as_secs_f64() * 1000.0);
            self.spectrum_windows += 1;
            if let Some(expected) = &case.references[0] {
                let detected: Vec<_> = result.pitches.iter().map(|pitch| pitch.midi).collect();
                self.stable_spectra += 1;
                self.expected += expected.len() as u64;
                self.detected += detected.len() as u64;
                self.matched += matches(expected, &detected) as u64;
                if expected.is_empty() {
                    self.silent_spectra += 1;
                    self.silent_spectrum_candidates += detected.len() as u64;
                }
            } else {
                self.unstable_spectra += 1;
            }
            None
        }
    }
}
fn read_file(path: &Path, max_bytes: u64) -> Vec<u8> {
    assert!(!fs::symlink_metadata(path)
        .expect("자료 경로")
        .file_type()
        .is_symlink());
    let metadata = fs::metadata(path).expect("자료 metadata");
    assert!(metadata.is_file() && metadata.len() <= max_bytes);
    let bytes = fs::read(path).expect("검증 자료 읽기");
    assert!(bytes.len() as u64 <= max_bytes);
    bytes
}

#[test]
fn benchmark_matching_uses_maximum_one_to_one_without_confidence_invention() {
    assert_eq!(matches(&[60.0, 60.6], &[59.6, 60.2]), 2);
    assert_eq!(matches(&[40.0, 52.0], &[40.0]), 1);
    assert_eq!(matches(&[], &[60.0]), 0);
    assert_eq!(matches(&[60.0], &[]), 0);
    let no_match = Metrics {
        detected: 1,
        expected: 1,
        ..Metrics::default()
    };
    assert_eq!(no_match.summary()["spectrum"]["f1"], 0.0);
    assert!(Metrics::default().summary()["spectrum"]["f1"].is_null());
}

#[test]
fn benchmark_details_keep_missing_candidates_and_unknown_or_unvoiced_references_distinct() {
    let mut references = vec![None; 38];
    references[0] = Some(vec![64.125]);
    references[1] = Some(vec![]);
    let case = Case {
        clip_id: "자체 무음 경계".into(),
        kind: Kind::Track,
        start_ms: 0.0,
        sample_rate: 44100,
        frames: 44100,
        file: "case-00000.f32".into(),
        sha256: String::new(),
        references,
    };
    let mut metrics = Metrics::default();
    let report = metrics
        .evaluate(&case, &vec![0.0; 44100])
        .expect("궤적 상세");
    let points = report["points"].as_array().expect("지점");
    assert_eq!(points.len(), 38);
    assert_eq!(points[0]["referenceMidi"], json!([64.125]));
    assert_eq!(points[1]["referenceMidi"], json!([]));
    assert!(points[2]["referenceMidi"].is_null());
    assert!(points.iter().all(|p| p["timeMs"].is_null()
        && p["detectedMidi"].is_null()
        && p["periodicity"].is_null()));
    let summary = metrics.summary();
    assert_eq!(summary["track"]["monoReferencePoints"], 1);
    assert_eq!(summary["track"]["monoMatchesWithin50Cents"], 0);
    assert_eq!(summary["track"]["monoHitRateIncludingMissing"], 0.0);
    assert_eq!(summary["track"]["unvoicedReferencePoints"], 1);
    assert_eq!(summary["track"]["excludedReferencePoints"], 36);
}

#[test]
#[ignore = "공식 공개 GuitarSet 부분집합과 명시적 환경 변수가 필요한 오프라인 평가"]
fn public_guitarset_reference_benchmark() {
    let manifest = PathBuf::from(
        std::env::var("GUITARLAB_GUITARSET_BENCHMARK")
            .expect("검증 manifest 환경 변수를 지정하세요."),
    );
    let allowed = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("프로젝트")
        .join("fixtures/external")
        .canonicalize()
        .expect("검증 자료 폴더");
    let manifest = manifest.canonicalize().expect("평가 manifest");
    assert!(manifest.starts_with(&allowed));
    let raw_manifest = read_file(&manifest, 2 * 1024 * 1024);
    let data: Benchmark = serde_json::from_slice(&raw_manifest).expect("평가 계약");
    assert_eq!(data.schema_version, 1);
    assert_eq!(data.license, "cc-by-4.0");
    let (rate, source_count) = match (data.source.as_str(), data.reference_policy.as_str()) {
        (
            "GuitarSet1.1.0",
            "stable-window-v1" | "continuous-center-v1" | "continuous-note-mask-v1",
        ) => (44100, 4),
        ("EGSet12-11406378", "note-interval-guard30ms-v1") => (48000, 2),
        _ => panic!("등록하지 않은 공개 검증 자료"),
    };
    let continuous = data.reference_policy.starts_with("continuous-");
    assert!(!data.cases.is_empty() && data.cases.len() <= 512);
    let root = manifest.parent().expect("평가 자료 폴더");
    let source = read_file(
        &root.parent().expect("공개 원본").join("manifest.json"),
        128 * 1024,
    );
    assert_eq!(hash(&source), data.source_manifest_sha256);
    let source: Value = serde_json::from_slice(&source).expect("출처");
    let selected = source["selectedIds"].as_array().expect("원본 표본");
    assert_eq!(selected.len(), source_count);
    assert_eq!(source["state"], "FILES_VERIFIED");
    assert_eq!(source["license"], "cc-by-4.0");
    if data.source == "EGSet12-11406378" {
        assert_eq!(source["source"], "https://zenodo.org/records/11406378");
        assert_eq!(source["selectedIds"], json!(["01", "12"]));
    }
    let cases_root = root.join("cases").canonicalize().expect("파형 조각");
    assert!(cases_root.starts_with(root));
    let mut groups: BTreeMap<String, Metrics> = BTreeMap::new();
    let mut track_cases = Vec::new();
    for (index, case) in data.cases.iter().enumerate() {
        assert!(!continuous || case.kind == Kind::Track);
        assert!(selected.iter().any(|id| id.as_str() == Some(&case.clip_id)));
        assert!(case.start_ms.is_finite() && (0.0..=60000.0).contains(&case.start_ms));
        assert_eq!(case.sample_rate, rate);
        assert_eq!(
            case.frames,
            if case.kind == Kind::Track {
                rate
            } else {
                rate * 2 / 5
            }
        );
        assert_eq!(
            case.references.len(),
            if case.kind == Kind::Track { 38 } else { 1 }
        );
        assert!(case
            .references
            .iter()
            .flatten()
            .all(|pitches| pitches.len() <= 6
                && pitches
                    .iter()
                    .all(|p| p.is_finite() && (39.5..=88.5).contains(p))
                && pitches.windows(2).all(|p| p[0] < p[1])));
        assert_eq!(case.file, format!("case-{index:05}.f32"));
        let path = cases_root
            .join(&case.file)
            .canonicalize()
            .expect("조각 경로");
        assert!(path.starts_with(&cases_root));
        let raw = read_file(&path, u64::from(case.frames) * 4);
        assert_eq!(raw.len(), case.frames as usize * 4);
        assert_eq!(hash(&raw), case.sha256);
        let samples: Vec<_> = raw
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| f32::from_le_bytes(*b))
            .collect();
        assert!(samples.iter().all(|p| p.is_finite()));
        if let Some(detail) = groups
            .entry(case.clip_id.clone())
            .or_default()
            .evaluate(case, &samples)
        {
            track_cases.push(detail);
        }
        if (index + 1) % 64 == 0 {
            println!("공개 기준선 처리 {}/{}", index + 1, data.cases.len());
        }
    }
    let summary: BTreeMap<_, _> = groups
        .iter()
        .map(|(id, metrics)| (id, metrics.summary()))
        .collect();
    let result = json!({"schemaVersion":2,"source":data.source,"sourceManifestSha256":data.source_manifest_sha256,
        "benchmarkManifestSha256":hash(&raw_manifest),"cases":data.cases.len(),"referencePolicy":data.reference_policy,
        "conflictingVoicedZeroReferences":data.reference_issues,"perClip":summary,"trackCases":track_cases,
        "limitations":["고정 공개 소량/마이크 자료의 좁은 참조 비교","continuous 정책은 분석 중심 주석만 비교하며 안정 창/주법 정답이 아님","continuous-note-mask-v1의 발음 마스크 역시 자동 주석이며 실제 무음/주법 정답 보장이 아님","중심 주석이 단음이어도 분석 창의 앞뒤 음/잔향이 겹칠 수 있음","주석은 절대 정답이 아니며 전환/불안정 제외 수를 확인","EGSet12 정수 음표 참조는 연속 음정·변화 깊이의 정답이 아님","실제 주법/연주 점수·DI/왜곡·샘플 정밀 정렬의 검증이 아님","salience를 confidence로 변환하지 않음"]});
    let destination = root.join(format!("results-{}.json", uuid::Uuid::new_v4()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
        .expect("새 기준선 결과");
    file.write_all(
        serde_json::to_string_pretty(&result)
            .expect("기준선 JSON")
            .as_bytes(),
    )
    .expect("결과 보존");
    println!("공개 기타 기준선 결과: {}", destination.display());
}
