"""보존한 공개 음정 오류의 분석 창 주석을 대조하며 앱/검출기/원본은 변경하지 않습니다."""

import hashlib
import json
import math
from pathlib import Path
import sys
from uuid import uuid4

from benchmark_basic_pitch_short_windows import checked_sources
from prepare_guitarset_benchmark import contours, continuous_reference, note_masks


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def geometry(index, sample_rate):
    if type(index) is not int or sample_rate != 44100 or not 0 <= index < 38:
        raise ValueError("고정 분석 창 인덱스/샘플레이트 오류")
    decimation = math.ceil(sample_rate / 16000)
    hop = math.floor(sample_rate / decimation * 0.025)
    start = index * hop * decimation
    last = start + 1024 * decimation - 1
    return start / sample_rate, last / sample_rate, (start + last) * 500 / sample_rate


def references_equal(left, right):
    if left is None or right is None:
        return left is right
    if not isinstance(left, list) or not isinstance(right, list) or len(left) != len(right) or len(left) > 6:
        return False
    return all(number(a) and number(b) and 39.5 <= a <= 88.5 and abs(a - b) <= 1e-12
               for a, b in zip(left, right))


def checked_points(case, detail):
    if (case["kind"] != "TRACK" or case["sampleRate"] != 44100 or case["frames"] != 44100
            or not number(case["startMs"]) or not 0 <= case["startMs"] <= 60000
            or detail["clipId"] != case["clipId"] or detail["startMs"] != case["startMs"]
            or len(detail["points"]) != 38 or len(case["references"]) != 38):
        raise ValueError("고정 창/보고서 대응 오류")
    for index, (point, reference) in enumerate(zip(detail["points"], case["references"])):
        center = geometry(index, case["sampleRate"])[2]
        detected, confidence, time = point["detectedMidi"], point["periodicity"], point["timeMs"]
        if (type(point["index"]) is not int or point["index"] != index or not references_equal(point["referenceMidi"], reference)
                or (time is not None and (not number(time) or abs(time - center) > 1e-9))
                or (detected is not None and (not number(detected) or not 39.5 <= detected <= 88.5
                    or not number(confidence) or not 0 <= confidence <= 1 or time is None))
                or (detected is None and confidence is not None)):
            raise ValueError("보고서 중심/음정/참조 대응 오류")
    return detail["points"]


def context_at(tracks, masks, start_seconds, index, sample_rate, expected):
    first, last, _ = geometry(index, sample_rate)
    references = [continuous_reference(tracks, start_seconds + first + (last - first) * i / 16, masks)
                  for i in range(17)]
    flags = {
        "uncertainProbes": sum(value is None for value in references),
        "unvoicedProbes": sum(value == [] for value in references),
        "polyProbes": sum(value is not None and len(value) > 1 for value in references),
        "differentMonoProbes": sum(value is not None and len(value) == 1 and abs(value[0] - expected) > 0.5
                                   for value in references),
    }
    kind = ("POLY_REFERENCE_PRESENT" if flags["polyProbes"] else
            "CHANGING_MONO_REFERENCE" if flags["differentMonoProbes"] else
            "UNVOICED_REFERENCE_PRESENT" if flags["unvoicedProbes"] else
            "REFERENCE_UNCERTAIN" if flags["uncertainProbes"] else "ANNOTATED_MONO_CONTEXT")
    return {"kind": kind, **flags}


