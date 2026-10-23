import hashlib
import json
from pathlib import Path
from threading import Event, Timer
from types import SimpleNamespace
import sys
import time
from uuid import uuid4

import pytest
from guitarlab_ai import install_managed as setup
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


@pytest.fixture
def setup_environment(tmp_path, monkeypatch):
    # 제품과 분리된 DEMO 설치 데이터이며 실제 실행 파일/모델이 아닙니다.
    monkeypatch.setattr(setup, "sys", SimpleNamespace(version_info=(3, 10, 8), platform="win32"))
    runner = tmp_path / "demo-pip-runner.py"
    runner.write_bytes(b"DEMO, never executed")
    monkeypatch.setattr(setup, "metadata", SimpleNamespace(
        version=lambda _: "22.2.2",
        distribution=lambda _: SimpleNamespace(locate_file=lambda _: runner)))
    bootstrap = {**setup.BOOTSTRAP, "bytes": 4, "sha256": hashlib.sha256(b"DEMO").hexdigest()}
    bundled = tmp_path / "ensurepip" / "_bundled"
    bundled.mkdir(parents=True)
    (bundled / bootstrap["filename"]).write_bytes(b"DEMO")
    monkeypatch.setattr(setup, "BOOTSTRAP", bootstrap)
    monkeypatch.setattr(setup, "ensurepip", SimpleNamespace(__file__=str(bundled.parent / "__init__.py")))
    plan = {"freeDiskBytesRequired": 1, "artifacts": [{"name": "demo", "version": "1.0", "filename": "demo.whl",
            "bytes": 4, "sha256": hashlib.sha256(b"DEMO").hexdigest()}]}
    monkeypatch.setattr(setup, "_plan", lambda: plan)
    cache = tmp_path / "ai" / "downloads" / setup.PLAN_ID
    cache.mkdir(parents=True)
    (cache / "demo.whl").write_bytes(b"DEMO")
    def create(path):
        (path / "Scripts").mkdir()
        (path / "Scripts/python.exe").write_bytes(b"DEMO")
    monkeypatch.setattr(setup.venv, "EnvBuilder", lambda **_: SimpleNamespace(create=create))
    calls = []
    def run(args, cancel, **_):
        setup._cancel(cancel)
        calls.append(args)
    monkeypatch.setattr(setup, "_run", run)
    return tmp_path, calls


def test_demo_bootstrap_is_still_hash_checked_before_environment_creation(setup_environment):
    root, calls = setup_environment
    bundled = Path(setup.ensurepip.__file__).parent / "_bundled"
    (bundled / setup.BOOTSTRAP["filename"]).write_bytes(b"BAD!")
    with pytest.raises(ModelError, match="AI_MODEL_INTEGRITY"):
        setup.prepare(root, Event(), lambda _: None)
    assert not calls
    assert not list((root / "ai/environments" / setup.ENV_FOLDER).iterdir())
    assert (root / "ai/downloads" / setup.PLAN_ID / "demo.whl").read_bytes() == b"DEMO"


def test_install_uses_hash_locked_offline_args_then_reuses_active_environment(setup_environment):
    root, calls = setup_environment
    progress = []
    result = setup.install(root, Event(), progress.append)
    assert result["state"] == "INSTALLED" and progress[-1] == "설치·검증·활성화 완료"
    pip = next(args for args in calls if "install" in args)
    for flag in ("--no-index", "--require-hashes", "--only-binary=:all:", "--no-deps", "--no-compile", "--no-cache-dir", "--isolated"):
        assert flag in pip
    marker = root / "ai/basic-pitch-active.json"
    original = marker.read_bytes()
    assert json.loads(original)["selfTest"] == setup.SELF_TEST
    environment = root / "ai/environments" / setup.ENV_FOLDER / result["environmentId"]
    assert (environment / "installation.json").read_bytes() == original
    assert "--hash=sha256:" in (environment / "requirements.lock").read_text()
    calls.clear()
    assert setup.install(root, Event(), lambda _: None)["state"] == "ALREADY_ACTIVE"
    assert len(calls) == 1 and calls[0][-1] == "--self-test"
    assert marker.read_bytes() == original


@pytest.mark.parametrize("cancel", [False, True])
def test_failed_or_canceled_setup_keeps_cache_and_removes_only_new_environment(setup_environment, monkeypatch, cancel):
    root, _ = setup_environment
    sentinel = root / "user-data.txt"; sentinel.write_bytes(b"preserve")
    event = Event()
    def fail(args, current, **_):
        if cancel:
            current.set()
            setup._cancel(current)
        raise ModelError("AI_SETUP_PROCESS_FAILED")
    monkeypatch.setattr(setup, "_run", fail)
    with pytest.raises(Canceled if cancel else ModelError):
        setup.install(root, event, lambda _: None)
    assert not (root / "ai/basic-pitch-active.json").exists()
    assert not list((root / "ai/environments" / setup.ENV_FOLDER).iterdir())
    assert (root / "ai/downloads" / setup.PLAN_ID / "demo.whl").read_bytes() == b"DEMO"
    assert sentinel.read_bytes() == b"preserve"


