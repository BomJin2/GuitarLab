"""공식 GuitarSet의 작은 평가용 부분집합만 받습니다. 앱/모델 설치와 무관합니다."""

import argparse
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

RECORD = "https://zenodo.org/api/records/3371780"
ARCHIVES = {
    "annotation.zip": (39132574, "b39b78e63d3446f2e54ddb7a54df9b10"),
    "audio_mono-mic.zip": (656927981, "275966d6610ac34999b58426beb119c3"),
}
EXCLUDED = {"04_BN3-154-E_comp", "04_Jazz1-200-B_comp", "02_Funk2-119-G_comp"}
PATTERNS = (r"00_BN.+_solo", r"01_Jazz.+_solo", r"00_Rock.+_comp", r"01_Funk.+_comp")


class RangeReader(io.RawIOBase):
    def __init__(self, url, size, opener=urllib.request.urlopen, *, max_total_bytes=15 * 1024 * 1024):
        if type(max_total_bytes) is not int or not 1 <= max_total_bytes <= 256 * 1024 * 1024:
            raise ValueError("선택 ZIP 수신 한도가 잘못되었습니다.")
        self.url, self.size, self.opener = url, size, opener
        self.max_total_bytes = max_total_bytes
        self.position = self.transferred = 0
        self.etag = None

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        position = offset + (self.position if whence == 1 else self.size if whence == 2 else 0)
        if whence not in (0, 1, 2) or position < 0 or position > self.size:
            raise ValueError("ZIP 범위 위치가 잘못되었습니다.")
        self.position = position
        return position

    def read(self, count=-1):
        count = min(self.size - self.position, count if count >= 0 else self.size)
        if not count:
            return b""
        if count > 8 * 1024 * 1024 or self.transferred + count > self.max_total_bytes:
            raise ValueError("선택 ZIP 수신 한도를 넘었습니다.")
        end = self.position + count - 1
        request = urllib.request.Request(self.url, headers={
            "Range": f"bytes={self.position}-{end}", "Cache-Control": "no-cache",
            "User-Agent": "GuitarLab-development-validation",
        })
        with self.opener(request, timeout=25) as response:
            if response.status != 206 or response.geturl() != self.url:
                raise ValueError("공식 범위 응답이 아니어서 전체 다운로드를 거부했습니다.")
            if response.headers.get("Content-Range") != f"bytes {self.position}-{end}/{self.size}":
                raise ValueError("수신한 ZIP 범위가 요청과 다릅니다.")
            etag = response.headers.get("ETag")
            if self.etag is not None and etag != self.etag:
                raise ValueError("요청 사이에 원격 ZIP이 변경되었습니다.")
            self.etag = etag
            data = response.read(count + 1)
        if len(data) != count:
            raise ValueError("ZIP 범위의 수신 길이가 다릅니다.")
        self.transferred += count
        self.position += count
        return data


def checked_metadata():
    with urllib.request.urlopen(RECORD, timeout=25) as response:
        raw = response.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("공식 metadata 크기 초과")
    metadata = json.loads(raw)
    if (metadata.get("id") != 3371780 or metadata["metadata"].get("version") != "1.1.0"
            or metadata["metadata"].get("license", {}).get("id") != "cc-by-4.0"):
        raise ValueError("예상한 데이터 버전/조건과 다릅니다.")
    files = {entry["key"]: entry for entry in metadata["files"]}
    for name, (size, md5) in ARCHIVES.items():
        entry = files[name]
        if entry["size"] != size or entry["checksum"] != "md5:" + md5:
            raise ValueError("공식 ZIP metadata가 고정 레코드와 다릅니다.")
        if entry["links"]["self"] != RECORD + "/files/" + name + "/content":
            raise ValueError("예상하지 않은 다운로드 주소")
    return files


def sample_ids(names):
    ids = sorted(Path(name).stem for name in names if name.endswith(".jams") and "__MACOSX" not in name)
    selected = []
    for pattern in PATTERNS:
        candidates = [name for name in ids if re.fullmatch(pattern, name) and name not in EXCLUDED]
        if not candidates:
            raise ValueError("고정 표본 조건에 해당하는 주석이 없습니다.")
        selected.append(candidates[0])
    return selected


