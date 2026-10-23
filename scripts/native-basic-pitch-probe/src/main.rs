use prost::Message;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path, time::Instant};
use tract_onnx::prelude::*;
use tract_onnx::tract_core::internal::{anyhow, ensure};

mod signal_gate;

const SAMPLES: usize = 43844;
const MODEL_SHA: &str = "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec";

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn save(path: &Path, bytes: &[u8]) -> TractResult<()> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn signal(amplitude: f64, dyad: bool) -> Vec<f32> {
    (0..SAMPLES)
        .map(|index| {
            let phase = index as f64 * std::f64::consts::TAU / 22050.0;
            (amplitude * ((phase * 440.0).sin() + if dyad { (phase * 660.0).sin() } else { 0.0 }))
                as f32
        })
        .collect()
}

fn public_inputs(output: &Path) -> TractResult<Vec<(String, Vec<f32>)>> {
    let raw = fs::read(output.join("public-inputs.json"))?;
    ensure!(raw.len() <= 16384, "공개 입력 목록 한도 초과");
    let manifest: serde_json::Value = serde_json::from_slice(&raw)?;
    ensure!(
        manifest["schemaVersion"] == 1 && manifest["source"] == "EGSet12-11406378",
        "고정 외부 표본이 아닙니다."
    );
    let cases = manifest["cases"]
        .as_array()
        .ok_or_else(|| anyhow!("입력 목록 오류"))?;
    ensure!(cases.len() == 8, "고정8개 입력이 아닙니다.");
    let mut inputs = Vec::new();
    for (index, case) in cases.iter().enumerate() {
        let name = format!(
            "eg{}-{:02}",
            if index < 4 { "01" } else { "12" },
            index % 4 * 2
        );
        let file = format!("{name}.f32");
        ensure!(case["file"] == file, "공개 입력 이름 오류");
        let path = output.join(file).canonicalize()?;
        ensure!(
            path.starts_with(output) && fs::metadata(&path)?.len() == (SAMPLES * 4) as u64,
            "입력 경로/크기 오류"
        );
        let bytes = fs::read(path)?;
        ensure!(case["sha256"] == sha256(&bytes), "공개 입력 지문 오류");
        let samples: Vec<_> = bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| f32::from_le_bytes(*b))
            .collect();
        signal_gate::classify(&samples)?;
        inputs.push((name, samples));
    }
    Ok(inputs)
}

fn trace_normalization(raw: &[u8], output: &Path) -> TractResult<()> {
    let mut proto = tract_onnx::pb::ModelProto::decode(raw)?;
    let graph = proto
        .graph
        .as_mut()
        .ok_or_else(|| anyhow!("모델 그래프가 없습니다."))?;
    let names: Vec<_> = graph
        .node
        .iter()
        .filter(|node| {
            node.name.starts_with("model_1/normalized_log_1/")
                && [
                    "Add",
                    "Log",
                    "Mul",
                    "ReduceMin",
                    "Sub",
                    "ReduceMax",
                    "Div",
                    "Where",
                ]
                .contains(&node.op_type.as_str())
        })
        .flat_map(|node| node.output.clone())
        .collect();
    ensure!(
        !names.is_empty() && names.len() <= 16,
        "정규화 연산 범위 오류"
    );
    graph.output = names
        .iter()
        .map(|name| tract_onnx::pb::ValueInfoProto {
            name: name.clone(),
            r#type: Some(tract_onnx::pb::TypeProto {
                denotation: String::new(),
                value: Some(tract_onnx::pb::type_proto::Value::TensorType(
                    tract_onnx::pb::type_proto::Tensor {
                        elem_type: 1,
                        shape: None,
                    },
                )),
            }),
            doc_string: String::new(),
        })
        .collect();
    let debug = proto.encode_to_vec();
    save(&output.join("debug-normalization.onnx"), &debug)?;
    let model = tract_onnx::onnx()
        .model_for_read(&mut debug.as_slice())?
        .with_input_fact(0, f32::fact([1, SAMPLES, 1]).into())?
        .into_typed()?
        .into_runnable()?;
    let mut cases = Vec::new();
    for (name, amplitude) in [("silence", 0.0), ("sine440", 0.2)] {
        let input = signal(amplitude, false);
        save(
            &output.join(format!("{name}.f32")),
            &input
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect::<Vec<_>>(),
        )?;
        let values = model.run(tvec!(Tensor::from_shape(&[1, SAMPLES, 1], &input)?.into()))?;
        ensure!(values.len() == names.len(), "중간 출력 개수 오류");
        let mut outputs = Vec::new();
        for (index, value) in values.iter().enumerate() {
            let view = value.to_array_view::<f32>()?;
            let file = format!("{name}-trace-{index}.f32");
            let bytes: Vec<_> = view.iter().flat_map(|v| v.to_le_bytes()).collect();
            save(&output.join(&file), &bytes)?;
            outputs.push(json!({"name":names[index],"shape":view.shape(),"file":file,"sha256":sha256(&bytes)}));
        }
        cases.push(json!({"input":format!("{name}.f32"),"outputs":outputs}));
    }
    save(
        &output.join("trace.json"),
        &serde_json::to_vec_pretty(
            &json!({"schemaVersion":1,"originalModelSha256":MODEL_SHA,"debugModelSha256":sha256(&debug),"cases":cases}),
        )?,
    )?;
    println!("정규화 중간 연산{}개 비교 자료 생성", names.len());
    Ok(())
}

