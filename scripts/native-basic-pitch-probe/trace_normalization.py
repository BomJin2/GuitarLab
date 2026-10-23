"""검증 모델에서 추출한 정규화 중간 연산을 비교합니다. 제품 모델은 수정하지 않습니다."""

import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify import deny_network, MODEL_SHA


def run(folder):
    import socket
    import numpy as np
    import onnxruntime as ort
    root = (Path(__file__).resolve().parents[2] / "src-tauri/target/runtime-validation").resolve(strict=True)
    folder = folder.resolve(strict=True)
    if not folder.is_relative_to(root):
        raise ValueError("개발 결과 폴더가 아닙니다.")
    trace = json.loads((folder / "trace.json").read_bytes())
    model = folder / "debug-normalization.onnx"
    if model.stat().st_size > 256 * 1024 or trace["originalModelSha256"] != MODEL_SHA:
        raise ValueError("원본 모델/파생 크기 오류")
    raw = model.read_bytes()
    if hashlib.sha256(raw).hexdigest() != trace["debugModelSha256"]:
        raise ValueError("개발 파생 모델 해시 오류")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    ort.disable_telemetry_events()
    options = ort.SessionOptions()
    options.log_severity_level = 3
    session = ort.InferenceSession(raw, sess_options=options, providers=["CPUExecutionProvider"])
    result = {"schemaVersion": 1, "debugModelSha256": trace["debugModelSha256"], "cases": []}
    for index, case in enumerate(trace["cases"]):
        name = ("silence", "sine440")[index]
        if case["input"] != name + ".f32":
            raise ValueError("합성 입력 이름 오류")
        samples = np.frombuffer((folder / case["input"]).read_bytes(), dtype="<f4").reshape(1, 43844, 1)
        if not np.isfinite(samples).all() or np.abs(samples).max() > 0.2:
            raise ValueError("합성 입력 오류")
        values = session.run(None, {"serving_default_input_2:0": samples})
        if len(values) != len(case["outputs"]) or len(values) > 16:
            raise ValueError("중간 출력 개수 오류")
        comparisons = []
        for output_index, (reference, entry) in enumerate(zip(values, case["outputs"])):
            if entry["file"] != f"{name}-trace-{output_index}.f32":
                raise ValueError("중간 출력 이름 오류")
            raw = (folder / entry["file"]).read_bytes()
            if len(raw) > 1024 * 1024 or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                raise ValueError("중간 출력 해시/크기 오류")
            native = np.frombuffer(raw, dtype="<f4").reshape(entry["shape"])
            if native.shape != reference.shape:
                raise ValueError("중간 출력 형상 오류")
            both_finite = np.isfinite(native) & np.isfinite(reference)
            def describe(value):
                finite = value[np.isfinite(value)]
                return {"nonFinite": int(value.size - finite.size), "min": float(finite.min()) if finite.size else None, "max": float(finite.max()) if finite.size else None}
            comparisons.append({"name": entry["name"], "native": describe(native), "reference": describe(reference),
                "maxError": float(np.abs(native[both_finite] - reference[both_finite]).max()) if both_finite.any() else None,
                "allClose": bool(np.allclose(native, reference, rtol=1e-3, atol=1e-4, equal_nan=True))})
        result["cases"].append({"input": case["input"], "comparisons": comparisons})
    with (folder / "trace-comparison.json").open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("새 중간 연산 결과 폴더가 필요합니다.")
    run(Path(sys.argv[1]))
