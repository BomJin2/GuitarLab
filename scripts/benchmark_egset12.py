"""고정 EGSet12 표본의 음표 참조 비교입니다. 실제 주법·채점 검증으로 사용하지 않습니다."""

import argparse
import array
import hashlib
import json
import math
import os
from pathlib import Path
import socket
import struct
import sys
import time
from threading import Event
import urllib.request
from uuid import uuid4
import wave

from benchmark_basic_pitch_guitarset import deny_network, summarize
from evaluate_guitarset_onsets import distribution, match_onsets, reference_notes
from fetch_egset12_sample import FILES


def checked_source(manifest):
    # 외부 자료를 아직 받지 않았어도 범위 밖 입력은 내용을 읽기 전에 거부합니다.
    external = (Path(__file__).resolve().parents[1] / "fixtures/external/egset12-11406378").resolve()
    manifest = manifest.resolve(strict=True)
    if not manifest.is_relative_to(external) or manifest.stat().st_size > 128 * 1024:
        raise ValueError("고정 공개 자료 경로/크기 오류")
    raw = manifest.read_bytes()
    source = json.loads(raw)
    if (source["schemaVersion"] != 1 or source["state"] != "FILES_VERIFIED" or
            source["source"] != "https://zenodo.org/records/11406378" or source["license"] != "cc-by-4.0" or
            source["selectedIds"] != ["01", "12"] or len(source["files"]) != 4 or
            {entry["name"] for entry in source["files"]} != set(FILES)):
        raise ValueError("공식 고정 표본 계약 오류")
    for entry in source["files"]:
        size, digest = FILES[entry["name"]]
        path = manifest.parent / entry["name"]
        if path.is_symlink() or not path.resolve(strict=True).is_relative_to(manifest.parent) or path.stat().st_size != size:
            raise ValueError("공개 자료 경로/크기 오류")
        data = path.read_bytes()
        if (entry["bytes"] != size or entry["md5"] != digest or
                hashlib.md5(data, usedforsecurity=False).hexdigest() != digest or
                hashlib.sha256(data).hexdigest() != entry["sha256"]):
            raise ValueError("공개 자료 지문 오류")
    return manifest, raw, source


def mono_24_stereo(raw):
    if len(raw) % 6:
        raise ValueError("24bit stereo 프레임 오류")
    result = array.array("f")
    max_difference = 0
    for index in range(0, len(raw), 6):
        left = int.from_bytes(raw[index:index + 3], "little", signed=True)
        right = int.from_bytes(raw[index + 3:index + 6], "little", signed=True)
        result.append((left + right) / 16777216)
        max_difference = max(max_difference, abs(left - right))
    return result, max_difference / 8388608


def reference_interval(notes, start_ms, end_ms):
    # 정수 음표의 경계 전후30ms 및 그 사이를 지나는 전환은 정답에서 제외합니다.
    if not math.isfinite(start_ms + end_ms) or not 0 <= start_ms < end_ms:
        raise ValueError("참조 구간 오류")
    low, high = start_ms - 30, end_ms + 30
    if any(low <= edge <= high for note in notes for edge in (note["onsetMs"], note["offsetMs"])):
        return None
    return sorted({note["pitchMidi"] for note in notes if note["onsetMs"] < low and note["offsetMs"] > high})


def little_float(samples):
    values = array.array("f", samples)
    if sys.byteorder != "little":
        values.byteswap()
    return values.tobytes()


