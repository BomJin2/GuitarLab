"""Tauri가 NSIS에만 넣는 고정 표식 외에 실행 파일 바이트가 바뀌지 않았는지 확인합니다."""

import argparse
import hashlib
import json
from pathlib import Path

from backup_local_data import checked_path


def nsis_payload(source):
    before = b"__TAURI_BUNDLE_TYPE_VAR_UNK"
    after = b"__TAURI_BUNDLE_TYPE_VAR_NSS"
    if not source.startswith(b"MZ") or len(source) > 64 * 1024 * 1024 or source.count(before) != 1:
        raise ValueError("지원하는 단일 Tauri 번들 표식이 아닙니다.")
    return source.replace(before, after, 1)


def verify(source, installed):
    expected = nsis_payload(source)
    if hashlib.sha256(installed).digest() != hashlib.sha256(expected).digest():
        raise ValueError("Tauri NSIS 표식 이외의 실행 파일 바이트가 다릅니다.")
    return {"schemaVersion": 1, "state": "NSIS_BINARY_VERIFIED", "bytes": len(installed),
            "sourceSha256": hashlib.sha256(source).hexdigest(), "installedSha256": hashlib.sha256(installed).hexdigest(),
            "bundleMarkerAdjusted": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("installed", type=Path)
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1]
    paths = [path.resolve(strict=True) for path in (args.source, args.installed)]
    for path in paths:
        checked_path(project, path)
        if path.stat().st_size > 64 * 1024 * 1024: raise ValueError("실행 파일 크기 한도 오류")
    print(json.dumps(verify(paths[0].read_bytes(), paths[1].read_bytes())))
