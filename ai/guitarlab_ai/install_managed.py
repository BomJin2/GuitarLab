"""고정 캐시로 별도 개발 환경을 설치하고 자체 검증 뒤 활성화합니다."""
import argparse
import ensurepip
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
from threading import Event
import time
from uuid import UUID, uuid4
import venv

from .model_cache import PLAN_ID, PLAN_HASH, _plan, _publish, _verify_cached
from .model_integrity import ModelError, verify_model_file
from .runtime import Canceled

AI_ROOT = Path(__file__).resolve().parents[1]
ENV_FOLDER = "basic-pitch-0.4.0-cp310"
SELF_TEST = "OWNED_8_NOTES_PASSED"
BOOTSTRAP = {"name": "setuptools", "version": "63.2.0", "filename": "setuptools-63.2.0-py3-none-any.whl",
             "bytes": 1228000, "sha256": "0d33c374d41c7863419fc8f6c10bfe25b7b498aa34164d135c622e52580c6b16"}


def model_settings(model_id='basic-pitch'):
    if sys.version_info[:3] == (3, 12, 15):
        if model_id == 'basic-pitch':
            return {'id':model_id,'version':'0.4.0','folder':'basic-pitch-0.4.0-onnx1-cp312',
                    'planId':'basic-pitch-0.4.0-onnx1-windows-cp312',
                    'planHash':'e4d75fa2a10e92de7dbb1c828d2102bc0bd76092f766892e41ddb7cde44989f1',
                    'marker':'basic-pitch-cp312-active.json','selfTest':SELF_TEST}
        if model_id == 'htdemucs_6s':
            return {'id':model_id,'version':'4.1.0','folder':'demucs-4.1.0-cp312',
                    'planId':'demucs-4.1.0-htdemucs-6s-windows-cp312',
                    'planHash':'2d7760f72cc5cc07aa25cf120b7d478b720941c2513109393d78b3014c70a5e7',
                    'marker':'demucs-cp312-active.json','selfTest':'OWNED_STEM_SPLIT_PASSED'}
    if model_id == 'basic-pitch':
        return {'id':model_id, 'version':'0.4.0', 'folder':ENV_FOLDER, 'planId':PLAN_ID,
                'planHash':PLAN_HASH, 'marker':'basic-pitch-active.json', 'selfTest':SELF_TEST}
    if model_id == 'htdemucs_6s':
        return {'id':model_id, 'version':'4.1.0', 'folder':'demucs-4.1.0-cp310',
                'planId':'demucs-4.1.0-htdemucs-6s-windows-cp310',
                'planHash':'0b4407faad80689e6b0a0c51816a1077eb7650cb20ec094ee1dc6132adc5e33d',
                'marker':'demucs-active.json', 'selfTest':'OWNED_STEM_SPLIT_PASSED'}
    raise ModelError('AI_SETUP_VERSION')


def bootstrap_hash():
    return '7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad' if sys.version_info[:3] == (3,12,15) else BOOTSTRAP['sha256']


def _cancel(cancel):
    if cancel.is_set():
        raise Canceled()


def _directory(root, *parts):
    if not root.is_absolute():
        raise ModelError("AI_SETUP_PATH")
    root = root.resolve(strict=True)
    path = root
    for part in parts:
        if part in ("", ".", "..") or Path(part).name != part:
            raise ModelError("AI_SETUP_PATH")
        path = path / part
        path.mkdir(exist_ok=True)
        if (not path.is_dir() or path.is_symlink() or getattr(path.lstat(), "st_file_attributes", 0) & 0x400
                or not path.resolve().is_relative_to(root)):
            raise ModelError("AI_SETUP_PATH")
    return path


