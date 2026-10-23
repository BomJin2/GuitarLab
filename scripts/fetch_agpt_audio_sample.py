"""사전에 고정한 AG-PT-set WAV8개만 검증·보존하며 실제 검출 평가는 하지 않습니다."""

import hashlib
import io
import json
from pathlib import Path
import re
import shutil
from uuid import uuid4
import wave
import zipfile

from agpt_audio_catalog import AUDIO_BYTES, MEMBER, StoredMemberView
from backup_local_data import checked_path
from fetch_agpt_metadata import checked_metadata
from fetch_guitarset_sample import RangeReader, read_member
from package_validation import unique_object

PROJECT = Path(__file__).resolve().parents[1]
PLAN_SHA256 = "82356f0f7f764c066a6a15b85d976521c76327a1d492dcb95702b56839dc427e"


def load_plan():
    path = PROJECT / "fixtures/agpt-onset-sample-v1.json"
    checked_path(PROJECT, path)
    if path.stat().st_size > 32768:
        raise ValueError("고정 표본 계획 크기 초과")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PLAN_SHA256:
        raise ValueError("고정 표본 계획 SHA 불일치")
    plan = json.loads(raw, object_pairs_hook=unique_object)
    samples = plan["samples"]
    if (plan["schemaVersion"] != 1 or plan["state"] != "FIXED_REFERENCE_SELECTION" or len(samples) != 8
            or len({row["filename"] for row in samples}) != 8):
        raise ValueError("고정 표본 계획 버전/목록 오류")
    for row in samples:
        name = row["filename"]
        if (Path(name).name != name or any(c in name for c in (":", "\\", "/")) or not name.endswith(".wav")
                or row["member"] != "audio/" + name or re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) is None
                or re.fullmatch(r"[0-9a-f]{8}", row["crc32"]) is None
                or any(type(row[key]) is not int or not 0 < row[key] <= limit for key, limit in
                       (("bytes", 12 * 1024 * 1024), ("compressedBytes", 12 * 1024 * 1024), ("frames", 48000 * 60)))):
            raise ValueError("고정 표본 경로/지문/한도 오류")
    if sum(row["bytes"] for row in samples) > 64 * 1024 * 1024 or sum(row["compressedBytes"] for row in samples) > 40 * 1024 * 1024:
        raise ValueError("고정 표본 합계 한도 초과")
    return plan


def receive(archive, sample, destination):
    info = archive.getinfo(sample["member"])
    if (info.file_size != sample["bytes"] or info.compress_size != sample["compressedBytes"]
            or f"{info.CRC:08x}" != sample["crc32"] or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
        raise ValueError("선택 WAV의 크기/CRC 선언 변경")
    raw = read_member(archive, sample["member"])[1]
    if hashlib.sha256(raw).hexdigest() != sample["sha256"]:
        raise ValueError("선택 WAV의 고정 SHA 불일치")
    with wave.open(io.BytesIO(raw), "rb") as audio:
        if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes())
                != (1, 3, 48000, sample["frames"]) or audio.getcomptype() != "NONE"
                or len(audio.readframes(sample["frames"])) != sample["frames"] * 3):
            raise ValueError("선택 WAV의 PCM24/mono/48kHz/프레임 불일치")
    with destination.open("xb") as output:
        output.write(raw)
    return {**sample, "crcVerified": True, "wavFormatVerified": True}


def main():
    plan = load_plan()
    print(json.dumps({"stage": "고정 WAV8개 검증·수신", "total": 8, "maxReceivedBytes": 40 * 1024 * 1024}), flush=True)
    parent = PROJECT
    for name in ("fixtures", "external", "agpt-audio-10159492"):
        parent = parent / name
        parent.mkdir(exist_ok=True)
        checked_path(PROJECT, parent, directory=True)
    if shutil.disk_usage(parent).free < 512 * 1024 * 1024:
        raise ValueError("공개 오디오 표본에 작업 여유512MiB가 필요합니다.")
    root = parent / str(uuid4())
    root.mkdir()
    (root / "ATTRIBUTION.md").write_text(
        "# AG-PT-set 고정 평가 표본\n\nDomenico Stefani; Luca Turchet; CIMIL (2023). AG-PT-set v1. "
        "https://doi.org/10.5281/zenodo.10159492\n\nCreative Commons Attribution4.0 — "
        "https://creativecommons.org/licenses/by/4.0/\n\n고정8개 WAV를 수정 없이 보존합니다. "
        "공식 CSV의 개별 SHA와 CRC/형식을 확인하며 전체/내부 ZIP의 CRC·MD5는 확인하지 않습니다. "
        "실제 검출 평가/주법 점수 수용은 별도이고 Git/앱 배포물에서 제외합니다.\n", encoding="utf-8")
    receipt = {"schemaVersion": 1, "state": "DOWNLOADING", "source": plan["source"], "license": plan["license"],
               "planSha256": PLAN_SHA256, "archiveMd5FullyVerified": False, "nestedCrcFullyVerified": False,
               "accuracyMeasured": False, "files": []}
    reader = None
    try:
        entry = checked_metadata()
        reader = RangeReader(entry["links"]["self"], entry["size"], max_total_bytes=40 * 1024 * 1024)
        with zipfile.ZipFile(reader) as outer:
            matches = [row for row in outer.infolist() if row.filename == MEMBER]
            if len(matches) != 1 or matches[0].file_size != AUDIO_BYTES:
                raise ValueError("고정 내부 ZIP 크기/목록 변경")
            with zipfile.ZipFile(StoredMemberView(reader, matches[0])) as inner:
                for sample in plan["samples"]:
                    if sum(row.filename == sample["member"] for row in inner.infolist()) != 1:
                        raise ValueError("선택 WAV 이름 중복/누락")
                    receipt["files"].append(receive(inner, sample, root / sample["filename"]))
                    print(json.dumps({"completed": len(receipt["files"]), "total": 8, "file": sample["filename"]}), flush=True)
        receipt["state"] = "AUDIO_FILES_VERIFIED_NOT_EVALUATED"
    except (Exception, KeyboardInterrupt) as cause:
        receipt.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        receipt.update(receivedBytes=reader.transferred if reader else 0, etag=reader.etag if reader else None)
        with (root / "manifest.json").open("x", encoding="utf-8") as output:
            json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(str(root / "manifest.json"), flush=True)


if __name__ == "__main__":
    main()