def test_corrupt_marker_and_wrong_cleanup_target_are_never_changed(setup_environment):
    root, calls = setup_environment
    marker = root / "ai/basic-pitch-active.json"; marker.write_text('{}')
    with pytest.raises(ModelError, match="AI_SETUP_MARKER_INVALID"):
        setup.install(root, Event(), lambda _: None)
    assert not calls and marker.read_text() == '{}'
    foreign = root / "foreign" / str(uuid4()); foreign.mkdir(parents=True)
    with pytest.raises(ModelError, match="AI_SETUP_PATH"):
        setup._remove_new_environment(foreign, root / "ai", foreign.name)
    assert foreign.is_dir()


def test_prepare_has_no_children_and_discard_preserves_activated_environment(setup_environment):
    root, calls = setup_environment
    environment_id = str(uuid4())
    result = setup.prepare(root, Event(), lambda _: None, environment_id)
    assert result['state'] == 'PREPARED' and result['environmentId'] == environment_id
    assert not calls and not (root / 'ai/basic-pitch-active.json').exists()
    environment = root / 'ai/environments' / setup.ENV_FOLDER / environment_id
    assert (environment / 'setup-bootstrap' / setup.BOOTSTRAP['filename']).stat().st_size == setup.BOOTSTRAP['bytes']
    assert setup.discard(root, environment_id)['state'] == 'DISCARDED'
    assert not environment.exists()
    setup.prepare(root, Event(), lambda _: None, environment_id)
    assert setup.activate(root, environment_id, Event())['state'] == 'INSTALLED'
    marker = (root / 'ai/basic-pitch-active.json').read_bytes()
    assert setup.discard(root, environment_id)['state'] == 'KEPT_ACTIVE'
    assert environment.is_dir() and (root / 'ai/basic-pitch-active.json').read_bytes() == marker
    assert setup.prepare(root, Event(), lambda _: None, str(uuid4()))['state'] == 'ALREADY_ACTIVE'
    assert not calls


def test_cancel_during_prepare_removes_only_candidate(setup_environment):
    root, _ = setup_environment
    environment_id = str(uuid4())
    event = Event()
    def progress(stage):
        if stage == '별도 환경 생성':
            event.set()
    with pytest.raises(Canceled):
        setup.prepare(root, event, progress, environment_id)
    assert not (root / 'ai/environments' / setup.ENV_FOLDER / environment_id).exists()
    assert (root / 'ai/downloads' / setup.PLAN_ID / 'demo.whl').read_bytes() == b'DEMO'


def test_demucs_uses_separate_marker_models_and_preserves_basic_environment(setup_environment, monkeypatch):
    from guitarlab_ai import cache_demucs
    root, calls = setup_environment
    basic = setup.install(root, Event(), lambda _:None)
    original_marker = (root / 'ai/basic-pitch-active.json').read_bytes()
    # 실제 모델이 아닌 DEMO 파일로 두 설치 도메인의 독립성을 검사합니다.
    artifact = {'name':'demo', 'version':'1.0', 'filename':'demo.whl', 'bytes':4, 'sha256':hashlib.sha256(b'DEMO').hexdigest()}
    models = [{**artifact, 'path':name} for name in ('5c90dfd2.safetensors','htdemucs_6s.yaml')]
    plan = {'freeDiskBytesRequired':1, 'artifacts':[artifact], 'modelFiles':models}
    monkeypatch.setattr(cache_demucs,'load_plan',lambda:plan)
    cache = root / 'ai/downloads' / cache_demucs.PLAN_ID; cache.mkdir()
    for name in ('demo.whl','5c90dfd2.safetensors','htdemucs_6s.yaml'):
        (cache / name).write_bytes(b'DEMO')
    result = setup.install(root, Event(), lambda _:None, 'htdemucs_6s')
    assert result['modelVersion'] == '4.1.0' and result['selfTest'] == 'OWNED_STEM_SPLIT_PASSED'
    assert result['environmentId'] != basic['environmentId']
    environment = root / 'ai/environments/demucs-4.1.0-cp310' / result['environmentId']
    assert (environment / 'models/htdemucs_6s/5c90dfd2.safetensors').read_bytes() == b'DEMO'
    assert (root / 'ai/basic-pitch-active.json').read_bytes() == original_marker
    marker = root / 'ai/demucs-active.json'
    assert setup._read_active(marker,'htdemucs_6s')['environmentId'] == result['environmentId']
    with pytest.raises(ModelError):
        setup._read_active(marker)
    calls.clear()
    assert setup.install(root,Event(),lambda _:None,'htdemucs_6s')['state'] == 'ALREADY_ACTIVE'
    assert '--model' in calls[0] and 'htdemucs_6s' in calls[0]
    assert setup.discard(root,result['environmentId'],'htdemucs_6s')['state'] == 'KEPT_ACTIVE'


@pytest.mark.parametrize("cancel_requested", [False, True])
def test_fixed_subprocess_timeout_or_cancel_waits_for_child_exit(monkeypatch, cancel_requested):
    children = []
    original = setup.subprocess.Popen
    def spawn(*args, **kwargs):
        child = original(*args, **kwargs); children.append(child); return child
    monkeypatch.setattr(setup.subprocess, "Popen", spawn)
    event = Event()
    trigger = Timer(0.1, event.set)
    if cancel_requested:
        trigger.start()
    started = time.monotonic()
    try:
        with pytest.raises(Canceled if cancel_requested else ModelError):
            setup._run([sys.executable, "-c", "import time; time.sleep(5)"], event, timeout=0.1 if not cancel_requested else 5)
        assert children[0].poll() is not None and time.monotonic() - started < 3
    finally:
        trigger.cancel()
