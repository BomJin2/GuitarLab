"""고정 개발 입력을 기존 ONNX Runtime과 비교합니다. 제품에서는 호출하지 않습니다."""

import hashlib
import json
import socket
import sys
import time
from pathlib import Path

MODEL_SHA = "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec"


def deny_network(*_args, **_kwargs):
    raise RuntimeError("모델 비교는 로컬 전용입니다.")


def verify(model, folder):
    import numpy as np
    import onnxruntime as ort

    allowed = (Path(__file__).resolve().parents[2] / "src-tauri/target/runtime-validation").resolve(strict=True)
    folder = folder.resolve(strict=True)
    if not folder.is_relative_to(allowed):
        raise ValueError("개발 출력 폴더가 아닙니다.")
    if model.stat().st_size != 230444:
        raise ValueError("모델 크기 오류")
    raw = model.read_bytes()
    if len(raw) != 230444 or hashlib.sha256(raw).hexdigest() != MODEL_SHA:
        raise ValueError("모델 무결성 오류")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    ort.disable_telemetry_events()
    started = time.perf_counter()
    session = ort.InferenceSession(raw, providers=["CPUExecutionProvider"])
    prepare_ms = (time.perf_counter() - started) * 1000
    report = json.loads((folder / "native.json").read_bytes())
    if report["modelSha256"] != MODEL_SHA or report["state"] != "COMPLETED":
        raise ValueError("네이티브 완료 결과가 아닙니다.")
    names = ["StatefulPartitionedCall:2", "StatefulPartitionedCall:1", "StatefulPartitionedCall:0"]
    guarded = report.get("guarded", False)
    if type(guarded) is not bool:
        raise ValueError("검사 모드 오류")
    input_names = ("silence.f32", "sine440.f32") if len(report["cases"]) == 2 else ("silence.f32", "tiny440.f32", "quiet440.f32", "sine440.f32", "dyad440660.f32")
    if guarded:
        input_names += ("dc.f32", "clipped440.f32")
    public = report.get("publicInputs", False)
    if type(public) is not bool:
        raise ValueError("공개 입력 모드 오류")
    if public:
        if not guarded:
            raise ValueError("공개 입력은 보호 계약이 필요합니다.")
        input_names = tuple(f"eg{clip}-{start:02}.f32" for clip in ("01", "12") for start in (0, 2, 4, 6))
        if (folder / "public-inputs.json").stat().st_size > 16384:
            raise ValueError("공개 입력 목록 한도 초과")
        origin = json.loads((folder / "public-inputs.json").read_bytes())
        if origin["source"] != "EGSet12-11406378" or [entry["file"] for entry in origin["cases"]] != list(input_names):
            raise ValueError("고정 외부 표본이 아닙니다.")
    cases = []
    for index, case in enumerate(report["cases"]):
        expected_input = input_names[index]
        if case["input"] != expected_input:
            raise ValueError("합성 입력 이름 오류")
        input_raw = (folder / expected_input).read_bytes()
        if "inputSha256" in case and hashlib.sha256(input_raw).hexdigest() != case["inputSha256"]:
            raise ValueError("추론 전후 입력 지문 오류")
        if public and hashlib.sha256(input_raw).hexdigest() != origin["cases"][index]["sha256"]:
            raise ValueError("공개 입력 지문 오류")
        samples = np.frombuffer(input_raw, dtype="<f4")
        if samples.size != 43844 or not np.isfinite(samples).all() or np.abs(samples).max() > (1.0 if guarded else 0.2):
            raise ValueError("합성 입력 규격 오류")
        if guarded:
            centered = samples.astype(np.float64) - np.mean(samples, dtype=np.float64)
            dbfs = 20 * np.log10(max(1e-12, np.sqrt(np.mean(centered ** 2))))
            quality = "CLIPPED" if np.count_nonzero(np.abs(samples) >= 0.995) / samples.size >= 0.001 else "NO_SIGNAL" if dbfs < -65 else "ANALYZE"
            if case["quality"] != quality or abs(case["rmsDbfs"] - dbfs) > 1e-6:
                raise ValueError("품질 게이트 결과 불일치")
            if quality != "ANALYZE":
                if case["outputs"] or case["elapsedMs"]:
                    raise ValueError("제외 입력에 모델을 실행했습니다.")
                cases.append({"input": expected_input, "quality": quality, "comparisons": [], "modelExecuted": False})
                continue
        outputs = None
        elapsed = []
        for _ in range(4):
            started = time.perf_counter()
            outputs = session.run(names, {"serving_default_input_2:0": samples.reshape(1, 43844, 1)})
            elapsed.append((time.perf_counter() - started) * 1000)
        comparisons = []
        for output_index, (reference, entry) in enumerate(zip(outputs, case["outputs"])):
            expected_file = expected_input[:-4] + f"-output-{output_index}.f32"
            if entry["file"] != expected_file:
                raise ValueError("합성 결과 이름 오류")
            data = (folder / expected_file).read_bytes()
            if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError("네이티브 출력 해시 오류")
            native = np.frombuffer(data, dtype="<f4").reshape(entry["shape"])
            if native.shape != reference.shape or not np.isfinite(reference).all():
                raise ValueError("출력 규격 오류")
            comparisons.append({"name": names[output_index], "shape": list(native.shape),
                "maximumAbsoluteError": float(np.abs(native - reference).max()),
                "allClose": bool(np.allclose(native, reference, rtol=1e-3, atol=1e-4))})
        cases.append({"input": expected_input, "elapsedMs": elapsed, "comparisons": comparisons, "modelExecuted": True})
    if len(cases) != len(input_names) or any(len(case["comparisons"]) != (3 if case["modelExecuted"] else 0) for case in cases):
        raise ValueError("비교 개수 오류")
    result = {"schemaVersion": 1, "referenceRuntime": ort.__version__, "prepareMs": prepare_ms,
        "modelSha256": MODEL_SHA, "mode": "PUBLIC_GUARDED_CONTRACT" if public else "GUARDED_CONTRACT" if guarded else "RAW_OUTPUTS", "cases": cases,
        "passed": all(item["allClose"] for case in cases for item in case["comparisons"])}
    with (folder / "comparison.json").open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps(result, ensure_ascii=False))
    if not result["passed"]:
        raise ValueError("출력이 허용 오차 내에서 일치하지 않습니다.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("검증 모델과 네이티브 결과 폴더가 필요합니다.")
    verify(Path(sys.argv[1]), Path(sys.argv[2]))
