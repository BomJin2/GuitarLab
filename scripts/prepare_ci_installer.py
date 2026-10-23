"""고정 Python 두 원본만 선택 수신해 모델 없는 독립 설치 CI 리소스를 준비합니다."""

import argparse
import json
from pathlib import Path
import re
import signal
import sys
from threading import Event
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import uuid4

from backup_local_data import checked_path
from prepare_validation_installer import prepare as prepare_installer

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "ai"))
from guitarlab_ai.model_cache import _publish, _verify_cached
from guitarlab_ai.runtime import Canceled
from guitarlab_ai.runtime_archive import load_runtime_plan
from guitarlab_ai.runtime_bundle import FULL_ARCHIVE, prepare as prepare_bundle

BASE_URL = "https://github.com/astral-sh/python-build-standalone/releases/download/20261013/"


def cached_archive(record, cache, allow_download, cancel):
    if cancel.is_set():
        raise Canceled()
    name = record["filename"]
    if (Path(name).name != name or ":" in name or not name.endswith((".tar.gz", ".tar.zst"))
            or record["url"] != BASE_URL + quote(name, safe="")
            or type(record["bytes"]) is not int or not 0 < record["bytes"] <= 64 * 1024 * 1024
            or re.fullmatch(r"[0-9a-f]{64}", record["sha256"]) is None):
        raise ValueError("고정 런타임 원본의 경로/주소/한도 오류")
    checked_path(PROJECT, cache, directory=True)
    target = cache / name
    if target.exists() or target.is_symlink():
        checked_path(PROJECT, target)
        _verify_cached(target, record, cancel)
        return target
    if not allow_download:
        raise FileNotFoundError("고정 Python 원본 캐시가 없습니다. 명시적 --download-runtime이 필요합니다.")
    part = cache / ("ci-runtime-" + str(uuid4()) + ".part")
    created = False
    try:
        print(json.dumps({"stage": "고정 Python 원본 수신", "file": name, "bytes": record["bytes"]}), flush=True)
        request = Request(record["url"], headers={"User-Agent": "GuitarLab-runtime-CI"})
        with urlopen(request, timeout=30) as response, part.open("xb") as output:
            created = True
            received = 0
            while True:
                if cancel.is_set():
                    raise Canceled()
                block = response.read(min(65536, record["bytes"] + 1 - received))
                if not block:
                    break
                received += len(block)
                if received > record["bytes"]:
                    raise ValueError("런타임 원본 수신 크기 초과")
                output.write(block)
        _verify_cached(part, record, cancel)
        try:
            _publish(part, target)
        except FileExistsError:
            checked_path(PROJECT, target)
            _verify_cached(target, record, cancel)
        return target
    finally:
        if created and part.exists():
            part.unlink()


def prepare(allow_download, cancel):
    cache = PROJECT
    for part in ("src-tauri", "target", "runtime-validation", "downloads"):
        cache = cache / part
        cache.mkdir(exist_ok=True)
        checked_path(PROJECT, cache, directory=True)
    plan = load_runtime_plan()
    full = {**FULL_ARCHIVE, "url": BASE_URL + quote(FULL_ARCHIVE["filename"], safe="")}
    for record in (plan, full):
        cached_archive(record, cache, allow_download, cancel)
    resources, inventory = prepare_bundle(cancel, lambda stage: print(json.dumps({"stage": stage}), flush=True))
    print(json.dumps({"stage": "고정 런타임 지문 확인", "files": len(inventory["files"]),
                      "modelWeightsIncluded": False}), flush=True)
    prepare_installer("release", runtime_resources=resources)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-runtime", action="store_true", help="고정 Python 두 원본 약63MiB만 수신합니다. AI 모델은 받지 않습니다.")
    options = parser.parse_args()
    event = Event()
    signal.signal(signal.SIGINT, lambda *_: event.set())
    prepare(options.download_runtime, event)
