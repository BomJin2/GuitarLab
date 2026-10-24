"""이미 관측한 공개 단음 창만 pYIN과 비교합니다. 제품/실시간 점수에는 연결하지 않습니다."""

import array
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import sys
import time
from unittest.mock import patch
from uuid import uuid4

from audit_guitarset_pitch_windows import checked_pcm, checked_points, geometry, read_json
from backup_local_data import checked_path, safe_member
from benchmark_basic_pitch_guitarset import deny_network
from benchmark_basic_pitch_short_windows import checked_sources
from package_validation import unique_object

PROJECT = Path(__file__).resolve().parents[1]
VERSIONS = {"librosa": "0.11.0", "numpy": "1.26.4", "scipy": "1.15.3", "numba": "0.68.0"}
PARAMETERS = dict(fmin=70.0, fmax=1500.0, sr=14700, frame_length=1024, hop_length=367,
                  n_thresholds=100, beta_parameters=[2, 18], boltzmann_parameter=2,
                  resolution=0.1, max_transition_rate=35.92, switch_prob=0.01,
                  no_trough_prob=0.01, center=False, pad_mode="constant")
EXPECTED = {
    "originalBenchmark": "bfa232946a88ff1796f0b8ed7adb021664b8fed0d41ad198e5b4456a255b7be1",
    "originalReport": "e4e96b4378c0a6f100630f38a92f51dc47dc102ff8a68438587177a4d65ab65e",
    "additionalBenchmark": "7f0a90f0e8e16931bf80e40885a4e4ea76ad5d0e0bbb51d66d7de8b974447310",
    "additionalReport": "88fe72b8bcde5b2b30366487aafebf4bfdc2f75c38dd90d6aa954c0dd0a6812c",
    "productDsp": "98c6258fc339d97fed1500e829415e88ff8c8a87a4d8aa903b1f8330e0d75b33",
}


def protocol(path):
    path = Path(path).absolute()
    root = PROJECT / "src-tauri/target/runtime-validation"
    checked_path(root, path)
    if path.parent.parent != root or not path.parent.name.startswith("pyin-baseline-") or path.name != "plan.json":
        raise ValueError("고정 비교 계획 경로 오류")
    plan, sha = read_json(path, 32768)
    if (type(plan.get("schemaVersion")) is not int or plan["schemaVersion"] != 1
            or plan.get("state") != "OFFLINE_COMPARISON_REGISTERED_BEFORE_EXECUTION"
            or plan.get("posthocObservedData") is not True
            or any(plan.get(k) is not False for k in ("independentGroundTruthAccepted", "productCodeChanged", "actualAppJudgements", "streamingEquivalent"))
            or plan.get("versions") != VERSIONS
            or json.dumps(plan.get("parameters"), sort_keys=True) != json.dumps(PARAMETERS, sort_keys=True)
            or type(plan.get("pointsPerCase")) is not int or plan["pointsPerCase"] != 38
            or plan.get("caseCounts") != [91, 91] or set(plan["sources"]) != set(EXPECTED)):
        raise ValueError("사전 고정 방법/분모 변경")
    paths = {}
    for key, item in plan["sources"].items():
        name = item["path"]; safe_member(name)
        prefix = ("src-tauri/target/runtime-validation/goertzel-candidate-0004f82b-0b2a-4fca-b5bb-dd8e2d892717/"
                  if key == "additionalReport" else "fixtures/external/guitarset-v1.1.0/")
        if (key == "productDsp" and name != "src-tauri/src/audio/dsp.rs") or (key != "productDsp" and not name.startswith(prefix)):
            raise ValueError("공개 고정 입력 경로가 아님")
        source = PROJECT / name; checked_path(PROJECT, source)
        if (type(item["bytes"]) is not int or not 0 < item["bytes"] <= 4 * 1024 * 1024
                or source.stat().st_size != item["bytes"] or item["sha256"] != EXPECTED[key]
                or hashlib.sha256(source.read_bytes()).hexdigest() != EXPECTED[key]):
            raise ValueError("고정 입력 지문 변경")
        paths[key] = source
    return paths, sha


