"""고정 공개 PCM24·정밀 onset 참조로 기존 검출기의 오프라인 입력만 준비합니다."""

import array
from collections import Counter
import csv
from decimal import Decimal
import hashlib
import io
import json
import math
from pathlib import Path
import sys
from uuid import UUID, uuid4
import wave

from backup_local_data import checked_path
from fetch_agpt_audio_sample import PLAN_SHA256, load_plan
from fetch_agpt_metadata import CSV_FILES
from package_validation import unique_object

PROJECT = Path(__file__).resolve().parents[1]


def source_root(path, category):
    path = path.absolute()
    checked_path(PROJECT, path, directory=True)
    path = path.resolve(strict=True)
    if path.parent != (PROJECT / "fixtures/external" / category).resolve(strict=True) or str(UUID(path.name)) != path.name:
        raise ValueError("고정 공개 자료 UUID 폴더가 아닙니다.")
    return path


def verified_bytes(path, size, digest):
    checked_path(PROJECT, path)
    if path.stat().st_size != size:
        raise ValueError("공개 원본 크기 불일치")
    with path.open("rb") as source:
        raw = source.read(size + 1)
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("공개 원본 SHA 불일치")
    return raw


def read_manifest(root):
    path = root / "manifest.json"
    checked_path(PROJECT, path)
    with path.open("rb") as source:
        raw = source.read(128 * 1024 + 1)
    if len(raw) > 128 * 1024:
        raise ValueError("공개 원문 manifest 크기 초과")
    return json.loads(raw, object_pairs_hook=unique_object), hashlib.sha256(raw).hexdigest()


def pcm24(raw):
    if len(raw) % 3:
        raise ValueError("PCM24 프레임 경계 오류")
    result = array.array("f", (int.from_bytes(raw[i:i + 3], "little", signed=True) / 8388608.0 for i in range(0, len(raw), 3)))
    if result.itemsize != 4:
        raise ValueError("float32 입력 형식 오류")
    if sys.byteorder != "little": result.byteswap()
    return result.tobytes()


def references(rows, samples):
    known = {row["filename"]: row for row in samples}
    result = {name: [] for name in known}
    for row in rows:
        name = row["audio_file_path"]
        if name not in known: continue
        selected = known[name]
        onset = int(row["onset_label_samples"])
        raw_pitch = row["pitch_midi"]
        if raw_pitch == "None":
            pitch_status = "MISSING"
        else:
            try:
                numeric = float(raw_pitch)
                pitch_status = ("INVALID_NUMERIC" if not math.isfinite(numeric) else
                                "OUTSIDE_MIDI_RANGE" if not 0 <= numeric <= 127 else "UNVERIFIED_RANGE_ONLY")
            except ValueError:
                pitch_status = "INVALID_NUMERIC"
        seconds = Decimal(row["onset_label_seconds"])
        if (not 0 <= onset < selected["frames"] or not 1 <= len(raw_pitch) <= 128
                or not seconds.is_finite() or seconds < 0 or abs(seconds * 48000 - onset) > 2
                or row["expressive_technique_id"] != selected["techniqueId"]
                or row["string_number"] != selected["stringNumber"] or row["isPercussive"] != "False"):
            raise ValueError("공개 타격 참조의 시각/음정/주법/줄 오류")
        result[name].append({"sample": onset, "rawPitchMidi": raw_pitch, "pitchReferenceStatus": pitch_status,
                             "sourceSeconds": row["onset_label_seconds"]})
    for name, events in result.items():
        events.sort(key=lambda row: row["sample"])
        if len(events) != known[name]["notes"] or len({r["sample"] for r in events}) != len(events):
            raise ValueError("공개 참조 누락/중복")
    return result


def main(audio_root, metadata_root):
    audio_root = source_root(audio_root, "agpt-audio-10159492")
    metadata_root = source_root(metadata_root, "agpt-10159492")
    plan = load_plan()
    source, source_sha = read_manifest(audio_root)
    metadata, metadata_sha = read_manifest(metadata_root)
    if (source["state"] != "AUDIO_FILES_VERIFIED_NOT_EVALUATED" or source["planSha256"] != PLAN_SHA256
            or source["files"] != [{**row, "crcVerified": True, "wavFormatVerified": True} for row in plan["samples"]]
            or metadata["state"] != "METADATA_VERIFIED_NOT_AUDIO" or metadata["recordId"] != 10159492):
        raise ValueError("고정 원문 수신 결과 계약 오류")
    csv_bytes = {name: verified_bytes(metadata_root / name, row[0], row[3]) for name, row in CSV_FILES.items()}
    expected = references(csv.DictReader(io.StringIO(csv_bytes["note_labels.csv"].decode("utf-8-sig"), newline="")), plan["samples"])
    target = audio_root / ("onset-benchmark-" + str(uuid4()))
    target.mkdir(); (target / "cases").mkdir()
    report = {"schemaVersion": 1, "state": "PREPARING", "source": "AG-PT-set10159492", "license": "cc-by-4.0",
              "planSha256": PLAN_SHA256, "sourceManifestSha256": source_sha, "metadataManifestSha256": metadata_sha,
              "referencePolicy": "onset-sample-column-only-v1", "pitchEvaluationEnabled": False,
              "referencePitchIssues": dict(Counter(row["pitchReferenceStatus"] for notes in expected.values() for row in notes)),
              "noiseGateDbfs": -50.0, "gainNormalized": False, "tailPaddingFrames": 0, "cases": []}
    try:
        for index, sample in enumerate(plan["samples"]):
            raw = verified_bytes(audio_root / sample["filename"], sample["bytes"], sample["sha256"])
            with wave.open(io.BytesIO(raw), "rb") as audio:
                if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes()) != (1, 3, 48000, sample["frames"]):
                    raise ValueError("고정 WAV 형식 불일치")
                data = audio.readframes(sample["frames"])
            if len(data) != sample["frames"] * 3:
                raise ValueError("고정 WAV 본문 누락")
            floats = pcm24(data)
            filename = f"case-{index:05}.f32"
            with (target / "cases" / filename).open("xb") as output: output.write(floats)
            report["cases"].append({"clipId": sample["filename"], "file": filename, "frames": sample["frames"],
                                   "sha256": hashlib.sha256(floats).hexdigest(), "references": expected[sample["filename"]]})
            print(json.dumps({"completed": index + 1, "total": 8}), flush=True)
        report["state"] = "AGPT_ONSET_BENCHMARK_PREPARED"
    except (Exception, KeyboardInterrupt) as cause:
        report.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (target / "benchmark.json").open("x", encoding="utf-8") as output:
            json.dump(report, output, ensure_ascii=False, indent=2, allow_nan=False)
    print(str(target / "benchmark.json"), flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 3: raise SystemExit("검증된 공개 WAV UUID 폴더와 CSV UUID 폴더가 필요합니다.")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
