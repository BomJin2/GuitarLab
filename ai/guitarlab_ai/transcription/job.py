"""작업 영역의 snapshot을 분석하고 새 검토용 결과만 기록합니다."""
import json
from importlib import import_module
from pathlib import Path
from threading import Event
from ..model_integrity import ModelError
from ..runtime import Canceled
from .basic_pitch import transcribe_wav
from .draft import build_draft


def transcribe_job(request: dict, cancel: Event, progress) -> dict:
    work = Path(request["input"]["workDir"]).resolve()
    source = Path(request["input"]["assetPath"]).resolve()
    output = work / "notes.json"
    if not work.is_dir() or source.parent != work or source.name != "input.wav" or output.exists():
        raise ModelError("AI_INPUT_INVALID")
    progress(0)
    notes = transcribe_wav(source, work, cancel)
    options = request["options"]
    draft = build_draft(notes, [(a["scoreTick"], a["audioTimeMs"]) for a in options["syncAnchors"]], tuple(options["tuningMidi"]), grid=options["grid"], cancel=cancel)
    duration_ms = import_module("soundfile").info(source).duration * 1000
    payload = json.dumps({"schemaVersion":1,"durationMs":duration_ms,"notes":draft}, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    if len(payload) > 2 * 1024 * 1024:
        raise ModelError("AI_OUTPUT_INVALID")
    created = False
    try:
        if cancel.is_set():
            raise Canceled()
        with output.open("xb") as stream:
            created = True
            stream.write(payload)
        if cancel.is_set():
            raise Canceled()
    except Exception:
        if created:
            output.unlink(missing_ok=True)
        raise
    progress(100)
    return {"notesPath":str(output),"modelId":"basic-pitch","modelVersion":"0.4.0"}
