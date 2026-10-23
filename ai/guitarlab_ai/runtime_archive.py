"""검증된 런타임의 일반 파일만 새 격리 폴더에 풉니다."""
import os
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
from threading import Event

from .install_managed import _cancel,AI_ROOT
from .model_cache import _verify_cached
from .model_integrity import ModelError


def load_runtime_plan():
    plan=json.loads((AI_ROOT/'models/python-3.12.15-windows-x64.json').read_text(encoding='utf-8'))
    if hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest()!='b3737cc24926812a06af86da81cc8681c8bf51b94eb723dff2e3f72ed3359d31':
        raise ModelError('AI_CACHE_INTEGRITY')
    return plan


def verify_runtime_tree(archive: Path,destination: Path,expected: dict,cancel: Event):
    _verify_cached(archive,expected,cancel)
    root=destination.resolve(strict=True)
    names=set()
    with tarfile.open(archive,'r:gz') as source:
        for member in source:
            _cancel(cancel)
            parts=_member_path(member.name)
            if not member.isfile(): raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
            relative='/'.join(parts); target=root.joinpath(*parts)
            if (not target.resolve().is_relative_to(root) or not target.is_file() or target.is_symlink()
                    or target.stat().st_size!=member.size): raise ModelError('AI_CACHE_INTEGRITY')
            extracted=source.extractfile(member)
            if extracted is None: raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
            with extracted,target.open('rb') as installed:
                left,right=hashlib.sha256(),hashlib.sha256()
                for stream,digest in ((extracted,left),(installed,right)):
                    for block in iter(lambda:stream.read(65536),b''):
                        _cancel(cancel); digest.update(block)
            if left.digest()!=right.digest(): raise ModelError('AI_CACHE_INTEGRITY')
            names.add(relative)
    pending=[root]
    actual=set()
    while pending:
        with os.scandir(pending.pop()) as entries:
            for entry in entries:
                _cancel(cancel)
                if entry.is_symlink() or getattr(entry.stat(follow_symlinks=False),'st_file_attributes',0)&0x400:
                    raise ModelError('AI_CACHE_INTEGRITY')
                if entry.is_dir(follow_symlinks=False): pending.append(Path(entry.path))
                else: actual.add(Path(entry.path).relative_to(root).as_posix())
    if actual!=names: raise ModelError('AI_CACHE_INTEGRITY')


def _member_path(name: str):
    parts = PurePosixPath(name).parts
    if (not parts or parts[0] != 'python' or len(parts) < 2 or name.startswith('/')
            or '\\' in name or ':' in name or '\0' in name
            or any(part in ('', '.', '..') or part.endswith(('.', ' ')) or
                   part.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))}
                   for part in parts)):
        raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
    return parts


def unpack_runtime(archive: Path, destination: Path, expected: dict, cancel: Event, progress):
    _cancel(cancel)
    _verify_cached(archive, expected, cancel)
    parent = destination.parent.resolve(strict=True)
    if not destination.is_absolute() or destination.exists() or destination.is_symlink():
        raise ModelError('AI_SETUP_PATH')
    destination.mkdir()
    resolved = destination.resolve(strict=True)
    if resolved.parent != parent:
        raise ModelError('AI_SETUP_PATH')
    count, total, names = 0, 0, set()
    try:
        with tarfile.open(archive, 'r:gz') as source:
            for member in source:
                _cancel(cancel)
                parts = _member_path(member.name)
                key = '/'.join(parts).casefold()
                count += 1
                total += member.size
                if (not member.isfile() or member.size < 0 or member.size > 64 * 1024 * 1024
                        or total > 256 * 1024 * 1024 or count > 20000 or key in names):
                    raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
                names.add(key)
                target = resolved.joinpath(*parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                stream = source.extractfile(member)
                if stream is None:
                    raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
                copied = 0
                with stream, target.open('xb') as output:
                    for block in iter(lambda: stream.read(65536), b''):
                        _cancel(cancel)
                        copied += len(block)
                        if copied > member.size:
                            raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
                        output.write(block)
                    output.flush()
                    os.fsync(output.fileno())
                if copied != member.size:
                    raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
                progress(count, total)
        for name in ('python.exe', 'python312.dll', 'LICENSE.txt'):
            if not (resolved / 'python' / name).is_file():
                raise ModelError('AI_RUNTIME_ARCHIVE_INVALID')
        return {'schemaVersion':1,'state':'ARCHIVE_VERIFIED','files':count,'unpackedBytes':total,'archiveSha256':expected['sha256']}
    except BaseException:
        # 이번에 새로 만든 폴더만 검증한 부모 아래에서 정리합니다.
        if destination.resolve() != resolved or resolved.parent != parent or destination.is_symlink():
            raise ModelError('AI_SETUP_PATH')
        shutil.rmtree(resolved)
        raise
