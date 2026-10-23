"""보존된 공개 분석 결과와 onset 참조만 비교합니다. 모델·앱·사용자 녹음을 실행하지 않습니다."""

import hashlib
import json
import math
from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchmark_basic_pitch_short_windows import checked_sources
from benchmark_basic_pitch_guitarset import summarize


def reference_notes(document):
    tracks = [value for value in document["annotations"] if value["namespace"] == "note_midi"]
    if len(tracks) != 6:
        raise ValueError("기타6줄 onset 주석이 아닙니다.")
    notes = []
    unsupported = 0
    for track in tracks:
        if not isinstance(track["data"], list) or len(track["data"]) > 512:
            raise ValueError("주석 개수 오류")
        for value in track["data"]:
            onset, duration, pitch = value["time"] * 1000, value["duration"] * 1000, value["value"]
            if any(not math.isfinite(v) for v in (onset, duration, pitch)) or onset < 0 or duration <= 0:
                raise ValueError("주석 시각/음정 오류")
            if not 39.5 <= pitch <= 88.5:
                unsupported += 1
                continue
            notes.append({"onsetMs": onset, "offsetMs": onset + duration, "pitchMidi": pitch})
    merged = []
    previous = {}
    for note in sorted(notes, key=lambda n: (n["onsetMs"], n["pitchMidi"])):
        key = math.floor(note["pitchMidi"] + 0.5)
        earlier = previous.get(key)
        if earlier is not None and note["onsetMs"] - earlier["onsetMs"] <= 10 and abs(note["pitchMidi"] - earlier["pitchMidi"]) <= 0.5:
            earlier["offsetMs"] = max(earlier["offsetMs"], note["offsetMs"])
            continue
        copy = dict(note)
        merged.append(copy)
        previous[key] = copy
    return merged, len(notes) - len(merged), unsupported


def match_onsets(expected, detected, tolerance_ms):
    if len(expected) > 512 or len(detected) > 512 or tolerance_ms not in (50, 120, 180):
        raise ValueError("고정 onset 평가 범위 오류")
    for note in [*expected, *detected]:
        if any(not math.isfinite(note[key]) for key in ("onsetMs", "offsetMs", "pitchMidi")) or not 0 <= note["onsetMs"] < note["offsetMs"] or not 0 <= note["pitchMidi"] <= 127:
            raise ValueError("음표 이벤트 오류")
    candidates = [[index for index, note in sorted(enumerate(detected), key=lambda pair: (abs(pair[1]["onsetMs"] - target["onsetMs"]), pair[0]))
        if abs(note["pitchMidi"] - target["pitchMidi"]) <= 0.5 and abs(note["onsetMs"] - target["onsetMs"]) <= tolerance_ms] for target in expected]
    return maximum_pairs(candidates)


def maximum_pairs(candidates):
    owners = {}
    def assign(target, seen):
        for index in candidates[target]:
            if index in seen:
                continue
            seen.add(index)
            if index not in owners or assign(owners[index], seen):
                owners[index] = target
                return True
        return False
    for target in range(len(candidates)):
        assign(target, set())
    return sorted((target, index) for index, target in owners.items())


def match_times(expected, detected, tolerance_ms):
    if len(expected) > 512 or len(detected) > 2048 or tolerance_ms not in (5, 10, 25, 50, 120, 180):
        raise ValueError("타격 시각 비교 한도 오류")
    if any(type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 60000 for value in [*expected, *detected]):
        raise ValueError("타격 시각 숫자/범위 오류")
    candidates = [[index for index, onset in sorted(enumerate(detected), key=lambda pair: (abs(pair[1] - target), pair[0]))
                   if abs(onset - target) <= tolerance_ms] for target in expected]
    return maximum_pairs(candidates)


def distribution(values):
    if not values:
        return None
    ordered = sorted(values)
    absolute = sorted(map(abs, values))
    return {"signedMedianMs": ordered[len(ordered) // 2], "absoluteMedianMs": absolute[len(absolute) // 2],
        "absoluteP95Ms": absolute[math.ceil(len(absolute) * 0.95) - 1]}


def run(manifest, report):
    allowed = (Path(__file__).resolve().parents[1] / "fixtures/external").resolve(strict=True)
    manifest, report = manifest.resolve(strict=True), report.resolve(strict=True)
    if not manifest.is_relative_to(allowed) or not report.is_relative_to(manifest.parent) or max(manifest.stat().st_size, report.stat().st_size) > 2 * 1024 * 1024:
        raise ValueError("공개 평가 경로/크기 오류")
    raw_manifest, raw_report = manifest.read_bytes(), report.read_bytes()
    benchmark, predictions = json.loads(raw_manifest), json.loads(raw_report)
    source = manifest.parent.parent
    origin_raw = (source / "manifest.json").read_bytes()
    origin = json.loads(origin_raw)
    if benchmark["source"] != "GuitarSet1.1.0" or hashlib.sha256(origin_raw).hexdigest() != benchmark["sourceManifestSha256"] or origin["license"] != "cc-by-4.0" or predictions["state"] != "COMPLETED" or predictions["model"] != "Basic Pitch" or predictions["modelVersion"] != "0.4.0" or predictions["benchmarkManifestSha256"] != hashlib.sha256(raw_manifest).hexdigest() or set(predictions["perClip"]) != set(origin["selectedIds"]):
        raise ValueError("보존한 공개 분석 결과 계약 오류")
    checked_sources(origin, source)
    known_files = {entry["name"] for entry in origin["files"]}
    if any(clip + ".jams" not in known_files or Path(clip).name != clip for clip in origin["selectedIds"]):
        raise ValueError("확인한 주석 원본 이름이 아닙니다.")
    result = {"schemaVersion": 1, "state": "COMPLETED", "benchmarkSha256": hashlib.sha256(raw_manifest).hexdigest(), "predictionReportSha256": hashlib.sha256(raw_report).hexdigest(),
        "independentHeldOutEvaluation": False, "notActualAppJudgements": True, "perClip": {}, "totals": {}}
    for tolerance in (50, 120, 180):
        counts = {"frames": 0, "expected": 0, "detected": 0, "matched": 0}
        differences = []
        for clip in origin["selectedIds"]:
            expected, merged, unsupported = reference_notes(json.loads((source / (clip + ".jams")).read_bytes()))
            detected = predictions["perClip"][clip]["notes"]
            pairs = match_onsets(expected, detected, tolerance)
            deltas = [detected[p]["onsetMs"] - expected[t]["onsetMs"] for t, p in pairs]
            metrics = summarize({"frames": 1, "expected": len(expected), "detected": len(detected), "matched": len(pairs)})
            result["perClip"].setdefault(clip, {})[str(tolerance)] = {**metrics, "unmatchedReferenceEvents": len(expected) - len(pairs), "extraDetectedEvents": len(detected) - len(pairs), "timing": distribution(deltas), "mergedUnisons": merged, "unsupportedReferenceEvents": unsupported}
            for key in counts:
                counts[key] += metrics[key]
            differences.extend(deltas)
        result["totals"][str(tolerance)] = {**summarize(counts), "timing": distribution(differences)}
    target = manifest.parent / ("onset-evaluation-" + str(uuid4()) + ".json")
    with target.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps(result["totals"]))
    print(str(target))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("고정 참조 manifest와 보존한 전체 파일 분석 JSON이 필요합니다.")
    run(Path(sys.argv[1]), Path(sys.argv[2]))