def preprocess(samples):
    if len(samples) != 44100 or any(not math.isfinite(v) or abs(v) > 1 for v in samples):
        raise ValueError("고정1초/정규 PCM 오류")
    mean = 0.0
    for value in samples: mean += value
    mean /= len(samples)
    energy = 0.0
    for value in samples: energy += (value - mean) ** 2
    unavailable = sum(abs(v) >= 0.9999 for v in samples) * 1000 >= len(samples) or energy / len(samples) < 10 ** -6.5
    reduced = array.array("f", (((samples[i] + samples[i+1]) + samples[i+2]) / 3 - mean
                               for i in range(0, len(samples), 3)))
    masks = []
    for start in range(0, len(reduced) - 1024 + 1, 367):
        energy = 0.0
        for value in reduced[start:start+1024]: energy += value ** 2
        masks.append(not unavailable and energy / 1024 >= 10 ** -6.5)
    return reduced, masks


def observations(frequencies, flags, probabilities, masks):
    if any(len(v) != 38 for v in (frequencies, flags, probabilities, masks)):
        raise ValueError("고정38점 모델 출력 오류")
    rows = []
    for hz, flag, probability, available in zip(frequencies, flags, probabilities, masks):
        if (type(flag) is not bool or type(available) is not bool
                or type(probability) not in (int, float) or not math.isfinite(probability) or not 0 <= probability <= 1
                or (hz is not None and (type(hz) not in (int, float) or not math.isfinite(hz) or hz <= 0))
                or (flag and hz is None)):
            raise ValueError("모델 발음/확률/F0 값 오류")
        midi = 69 + 12 * math.log2(hz / 440) if hz is not None and flag else None
        candidate = midi if available and midi is not None and 39.5 <= midi <= 88.5 else None
        rows.append({"rawHz": hz, "voicedFlag": flag, "voicedProbability": probability, "candidateMidi": candidate,
                     "commonGateAvailable": available})
    return rows


def compare(reference, baseline, candidate):
    result = dict(points=1, mono=0, silent=0, unknown=0, poly=0, baselineCorrect=0, pyinCorrect=0,
                  baselineMissing=0, pyinMissing=0, gains=0, losses=0, baselineVoicedSilent=0, pyinVoicedSilent=0)
    if reference is None: result["unknown"] = 1
    elif not reference:
        result.update(silent=1, baselineVoicedSilent=int(baseline is not None), pyinVoicedSilent=int(candidate is not None))
    elif len(reference) > 1: result["poly"] = 1
    else:
        before = baseline is not None and abs(baseline - reference[0]) <= .5
        after = candidate is not None and abs(candidate - reference[0]) <= .5
        result.update(mono=1, baselineCorrect=int(before), pyinCorrect=int(after),
                      baselineMissing=int(baseline is None), pyinMissing=int(candidate is None),
                      gains=int(after and not before), losses=int(before and not after))
    return result


def predictor(folder):
    for name, expected in VERSIONS.items():
        if importlib.metadata.version(name) != expected: raise ValueError("고정 개발 환경 버전이 아님: " + name)
    os.environ["NUMBA_CACHE_DIR"] = str(folder / "numba-cache")
    os.environ["LIBROSA_CACHE_DIR"] = str(folder / "librosa-cache")
    os.environ["NUMBA_NUM_THREADS"] = "1"; os.environ["OPENBLAS_NUM_THREADS"] = "1"
    import numpy as np
    import librosa
    def infer(samples):
        hz, flags, probabilities = librosa.pyin(np.asarray(samples, dtype=np.float32), **{
            **PARAMETERS, "beta_parameters": tuple(PARAMETERS["beta_parameters"]), "fill_na": np.nan})
        return ([None if math.isnan(float(v)) else float(v) for v in hz],
                [bool(v) for v in flags], [float(v) for v in probabilities])
    source = Path(librosa.__file__).parent / "core/pitch.py"
    return infer, hashlib.sha256(source.read_bytes()).hexdigest()