def read_member(archive, member):
    info = archive.getinfo(member)
    if (info.is_dir() or info.file_size > 16 * 1024 * 1024 or
            info.compress_size > 8 * 1024 * 1024 or info.flag_bits & 1):
        raise ValueError("선택 파일 형식/크기 제한을 넘었습니다.")
    with archive.open(info) as source:
        data = source.read(info.file_size + 1)
    if len(data) != info.file_size:
        raise ValueError("선택 파일 크기가 다릅니다.")
    return info, data


def main(download):
    files = checked_metadata()
    readers = {name: RangeReader(entry["links"]["self"], entry["size"])
               for name, entry in files.items() if name in ARCHIVES}
    with zipfile.ZipFile(readers["annotation.zip"]) as annotations, zipfile.ZipFile(readers["audio_mono-mic.zip"]) as audio:
        selected = sample_ids(annotations.namelist())
        print(json.dumps({"license": "cc-by-4.0", "selectedIds": selected}, ensure_ascii=False), flush=True)
        if not download:
            return
        parent = Path(__file__).resolve().parents[1] / "fixtures" / "external" / "guitarset-v1.1.0"
        target = parent / str(uuid4())
        target.mkdir(parents=True, exist_ok=False)
        receipt = {"schemaVersion": 1, "source": "https://zenodo.org/records/3371780",
                   "license": "cc-by-4.0", "version": "1.1.0", "selectedIds": selected,
                   "selection": "2명/4스타일의 고정 조건별 사전순 첫 표본. 결과로 표본을 선택하지 않음.",
                   "archiveMd5FullyVerified": False, "files": [], "state": "DOWNLOADING"}
        receipt_path = target / "manifest.json"
        try:
            for clip_id in selected:
                for archive_name, archive, suffix in [("annotation.zip", annotations, ".jams"), ("audio_mono-mic.zip", audio, "_mic.wav")]:
                    expected = clip_id + suffix
                    candidates = [name for name in archive.namelist() if Path(name).name == expected and "__MACOSX" not in name]
                    if len(candidates) != 1:
                        raise ValueError("원본과 주석의 표본 이름이 일치하지 않습니다.")
                    info, data = read_member(archive, candidates[0])
                    with (target / expected).open("xb") as output:
                        output.write(data)
                    receipt["files"].append({"name": expected, "archive": archive_name,
                                             "member": info.filename, "bytes": len(data),
                                             "crc32": f"{info.CRC:08x}", "sha256": hashlib.sha256(data).hexdigest()})
                    print(f"선택 파일 확인 {len(receipt['files'])}/8 · {expected} · {len(data)}바이트", flush=True)
            receipt.update(state="FILES_VERIFIED", completedAt=datetime.now(timezone.utc).isoformat(),
                           receivedBytes=sum(reader.transferred for reader in readers.values()))
            (target / "ATTRIBUTION.md").write_text(
                "# GuitarSet1.1.0 검증용 부분집합\n\n"
                "Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye, Juan P. Bello. "
                "GuitarSet: A Dataset for Guitar Transcription (ISMIR2018).\n\n"
                "출처: https://doi.org/10.5281/zenodo.3371780\n\n"
                "조건: Creative Commons Attribution4.0 International — https://creativecommons.org/licenses/by/4.0/\n\n"
                "공식 ZIP에서 선택 파일을 CRC 검사 후 수정 없이 추출했습니다. 전체 ZIP의 MD5는 검증하지 않았습니다. "
                "개별 SHA-256·원본 이름/CRC/받은 바이트를 manifest.json에 보존합니다. 앱/배포물에는 포함하지 않습니다.\n",
                encoding="utf-8")
        except (Exception, KeyboardInterrupt) as cause:
            receipt.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED",
                           errorType=type(cause).__name__)
            raise
        finally:
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
        print(str(receipt_path), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-samples", action="store_true", help="최대30MiB 범위 수신으로 고정 표본8개만 보존")
    main(parser.parse_args().download_samples)