fn run() -> TractResult<()> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    ensure!(
        args.len() == 2
            || (args.len() == 3
                && (args[2] == "--without-optimizations"
                    || args[2] == "--guarded"
                    || args[2] == "--public-egset12"
                    || args[2] == "--inspect"
                    || args[2] == "--trace-normalization")),
        "검증 모델과 새 실험 폴더가 필요합니다."
    );
    let public = args.len() == 3 && args[2] == "--public-egset12";
    let optimized = args.len() == 2 || args[2] == "--guarded" || public;
    let guarded = (args.len() == 3 && args[2] == "--guarded") || public;
    let model_path = fs::canonicalize(&args[0])?;
    let output = fs::canonicalize(&args[1])?;
    let project = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| anyhow!("프로젝트 경로 오류"))?;
    let allowed = fs::canonicalize(project.join("src-tauri/target/runtime-validation"))?;
    ensure!(
        output.starts_with(allowed) && output.is_dir(),
        "개발 출력 폴더가 아닙니다."
    );
    ensure!(fs::metadata(&model_path)?.len() == 230444, "모델 크기 오류");
    let raw = fs::read(&model_path)?;
    ensure!(sha256(&raw) == MODEL_SHA, "모델 무결성 오류");
    if args.len() == 3 && args[2] == "--trace-normalization" {
        return trace_normalization(&raw, &output);
    }
    if args.len() == 3 && args[2] == "--inspect" {
        let proto = tract_onnx::pb::ModelProto::decode(raw.as_slice())?;
        let graph = proto
            .graph
            .ok_or_else(|| anyhow!("모델 그래프가 없습니다."))?;
        let nodes: Vec<_> = graph.node.iter().map(|node| json!({"name":node.name,"op":node.op_type,"inputs":node.input,"outputs":node.output})).collect();
        save(
            &output.join("nodes.json"),
            &serde_json::to_vec_pretty(&nodes)?,
        )?;
        println!("검증 모델 연산{}개 확인", nodes.len());
        return Ok(());
    }
    let started = Instant::now();
    let inference = tract_onnx::onnx()
        .model_for_read(&mut raw.as_slice())?
        .with_input_fact(0, f32::fact([1, SAMPLES, 1]).into())?;
    let model = if optimized {
        inference.into_optimized()?
    } else {
        inference.into_typed()?
    }
    .into_runnable()?;
    let prepare_ms = started.elapsed().as_secs_f64() * 1000.0;
    let mut cases = Vec::new();
    let mut signals = vec![
        ("silence", 0.0, false),
        ("tiny440", 0.000001, false),
        ("quiet440", 0.001, false),
        ("sine440", 0.2, false),
        ("dyad440660", 0.1, true),
    ];
    if guarded {
        signals.extend([("dc", 0.0, false), ("clipped440", 1.0, false)]);
    }
    let inputs = if public {
        public_inputs(&output)?
    } else {
        signals
            .into_iter()
            .map(|(name, amplitude, dyad)| {
                (
                    name.to_owned(),
                    if name == "dc" {
                        vec![0.5; SAMPLES]
                    } else {
                        signal(amplitude, dyad)
                    },
                )
            })
            .collect()
    };
    for (name, input) in inputs {
        if !public {
            save(
                &output.join(format!("{name}.f32")),
                &input
                    .iter()
                    .flat_map(|v| v.to_le_bytes())
                    .collect::<Vec<_>>(),
            )?;
        }
        let (quality, dbfs) = signal_gate::classify(&input)?;
        if guarded && quality != "ANALYZE" {
            cases.push(json!({"input":format!("{name}.f32"),"inputSha256":sha256(&input.iter().flat_map(|v| v.to_le_bytes()).collect::<Vec<_>>()),"quality":quality,"rmsDbfs":dbfs,"elapsedMs":[],"outputs":[]}));
            continue;
        }
        let tensor = Tensor::from_shape(&[1, SAMPLES, 1], &input)?;
        let mut elapsed = Vec::new();
        let mut outputs = Vec::new();
        for iteration in 0..4 {
            let started = Instant::now();
            let values = model.run(tvec!(tensor.clone().into()))?;
            elapsed.push(started.elapsed().as_secs_f64() * 1000.0);
            if iteration == 3 {
                ensure!(values.len() == 3, "출력 개수 오류");
                for (index, value) in values.iter().enumerate() {
                    let view = value.to_array_view::<f32>()?;
                    ensure!(
                        view.iter().all(|v| v.is_finite()),
                        "유한하지 않은 모델 출력"
                    );
                    let bins = if index == 2 { 264 } else { 88 };
                    ensure!(view.shape() == [1, 172, bins], "출력 규격 오류");
                    let filename = format!("{name}-output-{index}.f32");
                    let bytes: Vec<_> = view.iter().flat_map(|v| v.to_le_bytes()).collect();
                    save(&output.join(&filename), &bytes)?;
                    outputs.push(
                        json!({"file":filename,"shape":view.shape(),"sha256":sha256(&bytes)}),
                    );
                }
            }
        }
        cases.push(json!({"input":format!("{name}.f32"),"inputSha256":sha256(&input.iter().flat_map(|v| v.to_le_bytes()).collect::<Vec<_>>()),"quality":quality,"rmsDbfs":dbfs,"elapsedMs":elapsed,"outputs":outputs}));
    }
    let report = json!({"schemaVersion":1,"state":"COMPLETED","runtime":"tract-onnx 0.22.3","optimized":optimized,"guarded":guarded,"publicInputs":public,"modelSha256":MODEL_SHA,"prepareMs":prepare_ms,"inputSamples":SAMPLES,"sampleRate":22050,"cases":cases});
    save(
        &output.join("native.json"),
        &serde_json::to_vec_pretty(&report)?,
    )?;
    println!("합성 입력 검증 완료 · 준비 {prepare_ms:.2} ms");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("네이티브 호환성 실험 실패: {error:#}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_bounded_synthetic_inputs() {
        assert!(signal(0.0, false).iter().all(|value| *value == 0.0));
        let sine = signal(0.2, false);
        assert_eq!(sine.len(), SAMPLES);
        assert!(sine
            .iter()
            .all(|value| value.is_finite() && value.abs() <= 0.2));
    }

    #[test]
    fn fixed_public_inputs_reject_changed_hash_and_traversal_name() {
        let directory = std::env::temp_dir().join(format!(
            "guitarlab-public-probe-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("검사 시각")
                .as_nanos()
        ));
        fs::create_dir(&directory).expect("새 검사 폴더");
        let directory = directory.canonicalize().expect("검사 절대 경로");
        let bytes = vec![0_u8; SAMPLES * 4];
        let mut cases = Vec::new();
        for index in 0..8 {
            let name = format!(
                "eg{}-{:02}.f32",
                if index < 4 { "01" } else { "12" },
                index % 4 * 2
            );
            save(&directory.join(&name), &bytes).expect("새 입력");
            cases.push(json!({"file":name,"sha256":sha256(&bytes)}));
        }
        let mut manifest = json!({"schemaVersion":1,"source":"EGSet12-11406378","cases":cases});
        let file = directory.join("public-inputs.json");
        fs::write(&file, serde_json::to_vec(&manifest).expect("검사 JSON")).expect("검사 목록");
        assert_eq!(public_inputs(&directory).expect("고정 입력").len(), 8);
        manifest["cases"][0]["sha256"] = json!("0".repeat(64));
        fs::write(&file, serde_json::to_vec(&manifest).expect("손상 JSON")).expect("손상 목록");
        assert!(public_inputs(&directory).is_err());
        manifest["cases"][0]["sha256"] = json!(sha256(&bytes));
        manifest["cases"][0]["file"] = json!("../eg01-00.f32");
        fs::write(
            &file,
            serde_json::to_vec(&manifest).expect("잘못된 경로 JSON"),
        )
        .expect("잘못된 목록");
        assert!(public_inputs(&directory).is_err());
        for entry in cases {
            fs::remove_file(directory.join(entry["file"].as_str().expect("고정 이름")))
                .expect("자체 입력 정리");
        }
        fs::remove_file(file).expect("자체 목록 정리");
        fs::remove_dir(directory).expect("빈 검사 폴더 정리");
    }
}
