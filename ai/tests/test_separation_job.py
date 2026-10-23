import io
import json
from pathlib import Path
from threading import Event
from uuid import uuid4

import pytest

from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled
from guitarlab_ai.separation.job import separate_job
from guitarlab_ai.worker import parse_line, serve


def request(tmp_path):
    source = tmp_path / "input.wav"
    source.write_bytes(b"own fixture")
    return {"protocolVersion": 1, "type": "start", "jobId": str(uuid4()), "action": "separate",
            "input": {"assetPath": str(source), "workDir": str(tmp_path)}}


def test_separate_contract_dispatch_and_no_arbitrary_options(tmp_path, monkeypatch):
    value = request(tmp_path)
    line = lambda v: (json.dumps(v) + "\n").encode()
    assert parse_line(line(value)) == value
    for invalid in [dict(value, options={}), dict(value, input={"assetPath": "x"}), dict(value, action="shell")]:
        with pytest.raises(ValueError):
            parse_line(line(invalid))
    def fake(request, cancel, progress):
        progress(0); progress(100)
        return {"separationPath": "DEMO", "modelId": "htdemucs_6s", "modelVersion": "4.1.0"}
    monkeypatch.setattr("guitarlab_ai.separation.job.separate_job", fake)
    class Input(io.BytesIO):
        def fileno(self):
            raise OSError()
    # 단위 테스트의 종료 입력은 실행 완료 뒤 도착하도록 취소 reader를 대체합니다.
    monkeypatch.setattr("guitarlab_ai.worker.control_reader", lambda stream, done, limit: lambda: done.wait() or b"")
    output = io.StringIO()
    assert serve(Input(line(value)), output) == 0
    messages = [json.loads(s) for s in output.getvalue().splitlines()]
    assert messages[0]["stage"] == "separation" and messages[-1]["type"] == "completed"


def test_result_file_failure_cancel_and_previous_files_are_preserved(tmp_path, monkeypatch):
    value = request(tmp_path)
    original = Path(value["input"]["assetPath"])
    def fake(path, root, output, cancel, progress):
        for name in ("guitar.wav", "accompaniment.wav"):
            (output / name).write_bytes(b"DEMO output")
        progress(100)
        return {"schemaVersion": 1}
    monkeypatch.setattr("guitarlab_ai.separation.job.separate_wav", fake)
    result = separate_job(value, Event(), lambda _: None)
    assert Path(result["separationPath"]).is_file()
    with pytest.raises(ModelError):
        separate_job(value, Event(), lambda _: None)
    for name in ("separation.json", "guitar.wav", "accompaniment.wav"):
        (tmp_path / name).unlink()
    cancel = Event()
    with pytest.raises(Canceled):
        separate_job(value, cancel, lambda percent: cancel.set() if percent == 95 else None)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["input.wav"]
    assert original.read_bytes() == b"own fixture"
    protected = tmp_path / "separation.json"
    protected.write_bytes(b"previous")
    with pytest.raises(ModelError):
        separate_job(value, Event(), lambda _: None)
    assert protected.read_bytes() == b"previous"
