"""검증한 공개 기타 파일을 변경하지 않고 고정 창/참조 조각을 생성합니다."""

import argparse
import array
import bisect
import hashlib
import json
import math
import re
import sys
import wave
from pathlib import Path
from uuid import uuid4


def contours(document):
    result = []
    for annotation in document["annotations"]:
        if annotation["namespace"] != "pitch_contour":
            continue
        data = annotation["data"]
        if not isinstance(data, dict) or set(data) != {"time", "duration", "value", "confidence"}:
            raise ValueError("지원하지 않는 참조 주석 구조")
        times, values = data["time"], data["value"]
        if len(times) > 100000 or any(len(data[key]) != len(times) for key in data):
            raise ValueError("참조 주석 길이 오류")
        if any(not math.isfinite(t) or t < 0 for t in times) or any(b <= a for a, b in zip(times, times[1:])):
            raise ValueError("참조 시각 오류")
        for value in values:
            if (not isinstance(value, dict) or type(value.get("voiced")) is not bool or
                    not isinstance(value.get("frequency"), (int, float)) or not math.isfinite(value["frequency"]) or value["frequency"] < 0):
                raise ValueError("참조 음정 구조 오류")
        result.append((times, values))
    if len(result) != 6:
        raise ValueError("기타6줄 참조가 아닙니다.")
    return result


def reference_at(tracks, time):
    pitches = {}
    for times, values in tracks:
        index = bisect.bisect_left(times, time)
        near = [i for i in (index - 1, index) if 0 <= i < len(times)]
        if not near:
            continue
        closest = min(near, key=lambda i: abs(times[i] - time))
        if abs(times[closest] - time) > 0.0035 or not values[closest]["voiced"]:
            continue
        hz = values[closest]["frequency"]
        if hz <= 0:
            return None
        midi = 69 + 12 * math.log2(hz / 440)
        if not 39.5 <= midi <= 88.5:
            return None
        key = math.floor(midi + 0.5)
        pitches.setdefault(key, []).append(midi)
    return {key: sum(values) / len(values) for key, values in pitches.items()}


def continuous_reference(tracks, time, masks=None):
    """중심 시각을 보간/평균하지 않으며 주석 공백을 무음으로 간주하지 않습니다."""
    if len(tracks) != 6:
        raise ValueError("기타6줄 참조가 아닙니다.")
    if masks is not None and len(masks) != 6:
        raise ValueError("기타6줄 발음 구간이 아닙니다.")
    active = []
    for string, (times, values) in enumerate(tracks):
        index = bisect.bisect_left(times, time)
        near = [i for i in (index - 1, index) if 0 <= i < len(times)]
        closest = min(near, key=lambda i: abs(times[i] - time)) if near else None
        present = closest is not None and abs(times[closest] - time) <= 0.0035
        if masks is None:
            if not present:
                return None
        else:
            intervals = masks[string]
            if any(abs(time - edge) <= 0.030 for interval in intervals for edge in interval):
                return None
            sounding = any(start <= time < end for start, end in intervals)
            if sounding and (not present or not values[closest]["voiced"]):
                return None
            if not sounding and present and values[closest]["voiced"]:
                return None
            if not sounding:
                continue
        active.append((times, values))
    pitches = reference_at(active, time)
    return None if pitches is None else [pitches[key] for key in sorted(pitches)]


def note_masks(document):
    """음표 구간은 발음 여부에만 쓰고 연속 F0의 대체 정답으로 사용하지 않습니다."""
    annotations = document["annotations"]
    pitches = [a for a in annotations if a["namespace"] == "pitch_contour"]
    notes = [a for a in annotations if a["namespace"] == "note_midi"]
    expected = [str(i) for i in range(6)]
    if any([a.get("annotation_metadata", {}).get("data_source") for a in group] != expected for group in (pitches, notes)):
        raise ValueError("음정과 음표의6줄 식별자가 일치하지 않습니다.")
    result = []
    for annotation in notes:
        if not isinstance(annotation["data"], list) or len(annotation["data"]) > 10000:
            raise ValueError("발음 구간 구조/한도 오류")
        intervals = []
        for note in annotation["data"]:
            start, duration = note["time"], note["duration"]
            if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (start, duration)) or not 0 <= start < start + duration <= 61:
                raise ValueError("발음 구간 시각 오류")
            intervals.append((start, start + duration))
        if any(end > following for (_, end), (following, _) in zip(intervals, intervals[1:])):
            raise ValueError("발음 구간 순서/중복 오류")
        result.append(intervals)
    return result


def stable_reference(tracks, center, half_width, probes):
    frames = [reference_at(tracks, center - half_width + 2 * half_width * i / (probes - 1)) for i in range(probes)]
    if any(frame is None for frame in frames):
        return None
    keys = set(frames[0])
    if any(set(frame) != keys for frame in frames[1:]):
        return None
    for key in keys:
        values = [frame[key] for frame in frames]
        if (max(values) - min(values)) * 100 > 50:
            return None
    return [sum(frame[key] for frame in frames) / len(frames) for key in sorted(keys)]


