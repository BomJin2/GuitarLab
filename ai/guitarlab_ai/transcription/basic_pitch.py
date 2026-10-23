"""검증된 로컬 ONNX 모델을 사용하는 Basic Pitch adapter입니다."""
from contextlib import redirect_stderr, redirect_stdout
import importlib
from math import isfinite
import os
from pathlib import Path
from threading import Event
from typing import Callable
from ..model_integrity import ModelError, verified_basic_pitch_model
from ..runtime import Canceled
from .draft import DetectedNote


def decode_note_events(events, duration_ms: float) -> list[DetectedNote]:
    if len(events) > 2000:
        raise ModelError("AI_OUTPUT_INVALID")
    result = []
    for event in events:
        if len(event) != 5:
            raise ModelError("AI_OUTPUT_INVALID")
        onset, offset, pitch, activation, _ = event
        onset, offset, activation = float(onset) * 1000, float(offset) * 1000, float(activation)
        if any(not isfinite(v) for v in (onset, offset, activation)) or not 0 <= onset < offset <= duration_ms + 50 or int(pitch) != pitch or not 0 <= int(pitch) <= 127 or not 0 <= activation <= 1:
            raise ModelError("AI_OUTPUT_INVALID")
        result.append(DetectedNote(onset, offset, int(pitch), activation))
    if not result:
        raise ModelError("AI_TRANSCRIPTION_EMPTY")
    return sorted(result, key=lambda n: (n.onset_ms, n.pitch_midi, n.offset_ms))


def transcribe_wav(path: Path, allowed_root: Path, cancel: Event) -> list[DetectedNote]:
    return _transcribe_with_model(path,allowed_root,cancel,verified_basic_pitch_model)


def _transcribe_with_model(path: Path, allowed_root: Path, cancel: Event, resolve_model: Callable[[],Path]) -> list[DetectedNote]:
    if cancel.is_set():
        raise Canceled()
    resolved = path.resolve()
    if not resolved.is_relative_to(allowed_root.resolve()) or resolved.suffix.lower() != ".wav" or not resolved.is_file() or not 0 < resolved.stat().st_size <= 64 * 1024 * 1024:
        raise ModelError("AI_INPUT_INVALID")
    model_path = resolve_model()
    # 타사 import/예측의 경로 포함 print가 JSONL에 섞이지 않게 폐기합니다.
    with open(os.devnull, "w", encoding="utf-8") as sink, redirect_stdout(sink), redirect_stderr(sink):
        sf = importlib.import_module("soundfile")
        np = importlib.import_module("numpy")
        try:
            with sf.SoundFile(resolved) as audio:
                if audio.format not in ("WAV", "WAVEX") or audio.subtype not in ("PCM_16", "FLOAT") or audio.channels not in (1, 2) or not 8000 <= audio.samplerate <= 192000 or not 0 < audio.frames <= audio.samplerate * 60:
                    raise ModelError("AI_INPUT_INVALID")
                duration_ms = audio.frames * 1000 / audio.samplerate
                frames = 0
                for block in audio.blocks(blocksize=65536, dtype="float32", always_2d=True):
                    if cancel.is_set():
                        raise Canceled()
                    if not np.isfinite(block).all():
                        raise ModelError("AI_INPUT_INVALID")
                    frames += len(block)
                if frames != audio.frames:
                    raise ModelError("AI_INPUT_INVALID")
        except (RuntimeError, OSError, ValueError) as cause:
            raise ModelError("AI_INPUT_INVALID") from cause
        if cancel.is_set():
            raise Canceled()
        runtime = importlib.import_module("onnxruntime")
        runtime.disable_telemetry_events()
        inference = importlib.import_module("basic_pitch.inference")
        model = inference.Model(model_path)
        original_predict = model.predict
        def predict_window(samples):
            if cancel.is_set():
                raise Canceled()
            value = original_predict(samples)
            if cancel.is_set():
                raise Canceled()
            return value
        model.predict = predict_window
        _, _, events = inference.predict(resolved, model, multiple_pitch_bends=False)
    if cancel.is_set():
        raise Canceled()
    return decode_note_events(events, duration_ms)
