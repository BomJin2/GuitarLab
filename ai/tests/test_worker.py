import io
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Event
from uuid import uuid4
import pytest
from guitarlab_ai.worker import MAX_LINE, parse_line, serve
from guitarlab_ai.runtime import Canceled, inspect_runtime
from importlib import metadata


def message(job_id, kind="start", **extra):
    return {"protocolVersion": 1, "type": kind, "jobId": job_id,
            **({"action": "inspect"} if kind == "start" else {}), **extra}


def line(value):
    return (json.dumps(value) + "\n").encode()


@pytest.mark.parametrize("data", [b"not json\n", b"{}\n", b"x" * (MAX_LINE + 1), b'{}',
    line(message(str(uuid4()), protocolVersion=True)), line(message(str(uuid4()), path="private")),
    line(message(str(uuid4()), action="transcribe")), line(message("bad-id")),
    b'{"protocolVersion":1,"protocolVersion":1}\n', b'{"protocolVersion":NaN}\n'], ids=lambda _: "invalid")
def test_protocol_rejects_invalid_or_extra_input(data):
    with pytest.raises((ValueError, UnicodeError)):
        parse_line(data)
    output = io.StringIO()
    assert serve(io.BytesIO(data), output) == 2
    assert output.getvalue() == ""


def test_runtime_only_reads_metadata_and_never_claims_verified_model(monkeypatch):
    def version(name):
        if name == "basic-pitch":
            return "0.4.0"
        raise metadata.PackageNotFoundError(name)
    monkeypatch.setattr(metadata, "version", version)
    progress = []
    result = inspect_runtime(Event(), progress.append)
    assert progress == [0, 50, 100]
    assert result["models"] == [
        {"id": "basic-pitch", "packageVersion": "0.4.0", "state": "UNVERIFIED", "usable": False},
        {"id": "audio-separator", "packageVersion": None, "state": "PACKAGE_MISSING", "usable": False},
    ]
    cancel = Event()
    cancel.set()
    with pytest.raises(Canceled):
        inspect_runtime(cancel, lambda _: None)


def test_setup_protocol_rejects_paths_in_check_and_noncanonical_environment_ids():
    job = str(uuid4())
    for action in ('prepare_install', 'activate_install', 'discard_install'):
        valid = message(job, action=action, modelId='basic-pitch', input={'appDataRoot':'C:/app-data', 'environmentId':str(uuid4())})
        assert parse_line(line(valid)) == valid
        assert parse_line(line({**valid, 'modelId':'htdemucs_6s'}))['modelId'] == 'htdemucs_6s'
        for key, value in [('environmentId', '../private'), ('command', 'arbitrary')]:
            bad = {**valid, 'input':{**valid['input'], key:value}}
            with pytest.raises(ValueError):
                parse_line(line(bad))
        with pytest.raises(ValueError):
            parse_line(line({**valid, 'modelId':'unknown'}))
    valid = message(job, action='check_install', modelId='basic-pitch')
    assert parse_line(line(valid)) == valid
    with pytest.raises(ValueError):
        parse_line(line({**valid, 'input':{'path':'private'}}))


@pytest.mark.parametrize("followup,expected", [("cancel", "canceled"), ("duplicate", "failed"), ("foreign", "failed")])
def test_cancel_and_invalid_followups_have_one_terminal(followup, expected):
    job_id = str(uuid4())
    next_message = message(job_id, "cancel") if followup == "cancel" else message(job_id)
    if followup == "foreign":
        next_message = message(str(uuid4()), "cancel")
    def waiting(cancel, progress):
        assert cancel.wait(2)
        raise Canceled()
    output = io.StringIO()
    code = serve(io.BytesIO(line(message(job_id)) + line(next_message)), output, waiting)
    events = [json.loads(v) for v in output.getvalue().splitlines()]
    assert len(events) == 1 and events[0]["type"] == expected
    assert events[0]["jobId"] == job_id
    assert code == (0 if followup == "cancel" else 2)


def test_failure_redacts_exception_and_preserves_one_terminal():
    def failing(cancel, progress):
        raise RuntimeError("private user path")
    output = io.StringIO()
    serve(io.BytesIO(line(message(str(uuid4())))), output, failing)
    event = json.loads(output.getvalue())
    assert event["type"] == "failed"
    assert event["error"]["code"] == "AI_WORKER_FAILED"
    assert "private" not in output.getvalue()


def test_real_worker_stdout_is_only_versioned_jsonl_and_exits_on_parent_close():
    root = Path(__file__).resolve().parents[1]
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "PYTHONHOME")}
    env["PYTHONUTF8"] = "1"
    job_id = str(uuid4())
    child = subprocess.Popen([sys.executable, "-s", "-u", "-m", "guitarlab_ai.worker"], cwd=root,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0, env=env)
    try:
        child.stdin.write(line(message(job_id)))
        child.stdin.flush()
        events = []
        for _ in range(8):
            event = json.loads(child.stdout.readline(MAX_LINE + 1))
            assert event["protocolVersion"] == 1 and event["jobId"] == job_id
            events.append(event)
            if event["type"] == "completed":
                break
        assert [e["percent"] for e in events[:-1]] == [0, 50, 100]
        assert all(not m["usable"] for m in events[-1]["result"]["models"])
        child.stdin.close()
        assert child.wait(timeout=5) == 0
        assert child.stdout.read() == b"" and child.stderr.read() == b""
    finally:
        if child.poll() is None:
            child.kill()
        child.wait(timeout=5)
        for stream in (child.stdin, child.stdout, child.stderr):
            stream.close()
