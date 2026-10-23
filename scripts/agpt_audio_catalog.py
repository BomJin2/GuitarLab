"""전체 음원 수신 없이 AG-PT-set 내부 stored audio ZIP의 목록만 확인합니다."""

import io
import json
from pathlib import Path
import struct
from uuid import uuid4
import zipfile

from backup_local_data import checked_path
from fetch_agpt_metadata import checked_metadata
from fetch_guitarset_sample import RangeReader

PROJECT = Path(__file__).resolve().parents[1]
MEMBER = "aGPTset/data/audio.zip"
AUDIO_BYTES = 6748722491


class StoredMemberView(io.RawIOBase):
    def __init__(self, parent, info):
        if (info.filename != MEMBER or info.is_dir() or info.compress_type != zipfile.ZIP_STORED
                or info.flag_bits & 1 or info.file_size != info.compress_size or info.file_size <= 0
                or info.header_offset < 0 or info.header_offset + 30 > parent.size):
            raise ValueError("고정 내부 stored ZIP의 형식/범위 오류")
        parent.seek(info.header_offset)
        header = parent.read(30)
        if len(header) != 30:
            raise ValueError("내부 ZIP 로컬 헤더 누락")
        fields = struct.unpack("<4s5H3I2H", header)
        name_length, extra_length = fields[-2:]
        if (fields[0] != b"PK\x03\x04" or fields[2] != info.flag_bits or fields[3] != zipfile.ZIP_STORED
                or not 1 <= name_length <= 512 or extra_length > 8192):
            raise ValueError("내부 ZIP 로컬/중앙 헤더 불일치")
        name = parent.read(name_length).decode("utf-8" if info.flag_bits & 0x800 else "cp437")
        start = info.header_offset + 30 + name_length + extra_length
        if name != MEMBER or start + info.file_size > parent.size:
            raise ValueError("내부 ZIP 이름/범위 불일치")
        self.parent, self.start, self.size, self.position = parent, start, info.file_size, 0

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        if type(offset) is not int or whence not in (0, 1, 2):
            raise ValueError("내부 ZIP 위치 인자 오류")
        position = offset + (self.position if whence == 1 else self.size if whence == 2 else 0)
        if not 0 <= position <= self.size:
            raise ValueError("내부 ZIP 위치 범위 오류")
        self.position = position
        return position

    def read(self, count=-1):
        if type(count) is not int or count < -1:
            raise ValueError("내부 ZIP 읽기 크기 오류")
        count = min(self.size - self.position, count if count >= 0 else self.size)
        if not count:
            return b""
        self.parent.seek(self.start + self.position)
        data = self.parent.read(count)
        if len(data) != count:
            raise ValueError("내부 ZIP 부분 응답 누락")
        self.position += count
        return data


def main():
    print(json.dumps({"stage": "고정 ZIP의 내부 목록 확인"}), flush=True)
    entry = checked_metadata()
    reader = RangeReader(entry["links"]["self"], entry["size"], max_total_bytes=2 * 1024 * 1024)
    with zipfile.ZipFile(reader) as outer:
        matches = [row for row in outer.infolist() if row.filename == MEMBER]
        if len(matches) != 1 or matches[0].file_size != AUDIO_BYTES:
            raise ValueError("고정 내부 ZIP 크기 변경")
        info = matches[0]
        with zipfile.ZipFile(StoredMemberView(reader, info)) as inner:
            entries = inner.infolist()
            if not 1 <= len(entries) <= 10000:
                raise ValueError("내부 ZIP 목록 수 제한")
            files = [{"name": row.filename, "bytes": row.file_size, "compressedBytes": row.compress_size,
                      "method": row.compress_type, "crc32": f"{row.CRC:08x}"} for row in entries if not row.is_dir()]
    result = {"schemaVersion": 1, "state": "AGPT_AUDIO_CATALOG_ONLY", "source": entry["links"]["self"],
              "archiveMd5FullyVerified": False, "nestedCrcFullyVerified": False, "wavExtracted": False,
              "receivedBytes": reader.transferred, "etag": reader.etag, "files": files}
    parent = PROJECT
    for name in ("src-tauri", "target", "runtime-validation"):
        parent = parent / name
        parent.mkdir(exist_ok=True)
        checked_path(PROJECT, parent, directory=True)
    target = parent / ("agpt-audio-catalog-" + str(uuid4()) + ".json")
    with target.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
    print(json.dumps({"state": result["state"], "files": len(files), "receivedBytes": reader.transferred, "wavExtracted": False}), flush=True)
    print(str(target), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as cause:
        print(json.dumps({"state": "CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED",
                          "errorType": type(cause).__name__}), flush=True)
        raise
