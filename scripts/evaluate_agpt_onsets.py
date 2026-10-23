"""지문 검증한 공개 타격 시점만 비교합니다. 음정/실제 앱 감점률은 계산하지 않습니다."""

from collections import Counter
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import sys
from uuid import UUID, uuid4

from backup_local_data import checked_path
from benchmark_basic_pitch_guitarset import summarize
from evaluate_guitarset_onsets import distribution, match_times
from fetch_agpt_audio_sample import PLAN_SHA256, load_plan
from fetch_agpt_metadata import CSV_FILES
from package_validation import unique_object
from prepare_agpt_onset_benchmark import read_manifest, references, source_root, verified_bytes

PROJECT = Path(__file__).resolve().parents[1]
TOLERANCES = (5, 10, 25, 50, 120)


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def read_json(path):
    checked_path(PROJECT, path)
    with path.open("rb") as source: raw = source.read(2 * 1024 * 1024 + 1)
    if not 0 < len(raw) <= 2 * 1024 * 1024:
        raise ValueError("공개 평가 JSON 크기 오류")
    return json.loads(raw, object_pairs_hook=unique_object), hashlib.sha256(raw).hexdigest()


def audit_events(targets, events, pairs):
    # 검증을 마친 기존 대응을 그대로 분해하며 후보 유무로 재대응하지 않습니다.
    owners = dict(pairs)
    used = set(owners.values())
    extras = []
    for index, event in enumerate(events):
        if index in used: continue
        onset = event["onsetSample"] / 48
        nearest = min(range(len(targets)), key=lambda i: (abs(targets[i] - onset), i))
        delta = onset - targets[nearest]
        extras.append({"detectedIndex": index, "nearestReferenceIndex": nearest,
                       "nearestReferenceMatchedDetectedIndex": owners.get(nearest),
                       "deltaToNearestMs": delta, "insideReferenceWindow": abs(delta) <= 50,
                       "pitchReturned": event["pitchMidi"] is not None})
    matched_pitch = sum(events[index]["pitchMidi"] is not None for index in used)
    extra_pitch = sum(row["pitchReturned"] for row in extras)
    inside = sum(row["insideReferenceWindow"] for row in extras)
    return {"matchedWithPitch": matched_pitch, "matchedUnverified": len(used) - matched_pitch,
            "extraWithPitch": extra_pitch, "extraUnverified": len(extras) - extra_pitch,
            "extraInsideReferenceWindow": inside, "extraOutsideReferenceWindow": len(extras) - inside,
            "extraEvents": extras}


