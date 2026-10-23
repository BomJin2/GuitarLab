"""승인된 기존 Demucs 파일을 검증해 관리 캐시로 복사합니다."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import shutil
from threading import Event
from uuid import uuid4

from .install_managed import AI_ROOT, _cancel, _directory
from .model_cache import _publish, _verify_cached
from .model_integrity import ModelError
from .runtime import Canceled

PLAN_ID = 'demucs-4.1.0-htdemucs-6s-windows-cp310'
PLAN_HASH = '0b4407faad80689e6b0a0c51816a1077eb7650cb20ec094ee1dc6132adc5e33d'
PACKAGE_SOURCE = AI_ROOT.parent / 'src-tauri/target/demucs-downloads'
MODEL_SOURCE = AI_ROOT / '.venv-demucs/models/htdemucs_6s'
TOTAL_BYTES = 707117623


def load_plan():
    plan = json.loads((AI_ROOT / 'models' / f'{PLAN_ID}.json').read_text(encoding='utf-8'))
    encoded = json.dumps(plan, sort_keys=True, separators=(',', ':')).encode()
    if hashlib.sha256(encoded).hexdigest() != PLAN_HASH:
        raise ModelError('AI_CACHE_INTEGRITY')
    artifacts = [*plan['artifacts'], *({**item, 'filename':item['path']} for item in plan['modelFiles'])]
    if len(artifacts) != 33 or sum(item['bytes'] for item in artifacts) != TOTAL_BYTES:
        raise ModelError('AI_CACHE_INTEGRITY')
    return plan


def _plan():
    plan = load_plan()
    return [*plan['artifacts'], *({**item, 'filename':item['path']} for item in plan['modelFiles'])]


def stage_cache(root: Path, cancel: Event, progress):
    _cancel(cancel)
    artifacts = _plan()
    cache = _directory(root, 'ai', 'downloads', PLAN_ID)
    work = _directory(root, 'ai', 'cache-imports', str(uuid4()))
    part = work / 'copy.part'
    reused, completed = 0, 0
    try:
        missing = sum(item['bytes'] for item in artifacts if not (cache / item['filename']).exists())
        if shutil.disk_usage(cache).free < missing + 64 * 1024 * 1024:
            raise ModelError('AI_DISK_SPACE')
        progress(0)
        for item in artifacts:
            _cancel(cancel)
            name = item['filename']
            if Path(name).name != name or name in ('', '.', '..'):
                raise ModelError('AI_CACHE_INTEGRITY')
            target = cache / name
            if target.exists() or target.is_symlink():
                _verify_cached(target, item, cancel)
                reused += 1
            else:
                source = (PACKAGE_SOURCE if name.endswith('.whl') else MODEL_SOURCE) / name
                _verify_cached(source, item, cancel)
                digest, copied = hashlib.sha256(), 0
                with source.open('rb') as input_stream, part.open('xb') as output:
                    for block in iter(lambda: input_stream.read(65536), b''):
                        _cancel(cancel)
                        copied += len(block)
                        if copied > item['bytes']:
                            raise ModelError('AI_CACHE_INTEGRITY')
                        output.write(block)
                        digest.update(block)
                    output.flush()
                    os.fsync(output.fileno())
                if copied != item['bytes'] or digest.hexdigest() != item['sha256']:
                    raise ModelError('AI_CACHE_INTEGRITY')
                _cancel(cancel)
                _publish(part, target)
            completed += item['bytes']
            progress(completed * 100 // sum(value['bytes'] for value in artifacts))
        return {'schemaVersion':1, 'modelId':'htdemucs_6s', 'modelVersion':'4.1.0', 'state':'CACHE_VERIFIED',
                'artifactCount':len(artifacts), 'totalBytes':completed, 'reusedFiles':reused}
    finally:
        try:
            if part.is_file() and not part.is_symlink():
                part.unlink()
            work.rmdir()
        except OSError as cause:
            raise ModelError('AI_CACHE_CLEANUP_FAILED') from cause


def main():
    parser = argparse.ArgumentParser(description='기존 Demucs 파일만 관리 캐시로 복사합니다.')
    parser.add_argument('--import-cache', action='store_true', required=True)
    parser.parse_args()
    cancel = Event()
    signal.signal(signal.SIGINT, lambda *_: cancel.set())
    try:
        root = Path(os.environ['APPDATA']) / 'com.guitarlab.app'
        result = stage_cache(root, cancel, lambda percent: print(json.dumps({'percent':percent}), flush=True))
        print(json.dumps(result), flush=True)
        return 0
    except Canceled:
        print(json.dumps({'error':'CANCELED'}), flush=True)
    except (ModelError, OSError, ValueError, KeyError) as cause:
        print(json.dumps({'error':cause.code if isinstance(cause, ModelError) else 'AI_CACHE_INTEGRITY'}), flush=True)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