def run(plan_path):
    paths, plan_sha = protocol(plan_path)
    folder = Path(plan_path).absolute().parent
    destination = folder / ("pyin-observations-" + str(uuid4()) + ".json")
    result = {"schemaVersion": 1, "state": "PREPARING", "planSha256": plan_sha,
              "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "versions": VERSIONS,
              "productCodeChanged": False, "actualAppJudgements": False, "streamingEquivalent": False,
              "posthocObservedData": True, "independentGroundTruthAccepted": False, "datasets": []}
    try:
        with patch("socket.create_connection", deny_network), patch("socket.socket.connect", deny_network), patch("socket.getaddrinfo", deny_network):
            started = time.perf_counter(); infer, result["librosaPitchSourceSha256"] = predictor(folder)
            demo = array.array("f", (.3 * math.sin(math.tau * 130.8127826502993 * i / 14700) for i in range(14700)))
            rows = observations(*infer(demo), [True] * 38)
            values = [r["candidateMidi"] for r in rows if r["candidateMidi"] is not None]
            if len(values) < 30 or max(abs(v - 48) for v in values) > .5: raise ValueError("DEMO 단음 자체검사 실패")
            result["demoControl"] = {"demo": True, "points": 38, "voiced": len(values), "importAndFirstCallSeconds": time.perf_counter()-started}
            frozen = {"state": "SOURCE_FROZEN_BEFORE_PUBLIC_CASES", "planSha256": plan_sha,
                      "scriptSha256": result["scriptSha256"], "librosaPitchSourceSha256": result["librosaPitchSourceSha256"],
                      "sourceSha256": EXPECTED, "parameters": PARAMETERS, "versions": VERSIONS,
                      "networkDisabled": True, "posthocObservedData": True, "productCodeChanged": False}
            with (folder / ("pyin-freeze-" + str(uuid4()) + ".json")).open("x", encoding="utf8") as output:
                json.dump(frozen, output, ensure_ascii=False, indent=2, allow_nan=False)
            for group in ("original", "additional"):
                benchmark_path = paths[group + "Benchmark"]; root = benchmark_path.parent
                benchmark, _ = read_json(benchmark_path, 2*1024*1024)
                report, _ = read_json(paths[group + "Report"], 4*1024*1024)
                origin, origin_sha = read_json(root.parent / "manifest.json", 128*1024)
                if origin_sha != benchmark["sourceManifestSha256"] or len(benchmark["cases"]) != 91:
                    raise ValueError("공개 원본/분모 불일치")
                checked_sources(origin, root.parent)
                details = report["trackCases"] if group == "original" else report["cases"]
                if len(details) != 91: raise ValueError("baseline 창 개수 오류")
                dataset = {"name": group, "cases": [], "totals": None}; result["datasets"].append(dataset)
                for ordinal, (case, detail) in enumerate(zip(benchmark["cases"], details)):
                    if group == "additional":
                        detail = {**detail, "points": [{"index": p["index"], "referenceMidi": p["referenceMidi"],
                            "detectedMidi": p["baseline"][0], "periodicity": p["baseline"][1],
                            "timeMs": geometry(p["index"], 44100)[2]} for p in detail["points"]]}
                    before = checked_points(case, detail); samples = checked_pcm(case, root / "cases")
                    reduced, masks = preprocess(samples); started = time.perf_counter()
                    if any(masks): after = observations(*infer(reduced), masks)
                    else: after = [{"rawHz": None, "voicedFlag": None, "voicedProbability": None,
                                   "candidateMidi": None, "commonGateAvailable": False} for _ in range(38)]
                    points = []
                    for baseline, candidate in zip(before, after):
                        counts = compare(baseline["referenceMidi"], baseline["detectedMidi"], candidate["candidateMidi"])
                        if dataset["totals"] is None: dataset["totals"] = {k: 0 for k in counts}
                        for key, value in counts.items(): dataset["totals"][key] += value
                        points.append({**baseline, **candidate})
                    dataset["cases"].append({"clipId": case["clipId"], "startMs": case["startMs"], "pcmSha256": case["sha256"],
                        "inferencePerformed": any(masks), "elapsedSeconds": time.perf_counter()-started, "points": points})
                    if ordinal % 15 == 0: print(f"기존 공개 {group} 창 {ordinal+1}/91", flush=True)
                checked_sources(origin, root.parent)
                for case in benchmark["cases"]: checked_pcm(case, root/"cases")
                print(group, dataset["totals"], flush=True)
            if protocol(plan_path)[1] != plan_sha: raise ValueError("관측 중 등록 계획 변경")
            if hashlib.sha256(Path(__file__).read_bytes()).hexdigest() != result["scriptSha256"]:
                raise ValueError("관측 중 도구 소스 변경")
            result["state"] = "OFFLINE_OBSERVATIONS_COMPLETED_WITHOUT_PRODUCT_ADOPTION"
    except (Exception, KeyboardInterrupt) as cause:
        result.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with destination.open("x", encoding="utf8") as output:
            json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(str(destination), flush=True)
    return destination


if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit("고정 공개 비교 plan.json이 필요합니다.")
    run(Path(sys.argv[1]))
