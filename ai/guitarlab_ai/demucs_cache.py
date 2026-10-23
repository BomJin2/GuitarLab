"""명시적 다운로드 작업에서만 고정 Demucs 패키지·가중치를 받습니다."""
import errno
import hashlib
from http.client import HTTPException
import json
from pathlib import Path
from urllib.error import URLError

from .model_integrity import ModelError, load_model_plan
from .runtime_packages import stage_artifacts


def download_plan():
    path = Path(__file__).resolve().parents[1] / 'models/demucs-4.1.0-htdemucs-6s-windows-cp310.json'
    plan = load_model_plan(path, 'htdemucs_6s')
    expected = ('0b4407faad80689e6b0a0c51816a1077eb7650cb20ec094ee1dc6132adc5e33d'
                if plan['python'] == '3.10' else
                '2d7760f72cc5cc07aa25cf120b7d478b720941c2513109393d78b3014c70a5e7')
    if hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(',', ':')).encode()).hexdigest() != expected:
        raise ModelError('AI_CACHE_INTEGRITY')
    return plan


def download_demucs_cache(cache, work, cancel, progress):
    plan = download_plan()
    items = [*plan['artifacts'], *[{**item, 'filename': item['path']} for item in plan['modelFiles']]]
    last_percent = -1

    def report(done, total):
        nonlocal last_percent
        percent = min(95, done * 100 // total // 5 * 5)
        if percent > last_percent:
            progress(percent)
            last_percent = percent

    try:
        result = stage_artifacts(items, cache, [], cancel, report, work_dir=work)
    except (OSError, URLError, HTTPException) as cause:
        raise ModelError('AI_DISK_SPACE' if isinstance(cause, OSError) and cause.errno == errno.ENOSPC
                         else 'AI_DOWNLOAD_FAILED') from cause
    progress(100)
    return {key: result[key] for key in ('schemaVersion', 'state', 'artifactCount', 'totalBytes', 'reusedFiles')} | {
        'modelId': 'htdemucs_6s', 'modelVersion': '4.1.0'}