def prepare(manifest):
    manifest, raw, source = checked_source(manifest)
    target = manifest.parent / ("benchmark-" + str(uuid4()))
    target.mkdir(exist_ok=False)
    (target / "cases").mkdir()
    result = {"schemaVersion": 1, "source": "EGSet12-11406378", "license": "cc-by-4.0",
              "sourceManifestSha256": hashlib.sha256(raw).hexdigest(), "referencePolicy": "note-interval-guard30ms-v1",
              "referenceIssues": {}, "cases": [], "derivedAudio": {}, "state": "PREPARING"}
    try:
        for clip in source["selectedIds"]:
            notes, merged, unsupported = reference_notes(json.loads((manifest.parent / (clip + ".jams")).read_bytes()))
            if unsupported:
                raise ValueError("고정 음역 밖의 참조가 있습니다.")
            with wave.open(str(manifest.parent / (clip + ".wav"))) as audio:
                if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (2, 3, 48000) or not 0 < audio.getnframes() <= 48000 * 60:
                    raise ValueError("고정48kHz stereo24bit WAV가 아닙니다.")
                pcm, difference = mono_24_stereo(audio.readframes(audio.getnframes()))
            audio_raw = little_float(pcm)
            header = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", len(audio_raw) + 36, b"WAVE", b"fmt ", 16, 3, 1, 48000, 192000, 4, 32, b"data", len(audio_raw))
            derived = header + audio_raw
            with (target / (clip + ".wav")).open("xb") as output:
                output.write(derived)
            result["derivedAudio"][clip] = {"sha256": hashlib.sha256(derived).hexdigest(), "bytes": len(derived),
                "frames": len(pcm), "channelDifferencePeak": difference, "referenceEvents": len(notes), "mergedUnisons": merged}
            result["referenceIssues"][clip] = 0
            for kind, frames, stride in (("TRACK", 48000, 48000), ("SPECTRUM", 19200, 12000)):
                for start in range(0, len(pcm) - frames + 1, stride):
                    if kind == "TRACK":
                        refs = [reference_interval(notes, (start + i * 1200) / 48, (start + i * 1200 + 3071) / 48) for i in range(38)]
                    else:
                        refs = [reference_interval(notes, start / 48, (start + frames - 1) / 48)]
                    data = little_float(pcm[start:start + frames])
                    filename = f"case-{len(result['cases']):05d}.f32"
                    if len(result["cases"]) >= 320:
                        raise ValueError("고정 조각 한도 초과")
                    with (target / "cases" / filename).open("xb") as output:
                        output.write(data)
                    result["cases"].append({"clipId": clip, "kind": kind, "startMs": start / 48, "sampleRate": 48000,
                        "frames": frames, "file": filename, "sha256": hashlib.sha256(data).hexdigest(), "references": refs})
        checked_source(manifest)
        result["state"] = "PREPARED"
    except (Exception, KeyboardInterrupt) as cause:
        result.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (target / "egset12.json").open("x", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False, allow_nan=False, indent=2)
    # native 공통 평가 계약에 필요한 필드만 별도 파일로 보존합니다.
    common = {key: value for key, value in result.items() if key not in ("derivedAudio", "state")}
    with (target / "benchmark.json").open("x", encoding="utf-8") as output:
        json.dump(common, output, ensure_ascii=False, allow_nan=False, indent=2)
    print(str(target / "egset12.json"), flush=True)


