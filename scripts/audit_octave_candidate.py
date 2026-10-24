"""고정 후보의 전 지점/누락을 재집계합니다. 제품 검출/채택은 수행하지 않습니다."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from uuid import uuid4

from backup_local_data import checked_path
from package_validation import unique_object

PROJECT = Path(__file__).resolve().parents[1]


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def pitch(value):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("음정/주기성 쌍 오류")
    if value == [None, None]:
        return None
    if (not all(number(v) for v in value) or not 39.5 <= value[0] <= 88.5
            or not 0.90 <= value[1] <= 1):
        raise ValueError("음정/주기성 범위 오류")
    return value[0]


def summarize(document):
    if (type(document.get("schemaVersion")) is not int or document["schemaVersion"] != 1
            or any(document.get(key) is not False for key in (
                "productCodeChanged", "actualAppJudgements", "independentTechniqueGroundTruthAccepted"))):
        raise ValueError("비제품 개발 보고서가 아닙니다.")
    cases = document.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 512:
        raise ValueError("평가 창 개수 오류")
    totals = dict(points=0, mono=0, baselineCorrect=0, candidateCorrect=0,
                  baselineMissing=0, candidateMissing=0, regressions=0, improvements=0,
                  silentPoints=0, newVoicedSilent=0, changes=0)
    extra = dict(unknownPoints=0, polyPoints=0, newIncorrectMonoFromMissing=0,
                 newVoicedUncertain=0)
    seen = set()
    for case in cases:
        clip, start, points = case.get("clipId"), case.get("startMs"), case.get("points")
        if (not isinstance(clip, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", clip)
                or not number(start) or not 0 <= start <= 60000 or start % 1000 != 0
                or (clip, start) in seen or not isinstance(points, list) or len(points) != 38):
            raise ValueError("창 식별자/중복/고정38점 오류")
        seen.add((clip, start))
        for index, point in enumerate(points):
            if type(point.get("index")) is not int or point["index"] != index:
                raise ValueError("점 순서/인덱스 오류")
            if "referenceMidi" not in point:
                raise ValueError("원래 참조 필드가 없습니다.")
            reference = point["referenceMidi"]
            if reference is not None and (not isinstance(reference, list) or len(reference) > 6
                    or any(not number(v) or not 39.5 <= v <= 88.5 for v in reference)):
                raise ValueError("원래 참조 범위 오류")
            baseline, candidate = pitch(point["baseline"]), pitch(point["candidate"])
            totals["points"] += 1
            totals["changes"] += point["baseline"] != point["candidate"]
            if reference is None:
                extra["unknownPoints"] += 1
                extra["newVoicedUncertain"] += baseline is None and candidate is not None
            elif not reference:
                totals["silentPoints"] += 1
                totals["newVoicedSilent"] += baseline is None and candidate is not None
            elif len(reference) > 1:
                extra["polyPoints"] += 1
            else:
                good_before = baseline is not None and abs(baseline - reference[0]) * 100 <= 50
                good_after = candidate is not None and abs(candidate - reference[0]) * 100 <= 50
                totals["mono"] += 1
                totals["baselineMissing"] += baseline is None
                totals["candidateMissing"] += candidate is None
                totals["baselineCorrect"] += good_before
                totals["candidateCorrect"] += good_after
                totals["regressions"] += good_before and not good_after
                totals["improvements"] += good_after and not good_before
                extra["newIncorrectMonoFromMissing"] += baseline is None and candidate is not None and not good_after
    frozen = document.get("frozen", {})
    expected = {"allCases": len(cases), "allPoints": totals["points"], "monoPoints": totals["mono"],
                "silentPoints": totals["silentPoints"], "unknownPoints": extra["unknownPoints"]}
    if any(type(frozen.get(k)) is not int or frozen[k] != v for k, v in expected.items()):
        raise ValueError("사전 고정 분모와 다릅니다.")
    declared = document.get("totals", {})
    if set(declared) != set(totals) or any(type(declared[k]) is not int or declared[k] != v for k, v in totals.items()):
        raise ValueError("기존 합계와 재집계가 다릅니다.")
    state = "REJECTED_HELDOUT_REGRESSION" if totals["regressions"] or totals["newVoicedSilent"] else (
        "HELDOUT_QUALITY_PASSED_PERFORMANCE_PENDING" if totals["improvements"] else "REJECTED_NO_HELDOUT_IMPROVEMENT")
    if document.get("state") != state:
        raise ValueError("기존 완료 상태와 기각 조건이 다릅니다.")
    return {"candidateState": state, "totals": totals, "diagnostics": extra}


def run(path, expected_sha):
    root = PROJECT / "src-tauri/target/runtime-validation"
    path = Path(path).absolute()
    checked_path(root, path)
    if (not path.parent.name.startswith("goertzel-candidate-") or path.parent.parent != root
            or not path.name.startswith("heldout-results-") or path.suffix != ".json"
            or not re.fullmatch(r"[a-f0-9]{64}", expected_sha)):
        raise ValueError("등록한 개발 결과 경로/SHA만 허용합니다.")
    destination = path.parent / ("candidate-audit-" + str(uuid4()) + ".json")
    result = {"schemaVersion": 1, "state": "READING", "sourceSha256": expected_sha,
              "productCodeChanged": False, "actualAppJudgements": False}
    try:
        if not 0 < path.stat().st_size <= 4 * 1024 * 1024:
            raise ValueError("결과 크기 한도 초과")
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected_sha:
            raise ValueError("결과 SHA 불일치")
        document = json.loads(raw, object_pairs_hook=unique_object)
        result.update(summarize(document), state="AUDITED_WITHOUT_PRODUCT_ADOPTION")
        if path.read_bytes() != raw:
            raise ValueError("감사 중 원본 변경")
    except (Exception, KeyboardInterrupt) as cause:
        result.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with destination.open("x", encoding="utf8") as output:
            json.dump(result, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(str(destination), flush=True)
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    run(args.report, args.sha256)
