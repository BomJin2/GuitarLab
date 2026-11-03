"""고정 Python과 worker만 담는 별도 Windows 리소스 후보를 만듭니다."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
from threading import Event
from uuid import uuid4

from .install_managed import AI_ROOT, _cancel, _run, _write_new, _remove_new_environment
from .model_cache import _verify_cached
from .model_integrity import ModelError
from .runtime import Canceled
from .runtime_archive import load_runtime_plan, unpack_runtime, verify_runtime_tree

FULL_ARCHIVE = {
    'filename': 'cpython-3.12.15+20261013-x86_64-pc-windows-msvc-pgo-full.tar.zst',
    'bytes': 43731659,
    'sha256': '7780bf6a29f93e6d0e3b5bdbe8cf799b3e2a0638bdec921be5b0c3ca81e67313',
}
# 깨끗한 Windows에는 VC++ 재배포 패키지가 없어 onnxruntime·numba·torch가 msvcp140.dll을 찾지 못합니다.
# 새 msvcp140은 같은 버전 이상의 vcruntime140이 필요하므로 Python 동봉 14.44 vcruntime도 함께 바꿉니다.
VC_RUNTIME = {
    'concrt140.dll': (374200, '54716f0738af891f283d213b5c8d11b25896bb8ee3097d301eae718560cf974e'),
    'msvcp140.dll': (643512, '7c26614e1d733892c2deac7e245ce115504b1d80592dd0a01b08e3e5a55f89ca'),
    'msvcp140_1.dll': (35768, '206c931bf90fdad8816de3b5e2ef80b2bcaa9406c89ecc05fe6fddffe251e982'),
    'msvcp140_2.dll': (274872, 'd50d7883f20d1dc6191768d3746f52dd9cac89c346ffaed5be1f110c2f34a838'),
    'msvcp140_atomic_wait.dll': (57792, '3d0cbfaa1bf3eecf5a3f4491d2960ee803cb994f30292c6adc4a07c498f60e2b'),
    'msvcp140_codecvt_ids.dll': (31160, '8a65c7596ef2e6938731f5a1058e7e40145b6d97967cc649231a076b9a608d78'),
    'vcruntime140.dll': (178616, 'd1f4225df2cd877dbf130d5668a021dce3f94118455ff5ec952061c30afc9ce7'),
    'vcruntime140_1.dll': (50112, 'a7146c08f89fe5b04541ab507cdb59ff7b44534d4ba3c668a426c6450a03434e'),
    'vcruntime140_threads.dll': (38840, '40f39e8cee5f5a531b4010e18b807e8fe265b908dc58f959ecb7ebc6ea6cb11a'),
    'vcomp140.dll': (212920, '95d4ce4a6802d1e18b5e0e1722cc30ea72ca7e033f83828f05c0b7b993fe7cbf'),
}
LICENSES = ('cpython', 'bzip2', 'libffi', 'liblzma', 'libuuid', 'openssl-3', 'sqlite', 'tcl', 'tix', 'expat', 'mpdecimal', 'zlib')
LAUNCHER = '''from pathlib import Path
import os, runpy, sys
assert sys.flags.isolated == 1 and sys.dont_write_bytecode
assert sys.version_info[:3] == (3, 12, 15)
assert os.environ.get('GUITARLAB_AI_BASE') and Path(sys.base_prefix).samefile(Path(os.environ['GUITARLAB_AI_BASE']))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from guitarlab_ai.runtime_paths import configure_windows_paths
configure_windows_paths()
runpy.run_module('guitarlab_ai.worker', run_name='__main__')
'''


def inventory(root: Path, cancel: Event):
    files = []
    pending = [root]
    while pending:
        for path in pending.pop().iterdir():
            _cancel(cancel)
            if path.is_symlink() or getattr(path.lstat(), 'st_file_attributes', 0) & 0x400:
                raise ModelError('AI_CACHE_INTEGRITY')
            if path.is_dir():
                pending.append(path)
            elif path.is_file():
                relative = path.relative_to(root).as_posix()
                if path.stat().st_size > 64 * 1024 * 1024:
                    raise ModelError('AI_CACHE_INTEGRITY')
                data = path.read_bytes()
                files.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
            else:
                raise ModelError('AI_CACHE_INTEGRITY')
    files.sort(key=lambda item: item['path'])
    if len(files) > 5000 or sum(item['bytes'] for item in files) > 128 * 1024 * 1024:
        raise ModelError('AI_CACHE_INTEGRITY')
    return {'schemaVersion': 1, 'state': 'RUNTIME_RESOURCE_CANDIDATE', 'pythonVersion': '3.12.15', 'files': files}


def vc_runtime_sources(cancel: Event, roots=None):
    """빌드 PC의 VS 공식 Redist 폴더에서 지문이 고정된 VC++ 런타임 파일을 찾습니다."""
    if roots is None:
        roots = [Path(os.environ[key]) / 'Microsoft Visual Studio' for key in ('ProgramFiles(x86)', 'ProgramFiles') if key in os.environ]
    found = {}
    for name, (size, sha256) in VC_RUNTIME.items():
        for path in sorted(p for root in roots for p in root.glob(f'*/*/VC/Redist/MSVC/*/x64/Microsoft.VC145.*/{name}')):
            try:
                _verify_cached(path, {'bytes': size, 'sha256': sha256}, cancel)
            except ModelError:
                continue
            found[name] = path
            break
        else:
            raise ModelError('VC_RUNTIME_SOURCE_MISSING')
    return found


def prepare(cancel: Event, progress, refresh_lock=False):
    validation = AI_ROOT.parent / 'src-tauri/target/runtime-validation'
    plan = load_runtime_plan()
    archive = validation / 'downloads' / plan['filename']
    full = validation / 'downloads' / FULL_ARCHIVE['filename']
    _verify_cached(full, FULL_ARCHIVE, cancel)
    parent = AI_ROOT.parent / 'src-tauri/target/ai-runtime-resources'
    parent.mkdir(exist_ok=True)
    if parent.is_symlink() or parent.resolve().parent != (AI_ROOT.parent/'src-tauri/target').resolve():
        raise ModelError('AI_SETUP_PATH')
    candidate_id = str(uuid4())
    candidate = parent / candidate_id
    candidate.mkdir()
    success = False
    try:
        progress('Python 파일 검증·복사')
        # 압축 해제기는 자신이 새로 만든 폴더만 정리하므로 별도 하위 폴더를 사용합니다.
        unpacked = candidate / 'runtime'
        unpack_runtime(archive, unpacked, plan, cancel, lambda *_: None)
        worker = candidate / 'worker'
        worker.mkdir()
        source = AI_ROOT / 'guitarlab_ai'
        for path in source.rglob('*.py'):
            _cancel(cancel)
            if path.is_symlink() or not path.resolve().is_relative_to(source.resolve()):
                raise ModelError('AI_SETUP_PATH')
            target = worker / 'guitarlab_ai' / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        models = worker / 'models'
        models.mkdir()
        for path in (AI_ROOT / 'models').glob('*.json'):
            if path.name == 'runtime-bundle-lock.json':
                continue
            shutil.copyfile(path, models / path.name)
        (worker / 'launch_worker.py').write_text(LAUNCHER, encoding='utf-8')
        fixture = AI_ROOT.parent / 'public/fixtures/sine.wav'
        if hashlib.sha256(fixture.read_bytes()).hexdigest() != '7d519e32205014966c602feab05b5cae21e57ef66c60576781880013f2e8d386':
            raise ModelError('AI_SETUP_FIXTURE_INVALID')
        (worker / 'fixtures').mkdir()
        shutil.copyfile(fixture, worker / 'fixtures/sine.wav')
        progress('동일 빌드 라이선스 고지 수집')
        notices = candidate / 'notices'
        notices.mkdir()
        tar = Path(os.environ['SystemRoot']) / 'System32/tar.exe'
        members = [f'python/licenses/LICENSE.{name}.txt' for name in LICENSES]
        _run([str(tar), '-xf', str(full), '-C', str(notices), '--strip-components', '2', *members], cancel, timeout=30, cwd=candidate)
        shutil.copyfile(unpacked / 'python/tcl/tk8.6/license.terms', notices / 'LICENSE.tk.txt')
        (notices / 'README.md').write_text('''# Python 런타임 리소스 후보 고지

CPython3.12.15/Astral20261013의 원문 고지를 보존합니다. 기본 Python LICENSE, pip와 vendored 패키지 고지는 runtime/python 내부에 함께 있습니다. 추가 라이브러리 고지는 동일 공식 full archive에서 수집했으며 모델 가중치는 포함하지 않습니다.

runtime/python의 Microsoft Visual C++ 런타임 DLL 10개(14.51.36247)는 Visual Studio Build Tools의 공식 재배포 폴더(Microsoft.VC145.CRT·OpenMP)에서 지문을 확인해 복사했습니다. 재배포 조건은 Visual Studio 라이선스의 배포 가능 코드 조항을 따릅니다.

이 후보는 로컬 검증용입니다. Microsoft VC runtime 재배포 조건의 법무 검토, 모델 패키지 전체 고지와 최종 설치/새 PC 검증은 별도 릴리스 점검 대상입니다. Python 코드·모델 환경을 설치했다고 표시하지 않습니다.

출처: https://docs.astral.sh/python-build-standalone/distributions/
공식 빌드: https://github.com/astral-sh/python-build-standalone/releases/tag/20261013
VC runtime: https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution
''', encoding='utf-8')
        verify_runtime_tree(archive, unpacked, plan, cancel)
        progress('VC++ 런타임 복사')
        for name, source in vc_runtime_sources(cancel).items():
            target = unpacked / 'python' / name
            shutil.copyfile(source, target)
            _verify_cached(target, dict(zip(('bytes', 'sha256'), VC_RUNTIME[name])), cancel)
        report = inventory(candidate, cancel)
        lock = AI_ROOT / 'models/runtime-bundle-lock.json'
        if refresh_lock:
            # 명시적 개발 명령에서만 빌드 lock을 갱신합니다. 런타임 앱에서는 호출하지 않습니다.
            lock.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        elif json.loads(lock.read_text(encoding='utf-8')) != report:
            raise ModelError('AI_CACHE_INTEGRITY')
        _write_new(validation / ('bundle-'+candidate_id+'.json'), {'schemaVersion':1,'resourcePath':str(candidate),'files':len(report['files']),'bytes':sum(item['bytes'] for item in report['files']),'nativeActivated':False})
        _write_new(validation / ('bundle-'+candidate_id+'.conf.json'), {
            'app': {'windows': [{'label':'main','title':'GuitarLab · Python runtime 검증 후보','width':1440,'height':900,'minWidth':1100,'minHeight':680}]},
            'bundle': {'resources': {candidate.as_posix()+'/': 'ai-runtime/'}},
        })
        success = True
        return candidate, report
    finally:
        if not success:
            _remove_new_environment(candidate, parent, candidate_id)


def main():
    parser = argparse.ArgumentParser(description='개발 Python에 의존하지 않는 Windows worker 리소스 후보 준비')
    parser.add_argument('--prepare', action='store_true', required=True)
    parser.add_argument('--refresh-lock', action='store_true')
    args = parser.parse_args()
    cancel = Event()
    signal.signal(signal.SIGINT, lambda *_: cancel.set())
    try:
        _, report = prepare(cancel, lambda stage: print(json.dumps({'stage':stage}), flush=True), args.refresh_lock)
        print(json.dumps({'state':report['state'],'files':len(report['files']),'bytes':sum(item['bytes'] for item in report['files']),'nativeActivated':False}),flush=True)
        return 0
    except Exception as cause:
        print(json.dumps({'error':'CANCELED' if isinstance(cause,Canceled) else cause.code if isinstance(cause,ModelError) else 'AI_RUNTIME_BUNDLE_FAILED','exceptionType':type(cause).__name__}),flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