def generate(source, *, continuous=False):
    external = (Path(__file__).resolve().parents[1] / "fixtures" / "external").resolve()
    if source.is_symlink():
        raise ValueError("출처 manifest의 심볼릭 링크는 허용하지 않습니다.")
    source = source.resolve(strict=True)
    if not source.is_relative_to(external):
        raise ValueError("검증용 외부 자료 폴더의 manifest만 사용하세요.")
    raw_manifest = source.read_bytes()
    if len(raw_manifest) > 128 * 1024:
        raise ValueError("출처 manifest 한도 초과")
    manifest = json.loads(raw_manifest)
    if manifest.get("schemaVersion") != 1 or manifest.get("source") != "https://zenodo.org/records/3371780" or manifest["state"] != "FILES_VERIFIED" or manifest["license"] != "cc-by-4.0" or manifest["version"] != "1.1.0":
        raise ValueError("검증된 공개 원본이 아닙니다.")
    if len(manifest["selectedIds"]) != 4 or len(set(manifest["selectedIds"])) != 4:
        raise ValueError("고정4개 표본이 아닙니다.")
    expected_names = {clip + suffix for clip in manifest["selectedIds"] for suffix in (".jams", "_mic.wav")}
    if len(manifest["files"]) != 8 or {item["name"] for item in manifest["files"]} != expected_names:
        raise ValueError("원본과 주석8개가 일치하지 않습니다.")
    for item in manifest["files"]:
        path = source.parent / item["name"]
        if Path(item["name"]).name != item["name"] or not path.resolve(strict=True).is_relative_to(source.parent) or path.is_symlink():
            raise ValueError("원본 경로 오류")
        if item["bytes"] > 16 * 1024 * 1024 or path.stat().st_size != item["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError("원본 크기/해시 불일치")
    target = source.parent / ("benchmark-" + str(uuid4()))
    target.mkdir(exist_ok=False)
    (target / "cases").mkdir()
    benchmark = {"schemaVersion": 1, "source": "GuitarSet1.1.0", "license": "cc-by-4.0",
                 "sourceManifestSha256": hashlib.sha256(raw_manifest).hexdigest(), "referencePolicy": "continuous-note-mask-v1" if continuous else "stable-window-v1", "referenceIssues": {}, "cases": []}
    total_bytes = 0
    for clip_id in manifest["selectedIds"]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", clip_id):
            raise ValueError("참조 이름 오류")
        document = json.loads((source.parent / (clip_id + ".jams")).read_text(encoding="utf-8"))
        tracks = contours(document)
        masks = note_masks(document) if continuous else None
        benchmark["referenceIssues"][clip_id] = sum(1 for _, values in tracks for value in values if value["voiced"] and value["frequency"] == 0)
        with wave.open(str(source.parent / (clip_id + "_mic.wav")), "rb") as audio:
            if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != 44100 or audio.getnframes() > 44100 * 60:
                raise ValueError("고정44.1kHz/mono16bit/60초 이하 자료만 지원합니다.")
            pcm = array.array("h", audio.readframes(audio.getnframes()))
            if sys.byteorder != "little":
                pcm.byteswap()
        rate = 44100
        windows = [("TRACK", rate, rate)]
        if not continuous:
            windows.append(("SPECTRUM", rate * 2 // 5, rate // 4))
        for kind, frames, stride in windows:
            for start in range(0, len(pcm) - frames + 1, stride):
                if kind == "TRACK":
                    decimation = math.ceil(rate / 16000)
                    reduced_rate = rate / decimation
                    hop = math.floor(reduced_rate * 0.025)
                    count = math.floor((math.floor(rate / decimation) - 1024) / hop) + 1
                    centers = [((i * hop + 511.5) * decimation + (decimation - 1) / 2) / rate for i in range(count)]
                    refs = [continuous_reference(tracks, start / rate + center, masks) if continuous else
                            stable_reference(tracks, start / rate + center, 511.5 / reduced_rate, 7) for center in centers]
                else:
                    refs = [stable_reference(tracks, (start + (frames - 1) / 2) / rate, (frames - 1) / (2 * rate), 17)]
                data = array.array("f", (value / 32768 for value in pcm[start:start + frames]))
                if sys.byteorder != "little":
                    data.byteswap()
                raw = data.tobytes()
                total_bytes += len(raw)
                if total_bytes > 64 * 1024 * 1024 or len(benchmark["cases"]) >= 512:
                    raise ValueError("평가 조각 한도64MiB/512개 초과")
                filename = f"case-{len(benchmark['cases']):05d}.f32"
                with (target / "cases" / filename).open("xb") as output:
                    output.write(raw)
                benchmark["cases"].append({"clipId": clip_id, "kind": kind, "startMs": start * 1000 / rate,
                                           "sampleRate": rate, "frames": frames, "file": filename,
                                           "sha256": hashlib.sha256(raw).hexdigest(), "references": refs})
    path = target / "benchmark.json"
    path.write_text(json.dumps(benchmark, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"state": "BENCHMARK_PREPARED", "cases": len(benchmark["cases"]), "pcmBytes": total_bytes, "path": str(path)}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--continuous", action="store_true", help="안정 구간 평균 대신 고정 중심 시각별 연속 참조를 별도 생성합니다.")
    args = parser.parse_args()
    generate(args.manifest, continuous=args.continuous)
