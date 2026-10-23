"""추론과 다운로드 없이 선택 모델의 설치 파일만 확인합니다."""
import platform
from threading import Event

from .model_integrity import verified_basic_pitch_model
from .runtime import Canceled


def verify_installation(model_id: str, cancel: Event, progress) -> dict:
    if model_id not in ("basic-pitch", "htdemucs_6s"):
        raise ValueError("미지원 모델")
    if cancel.is_set():
        raise Canceled()
    progress(0)
    if model_id == "basic-pitch":
        verified_basic_pitch_model()
        version = "0.4.0"
    else:
        from .separation.demucs import verified_demucs_model
        verified_demucs_model()
        version = "4.1.0"
    if cancel.is_set():
        raise Canceled()
    progress(100)
    return {"schemaVersion": 1, "modelId": model_id, "modelVersion": version,
            "pythonVersion": platform.python_version(), "state": "FILES_VERIFIED"}
