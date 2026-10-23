import json
from threading import Event
from types import SimpleNamespace
from uuid import uuid4
import pytest
from guitarlab_ai.worker import parse_line
from guitarlab_ai.transcription import job
from guitarlab_ai.transcription.draft import DetectedNote
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


def request(root):
    return {"protocolVersion":1,"type":"start","jobId":str(uuid4()),"action":"transcribe",
        "input":{"assetPath":str(root / "input.wav"),"workDir":str(root)},
        "options":{"tuningMidi":[64,59,55,50,45,40],"syncAnchors":[{"scoreTick":0,"audioTimeMs":0},{"scoreTick":7680,"audioTimeMs":4000}],"grid":240}}


def test_transcribe_request_checks_paths_shape_options_and_anchor_order(tmp_path):
    value = request(tmp_path)
    assert parse_line((json.dumps(value)+"\n").encode()) == value
    for mutate in [lambda r:r["input"].update(extra="bad"), lambda r:r["options"].update(grid=13),lambda r:r["options"].update(tuningMidi=[64]),lambda r:r["options"]["syncAnchors"][1].update(audioTimeMs=-1),lambda r:r["options"]["syncAnchors"][1].update(scoreTick=0)]:
        bad = request(tmp_path); mutate(bad)
        with pytest.raises(ValueError):
            parse_line((json.dumps(bad)+"\n").encode())


def test_job_writes_only_new_result_preserves_input_and_cancel_creates_nothing(tmp_path, monkeypatch):
    value = request(tmp_path)
    source = tmp_path / "input.wav"; source.write_bytes(b"own fixture")
    monkeypatch.setattr(job,"transcribe_wav",lambda *_:[DetectedNote(0,500,64,.6)])
    monkeypatch.setattr(job,"import_module",lambda _:SimpleNamespace(info=lambda _:SimpleNamespace(duration=4.0)))
    progress=[]
    result=job.transcribe_job(value,Event(),progress.append)
    assert progress == [0,100] and result["modelVersion"] == "0.4.0"
    output=tmp_path / "notes.json"; data=json.loads(output.read_text(encoding="utf-8"))
    assert data["durationMs"]==4000 and data["notes"][0]["pitchMidi"]==64
    assert source.read_bytes()==b"own fixture"
    with pytest.raises(ModelError,match="AI_INPUT_INVALID"):
        job.transcribe_job(value,Event(),lambda _:None)
    output.unlink()
    cancel=Event();cancel.set()
    with pytest.raises(Canceled):
        job.transcribe_job(value,cancel,lambda _:None)
    assert not output.exists() and source.read_bytes()==b"own fixture"
