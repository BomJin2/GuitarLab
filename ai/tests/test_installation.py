from threading import Event
from uuid import uuid4

import pytest
from guitarlab_ai import installation
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled
from guitarlab_ai.separation import demucs
from guitarlab_ai.worker import parse_line
from test_worker import line, message


@pytest.mark.parametrize("model_id,version", [("basic-pitch", "0.4.0"), ("htdemucs_6s", "4.1.0")])
def test_installation_uses_adapter_verifier_without_loading_inference(monkeypatch, model_id, version):
    calls = []
    monkeypatch.setattr(installation, "verified_basic_pitch_model", lambda: calls.append("basic-pitch"))
    monkeypatch.setattr(demucs, "verified_demucs_model", lambda: calls.append("htdemucs_6s"))
    monkeypatch.setattr(demucs, "import_module", lambda _: pytest.fail("추론 라이브러리 로드 금지"))
    progress = []
    result = installation.verify_installation(model_id, Event(), progress.append)
    assert result == {"schemaVersion": 1, "modelId": model_id, "modelVersion": version,
                      "pythonVersion": installation.platform.python_version(), "state": "FILES_VERIFIED"}
    assert calls == [model_id] and progress == [0, 100]


def test_installation_cancel_and_integrity_failure_never_report_success(monkeypatch):
    cancel = Event()
    cancel.set()
    monkeypatch.setattr(installation, "verified_basic_pitch_model", lambda: pytest.fail("취소 후 파일 검사 금지"))
    with pytest.raises(Canceled):
        installation.verify_installation("basic-pitch", cancel, lambda _: None)
    cancel.clear()
    monkeypatch.setattr(installation, "verified_basic_pitch_model", cancel.set)
    progress = []
    with pytest.raises(Canceled):
        installation.verify_installation("basic-pitch", cancel, progress.append)
    assert progress == [0]
    cancel.clear()
    def corrupt():
        raise ModelError("AI_MODEL_INTEGRITY")
    monkeypatch.setattr(installation, "verified_basic_pitch_model", corrupt)
    with pytest.raises(ModelError, match="AI_MODEL_INTEGRITY"):
        installation.verify_installation("basic-pitch", cancel, lambda _: None)


def test_verify_protocol_accepts_only_fixed_models_and_no_paths():
    valid = message(str(uuid4()), action="verify_model", modelId="htdemucs_6s")
    assert parse_line(line(valid)) == valid
    for invalid in [message(str(uuid4()), action="verify_model"), {**valid, "modelId": "other"},
                    {**valid, "path": "private"}, {**valid, "input": {}}, {**valid, "modelId": None}]:
        with pytest.raises(ValueError):
            parse_line(line(invalid))
