"""고정 공개 관측의 주기 조건만 사후 대조합니다. 검출기/점수는 바꾸지 않습니다."""

import argparse
import hashlib
import json
import math
from pathlib import Path
from uuid import UUID, uuid4

from backup_local_data import checked_path
from package_validation import unique_object

PROJECT = Path(__file__).resolve().parents[1]
OBSERVATION_SHA = "a524f4f17a1477046364832dbd3ed378c02c3dd3d2a26400619da9c74b86625e"


def audit_points(points):
    if not 20 <= len(points) <= 40:
        raise ValueError("감사 점 개수 오류")
    valid = []
    previous = -1.0
    for point in points:
        time_ms, midi, confidence = (point[key] for key in ("timeMs", "midi", "confidence"))
        if (type(time_ms) not in (int, float) or not math.isfinite(time_ms)
                or not 0 <= time_ms < 1000 or time_ms <= previous):
            raise ValueError("감사 점 시각 오류")
        previous = time_ms
        if midi is None and confidence is None:
            continue
        if (type(midi) not in (int, float) or not math.isfinite(midi) or not 39.5 <= midi <= 88.5
                or type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0.9 <= confidence <= 1):
            raise ValueError("감사 점 음정/주기성 오류")
        valid.append((time_ms / 1000, midi * 100, confidence))
    if (len(valid) < 20 or len(valid) / len(points) < 0.9 or any(v[2] < 0.95 for v in valid)
            or any(b[0] - a[0] > 0.080001 or abs(b[1] - a[1]) > 80 for a, b in zip(valid, valid[1:]))):
        return {"unmetExistingConditions": ["POINT_QUALITY_OR_CONTINUITY"], "bestWithinExisting3To9Hz": None}
    count = len(valid)
    mean_time = sum(p[0] for p in valid) / count
    mean_pitch = sum(p[1] for p in valid) / count
    span = valid[-1][0] - valid[0][0]
    slope = sum((t - mean_time) * (y - mean_pitch) for t, y, _ in valid) / sum((p[0] - mean_time)**2 for p in valid)
    residuals = [y - mean_pitch - slope * (t - mean_time) for t, y, _ in valid]
    power = sum(y*y for y in residuals)
    if power < 1e-6:
        return {"unmetExistingConditions": ["NO_PERIODIC_VARIATION"], "bestWithinExisting3To9Hz": None}
    best = None
    for tenth in range(30, 91):
        hz = tenth / 10
        ss = cc = sc = ys = yc = 0.0
        for (time, _, _), value in zip(valid, residuals):
            sin, cos = math.sin(math.tau * hz * time), math.cos(math.tau * hz * time)
            ss += sin*sin; cc += cos*cos; sc += sin*cos; ys += value*sin; yc += value*cos
        determinant = ss*cc - sc*sc
        if determinant <= 1e-12:
            continue
        a, b = (ys*cc - yc*sc) / determinant, (yc*ss - ys*sc) / determinant
        error = sum((y - a * math.sin(math.tau * hz * p[0]) - b * math.cos(math.tau * hz * p[0]))**2
                    for p, y in zip(valid, residuals))
        candidate = {"rateHz": hz, "fit": max(0, min(1, 1 - error/power)), "depthCents": 2*math.hypot(a, b), "cycles": span*hz}
        if best is None or candidate["fit"] > best["fit"]:
            best = candidate
    if best is None:
        raise ValueError("주기 곡선 계산 불가")
    failed = []
    if abs(slope*span) > 50: failed.append("LINEAR_DRIFT_OVER_50_CENTS")
    if best["fit"] < 0.85: failed.append("FIT_BELOW_0_85")
    if not 35 <= best["depthCents"] <= 150: failed.append("DEPTH_OUTSIDE_35_TO_150_CENTS")
    if best["cycles"] < 3: failed.append("FEWER_THAN_3_CYCLES")
    return {"spanSeconds": span, "linearDriftCents": slope*span, "bestWithinExisting3To9Hz": best,
            "candidateNotReturnedByEngine": True, "unmetExistingConditions": failed}


def audit(path):
    root = PROJECT / "fixtures/external/egipt-15205644"
    path = Path(path).absolute()
    checked_path(root, path)
    UUID(path.parent.name)
    if not 0 < path.stat().st_size <= 512 * 1024:
        raise ValueError("고정 관측 파일 크기 초과")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != OBSERVATION_SHA:
        raise ValueError("고정 관측 SHA 불일치")
    source = json.loads(raw, object_pairs_hook=unique_object)
    if source["state"] != "EGIPT_PITCH_MOTION_OBSERVED" or len(source["observations"]) != 31:
        raise ValueError("고정 관측 계약 오류")
    cases = [{"file":row["file"], "startMs":row["startMs"], "coverage":row["coverage"],
              "minConfidence":row["minConfidence"], **audit_points(row["points"])}
             for row in source["observations"] if "vibrato" in row["file"] and row["coverage"] >= 0.9]
    if len(cases) != 3:
        raise ValueError("고정 사후 감사 분모 변경")
    result = {"schemaVersion":1, "state":"POSTHOC_PERIODICITY_CONDITIONS_AUDITED", "observationSha256":OBSERVATION_SHA,
              "posthocSelection":True, "productThresholdsChanged":False, "continuousPitchGroundTruthVerified":False,
              "actualAppJudgements":False, "independentPerformerEvaluation":False, "cases":cases}
    destination = path.parent / ("periodicity-audit-" + str(uuid4()) + ".json")
    with destination.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("observation", type=Path)
    print(audit(parser.parse_args().observation))
