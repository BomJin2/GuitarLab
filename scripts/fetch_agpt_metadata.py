"""AG-PT-set의 고정 CSV4개만 보존합니다. 오디오·외부 코드·모델은 읽지 않습니다."""

import csv
import hashlib
import io
import json
from pathlib import Path
import urllib.request
from uuid import uuid4
import zipfile

from backup_local_data import checked_path
from fetch_guitarset_sample import RangeReader, read_member

PROJECT = Path(__file__).resolve().parents[1]
RECORD = "https://zenodo.org/api/records/10159492"
ARCHIVE = "aGPTset_z.zip"
ARCHIVE_BYTES = 6749621615
ARCHIVE_MD5 = "1dff8103f9ad6e1a86cee2e5e39cbe87"
CSV_FILES = {
    "expressive_techniques.csv": (1484, 623, 0x2d728ade, "bb709bc8e13b591d350529fd6db36811da12b768a2bed0aa3458751e6a004582"),
    "files.csv": (463589, 79929, 0x7b8270c0, "92be5a356dfa9c2e3e43b4c5e4a2e2b3c7cbbdb2e0eacced66fcef1ba35410e1"),
    "instruments.csv": (577, 283, 0xf1a3e9b0, "5337ef4590b93e082ea5c1a35ec4eb119e6151d9e034819ef13c2bd03047d41d"),
    "note_labels.csv": (3989900, 385779, 0xa5418d22, "75502d20e5149641eb4d3449240413673ace6885a5c822df38760df422e98fa1"),
}


def validate_metadata(record):
    if (record.get("id") != 10159492 or record["metadata"].get("license", {}).get("id") != "cc-by-4.0"
            or len(record["files"]) != 1):
        raise ValueError("고정 AG-PT-set 레코드/허용 조건 오류")
    entry = record["files"][0]
    if (entry["key"] != ARCHIVE or entry["size"] != ARCHIVE_BYTES
            or entry["checksum"] != "md5:" + ARCHIVE_MD5
            or entry["links"]["self"] != RECORD + "/files/" + ARCHIVE + "/content"):
        raise ValueError("고정 AG-PT-set ZIP 정보 변경")
    return entry


def checked_metadata():
    request = urllib.request.Request(RECORD, headers={"User-Agent": "GuitarLab-development-validation"})
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError("AG-PT-set 메타데이터 크기 초과")
    return validate_metadata(json.loads(raw))


def selected_bytes(archive, name):
    expected = CSV_FILES[name]
    member = "aGPTset/metadata/" + name
    info = archive.getinfo(member)
    if (info.file_size, info.compress_size, info.CRC) != expected[:3] or info.compress_type != zipfile.ZIP_DEFLATED:
        raise ValueError("고정 CSV 크기/CRC/압축 방식 변경")
    raw = read_member(archive, member)[1]
    if hashlib.sha256(raw).hexdigest() != expected[3]:
        raise ValueError("고정 CSV SHA 불일치")
    return raw


def csv_shape(raw):
    text = raw.decode("utf-8-sig")
    if "\0" in text:
        raise ValueError("CSV의 NUL 문자")
    records = csv.reader(io.StringIO(text, newline=""), strict=True)
    header = next(records, [])
    if not 1 <= len(header) <= 100 or any(not value for value in header) or len(set(header)) != len(header):
        raise ValueError("CSV 헤더 오류")
    count = 0
    for row in records:
        if len(row) != len(header):
            raise ValueError("CSV 열 수 불일치")
        count += 1
        if count > 100000:
            raise ValueError("CSV 행 수 초과")
    return {"columns": header, "rows": count}


def main():
    entry = checked_metadata()
    parent = PROJECT
    for name in ("fixtures", "external", "agpt-10159492"):
        parent = parent / name
        parent.mkdir(exist_ok=True)
        checked_path(PROJECT, parent, directory=True)
    root = parent / str(uuid4())
    root.mkdir()
    reader = RangeReader(entry["links"]["self"], entry["size"], max_total_bytes=2 * 1024 * 1024)
    receipt = {"schemaVersion": 1, "recordId": 10159492, "source": "https://zenodo.org/records/10159492",
               "license": "cc-by-4.0", "state": "READING_METADATA", "archiveMd5": ARCHIVE_MD5,
               "archiveMd5FullyVerified": False, "audioDownloaded": False, "files": []}
    try:
        with zipfile.ZipFile(reader) as archive:
            for name in CSV_FILES:
                raw = selected_bytes(archive, name)
                shape = csv_shape(raw)
                with (root / name).open("xb") as output:
                    output.write(raw)
                receipt["files"].append({"name": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), **shape})
                print(json.dumps({"file": name, "rows": shape["rows"], "completed": len(receipt["files"]), "total": len(CSV_FILES)}), flush=True)
        (root / "ATTRIBUTION.md").write_text(
            "# AG-PT-set 메타데이터 검증 표본\n\nDomenico Stefani; Luca Turchet; CIMIL (2023). "
            "AG-PT-set v1. https://doi.org/10.5281/zenodo.10159492\n\n"
            "Creative Commons Attribution4.0 — https://creativecommons.org/licenses/by/4.0/\n\n"
            "공식 ZIP의 CSV4개만 수정 없이 보존했습니다. 부분 CRC/개별 SHA는 확인했고 전체 ZIP MD5는 확인하지 않았습니다. "
            "오디오/외부 코드/모델을 받거나 실행하지 않았으며 Git/앱 배포물에서 제외합니다.\n", encoding="utf-8")
        receipt["state"] = "METADATA_VERIFIED_NOT_AUDIO"
    except (Exception, KeyboardInterrupt) as cause:
        receipt.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        receipt.update(receivedBytes=reader.transferred, etag=reader.etag)
        with (root / "manifest.json").open("x", encoding="utf-8") as output:
            json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(str(root / "manifest.json"), flush=True)


if __name__ == "__main__":
    main()
