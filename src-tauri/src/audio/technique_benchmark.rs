//! 공개 DI의 관측 결과를 보존합니다. 파일의 주법 이름은 구간별 정답이 아닙니다.
use super::pitch_track::analyze_pitch_track;
use crate::storage::projects::hash;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::Instant,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Probe {
    schema_version: u8,
    source: String,
    license: String,
    source_manifest_sha256: String,
    window_policy: String,
    continuous_pitch_ground_truth: bool,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Case {
    clip_id: String,
    category: String,
    start_ms: u32,
    sample_rate: u32,
    source_channels: u8,
    file: String,
    sha256: String,
}
fn valid_case(case: &Case, index: usize) -> bool {
    let clips = [
        "P1_Bendings_DI",
        "P1_Vibrato_DI",
        "P2_Bendings_DI",
        "P2_Vibrato_DI",
    ];
    index < 48
        && case.clip_id == clips[index / 12]
        && case.category
            == if (index / 12).is_multiple_of(2) {
                "Bendings"
            } else {
                "Vibrato"
            }
        && case.start_ms == (1 + 5 * (index % 12)) as u32 * 1000
        && [44100, 48000, 96000].contains(&case.sample_rate)
        && (1..=2).contains(&case.source_channels)
        && case.file == format!("case-{index:03}.f32")
        && case.sha256.len() == 64
        && case
            .sha256
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn read(root: &Path, path: &Path, limit: u64) -> Vec<u8> {
    let metadata = fs::symlink_metadata(path).expect("공개 자료 속성");
    assert!(metadata.is_file() && !metadata.file_type().is_symlink() && metadata.len() <= limit);
    assert!(path
        .canonicalize()
        .expect("공개 자료 경로")
        .starts_with(root));
    fs::read(path).expect("공개 자료 읽기")
}
#[test]
fn di_case_policy_rejects_changed_selection_path_and_invented_truth() {
    let mut case: Case=serde_json::from_value(json!({"clipId":"P1_Bendings_DI","category":"Bendings","startMs":1000,"sampleRate":48000,"sourceChannels":2,"file":"case-000.f32","sha256":"a".repeat(64)})).expect("자체 사례");
    assert!(valid_case(&case, 0));
    assert!(!valid_case(&case, 48));
    case.start_ms = 2000;
    assert!(!valid_case(&case, 0));
    case.start_ms = 1000;
    case.file = "../private".into();
    assert!(!valid_case(&case, 0));
    let mut value = json!({"clipId":"P1_Bendings_DI","category":"Bendings","startMs":1000,"sampleRate":48000,"sourceChannels":2,"file":"case-000.f32","sha256":"a".repeat(64)});
    value["expectedTechnique"] = json!("BEND");
    assert!(serde_json::from_value::<Case>(value).is_err());
}
#[test]
#[ignore = "공식 공개 DI4개/고정48창이 필요하며 실제 주법 정답·점수 비교가 아닙니다"]
fn public_di_pitch_motion_observations() {
    let allowed = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("프로젝트")
        .join("fixtures/external/guitar-techs-14963133")
        .canonicalize()
        .expect("공개 DI 자료");
    let manifest = PathBuf::from(std::env::var_os("GUITARLAB_DI_PROBE").expect("고정 DI manifest"));
    let manifest = manifest.canonicalize().expect("DI manifest 경로");
    assert!(manifest.starts_with(&allowed));
    let raw = read(&allowed, &manifest, 128 * 1024);
    let data: Probe = serde_json::from_slice(&raw).expect("DI 관측 계약");
    assert_eq!(data.schema_version, 1);
    assert_eq!(data.source, "https://zenodo.org/records/14963133");
    assert_eq!(data.license, "cc-by-4.0");
    assert_eq!(
        data.window_policy,
        "first-12-1s-windows-at-1-plus-5i-seconds-v1"
    );
    assert!(!data.continuous_pitch_ground_truth);
    assert_eq!(data.cases.len(), 48);
    let root = manifest.parent().expect("DI 조각 root");
    let source_raw = read(
        &allowed,
        &root.parent().expect("원본 root").join("manifest.json"),
        32768,
    );
    assert_eq!(hash(&source_raw), data.source_manifest_sha256);
    let source: Value = serde_json::from_slice(&source_raw).expect("원본 출처");
    assert_eq!(source["source"], data.source);
    assert_eq!(source["state"], "DI_FILES_VERIFIED");
    assert_eq!(source["continuousPitchGroundTruth"], false);
    let mut observations = Vec::new();
    for (index, case) in data.cases.iter().enumerate() {
        assert!(valid_case(case, index));
        let raw = read(
            root,
            &root.join("cases").join(&case.file),
            u64::from(case.sample_rate) * 4,
        );
        assert_eq!(raw.len(), case.sample_rate as usize * 4);
        assert_eq!(hash(&raw), case.sha256);
        let samples: Vec<_> = raw
            .as_chunks::<4>()
            .0
            .iter()
            .map(|v| f32::from_le_bytes(*v))
            .collect();
        assert!(samples.iter().all(|v| v.is_finite()));
        let start = Instant::now();
        let result = analyze_pitch_track(&samples, case.sample_rate, &AtomicBool::new(false))
            .expect("DI 관측");
        observations.push(json!({"clipId":case.clip_id,"fileCategory":case.category,"startMs":case.start_ms,"sourceChannels":case.source_channels,
            "motion":format!("{:?}",result.motion),"coverage":result.coverage,"deltaCents":result.delta_cents,
            "minConfidence":result.min_confidence,"rmsDbfs":result.rms_dbfs,"oscillation":result.oscillation,
            "warnings":result.warnings,"elapsedMs":start.elapsed().as_secs_f64()*1000.0}));
    }
    let result = json!({"schemaVersion":1,"source":data.source,"probeManifestSha256":hash(&raw),
        "sourceManifestSha256":data.source_manifest_sha256,"continuousPitchGroundTruth":false,
        "observations":observations,"limitations":["파일 주법 이름은 각1초 창의 정답이 아님","≤100ms 주석 정렬 오차·연속 음정 정답 없음",
        "고정 첫12창/2명 DI이며 전체 자료 품질로 일반화하지 않음","관측 깊이·속도/처리 시간은 정확도·왕복 지연이 아님","제품 점수/실시간 처리 변경 없음"]});
    let destination = root.join(format!("observations-{}.json", uuid::Uuid::new_v4()));
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
        .expect("결과 보존");
    println!("DI 관측 결과: {}", destination.display());
}
