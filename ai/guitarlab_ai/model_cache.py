"""승인된 고정 wheel만 받아 검증하며 설치나 코드를 실행하지 않습니다."""
import errno
import hashlib
from http.client import HTTPException
import json
import os
from pathlib import Path
import re
import shutil
import sys
from threading import Event
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler

from .model_integrity import ModelError, PLAN_PATH
from .runtime import Canceled

PLAN_ID = "basic-pitch-0.4.0-windows-cp310"
PLAN_HASH = "55a4a2252034be7389673313f35b36ea7cfd49c54984b0827bd6b29699218c2a"
ARTIFACT_COUNT = 41
TOTAL_BYTES = 144366287


def _allowed_url(url):
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.netloc == "files.pythonhosted.org"
            and parsed.path.startswith("/packages/") and not parsed.query and not parsed.fragment)


class _Redirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _allowed_url(newurl):
            raise ModelError("AI_DOWNLOAD_FAILED")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open(url):
    return build_opener(ProxyHandler({}), _Redirects()).open(url, timeout=5)


def _plan():
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    encoded = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()
    if hashlib.sha256(encoded).hexdigest() != PLAN_HASH:
        raise ModelError("AI_CACHE_INTEGRITY")
    return plan


def _check_cancel(cancel):
    if cancel.is_set():
        raise Canceled()


def _verify_cached(path, artifact, cancel):
    if path.is_symlink() or not path.is_file() or path.stat().st_size != artifact["bytes"]:
        raise ModelError("AI_CACHE_INTEGRITY")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            _check_cancel(cancel)
            digest.update(block)
    if digest.hexdigest() != artifact["sha256"]:
        raise ModelError("AI_CACHE_INTEGRITY")


def _publish(part, target):
    # Windows rename와 POSIX link 모두 이미 있는 목적지를 덮어쓰지 않습니다.
    if os.name == "nt":
        os.rename(part, target)
    else:
        os.link(part, target)
        part.unlink()


