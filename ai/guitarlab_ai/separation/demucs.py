"""고정된 로컬 safetensors만 사용하는 CPU 전체 기타 분리입니다."""
from contextlib import redirect_stderr, redirect_stdout
import hashlib
from importlib import import_module, metadata
import json
import os
from pathlib import Path
import sys
from threading import Event
from typing import Callable

from ..model_integrity import ModelError, verify_model_file, load_model_plan
from ..runtime import Canceled
from .wav import float_header, read_wav

PLAN_PATH = Path(__file__).resolve().parents[2] / "models/demucs-4.1.0-htdemucs-6s-windows-cp310.json"


def verified_demucs_model() -> tuple[Path, dict]:
    plan = load_model_plan(PLAN_PATH, "htdemucs_6s")
    try:
        for artifact in plan["artifacts"]:
            if metadata.version(artifact["name"]) != artifact["version"]:
                raise ModelError("AI_MODEL_VERSION")
    except metadata.PackageNotFoundError as cause:
        raise ModelError("AI_MODEL_MISSING") from cause
    base = Path(sys.prefix) / "models/htdemucs_6s"
    files = plan["modelFiles"]
    if [f["path"] for f in files] != ["5c90dfd2.safetensors", "htdemucs_6s.yaml"]:
        raise ModelError("AI_MODEL_INTEGRITY")
    for expected in files:
        verify_model_file(base / expected["path"], base, expected, max_bytes=64 * 1024 * 1024)
    return base / files[0]["path"], plan


def separate_wav(path: Path, allowed_root: Path, output_dir: Path, cancel: Event, progress) -> dict:
    return _separate_with_model(path,allowed_root,output_dir,cancel,progress,verified_demucs_model)


def _separate_with_model(path: Path, allowed_root: Path, output_dir: Path, cancel: Event, progress, resolve_model: Callable[[],tuple[Path,dict]]) -> dict:
    source = read_wav(path, allowed_root, cancel)
    work = output_dir.resolve()
    if not work.is_dir() or not work.is_relative_to(allowed_root.resolve()) or any((work / n).exists() for n in ("guitar.wav", "accompaniment.wav")):
        raise ModelError("AI_INPUT_INVALID")
    progress(0)
    model_path, plan = resolve_model()
    if cancel.is_set():
        raise Canceled()
    progress(10)
    # 오프라인 로컬 파일만 사용하며 타사 로그가 JSONL stdout에 섞이지 않게 합니다.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    outputs, created = [], []
    try:
        with open(os.devnull, "w", encoding="utf-8") as sink, redirect_stdout(sink), redirect_stderr(sink):
            np = import_module("numpy")
            torch = import_module("torch")
            samples = np.frombuffer(source.pcm, dtype="<f4" if source.floating else "<i2").astype("float32").reshape(-1, source.channels).T.copy()
            if not source.floating:
                samples /= 32768
            if not np.isfinite(samples).all():
                raise ModelError("AI_INPUT_INVALID")
            if cancel.is_set():
                raise Canceled()
            safe_open = import_module("safetensors").safe_open
            with safe_open(str(model_path), framework="pt") as file:
                info = file.metadata()
            if info.get("klass") != "demucs.htdemucs.HTDemucs" or "structure" in info or json.loads(info.get("args", "null")) != []:
                raise ModelError("AI_MODEL_INTEGRITY")
            torch.set_num_threads(min(4, os.cpu_count() or 1))
            model = import_module("demucs.hf").load_safetensors_model(model_path)
            if list(model.sources) != plan["sources"] or model.samplerate != 44100 or model.audio_channels != 2:
                raise ModelError("AI_MODEL_INTEGRITY")
            model.eval()
            audio = torch.from_numpy(samples)
            if source.channels == 1:
                audio = audio.repeat(2, 1)
            audio = import_module("julius").resample_frac(audio, source.sample_rate, 44100)
            if audio.shape != (2, source.frames * 44100 // source.sample_rate):
                raise ModelError("AI_OUTPUT_INVALID")
            mean = audio.mean(0).mean()
            scale = audio.mean(0).std()
            if not torch.isfinite(scale) or scale.item() < 1e-8:
                raise ModelError("AI_SEPARATION_EMPTY")
            progress(30)
            total = len(range(0, audio.shape[-1], int(0.75 * float(model.segment) * 44100)))
            completed = 0
            def callback(event):
                nonlocal completed
                if cancel.is_set():
                    raise Canceled()
                if event["state"] == "end":
                    completed += 1
                    progress(30 + 50 * completed // total)
            with torch.inference_mode():
                estimates = import_module("demucs.apply").apply_model(model, ((audio - mean) / scale)[None], shifts=0, split=True, overlap=0.25, device="cpu", num_workers=0, progress=False, callback=callback)
            if cancel.is_set():
                raise Canceled()
            if estimates.shape != (1, 6, 2, audio.shape[-1]) or not torch.isfinite(estimates).all():
                raise ModelError("AI_OUTPUT_INVALID")
            guitar = estimates[0, model.sources.index("guitar")] * scale + mean
            for name, role, tensor in (("guitar.wav", "GUITAR_FULL", guitar), ("accompaniment.wav", "ACCOMPANIMENT", audio - guitar)):
                if cancel.is_set():
                    raise Canceled()
                value = tensor.numpy()
                if not np.isfinite(value).all():
                    raise ModelError("AI_OUTPUT_INVALID")
                output = work / name
                digest = hashlib.sha256()
                with output.open("xb") as stream:
                    created.append(output)
                    header = float_header(value.shape[-1])
                    stream.write(header)
                    digest.update(header)
                    for index in range(0, value.shape[-1], 65536):
                        if cancel.is_set():
                            raise Canceled()
                        block = value[:, index:index + 65536].T.astype("<f4").tobytes()
                        stream.write(block)
                        digest.update(block)
                    stream.flush()
                    os.fsync(stream.fileno())
                outputs.append({"role": role, "path": str(output), "sha256": digest.hexdigest(), "peak": float(np.abs(value).max())})
        if cancel.is_set():
            raise Canceled()
        result = {"schemaVersion": 1, "inputSha256": hashlib.sha256(source.raw).hexdigest(),
                  "modelId": "htdemucs_6s", "modelVersion": "4.1.0", "modelRevision": plan["modelRevision"],
                  "weightsSha256": plan["modelFiles"][0]["sha256"], "sampleRate": 44100, "channels": 2,
                  "frames": int(audio.shape[-1]), "durationMs": audio.shape[-1] * 1000 / 44100,
                  "startOffsetMs": 0, "outputs": outputs}
        progress(100)
        return result
    except BaseException:
        for output in created:
            output.unlink(missing_ok=True)
        raise
