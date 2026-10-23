import hashlib
import struct
from threading import Event

import pytest

from guitarlab_ai.model_integrity import ModelError, verify_model_file
from guitarlab_ai.runtime import Canceled
from guitarlab_ai.separation.demucs import separate_wav, verified_demucs_model
from guitarlab_ai.separation.wav import float_header, read_wav


def pcm_wav(samples=b"\x01\x00" * 80):
    return struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", len(samples) + 36, b"WAVE", b"fmt ",
                       16, 1, 1, 8000, 16000, 2, 16, b"data", len(samples)) + samples


def test_bounded_wav_reader_checks_real_chunks_format_and_frame_duration(tmp_path):
    path = tmp_path / "input.wav"
    original = pcm_wav()
    path.write_bytes(original)
    source = read_wav(path, tmp_path, Event())
    assert (source.frames, source.sample_rate, source.channels, source.floating) == (80, 8000, 1, False)
    floating = float_header(2) + struct.pack("<ffff", .1, -.1, .2, -.2)
    path.write_bytes(floating)
    source = read_wav(path, tmp_path, Event())
    assert source.floating and source.frames == 2 and source.channels == 2
    corrupt = []
    for index, value in [(4, 1), (20, 6), (22, 3), (28, 1), (32, 1), (34, 24), (40, 99999)]:
        changed = bytearray(original)
        struct.pack_into("<H" if index in (20, 22, 32, 34) else "<I", changed, index, value)
        corrupt.append(bytes(changed))
    corrupt += [original[:-1], original + b"extra", b"x" * 44, pcm_wav(b""), pcm_wav(b"x"), pcm_wav(b"\0" * (8000 * 60 * 2 + 2))]
    for data in corrupt:
        path.write_bytes(data)
        with pytest.raises(ModelError, match="AI_INPUT_INVALID"):
            read_wav(path, tmp_path, Event())
    path.write_bytes(original)
    with pytest.raises(ModelError, match="AI_INPUT_INVALID"):
        read_wav(path, tmp_path / "other", Event())
    assert path.read_bytes() == original


def test_cancel_existing_outputs_and_invalid_inputs_do_not_load_a_model(tmp_path, monkeypatch):
    path = tmp_path / "input.wav"
    original = pcm_wav()
    path.write_bytes(original)
    def forbidden():
        pytest.fail("취소/잘못된 입력에서는 모델을 로드하면 안 됩니다.")
    monkeypatch.setattr("guitarlab_ai.separation.demucs.verified_demucs_model", forbidden)
    cancel = Event()
    cancel.set()
    with pytest.raises(Canceled):
        separate_wav(path, tmp_path, tmp_path, cancel, lambda _: None)
    protected = tmp_path / "guitar.wav"
    protected.write_bytes(b"existing result")
    with pytest.raises(ModelError, match="AI_INPUT_INVALID"):
        separate_wav(path, tmp_path, tmp_path, Event(), lambda _: None)
    assert protected.read_bytes() == b"existing result" and path.read_bytes() == original
    assert not (tmp_path / "accompaniment.wav").exists()


def test_model_missing_and_explicit_size_cap_are_checked_before_loading(tmp_path, monkeypatch):
    from importlib import metadata
    def missing(_):
        raise metadata.PackageNotFoundError()
    monkeypatch.setattr("guitarlab_ai.separation.demucs.metadata.version", missing)
    with pytest.raises(ModelError, match="AI_MODEL_MISSING"):
        verified_demucs_model()
    model = tmp_path / "fixture.safetensors"
    model.write_bytes(b"test")
    expected = {"bytes": 4, "sha256": hashlib.sha256(b"test").hexdigest()}
    with pytest.raises(ModelError, match="AI_MODEL_INTEGRITY"):
        verify_model_file(model, tmp_path, expected, max_bytes=3)
    assert verify_model_file(model, tmp_path, expected, max_bytes=4) == model
