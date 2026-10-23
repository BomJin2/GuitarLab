import hashlib
from pathlib import Path
from threading import Event
import pytest
from guitarlab_ai.model_integrity import ModelError, verify_model_file
from guitarlab_ai.transcription.basic_pitch import decode_note_events, transcribe_wav
from guitarlab_ai.runtime import Canceled


def test_model_file_hash_size_and_root_are_checked_before_load(tmp_path):
    model = tmp_path / "nmp.onnx"
    original = b"own fixture model"
    model.write_bytes(original)
    expected = {"bytes": len(original), "sha256": hashlib.sha256(original).hexdigest()}
    assert verify_model_file(model, tmp_path, expected) == model
    model.write_bytes(b"damaged modelxxx")
    with pytest.raises(ModelError, match="AI_MODEL_INTEGRITY"):
        verify_model_file(model, tmp_path, expected)
    with pytest.raises(ModelError, match="AI_MODEL_INTEGRITY"):
        verify_model_file(model, tmp_path / "other", expected)


def test_model_events_preserve_real_pitch_and_activation_and_reject_bad_output():
    notes = decode_note_events([(0.5, 1.0, 67, .8, None), (0.0, .49, 64, .9, None)], 1000)
    assert [(n.onset_ms, n.offset_ms, n.pitch_midi) for n in notes] == [(0, 490, 64), (500, 1000, 67)]
    assert notes[0].confidence == .9
    for invalid in [[], [(0, 1, 128, .8, None)], [(0, 1, 64, float('nan'), None)], [(1, .5, 64, .8, None)], [(0, 2, 64, .8, None)]]:
        with pytest.raises(ModelError):
            decode_note_events(invalid, 1000)


def test_cancel_and_outside_source_are_rejected_without_model_load(tmp_path):
    cancel = Event(); cancel.set()
    with pytest.raises(Canceled):
        transcribe_wav(tmp_path / "none.wav", tmp_path, cancel)
    with pytest.raises(ModelError, match="AI_INPUT_INVALID"):
        transcribe_wav(Path(__file__), tmp_path, Event())
