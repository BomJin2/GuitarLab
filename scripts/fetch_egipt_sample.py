"""고정 EG-IPT DI8개만 제한 수신·검증합니다. 기본 실행은 오프라인입니다."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import time
import urllib.request
from uuid import uuid4
import wave
import zipfile

from backup_local_data import checked_path
from fetch_guitarset_sample import RangeReader, read_member
from package_validation import unique_object

PROJECT = Path(__file__).resolve().parents[1]
RECORD = "https://zenodo.org/api/records/15205644"
ARCHIVE_URL = RECORD + "/files/EG-IPT.zip/content"
ARCHIVE_BYTES = 23757983313
ARCHIVE_MD5 = "48a5135adfd090515ff0af7dc5c3c32f"
CENTRAL_OFFSET, CENTRAL_BYTES = 23741203027, 16780188
PLAN_SHA256 = "6da7035d1d8b121c0c9038201d0715ae25e4784dbd23426c1716512c12f51766"


def load_plan():
    path = PROJECT / "fixtures/egipt-technique-sample-v1.json"
    checked_path(PROJECT, path)
    if not 0 < path.stat().st_size <= 16384:
        raise ValueError("고정 표본 계획 크기 오류")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PLAN_SHA256:
        raise ValueError("고정 표본 계획 SHA 불일치")
    plan = json.loads(raw, object_pairs_hook=unique_object)
    samples = plan["samples"]
    if (type(plan["schemaVersion"]) is not int or plan["schemaVersion"] != 1
            or plan["state"] != "FIXED_SELECTION_BEFORE_AUDIO_OR_DETECTOR_RESULTS"
            or len(samples) != 8 or len({row["member"] for row in samples}) != 8
            or sum(row["bytes"] for row in samples) != plan["totalAudioBytes"]
            or sum(row["bytes"] for row in samples) > 12 * 1024 * 1024):
        raise ValueError("고정 표본 버전/목록/합계 오류")
    return plan


def validate_metadata(record):
    if (type(record["id"]) is not int or record["id"] != 15205644
            or record["metadata"]["version"] != "1"
            or record["metadata"]["license"]["id"] != "cc-by-4.0"
            or record["metadata"]["access_right"] != "open" or len(record["files"]) != 1):
        raise ValueError("공식 레코드/버전/이용 조건 변경")
    entry = record["files"][0]
    if (entry["key"] != "EG-IPT.zip" or type(entry["size"]) is not int
            or entry["size"] != ARCHIVE_BYTES or entry["checksum"] != "md5:" + ARCHIVE_MD5
            or entry["links"]["self"] != ARCHIVE_URL):
        raise ValueError("공식 ZIP 크기/지문/주소 변경")


def checked_metadata():
    with urllib.request.urlopen(RECORD, timeout=25) as response:
        if response.status != 200 or response.geturl() != RECORD:
            raise ValueError("공식 metadata 응답/주소 오류")
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError("공식 metadata 크기 초과")
    validate_metadata(json.loads(raw, object_pairs_hook=unique_object))
    return hashlib.sha256(raw).hexdigest()


class CatalogReader(RangeReader):
    def __init__(self, opener=urllib.request.urlopen):
        super().__init__(ARCHIVE_URL, ARCHIVE_BYTES, opener, max_total_bytes=32 * 1024 * 1024)
        self.deadline = time.monotonic() + 180

    def read(self, count=-1):
        if time.monotonic() >= self.deadline:
            raise TimeoutError("고정 표본 수신 시간 초과")
        if count > 8 * 1024 * 1024:
            if (self.position, count) != (CENTRAL_OFFSET, CENTRAL_BYTES):
                raise ValueError("고정 중앙 목록 이외의 큰 요청 거부")
            parts = []
            while count:
                size = min(count, 8 * 1024 * 1024)
                parts.append(self.read(size))
                count -= size
            return b"".join(parts)
        return super().read(count)


def receive(archive, sample, destination):
    info = archive.getinfo(sample["member"])
    if (info.file_size != sample["bytes"] or info.compress_size != sample["compressedBytes"]
            or f"{info.CRC:08x}" != sample["crc32"] or info.header_offset != sample["headerOffset"]
            or info.compress_type != zipfile.ZIP_DEFLATED):
        raise ValueError("고정 WAV의 크기/CRC/위치/압축 변경")
    raw = read_member(archive, sample["member"])[1]
    with wave.open(io.BytesIO(raw), "rb") as audio:
        frames = audio.getnframes()
        if ((audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 3, 96000)
                or audio.getcomptype() != "NONE" or not 0 < frames <= 30 * 96000
                or len(audio.readframes(frames)) != frames * 3):
            raise ValueError("선택 WAV의 mono PCM24/96kHz/프레임 오류")
    with destination.open("xb") as output:
        output.write(raw)
    return {**sample, "name": destination.name, "frames": frames, "sampleRate": 96000,
            "sha256": hashlib.sha256(raw).hexdigest(), "crcVerified": True, "wavFormatVerified": True}


def main(download=False):
    plan = load_plan()
    print(json.dumps({"samples": 8, "bytes": plan["totalAudioBytes"], "license": plan["license"]}), flush=True)
    if not download:
        return
    parent = PROJECT
    for name in ("fixtures", "external", "egipt-15205644"):
        parent = parent / name
        parent.mkdir(exist_ok=True)
        checked_path(PROJECT, parent, directory=True)
    if shutil.disk_usage(parent).free < 64 * 1024 * 1024:
        raise ValueError("고정 표본 작업 여유64MiB가 필요합니다.")
    root = parent / str(uuid4())
    root.mkdir()
    receipt = {"schemaVersion": 1, "state": "DOWNLOADING", "source": plan["source"],
               "license": plan["license"], "planSha256": PLAN_SHA256, "archiveMd5FullyVerified": False,
               "continuousPitchGroundTruthVerified": False, "actualAppJudgements": False,
               "independentPerformerEvaluation": False, "files": []}
    reader = None
    try:
        receipt["metadataSha256"] = checked_metadata()
        reader = CatalogReader()
        with zipfile.ZipFile(reader) as archive:
            for sample in plan["samples"]:
                if sum(info.filename == sample["member"] for info in archive.infolist()) != 1:
                    raise ValueError("선택 WAV 이름 중복/누락")
                receipt["files"].append(receive(archive, sample, root / Path(sample["member"]).name))
                print(f"고정 DI 파일 확인 {len(receipt['files'])}/8", flush=True)
        with (root / "ATTRIBUTION.md").open("x", encoding="utf-8") as output:
            output.write("# EG-IPT v1 고정 검증 표본\n\n"
                         "Marco Fiorini; Nicolas Brochec; Joakim Borg; Riccardo Pasini (2025). "
                         "https://doi.org/10.5281/zenodo.15205644\n\n"
                         "Creative Commons Attribution4.0 — https://creativecommons.org/licenses/by/4.0/\n\n"
                         "고정8개 DI WAV를 수정 없이 보존했습니다. 개별 CRC/형식·로컬 SHA만 확인하며 "
                         "전체 ZIP MD5·연속 F0 정답·실제 주법 판정은 검증하지 않았습니다. "
                         "공식 설명52320개와 목록52317개의 차이3개는 미해결입니다. 앱/배포물에 포함하지 않습니다.\n")
        receipt["state"] = "DI_FILES_VERIFIED_NOT_ANALYZED"
    except (Exception, KeyboardInterrupt) as cause:
        receipt.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        receipt.update(receivedBytes=reader.transferred if reader else 0, etag=reader.etag if reader else None)
        with (root / "manifest.json").open("x", encoding="utf-8") as output:
            json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(str(root / "manifest.json"), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-samples", action="store_true", help="공식 ZIP에서 최대32MiB로 고정 DI8개만 수신")
    main(parser.parse_args().download_samples)