def evaluate(benchmark, report, plan):
    for document in (benchmark, report):
        if (type(document["schemaVersion"]) is not int or type(document["tailPaddingFrames"]) is not int
                or not isinstance(document["referencePitchIssues"], dict)
                or any(type(count) is not int or count <= 0 for count in document["referencePitchIssues"].values())):
            raise ValueError("타격 평가 버전/프레임/참조 개수는 정수여야 합니다.")
    if (benchmark["schemaVersion"] != 1 or benchmark["state"] != "AGPT_ONSET_BENCHMARK_PREPARED"
            or benchmark["source"] != "AG-PT-set10159492" or benchmark["license"] != "cc-by-4.0"
            or benchmark["planSha256"] != PLAN_SHA256 or benchmark["pitchEvaluationEnabled"] is not False
            or benchmark["referencePolicy"] != "onset-sample-column-only-v1" or benchmark["gainNormalized"] is not False
            or benchmark["tailPaddingFrames"] != 0 or benchmark["noiseGateDbfs"] != -50
            or report["schemaVersion"] != 1 or report["state"] != "COMPLETED" or report["sampleRate"] != 48000
            or report["coldStart"] is not True or report["tailPaddingFrames"] != 0 or report["noiseGateDbfs"] != -50
            or report["actualAppJudgements"] is not False or report["actualDeviceLatencyMeasured"] is not False
            or report["pitchEvaluationEnabled"] is not False or report["referencePolicy"] != benchmark["referencePolicy"]
            or report["referencePitchIssues"] != benchmark["referencePitchIssues"]
            or len(benchmark["cases"]) != 8 or len(report["clips"]) != 8 or len(plan["samples"]) != 8
            or [case["clipId"] for case in benchmark["cases"]] != [row["filename"] for row in plan["samples"]]):
        raise ValueError("고정 타격 전용 평가 계약 오류")
    clips = {clip["clipId"]: clip for clip in report["clips"]}
    if len(clips) != 8 or set(clips) != {row["filename"] for row in plan["samples"]}:
        raise ValueError("검출 표본 누락/중복")
    issues = dict(Counter(row["pitchReferenceStatus"] for case in benchmark["cases"] for row in case["references"]))
    if issues != benchmark["referencePitchIssues"]:
        raise ValueError("음정 참조 보류 분모 오류")
    result = {"schemaVersion": 2, "state": "COMPLETED", "pitchEvaluationEnabled": False,
              "referencePitchIssues": issues, "actualAppJudgements": False, "actualDeviceLatencyMeasured": False,
              "independentHeldOutEvaluation": False, "noiseGateDbfs": -50, "coldStart": True, "tailPaddingFrames": 0,
              "pairingPolicy": "maximum-cardinality-nearest-candidate-not-global-minimum-error",
              "quantilePolicy": "upper-middle-and-nearest-rank-p95", "perClip": {}, "totals": {}}
    totals = {str(t): {"expected": 0, "detected": 0, "matched": 0} for t in TOLERANCES}
    delta_groups = {str(t): [] for t in TOLERANCES}
    all_delays, discontinuities, pitch_events, processing_ms = [], 0, 0, 0.0
    for case, planned in zip(benchmark["cases"], plan["samples"]):
        clip = clips[case["clipId"]]
        if (case["clipId"] != planned["filename"] or case["frames"] != planned["frames"]
                or clip["frames"] != case["frames"] or len(case["references"]) != planned["notes"]
                or not number(clip["processingMs"]) or clip["processingMs"] < 0
                or type(clip["discontinuities"]) is not int or not 0 <= clip["discontinuities"] <= case["frames"]
                or len(clip["events"]) > 2048):
            raise ValueError("표본/분모/처리 기록 오류")
        events = clip["events"]
        previous, previous_emitted = -1, -1
        for event in events:
            onset, emitted = event["onsetSample"], event["emittedSample"]
            pitch, confidence = event["pitchMidi"], event["confidence"]
            if (type(onset) is not int or type(emitted) is not int or not 0 <= onset <= emitted < case["frames"]
                    or onset <= previous or emitted <= previous_emitted or (pitch is None) != (confidence is None)
                    or (pitch is not None and (not number(pitch) or not 0 <= pitch <= 127
                        or not number(confidence) or not 0 <= confidence <= 1))):
                raise ValueError("검출 공격/방출 시각·음정 기록 오류")
            previous = onset
            previous_emitted = emitted
        targets = [row["sample"] / 48 for row in case["references"]]
        detected = [row["onsetSample"] / 48 for row in events]
        delays = [(row["emittedSample"] - row["onsetSample"]) / 48 for row in events]
        available = sum(row["pitchMidi"] is not None for row in events)
        details = {"expected": len(targets), "detected": len(events), "pitchReturnedEvents": available,
                   "unverifiedEvents": len(events) - available, "discontinuities": clip["discontinuities"],
                   "processingMs": clip["processingMs"], "emissionDelayMs": distribution(delays),
                   "warmupReferenceCount": sum(row["sample"] < 4096 for row in case["references"]),
                   "last210msReferenceCount": sum(row["sample"] >= case["frames"] - 10080 for row in case["references"]),
                   "perTolerance": {}}
        for tolerance in TOLERANCES:
            pairs = match_times(targets, detected, tolerance)
            deltas = [detected[d] - targets[r] for r, d in pairs]
            counts = {"expected": len(targets), "detected": len(events), "matched": len(pairs)}
            details["perTolerance"][str(tolerance)] = {**summarize(counts), "timing": distribution(deltas),
                "unmatchedReferenceEvents": len(targets) - len(pairs), "extraDetectedEvents": len(events) - len(pairs),
                "pairs": [{"referenceIndex": r, "detectedIndex": d, "deltaMs": detected[d] - targets[r]} for r, d in pairs]}
            for key, value in counts.items(): totals[str(tolerance)][key] += value
            delta_groups[str(tolerance)].extend(deltas)
        details["eventAudit50ms"] = audit_events(targets, events,
            [(row["referenceIndex"], row["detectedIndex"]) for row in details["perTolerance"]["50"]["pairs"]])
        result["perClip"][case["clipId"]] = details
        all_delays.extend(delays); discontinuities += clip["discontinuities"]
        pitch_events += available; processing_ms += clip["processingMs"]
    for tolerance, counts in totals.items():
        result["totals"][tolerance] = {**summarize(counts), "timing": distribution(delta_groups[tolerance]),
            "unmatchedReferenceEvents": counts["expected"] - counts["matched"],
            "extraDetectedEvents": counts["detected"] - counts["matched"]}
    result.update(emissionDelayMs=distribution(all_delays), discontinuities=discontinuities,
                  pitchReturnedEvents=pitch_events, unverifiedEvents=len(all_delays) - pitch_events, processingMs=processing_ms)
    result["eventAudit50ms"] = {key: sum(row["eventAudit50ms"][key] for row in result["perClip"].values())
                              for key in next(iter(result["perClip"].values()))["eventAudit50ms"] if key != "extraEvents"}
    return result