def download_cache(cache: Path, work: Path, cancel: Event, progress, model_id="basic-pitch") -> dict:
    _check_cancel(cancel)
    if model_id == "htdemucs_6s":
        from .demucs_cache import download_demucs_cache
        return download_demucs_cache(cache, work, cancel, progress)
    if model_id != "basic-pitch":
        raise ModelError("AI_MODEL_VERSION")
    if sys.version_info[:3] == (3,12,15):
        from .runtime_packages import load_plans, stage_artifacts
        plan = next(item for item in load_plans() if item['modelId']=='basic-pitch')
        fork = next(item for item in plan['artifacts'] if item.get('kind')=='LOCAL_ONNX_REPACK')
        generated = False
        last_percent = -1
        def report(done,total):
            nonlocal last_percent
            percent = min(95,done*100//total//5*5)
            if percent > last_percent:
                progress(percent)
                last_percent = percent
        try:
            if not (cache/fork['filename']).exists():
                from .onnx_wheel import build_onnx_wheel
                original = next(item for item in _plan()['artifacts'] if item['name']=='basic-pitch')
                stage_artifacts([original],cache,[],cancel,lambda *_:report(0,1),work_dir=work)
                output=work/fork['filename']
                try:
                    build_onnx_wheel(cache/original['filename'],output,cancel)
                    _verify_cached(output,fork,cancel)
                    _check_cancel(cancel)
                    _publish(output,cache/fork['filename'])
                    generated = True
                finally:
                    if output.is_file() and not output.is_symlink(): output.unlink()
            result = stage_artifacts(plan['artifacts'],cache,[],cancel,report,work_dir=work)
        except (OSError,URLError,HTTPException) as cause:
            raise ModelError('AI_DISK_SPACE' if isinstance(cause,OSError) and cause.errno==errno.ENOSPC else 'AI_DOWNLOAD_FAILED') from cause
        result['reusedFiles'] -= int(generated)
        progress(100)
        return {key:result[key] for key in ('schemaVersion','state','artifactCount','totalBytes','reusedFiles')} | {'modelId':'basic-pitch','modelVersion':'0.4.0'}
    plan = _plan()
    if (not cache.is_absolute() or not work.is_absolute() or not cache.is_dir() or not work.is_dir()
            or cache.is_symlink() or work.is_symlink() or cache.resolve() == work.resolve()):
        raise ModelError("AI_INPUT_INVALID")
    cache, work = cache.resolve(), work.resolve()
    artifacts = plan["artifacts"]
    if (plan["id"] != PLAN_ID or len(artifacts) != ARTIFACT_COUNT or plan["downloadBytes"] != TOTAL_BYTES
            or sum(a["bytes"] for a in artifacts) != TOTAL_BYTES):
        raise ModelError("AI_CACHE_INTEGRITY")
    names = set()
    for artifact in artifacts:
        name = artifact["filename"]
        if (not re.fullmatch(r"[A-Za-z0-9_.+-]+\.whl", name) or name in names
                or not _allowed_url(artifact["url"]) or not 0 < artifact["bytes"] <= 64 * 1024 * 1024):
            raise ModelError("AI_CACHE_INTEGRITY")
        names.add(name)
    part = work / "download.part"
    if part.exists() or part.is_symlink():
        raise ModelError("AI_INPUT_INVALID")
    missing_bytes = sum(a["bytes"] for a in artifacts if not (cache / a["filename"]).exists())
    if shutil.disk_usage(cache).free < missing_bytes + 64 * 1024 * 1024:
        raise ModelError("AI_DISK_SPACE")
    completed, reused, last_percent = 0, 0, -1
    def report(current):
        nonlocal last_percent
        percent = min(100, current * 100 // plan["downloadBytes"] // 5 * 5)
        if percent > last_percent:
            progress(percent)
            last_percent = percent
    report(0)
    try:
        for artifact in artifacts:
            _check_cancel(cancel)
            target = cache / artifact["filename"]
            if target.exists() or target.is_symlink():
                _verify_cached(target, artifact, cancel)
                reused += 1
            else:
                digest, received = hashlib.sha256(), 0
                with part.open("xb") as output, _open(artifact["url"]) as response:
                    if not _allowed_url(response.geturl()):
                        raise ModelError("AI_DOWNLOAD_FAILED")
                    while True:
                        _check_cancel(cancel)
                        block = response.read(min(65536, artifact["bytes"] - received + 1))
                        if not block:
                            break
                        received += len(block)
                        if received > artifact["bytes"]:
                            raise ModelError("AI_CACHE_INTEGRITY")
                        output.write(block)
                        digest.update(block)
                        # 100%는 마지막 파일의 해시/게시까지 끝난 뒤 표시합니다.
                        report(min(completed + received, plan["downloadBytes"] - 1))
                    if received != artifact["bytes"] or digest.hexdigest() != artifact["sha256"]:
                        raise ModelError("AI_CACHE_INTEGRITY")
                    output.flush()
                    os.fsync(output.fileno())
                _check_cancel(cancel)
                _publish(part, target)
            completed += artifact["bytes"]
            report(completed)
        _check_cancel(cancel)
        return {"schemaVersion": 1, "modelId": "basic-pitch", "modelVersion": "0.4.0",
                "state": "CACHE_VERIFIED", "artifactCount": ARTIFACT_COUNT, "totalBytes": completed, "reusedFiles": reused}
    except (URLError, OSError, HTTPException) as cause:
        code = "AI_DISK_SPACE" if getattr(cause, "errno", None) == errno.ENOSPC else "AI_DOWNLOAD_FAILED"
        raise ModelError(code) from cause
    finally:
        # 이 작업이 배타적으로 생성한 미완성 파일만 정리합니다.
        if part.is_file() and not part.is_symlink():
            part.unlink()
