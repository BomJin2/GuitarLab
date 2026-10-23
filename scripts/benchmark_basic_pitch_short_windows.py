"""고정된 공개400ms 조각만 기존 오프라인 어댑터에 넣어 문맥 영향을 확인합니다."""

import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time
from threading import Event
import urllib.request
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark_basic_pitch_guitarset import deny_network, maximum_matches, counts, summarize


def checked_case(case, root):
    if case["kind"] != "SPECTRUM" or case["sampleRate"] != 44100 or case["frames"] != 17640 or len(case["references"]) != 1 or case["references"][0] is None:
        raise ValueError("고정400ms 안정 참조가 아닙니다.")
    filename = case["file"]
    if Path(filename).name != filename or not filename.startswith("case-") or not filename.endswith(".f32"):
        raise ValueError("평가 파일 이름 오류")
    path = (root / filename).resolve(strict=True)
    if not path.is_relative_to(root) or path.stat().st_size != 17640 * 4:
        raise ValueError("평가 파일 경로/크기 오류")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != case["sha256"]:
        raise ValueError("평가 파일 무결성 오류")
    return raw


def checked_sources(origin, root):
    if len(origin["files"]) != 8:
        raise ValueError("고정 공개 원본8개가 아닙니다.")
    for entry in origin["files"]:
        filename = entry["name"]
        if Path(filename).name != filename:
            raise ValueError("공개 원본 이름 오류")
        path = (root / filename).resolve(strict=True)
        if not path.is_relative_to(root) or not 0 < path.stat().st_size <= 16 * 1024 * 1024 or path.stat().st_size != entry["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError("공개 원본 경로/크기/해시 오류")


def run(manifest):
    project = Path(__file__).resolve().parents[1]
    manifest = manifest.resolve(strict=True)
    if not manifest.is_relative_to((project / "fixtures/external").resolve(strict=True)) or manifest.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("공개 평가 경로/크기 오류")
    raw = manifest.read_bytes()
    benchmark = json.loads(raw)
    origin_raw = (manifest.parent.parent / "manifest.json").read_bytes()
    origin = json.loads(origin_raw)
    if benchmark["source"] != "GuitarSet1.1.0" or benchmark["referencePolicy"] != "stable-window-v1" or hashlib.sha256(origin_raw).hexdigest() != benchmark["sourceManifestSha256"] or origin["license"] != "cc-by-4.0" or origin["state"] != "FILES_VERIFIED" or len(benchmark["cases"]) != 453:
        raise ValueError("고정 공개 참조 계약 오류")
    checked_sources(origin, manifest.parent.parent)
    cases = [case for case in benchmark["cases"] if case["kind"] == "SPECTRUM" and case["references"][0] is not None]
    if len(cases) != 28:
        raise ValueError("사전 고정한 안정28개 창이 아닙니다.")
    workspace = manifest.parent / ("basic-pitch-short-" + str(uuid4()))
    workspace.mkdir(exist_ok=False)
    os.environ.update(NUMBA_CACHE_DIR=str(workspace / "numba-cache"), HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    urllib.request.urlopen = deny_network
    sys.path.insert(0, str(project / "ai"))
    import numpy as np
    import soundfile as sf
    from guitarlab_ai.transcription.basic_pitch import transcribe_wav
    from guitarlab_ai.model_integrity import ModelError
    result = {"schemaVersion": 1, "state": "RUNNING", "contextMs": 400, "benchmarkSha256": hashlib.sha256(raw).hexdigest(),
        "independentHeldOutEvaluation": False, "profile": "기존 Python3.10 개발 환경/오프라인", "cases": []}
    total = counts()
    try:
        for index, case in enumerate(cases):
            raw_case = checked_case(case, (manifest.parent / "cases").resolve(strict=True))
            samples = np.frombuffer(raw_case, dtype="<f4")
            if not np.isfinite(samples).all():
                raise ValueError("유한하지 않은 공개 조각")
            path = workspace / f"window-{index:02}.wav"
            sf.write(path, samples, 44100, subtype="FLOAT", format="WAV")
            wav_sha = hashlib.sha256(path.read_bytes()).hexdigest()
            started = time.perf_counter()
            error = None
            try:
                notes = transcribe_wav(path, workspace, Event())
            except ModelError as cause:
                error = str(cause)
                notes = []
            elapsed = (time.perf_counter() - started) * 1000
            if hashlib.sha256(path.read_bytes()).hexdigest() != wav_sha:
                raise ValueError("분석 중 입력이 변경되었습니다.")
            center = (case["frames"] - 1) * 500 / case["sampleRate"]
            detected = sorted({note.pitch_midi for note in notes if note.onset_ms <= center < note.offset_ms})
            expected = case["references"][0]
            matched = maximum_matches(expected, detected)
            for key, value in {"frames": 1, "matched": matched, "expected": len(expected), "detected": len(detected)}.items():
                total[key] += value
            entry = {"file": case["file"], "clipId": case["clipId"], "startMs": case["startMs"], "sourceSha256": case["sha256"], "wavSha256": wav_sha,
                "expected": expected, "detected": detected, "matched": matched, "elapsedMs": elapsed, "error": error,
                "notes": [{"onsetMs": n.onset_ms, "offsetMs": n.offset_ms, "pitchMidi": n.pitch_midi, "modelActivation": n.confidence} for n in notes]}
            result["cases"].append(entry)
            print(json.dumps({key: entry[key] for key in ("file", "detected", "matched", "elapsedMs", "error")}), flush=True)
        result.update(state="COMPLETED", metrics=summarize(total))
    except (Exception, KeyboardInterrupt) as cause:
        result.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (workspace / "results.json").open("x", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps(result["metrics"]))
    print(str(workspace / "results.json"))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("고정 참조 manifest가 필요합니다.")
    run(Path(sys.argv[1]))