def read_json(path, limit):
    if path.is_symlink() or not 0 < path.stat().st_size <= limit:
        raise ValueError("평가 JSON 경로/크기 오류")
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def run(manifest, report):
    external = (Path(__file__).resolve().parents[1] / "fixtures/external").resolve(strict=True)
    if manifest.is_symlink() or report.is_symlink():
        raise ValueError("평가 입력 링크는 허용하지 않습니다.")
    manifest, report = manifest.resolve(strict=True), report.resolve(strict=True)
    if not manifest.is_relative_to(external) or manifest.name != "benchmark.json" or report.parent != manifest.parent:
        raise ValueError("같은 공개 평가 폴더의 입력만 사용하세요.")
    benchmark, benchmark_sha = read_json(manifest, 2 * 1024 * 1024)
    result, report_sha = read_json(report, 4 * 1024 * 1024)
    origin, origin_sha = read_json(manifest.parent.parent / "manifest.json", 128 * 1024)
    if (benchmark["schemaVersion"] != 1 or result["schemaVersion"] != 2
            or benchmark["source"] != "GuitarSet1.1.0" or result["source"] != benchmark["source"]
            or benchmark["referencePolicy"] != "continuous-note-mask-v1" or result["referencePolicy"] != benchmark["referencePolicy"]
            or benchmark["sourceManifestSha256"] != origin_sha or result["sourceManifestSha256"] != origin_sha
            or result["benchmarkManifestSha256"] != benchmark_sha
            or origin["source"] != "https://zenodo.org/records/3371780" or origin["version"] != "1.1.0"
            or origin["license"] != "cc-by-4.0" or origin["state"] != "FILES_VERIFIED"
            or len(origin["selectedIds"]) != 4 or len(set(origin["selectedIds"])) != 4
            or len(benchmark["cases"]) != 91 or len(result["trackCases"]) != 91):
        raise ValueError("기존 고정 공개 평가의 지문/계약 오류")
    source = manifest.parent.parent
    checked_sources(origin, source)
    annotations = {}
    for clip in origin["selectedIds"]:
        if Path(clip).name != clip or clip + ".jams" not in {item["name"] for item in origin["files"]}:
            raise ValueError("검증한 주석 이름이 아닙니다.")
        document, _ = read_json(source / (clip + ".jams"), 16 * 1024 * 1024)
        annotations[clip] = contours(document), note_masks(document)
    totals = {key: 0 for key in ("allPoints", "monoPoints", "polyPoints", "unvoicedPoints", "uncertainPoints")}
    contexts, errors, seen = {}, [], set()
    for case, detail in zip(benchmark["cases"], result["trackCases"]):
        key = (case["clipId"], case["startMs"])
        if key in seen or key[0] not in annotations:
            raise ValueError("중복/알 수 없는 평가 창")
        seen.add(key)
        tracks, masks = annotations[key[0]]
        for point in checked_points(case, detail):
            totals["allPoints"] += 1
            reference = point["referenceMidi"]
            kind = ("uncertainPoints" if reference is None else "unvoicedPoints" if not reference else
                    "monoPoints" if len(reference) == 1 else "polyPoints")
            totals[kind] += 1
            if kind != "monoPoints":
                continue
            index = point["index"]
            # 중심 참조도 원본에서 대조해 보고서/참조를 결과에 맞춰 바꾸지 못하게 합니다.
            center = geometry(index, case["sampleRate"])[2]
            if not references_equal(reference, continuous_reference(tracks, (key[1] + center) / 1000, masks)):
                raise ValueError("원본 중심 참조 불일치")
            context = context_at(tracks, masks, key[1] / 1000, index, case["sampleRate"], reference[0])
            counts = contexts.setdefault(context["kind"], {name: 0 for name in ("reference", "candidate", "within50", "error", "missing")})
            counts["reference"] += 1
            detected = point["detectedMidi"]
            if detected is None:
                counts["missing"] += 1
                continue
            counts["candidate"] += 1
            error = (detected - reference[0]) * 100
            if abs(error) <= 50:
                counts["within50"] += 1
            else:
                counts["error"] += 1
                first, last, _ = geometry(index, case["sampleRate"])
                errors.append({"clipId": key[0], "timeMs": key[1] + center,
                               "windowFirstMs": key[1] + first * 1000, "windowLastMs": key[1] + last * 1000,
                               "referenceMidi": reference[0], "detectedMidi": detected,
                               "errorCents": error, "periodicity": point["periodicity"], "context": context})
    checked_sources(origin, source)
    if (read_json(manifest, 2 * 1024 * 1024)[1] != benchmark_sha
            or read_json(report, 4 * 1024 * 1024)[1] != report_sha
            or read_json(source / "manifest.json", 128 * 1024)[1] != origin_sha):
        raise ValueError("감사 중 입력 변경")
    output = {"schemaVersion": 1, "state": "PUBLIC_WINDOW_CONTEXT_AUDIT", "sourceManifestSha256": origin_sha,
              "benchmarkSha256": benchmark_sha, "reportSha256": report_sha,
              "probesPerWindow": 17, "totals": totals, "contexts": contexts, "errors": errors,
              "limitations": ["자동 주석의 문맥이며 실제 파형의 성부/잔향 원인이나 주법 정답이 아님",
                              "원본/검출기/채점/모델을 변경하지 않음", "고정4개/2명 표본의 관측이며 일반화 품질이 아님"]}
    destination = manifest.parent / ("window-context-" + str(uuid4()) + ".json")
    with destination.open("x", encoding="utf-8") as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps({"path": str(destination), "totals": totals, "contexts": contexts}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("기존 고정 benchmark.json과 native schema2 보고서가 필요합니다.")
    run(Path(sys.argv[1]), Path(sys.argv[2]))