def _run(args, cancel, timeout=900, report=False, cwd=None, environment=None):
    _cancel(cancel)
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "PYTHONHOME")}
    env.update(PYTHONUTF8="1", PYTHONDONTWRITEBYTECODE="1", PIP_NO_INDEX="1")
    if environment:
        env.update(environment)
    child = subprocess.Popen(args, cwd=cwd or AI_ROOT, env=env, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE if report else subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    started = time.monotonic()
    try:
        while child.poll() is None:
            _cancel(cancel)
            if time.monotonic() - started > timeout:
                raise ModelError("AI_SETUP_TIMEOUT")
            cancel.wait(0.1)
        _cancel(cancel)
        if child.returncode != 0:
            if report:
                data = json.loads(child.stdout.read(4097))
                if isinstance(data, dict) and set(data).issubset({"error", "exceptionType", "missingModule"}):
                    print(json.dumps({"selfTestError": data}), flush=True)
            raise ModelError("AI_SETUP_PROCESS_FAILED")
    finally:
        if child.poll() is None:
            child.kill()
        child.wait()
        if child.stdout:
            child.stdout.close()


def _self_test(model_id='basic-pitch', cancel=None):
    from .transcription.basic_pitch import transcribe_wav
    if metadata.version("setuptools") != ('75.3.2' if sys.version_info[:3] == (3,12,15) else BOOTSTRAP["version"]):
        raise ModelError("AI_SETUP_VERSION")
    fixture = AI_ROOT / 'fixtures/sine.wav'
    if not fixture.is_file():
        fixture = AI_ROOT.parent / "public/fixtures/sine.wav"
    if hashlib.sha256(fixture.read_bytes()).hexdigest() != "7d519e32205014966c602feab05b5cae21e57ef66c60576781880013f2e8d386":
        raise ModelError("AI_SETUP_FIXTURE_INVALID")
    cancel = cancel or Event()
    model_settings(model_id)
    if model_id == 'basic-pitch':
        notes = transcribe_wav(fixture, fixture.parent, cancel)
        if [n.pitch_midi for n in notes] != [64, 67, 69, 71] * 2:
            raise ModelError("AI_SETUP_SELF_TEST_FAILED")
    else:
        from .separation.demucs import separate_wav
        work = Path(tempfile.mkdtemp(prefix='guitarlab-ai-verify-')).resolve()
        try:
            input_path = work / 'input.wav'
            shutil.copyfile(fixture, input_path)
            result = separate_wav(input_path, work, work, cancel, lambda _:None)
            if (result['frames'] != 176400 or result['channels'] != 2 or result['durationMs'] != 4000
                    or [item['role'] for item in result['outputs']] != ['GUITAR_FULL', 'ACCOMPANIMENT']
                    or result['inputSha256'] != hashlib.sha256(fixture.read_bytes()).hexdigest()):
                raise ModelError('AI_SETUP_SELF_TEST_FAILED')
        finally:
            if work.parent != Path(tempfile.gettempdir()).resolve() or not work.name.startswith('guitarlab-ai-verify-'):
                raise ModelError('AI_SETUP_PATH')
            shutil.rmtree(work)


def _read_active(path, model_id='basic-pitch'):
    model = model_settings(model_id)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 4096:
        raise ModelError("AI_SETUP_MARKER_INVALID")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        environment_id = str(UUID(value["environmentId"]))
    except (ValueError, TypeError, KeyError, AttributeError) as cause:
        raise ModelError("AI_SETUP_MARKER_INVALID") from cause
    if (not isinstance(value, dict) or set(value) != {"schemaVersion", "modelId", "modelVersion", "environmentId", "planSha256", "bootstrapSha256", "selfTest"}
            or type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1 or value["modelId"] != model_id
            or value["modelVersion"] != model['version'] or value["planSha256"] != model['planHash'] or value["selfTest"] != model['selfTest']
            or value["bootstrapSha256"] != bootstrap_hash()
            or environment_id != value["environmentId"]):
        raise ModelError("AI_SETUP_MARKER_INVALID")
    return value


def _write_new(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, separators=(",", ":"), allow_nan=False)
        stream.flush()
        os.fsync(stream.fileno())


def _remove_new_environment(environment, parent, environment_id):
    # 새로 만든 UUID 경로만 정리하며 venv를 옮기거나 기존 환경을 지우지 않습니다.
    if (environment.name != environment_id or str(UUID(environment_id)) != environment_id
            or environment.is_symlink() or environment.resolve().parent != parent.resolve()
            or getattr(environment.lstat(), "st_file_attributes", 0) & 0x400):
        raise ModelError("AI_SETUP_PATH")
    shutil.rmtree(environment)


def prepare(root: Path, cancel: Event, progress, environment_id=None, model_id='basic-pitch'):
    _cancel(cancel)
    if environment_id is not None and str(UUID(environment_id)) != environment_id:
        raise ModelError("AI_SETUP_PATH")
    cp312 = sys.version_info[:3] == (3,12,15)
    if sys.platform != "win32" or (not cp312 and sys.version_info[:2] != (3,10)) or metadata.version("pip") != ('26.2.1' if cp312 else "22.2.2"):
        raise ModelError("AI_SETUP_VERSION")
    model = model_settings(model_id)
    if cp312:
        from .runtime_packages import load_plans
        plan = next(item for item in load_plans() if item['modelId'] == model_id)
    elif model_id == 'basic-pitch':
        plan = _plan()
    else:
        from .cache_demucs import load_plan
        plan = load_plan()
    directory = _directory(root, "ai")
    parent = _directory(root, "ai", "environments", model['folder'])
    active = directory / model['marker']
    if active.exists() or active.is_symlink():
        value = _read_active(active, model_id)
        environment = parent / value["environmentId"]
        if not environment.is_dir():
            raise ModelError("AI_SETUP_MARKER_INVALID")
        environment = _directory(root, "ai", "environments", model['folder'], value["environmentId"])
        return {"schemaVersion": 1, "modelId": model_id, "modelVersion": model['version'], "state": "ALREADY_ACTIVE", "environmentId": value["environmentId"]}
    cache = _directory(root, "ai", "downloads", model['planId'])
    progress("캐시 검증")
    for artifact in plan["artifacts"]:
        _cancel(cancel)
        _verify_cached(cache / artifact["filename"], artifact, cancel)
    model_files = plan['modelFiles'] if model_id == 'htdemucs_6s' else []
    for item in model_files:
        _verify_cached(cache / item['path'], item, cancel)
    if shutil.disk_usage(parent).free < plan["freeDiskBytesRequired"]:
        raise ModelError("AI_DISK_SPACE")
    bundled = Path(ensurepip.__file__).parent / "_bundled"
    if not cp312:
        verify_model_file(bundled / BOOTSTRAP["filename"], bundled, BOOTSTRAP)
    # lock을 manifest에서 다시 만들므로 임의 변경된 requirements를 실행하지 않습니다.
    artifacts = plan['artifacts'] if cp312 else [*plan['artifacts'],BOOTSTRAP]
    lock = "".join(f"{a['name']}=={a['version']} --hash=sha256:{a['sha256']}\n" for a in artifacts)
    environment_id = environment_id or str(uuid4())
    environment = parent / environment_id
    environment.mkdir()
    try:
        progress("별도 환경 생성")
        venv.EnvBuilder(with_pip=False, symlinks=False).create(environment)
        _cancel(cancel)
        lock_path = environment / "requirements.lock"
        lock_path.write_text(lock, encoding="utf-8")
        bootstrap_dir = environment / "setup-bootstrap"
        bootstrap_dir.mkdir()
        if not cp312:
            with (bundled / BOOTSTRAP["filename"]).open("rb") as source, (bootstrap_dir / BOOTSTRAP["filename"]).open("xb") as target:
                for block in iter(lambda: source.read(65536), b""):
                    _cancel(cancel)
                    target.write(block)
                target.flush()
                os.fsync(target.fileno())
            verify_model_file(bootstrap_dir / BOOTSTRAP["filename"], bootstrap_dir, BOOTSTRAP)
        if model_files:
            model_dir = environment / 'models/htdemucs_6s'
            model_dir.mkdir(parents=True)
            for item in model_files:
                with (cache / item['path']).open('rb') as source, (model_dir / item['path']).open('xb') as target:
                    for block in iter(lambda: source.read(65536), b''):
                        _cancel(cancel)
                        target.write(block)
                    target.flush()
                    os.fsync(target.fileno())
                _verify_cached(model_dir / item['path'], item, cancel)
        _cancel(cancel)
        return {"schemaVersion": 1, "modelId": model_id, "modelVersion": model['version'], "state": "PREPARED", "environmentId": environment_id}
    except BaseException:
        _remove_new_environment(environment, parent, environment_id)
        raise


def _paths(root, environment_id, model_id='basic-pitch'):
    if str(UUID(environment_id)) != environment_id:
        raise ModelError("AI_SETUP_PATH")
    directory = _directory(root, "ai")
    parent = _directory(root, "ai", "environments", model_settings(model_id)['folder'])
    return directory, parent, parent / environment_id


def _result(state, environment_id, model_id='basic-pitch'):
    model = model_settings(model_id)
    return {"schemaVersion": 1, "modelId": model_id, "modelVersion": model['version'],
            "state": state, "environmentId": environment_id, "selfTest": model['selfTest']}


def activate(root, environment_id, cancel, model_id='basic-pitch'):
    _cancel(cancel)
    model = model_settings(model_id)
    directory, _, environment = _paths(root, environment_id, model_id)
    if not environment.is_dir():
        raise ModelError("AI_SETUP_PATH")
    _directory(root, "ai", "environments", model['folder'], environment_id)
    active = directory / model['marker']
    if active.exists() or active.is_symlink():
        if _read_active(active, model_id)["environmentId"] == environment_id:
            return _result("ALREADY_ACTIVE", environment_id, model_id)
        raise ModelError("AI_SETUP_MARKER_INVALID")
    pending = directory / f"active-{environment_id}.pending"
    marker = {"schemaVersion": 1, "modelId": model_id, "modelVersion": model['version'],
              "environmentId": environment_id, "planSha256": model['planHash'], "bootstrapSha256": bootstrap_hash(), "selfTest": model['selfTest']}
    try:
        _write_new(environment / "installation.json", marker)
        _write_new(pending, marker)
        _cancel(cancel)
        _publish(pending, active)
        return _result("INSTALLED", environment_id, model_id)
    finally:
        if pending.is_file() and not pending.is_symlink():
            pending.unlink()


def discard(root, environment_id, model_id='basic-pitch'):
    model = model_settings(model_id)
    directory, parent, environment = _paths(root, environment_id, model_id)
    active = directory / model['marker']
    if active.exists() or active.is_symlink():
        if _read_active(active, model_id)["environmentId"] == environment_id:
            return {"schemaVersion": 1, "modelId": model_id, "modelVersion": model['version'], "state": "KEPT_ACTIVE"}
    if environment.exists() or environment.is_symlink():
        _remove_new_environment(environment, parent, environment_id)
    pending = directory / f"active-{environment_id}.pending"
    if pending.is_file() and not pending.is_symlink():
        pending.unlink()
    return {"schemaVersion": 1, "modelId": model_id, "modelVersion": model['version'], "state": "DISCARDED"}


def install(root: Path, cancel: Event, progress, model_id='basic-pitch'):
    model = model_settings(model_id)
    prepared = prepare(root, cancel, progress, model_id=model_id)
    environment_id = prepared["environmentId"]
    directory, _, environment = _paths(root, environment_id, model_id)
    executable = str(environment / "Scripts/python.exe")
    if prepared["state"] == "ALREADY_ACTIVE":
        _run([executable, "-s", "-u", "-m", "guitarlab_ai.install_managed", "--model", model_id, "--self-test"], cancel, report=True)
        progress("기존 활성 환경 재검증 완료")
        return _result("ALREADY_ACTIVE", environment_id, model_id)
    try:
        runner = Path(metadata.distribution("pip").locate_file("pip/__pip-runner__.py"))
        if not runner.is_file():
            raise ModelError("AI_SETUP_VERSION")
        pip = [executable, "-I", str(runner), "--isolated", "--disable-pip-version-check", "--no-input"]
        progress("오프라인 패키지 설치")
        _run([*pip, "install", "--no-index", "--find-links", str(directory / "downloads" / model['planId']), "--find-links", str(environment / "setup-bootstrap"),
              "--require-hashes", "--only-binary=:all:", "--no-deps", "--no-compile", "--no-cache-dir", "-r", str(environment / "requirements.lock")], cancel)
        progress("의존성 확인")
        _run([*pip, "check"], cancel)
        progress("모델 해시·자체 음원 분석")
        _run([executable, "-s", "-u", "-m", "guitarlab_ai.install_managed", "--model", model_id, "--self-test"], cancel, report=True)
        result = activate(root, environment_id, cancel, model_id)
        progress("설치·검증·활성화 완료")
        return result
    finally:
        discard(root, environment_id, model_id)


def main():
    parser = argparse.ArgumentParser(description="두 고정 모델의 오프라인 환경 설치")
    parser.add_argument('--model', choices=('basic-pitch', 'htdemucs_6s'), default='basic-pitch')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--install", action="store_true")
    group.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    cancel = Event()
    signal.signal(signal.SIGINT, lambda *_: cancel.set())
    try:
        if args.self_test:
            _self_test(args.model, cancel)
            result = {"state": model_settings(args.model)['selfTest']}
        else:
            root = Path(os.environ["APPDATA"]) / "com.guitarlab.app"
            result = install(root, cancel, lambda stage: print(json.dumps({"stage": stage}, ensure_ascii=False), flush=True), args.model)
        print(json.dumps(result), flush=True)
        return 0
    except Exception as cause:
        failure = {"error": "CANCELED" if isinstance(cause, Canceled) else cause.code if isinstance(cause, ModelError) else "AI_SETUP_FAILED", "exceptionType": type(cause).__name__}
        if isinstance(cause, ModuleNotFoundError) and isinstance(cause.name, str) and len(cause.name) < 100 and all(c.isalnum() or c in "_." for c in cause.name):
            failure["missingModule"] = cause.name
        print(json.dumps(failure), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
