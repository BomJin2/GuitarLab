"""모델을 불러오지 않고 설치 메타데이터만 확인합니다."""
from importlib import metadata
import platform
from threading import Event
from collections.abc import Callable

MODEL_IDS = ("basic-pitch", "audio-separator")


class Canceled(Exception):
    pass


def inspect_runtime(cancel: Event, progress: Callable[[int], None]) -> dict:
    models = []
    progress(0)
    for index, model_id in enumerate(MODEL_IDS):
        if cancel.is_set():
            raise Canceled()
        try:
            version = metadata.version(model_id)
        except metadata.PackageNotFoundError:
            version = None
        if version is not None and (not version or len(version) > 128):
            raise ValueError("패키지 버전이 올바르지 않습니다.")
        models.append({"id": model_id, "packageVersion": version,
                       "state": "UNVERIFIED" if version else "PACKAGE_MISSING", "usable": False})
        progress((index + 1) * 100 // len(MODEL_IDS))
    if cancel.is_set():
        raise Canceled()
    return {"schemaVersion": 1, "pythonVersion": platform.python_version(), "models": models}
