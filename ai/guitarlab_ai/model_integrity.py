"""고정 배포 계획과 설치 모델의 무결성을 로드 전에 검사합니다."""
import hashlib
import json
from importlib import metadata
from pathlib import Path
import sys
from .runtime_paths import extended_path

PLAN_PATH = Path(__file__).resolve().parents[1] / "models" / "basic-pitch-0.4.0-windows-cp310.json"


class ModelError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def load_model_plan(legacy_path: Path, model_id: str) -> dict:
    profiles = {
        "basic-pitch": ("basic-pitch-0.4.0-onnx1-windows-cp312.json", "e4d75fa2a10e92de7dbb1c828d2102bc0bd76092f766892e41ddb7cde44989f1"),
        "htdemucs_6s": ("demucs-4.1.0-htdemucs-6s-windows-cp312.json", "2d7760f72cc5cc07aa25cf120b7d478b720941c2513109393d78b3014c70a5e7"),
    }
    if model_id not in profiles:
        raise ModelError("AI_MODEL_VERSION")
    version = tuple(sys.version_info[:3])
    if version[:2] == (3, 10):
        path, expected = legacy_path, None
        python = "3.10"
    elif version == (3, 12, 15):
        filename, expected = profiles[model_id]
        path = legacy_path.parent / filename
        python = "3.12.15"
    else:
        raise ModelError("AI_MODEL_VERSION")
    try:
        plan = json.loads(path.read_text(encoding="utf-8"))
        encoded = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()
        if expected is not None and hashlib.sha256(encoded).hexdigest() != expected:
            raise ModelError("AI_MODEL_INTEGRITY")
        if plan["schemaVersion"] != 1 or plan["python"] != python or (expected is not None and plan["modelId"] != model_id):
            raise ModelError("AI_MODEL_VERSION")
        return plan
    except (OSError, ValueError, KeyError, TypeError) as cause:
        raise ModelError("AI_MODEL_INTEGRITY") from cause


def verify_model_file(path: Path, base: Path, expected: dict, *, max_bytes: int = 8 * 1024 * 1024) -> Path:
    resolved = path.resolve()
    if not extended_path(resolved).is_relative_to(extended_path(base)) or not resolved.is_file() or resolved.stat().st_size != expected["bytes"] or not 0 < expected["bytes"] <= max_bytes:
        raise ModelError("AI_MODEL_INTEGRITY")
    digest = hashlib.sha256()
    with resolved.open("rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            digest.update(block)
    if digest.hexdigest() != expected["sha256"]:
        raise ModelError("AI_MODEL_INTEGRITY")
    return resolved


def verified_basic_pitch_model() -> Path:
    plan = load_model_plan(PLAN_PATH, "basic-pitch")
    try:
        for artifact in plan["artifacts"]:
            if metadata.version(artifact["name"]) != artifact["version"]:
                raise ModelError("AI_MODEL_VERSION")
        distribution = metadata.distribution("basic-pitch")
    except metadata.PackageNotFoundError as cause:
        raise ModelError("AI_MODEL_MISSING") from cause
    models = plan.get("modelFiles", [])
    if len(models) != 1 or models[0]["path"] != "basic_pitch/saved_models/icassp_2022/nmp.onnx":
        raise ModelError("AI_MODEL_INTEGRITY")
    return verify_model_file(Path(distribution.locate_file(models[0]["path"])), Path(sys.prefix), models[0])