def analyze(manifest):
    manifest = manifest.resolve(strict=True)
    source_path, source_raw, source = checked_source(manifest.parent.parent / "manifest.json")
    if manifest.name != "egset12.json" or not manifest.parent.is_relative_to(source_path.parent) or manifest.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("고정 평가 경로/크기 오류")
    raw = manifest.read_bytes()
    benchmark = json.loads(raw)
    if benchmark["source"] != "EGSet12-11406378" or benchmark["state"] != "PREPARED" or benchmark["sourceManifestSha256"] != hashlib.sha256(source_raw).hexdigest():
        raise ValueError("평가 자료 계약 오류")
    workspace = manifest.parent / ("basic-pitch-" + str(uuid4()))
    workspace.mkdir(exist_ok=False)
    os.environ.update(NUMBA_CACHE_DIR=str(workspace / "numba-cache"), HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    urllib.request.urlopen = deny_network
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ai"))
    from guitarlab_ai.transcription.basic_pitch import transcribe_wav
    result = {"schemaVersion": 1, "source": "EGSet12-11406378", "benchmarkSha256": hashlib.sha256(raw).hexdigest(),
              "model": "Basic Pitch 0.4.0", "state": "RUNNING", "perClip": {}, "totals": {},
              "limitations": ["2개/1명/앰프 마이크의 좁은 자료", "정수 음표 주석이며 연속 음정·주법 정답이 아님", "실시간 지연/실제 앱 채점 검증이 아님", "학습 자료 포함 여부는 확인하지 못함"]}
    try:
        for clip in source["selectedIds"]:
            path = manifest.parent / (clip + ".wav")
            entry = benchmark["derivedAudio"][clip]
            if path.is_symlink() or not path.resolve(strict=True).is_relative_to(manifest.parent) or path.stat().st_size != entry["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
                raise ValueError("파생 입력 무결성 오류")
            expected, merged, unsupported = reference_notes(json.loads((source_path.parent / (clip + ".jams")).read_bytes()))
            started = time.perf_counter()
            notes = transcribe_wav(path, manifest.parent, Event())
            elapsed = (time.perf_counter() - started) * 1000
            if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
                raise ValueError("분석 중 입력 변경")
            detected = [{"onsetMs": n.onset_ms, "offsetMs": n.offset_ms, "pitchMidi": n.pitch_midi, "modelActivation": n.confidence} for n in notes]
            metrics = {}
            for tolerance in (50, 120, 180):
                pairs = match_onsets(expected, detected, tolerance)
                metrics[str(tolerance)] = {**summarize({"frames": 1, "expected": len(expected), "detected": len(detected), "matched": len(pairs)}),
                    "timing": distribution([detected[p]["onsetMs"] - expected[t]["onsetMs"] for t, p in pairs])}
            result["perClip"][clip] = {"elapsedMs": elapsed, "sourceSha256": entry["sha256"], "notes": detected, "onsets": metrics,
                "mergedUnisons": merged, "unsupportedReferenceEvents": unsupported}
            print(json.dumps({"clip": clip, "elapsedMs": elapsed, "onsets": metrics}), flush=True)
        for tolerance in ("50", "120", "180"):
            counts = {key: sum(c["onsets"][tolerance][key] for c in result["perClip"].values()) for key in ("frames", "expected", "detected", "matched")}
            result["totals"][tolerance] = summarize(counts)
        checked_source(source_path)
        result["state"] = "COMPLETED"
    except (Exception, KeyboardInterrupt) as cause:
        result.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (workspace / "results.json").open("x", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False, allow_nan=False, indent=2)
    print(str(workspace / "results.json"), flush=True)


def prepare_native(manifest):
    # 두 엔진에 동일 float32만 공급하는 비교이며 공식 모델의 스트리밍/시각 정렬을 검증하지 않습니다.
    import numpy as np
    import scipy
    from scipy.signal import resample_poly
    manifest, raw, source = checked_source(manifest)
    target = Path(__file__).resolve().parents[1] / "src-tauri/target/runtime-validation" / ("egset12-native-inputs-" + str(uuid4()))
    target.mkdir(exist_ok=False)
    result = {"schemaVersion": 1, "source": "EGSet12-11406378", "sourceManifestSha256": hashlib.sha256(raw).hexdigest(),
              "resampling": "scipy.signal.resample_poly147/320 기본 필터", "scipyVersion": scipy.__version__, "cases": []}
    for clip in source["selectedIds"]:
        with wave.open(str(manifest.parent / (clip + ".wav"))) as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (2, 3, 48000):
                raise ValueError("고정 WAV 구조 오류")
            pcm, _ = mono_24_stereo(audio.readframes(audio.getnframes()))
        values = resample_poly(np.asarray(pcm, dtype=np.float32), 147, 320)
        for start in (0, 2, 4, 6):
            samples = values[start * 22050:start * 22050 + 43844]
            if len(samples) != 43844 or not np.isfinite(samples).all() or np.abs(samples).max() > 1:
                raise ValueError("고정 모델 입력 범위 오류")
            data = samples.astype("<f4").tobytes()
            filename = f"eg{clip}-{start:02}.f32"
            with (target / filename).open("xb") as output:
                output.write(data)
            result["cases"].append({"file": filename, "sha256": hashlib.sha256(data).hexdigest(), "sourceId": clip, "startSeconds": start})
    checked_source(manifest)
    with (target / "public-inputs.json").open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, allow_nan=False, indent=2)
    print(str(target), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "analyze", "prepare-native"))
    parser.add_argument("manifest", type=Path)
    arguments = parser.parse_args()
    {"prepare": prepare, "analyze": analyze, "prepare-native": prepare_native}[arguments.mode](arguments.manifest)
