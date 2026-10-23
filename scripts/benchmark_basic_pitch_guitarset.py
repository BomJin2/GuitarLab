"""설치된 Basic Pitch의 오프라인 음고 집합만 공개 참조와 비교합니다. 실시간 채점에 연결하지 않습니다."""

import argparse
import hashlib
import json
import os
import platform
import socket
import sys
import time
import urllib.request
from pathlib import Path
from threading import Event
from uuid import uuid4


def maximum_matches(expected, detected):
    owners = {}
    def assign(target, seen):
        for index, pitch in enumerate(detected):
            if index in seen or abs(expected[target] - pitch) * 100 > 50:
                continue
            seen.add(index)
            if index not in owners or assign(owners[index], seen):
                owners[index] = target
                return True
        return False
    return sum(assign(target, set()) for target in range(len(expected)))


def counts():
    return {"frames": 0, "expected": 0, "detected": 0, "matched": 0}


def summarize(values):
    tp, predicted, expected = values["matched"], values["detected"], values["expected"]
    return {**values, "precision": tp / predicted if predicted else None,
            "recall": tp / expected if expected else None,
            "f1": 2 * tp / (predicted + expected) if predicted + expected else None}


def evaluate(notes, cases):
    groups = {name: counts() for name in ("all", "mono", "poly", "unvoiced", "spectrumWindows")}
    unstable = 0
    unstable_spectra = 0
    for case in cases:
        if case["kind"] == "SPECTRUM":
            expected = case["references"][0]
            if expected is None:
                unstable_spectra += 1
                continue
            center = case["startMs"] + (case["frames"] - 1) * 500 / case["sampleRate"]
            detected = sorted({note.pitch_midi for note in notes if note.onset_ms <= center < note.offset_ms})
            group = groups["spectrumWindows"]
            group["frames"] += 1
            group["expected"] += len(expected)
            group["detected"] += len(detected)
            group["matched"] += maximum_matches(expected, detected)
            continue
        if case["kind"] != "TRACK":
            continue
        rate = case["sampleRate"]
        if rate != 44100 or len(case["references"]) != 38:
            raise ValueError("고정 참조 창이 아닙니다.")
        for index, expected in enumerate(case["references"]):
            if expected is None:
                unstable += 1
                continue
            time_ms = case["startMs"] + ((index * 367 + 511.5) * 3 + 1) * 1000 / rate
            detected = sorted({note.pitch_midi for note in notes if note.onset_ms <= time_ms < note.offset_ms})
            matched = maximum_matches(expected, detected)
            category = "unvoiced" if not expected else "mono" if len(expected) == 1 else "poly"
            for name in ("all", category):
                group = groups[name]
                group["frames"] += 1
                group["expected"] += len(expected)
                group["detected"] += len(detected)
                group["matched"] += matched
    return {"unstableOrUnsupportedReferences": unstable, "unstableSpectrumReferences": unstable_spectra,
            **{name: summarize(values) for name, values in groups.items()}}


def deny_network(*_args, **_kwargs):
    raise RuntimeError("평가는 로컬 전용입니다.")


def run(manifest):
    project = Path(__file__).resolve().parents[1]
    allowed = (project / "fixtures/external").resolve(strict=True)
    manifest = manifest.resolve(strict=True)
    if not manifest.is_relative_to(allowed) or manifest.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("평가 자료 경로/크기 오류")
    raw_benchmark = manifest.read_bytes()
    benchmark = json.loads(raw_benchmark)
    if benchmark["schemaVersion"] != 1 or benchmark["source"] != "GuitarSet1.1.0" or benchmark["referencePolicy"] != "stable-window-v1" or len(benchmark["cases"]) > 512:
        raise ValueError("평가 계약 오류")
    source = manifest.parent.parent
    raw_source = (source / "manifest.json").read_bytes()
    if hashlib.sha256(raw_source).hexdigest() != benchmark["sourceManifestSha256"]:
        raise ValueError("출처 manifest가 변경되었습니다.")
    origin = json.loads(raw_source)
    if origin["license"] != "cc-by-4.0" or origin["state"] != "FILES_VERIFIED":
        raise ValueError("확인한 공개 자료가 아닙니다.")
    workspace = manifest.parent / ("basic-pitch-" + str(uuid4()))
    workspace.mkdir(exist_ok=False)
    os.environ.update(NUMBA_CACHE_DIR=str(workspace / "numba-cache"), HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    urllib.request.urlopen = deny_network
    sys.path.insert(0, str(project / "ai"))
    from guitarlab_ai.transcription.basic_pitch import transcribe_wav
    from importlib.metadata import version
    result = {"schemaVersion": 1, "source": "GuitarSet1.1.0", "referencePolicy": "stable-window-v1",
              "benchmarkManifestSha256": hashlib.sha256(raw_benchmark).hexdigest(),
              "model": "Basic Pitch", "modelVersion": version("basic-pitch"), "pythonVersion": platform.python_version(),
              "profile": "기존 개발 환경/제품 cp312와 별도", "perClip": {}, "state": "RUNNING"}
    try:
        for clip in origin["selectedIds"]:
            filename = clip + "_mic.wav"
            entries = [entry for entry in origin["files"] if entry["name"] == filename]
            if len(entries) != 1 or Path(filename).name != filename:
                raise ValueError("공개 입력 이름 오류")
            path = source / filename
            if not path.resolve(strict=True).is_relative_to(source) or path.stat().st_size > 16 * 1024 * 1024 or hashlib.sha256(path.read_bytes()).hexdigest() != entries[0]["sha256"]:
                raise ValueError("공개 원본 해시/크기 오류")
            started = time.perf_counter()
            notes = transcribe_wav(path, source, Event())
            elapsed_ms = (time.perf_counter() - started) * 1000
            if hashlib.sha256(path.read_bytes()).hexdigest() != entries[0]["sha256"]:
                raise ValueError("분석 전후 공개 원본이 달라졌습니다.")
            cases = [case for case in benchmark["cases"] if case["clipId"] == clip]
            metrics = evaluate(notes, cases)
            result["perClip"][clip] = {"sourceSha256": entries[0]["sha256"], "elapsedMs": elapsed_ms,
                "notes": [{"onsetMs": n.onset_ms, "offsetMs": n.offset_ms, "pitchMidi": n.pitch_midi, "modelActivation": n.confidence} for n in notes],
                "frameMetrics": metrics}
            print(json.dumps({"clip": clip, "notes": len(notes), "elapsedMs": elapsed_ms, "frameMetrics": metrics}, ensure_ascii=False), flush=True)
        result["state"] = "COMPLETED"
    except (Exception, KeyboardInterrupt) as cause:
        result.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (workspace / "results.json").open("x", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(str(workspace / "results.json"), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    run(parser.parse_args().manifest)