def main(manifest, detections, metadata_root):
    manifest, detections = manifest.absolute(), detections.absolute()
    root = manifest.parent
    source = source_root(root.parent, "agpt-audio-10159492")
    if (manifest.name != "benchmark.json" or root.name != "onset-benchmark-" + str(UUID(root.name.removeprefix("onset-benchmark-")))
            or detections.parent != root or not detections.name.startswith("detections-") or detections.suffix != ".json"):
        raise ValueError("고정 타격 평가 경로 오류")
    metadata_root = source_root(metadata_root, "agpt-10159492")
    benchmark, benchmark_sha = read_json(manifest)
    report, report_sha = read_json(detections)
    plan = load_plan()
    _, source_sha = read_manifest(source)
    _, metadata_sha = read_manifest(metadata_root)
    if (report["benchmarkSha256"] != benchmark_sha or benchmark["sourceManifestSha256"] != source_sha
            or benchmark["metadataManifestSha256"] != metadata_sha):
        raise ValueError("원문/검출 결과 연결 SHA 오류")
    expected_size, _, _, expected_sha = CSV_FILES["note_labels.csv"]
    raw = verified_bytes(metadata_root / "note_labels.csv", expected_size, expected_sha)
    expected = references(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline="")), plan["samples"])
    for case in benchmark["cases"]:
        if case["references"] != expected[case["clipId"]]:
            raise ValueError("검증 CSV와 다른 타격 참조")
    result = evaluate(benchmark, report, plan)
    result.update(benchmarkSha256=benchmark_sha, detectionReportSha256=report_sha, planSha256=PLAN_SHA256,
                  sourceManifestSha256=source_sha, metadataManifestSha256=metadata_sha)
    destination = root / ("onset-evaluation-" + str(uuid4()) + ".json")
    with destination.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps(result["totals"], ensure_ascii=False)); print(str(destination), flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 4: raise SystemExit("공개 benchmark.json·검출 JSON·CSV UUID 폴더가 필요합니다.")
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
