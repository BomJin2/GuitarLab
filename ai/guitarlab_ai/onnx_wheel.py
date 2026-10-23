"""원본 코드를 보존한 Basic Pitch ONNX 전용 wheel을 재현 가능하게 만듭니다."""
import base64
import csv
from email import policy
from email.parser import BytesParser
import hashlib
import io
import os
import re
from pathlib import Path, PurePosixPath
from threading import Event
from uuid import uuid4
import zipfile

from .install_managed import _cancel
from .model_cache import _publish, _verify_cached
from .model_integrity import ModelError

VERSION = '0.4.0+guitarlab.onnx1'
FILENAME = f'basic_pitch-{VERSION}-py3-none-any.whl'
SOURCE = {'bytes':758279,'sha256':'738adb503aae7fdfc7d1e1511aa0ce35052315f260a19531ef4c356708425db0'}
ORIGINAL_INFO = 'basic_pitch-0.4.0.dist-info/'
INFO = f'basic_pitch-{VERSION}.dist-info/'
NOTICE = '''# GuitarLab ONNX 전용 패키징 변경

원본: Spotify Basic Pitch 0.4.0, Copyright 2022 Spotify AB, Apache-2.0.
원본 LICENSE/NOTICE와 모든 추론 코드·모델 파일을 그대로 보존합니다.
GuitarLab은 배포 메타데이터를 변경했습니다. 로컬 버전은0.4.0+guitarlab.onnx1입니다.
ONNX Runtime을 필수 의존성으로 선언하고 TensorFlow/CoreML/TFLite와 개발 extras를 제외합니다.
METADATA/WHEEL/RECORD와 dist-info 경로만 다시 작성했으며 공식 원본 패키지와 구분합니다.
원본 wheel SHA256: 738adb503aae7fdfc7d1e1511aa0ce35052315f260a19531ef4c356708425db0
'''


def _metadata(data):
    message = BytesParser(policy=policy.compat32).parsebytes(data)
    if message.get_all('Name') != ['basic-pitch'] or message.get_all('Version') != ['0.4.0']:
        raise ModelError('AI_CACHE_INTEGRITY')
    requirements = message.get_all('Requires-Dist', [])
    del message['Requires-Dist']; del message['Provides-Extra']; del message['Version']
    message['Version'] = VERSION
    for text in requirements:
        # 해시 고정 원본의 이름/extra만 선별하며 marker를 실행하지 않습니다.
        match = re.match(r'[A-Za-z0-9][A-Za-z0-9._-]*', text)
        if match is None:
            raise ModelError('AI_CACHE_INTEGRITY')
        name = match.group().lower().replace('_','-')
        marker = text.partition(';')[2]
        if re.search(r'\bextra\b',marker) or name in {'tensorflow','tensorflow-macos','coremltools','tflite-runtime','onnxruntime'}:
            continue
        message['Requires-Dist'] = text
    message['Requires-Dist'] = 'onnxruntime'
    return message.as_bytes(policy=policy.compat32.clone(max_line_length=0))


def build_onnx_wheel(source: Path, target: Path, cancel: Event):
    _verify_cached(source,SOURCE,cancel)
    if target.name != FILENAME or target.exists() or target.is_symlink():
        raise ModelError('AI_SETUP_PATH')
    files = {}
    with zipfile.ZipFile(source) as archive:
        total = 0
        for member in archive.infolist():
            _cancel(cancel)
            path = PurePosixPath(member.filename)
            total += member.file_size
            if (path.is_absolute() or '..' in path.parts or '\\' in member.filename or ':' in member.filename
                    or member.is_dir() or member.filename in files or len(files)>5000 or total>64*1024*1024):
                raise ModelError('AI_CACHE_INTEGRITY')
            if member.filename == ORIGINAL_INFO+'RECORD':
                continue
            name = member.filename.replace(ORIGINAL_INFO,INFO,1) if member.filename.startswith(ORIGINAL_INFO) else member.filename
            files[name] = archive.read(member)
    for name in ('METADATA','WHEEL','LICENSE','NOTICE'):
        if INFO+name not in files:
            raise ModelError('AI_CACHE_INTEGRITY')
    files[INFO+'METADATA'] = _metadata(files[INFO+'METADATA'])
    files[INFO+'WHEEL'] = b'Wheel-Version: 1.0\nGenerator: GuitarLab ONNX metadata recipe 1\nRoot-Is-Purelib: true\nTag: py3-none-any\n'
    files[INFO+'GUITARLAB-MODIFICATIONS.md'] = NOTICE.encode('utf-8')
    records=io.StringIO(newline='')
    writer=csv.writer(records,lineterminator='\n')
    for name,data in sorted(files.items()):
        digest=base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b'=').decode('ascii')
        writer.writerow([name,'sha256='+digest,str(len(data))])
    writer.writerow([INFO+'RECORD','',''])
    files[INFO+'RECORD'] = records.getvalue().encode('utf-8')
    part=target.parent/f'onnx-{uuid4()}.part'
    try:
        with part.open('xb') as stream:
            with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_STORED) as archive:
                for name,data in sorted(files.items()):
                    _cancel(cancel)
                    member=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0))
                    member.compress_type=zipfile.ZIP_STORED; member.external_attr=0o100644<<16
                    archive.writestr(member,data)
            stream.flush(); os.fsync(stream.fileno())
        _cancel(cancel)
        _publish(part,target)
        return {'name':'basic-pitch','version':VERSION,'filename':FILENAME,'bytes':target.stat().st_size,
                'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'sourceSha256':SOURCE['sha256'],
                'kind':'LOCAL_ONNX_REPACK','recipeVersion':1,'license':'Apache-2.0'}
    finally:
        if part.is_file() and not part.is_symlink():
            part.unlink()
