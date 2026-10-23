"""새 작업 snapshot에서만 분리하고 검증용 manifest를 기록합니다."""
import json
from pathlib import Path
from threading import Event

from ..model_integrity import ModelError
from ..runtime import Canceled
from .demucs import separate_wav


def separate_job(request: dict, cancel: Event, progress) -> dict:
    work = Path(request["input"]["workDir"]).resolve()
    source = Path(request["input"]["assetPath"]).resolve()
    output = work / "separation.json"
    if not work.is_dir() or source.parent != work or source.name != "input.wav" or output.exists():
        raise ModelError("AI_INPUT_INVALID")
    created = []
    try:
        result = separate_wav(source, work, work, cancel, lambda value: progress(min(value, 95)))
        created.extend(work / n for n in ("guitar.wav", "accompaniment.wav"))
        payload = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
        if cancel.is_set():
            raise Canceled()
        if len(payload) > 16384:
            raise ModelError("AI_OUTPUT_INVALID")
        with output.open("xb") as stream:
            created.append(output)
            stream.write(payload)
        if cancel.is_set():
            raise Canceled()
        progress(100)
        return {"separationPath": str(output), "modelId": "htdemucs_6s", "modelVersion": "4.1.0"}
    except BaseException:
        for path in created:
            path.unlink(missing_ok=True)
        raise
