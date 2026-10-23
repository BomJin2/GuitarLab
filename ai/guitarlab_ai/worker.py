"""한 작업을 처리하는 로컬 JSONL 개발 worker입니다."""
import json
import sys
from threading import Event, Lock, Thread
from uuid import UUID
from .ipc import PROTOCOL_VERSION
from .runtime import Canceled, inspect_runtime
from .model_integrity import ModelError
from .ipc.control import control_reader

MAX_LINE = 65536


def parse_line(line: bytes) -> dict:
    if len(line) > MAX_LINE or not line.endswith(b"\n"):
        raise ValueError("메시지 크기 또는 줄 구분 오류")
    def invalid_number(_):
        raise ValueError("유한하지 않은 숫자")
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("중복 키")
            result[key] = value
        return result
    value = json.loads(line.decode("utf-8"), parse_constant=invalid_number, object_pairs_hook=unique_keys)
    if not isinstance(value, dict) or type(value.get("protocolVersion")) is not int or value["protocolVersion"] != PROTOCOL_VERSION:
        raise ValueError("계약 버전 오류")
    job_id = value.get("jobId")
    if not isinstance(job_id, str) or str(UUID(job_id)) != job_id:
        raise ValueError("작업 ID 오류")
    expected = {"protocolVersion", "type", "jobId"}
    if value.get("type") == "start":
        expected.add("action")
        if value.get("action") == "transcribe":
            expected.update(("input", "options"))
            source, options = value.get("input"), value.get("options")
            if not isinstance(source, dict) or set(source) != {"assetPath", "workDir"} or any(not isinstance(v, str) or not 0 < len(v) <= 4096 for v in source.values()):
                raise ValueError("작업 입력 오류")
            if not isinstance(options, dict) or set(options) != {"tuningMidi", "syncAnchors", "grid"} or type(options["grid"]) is not int or options["grid"] not in (60,120,240,480,960):
                raise ValueError("작업 옵션 오류")
            tuning, anchors = options["tuningMidi"], options["syncAnchors"]
            if not isinstance(tuning, list) or len(tuning) != 6 or any(type(p) is not int or not 0 <= p <= 127 for p in tuning) or not isinstance(anchors, list) or not 2 <= len(anchors) <= 256:
                raise ValueError("튜닝/앵커 오류")
            for anchor in anchors:
                if not isinstance(anchor, dict) or set(anchor) != {"scoreTick", "audioTimeMs"} or type(anchor["scoreTick"]) is not int or not 0 <= anchor["scoreTick"] <= 100000000 or not isinstance(anchor["audioTimeMs"], (int, float)) or isinstance(anchor["audioTimeMs"], bool) or not 0 <= anchor["audioTimeMs"] <= 86400000:
                    raise ValueError("시간 앵커 오류")
            if any(a["scoreTick"] >= b["scoreTick"] or a["audioTimeMs"] >= b["audioTimeMs"] for a,b in zip(anchors, anchors[1:])):
                raise ValueError("앵커 순서 오류")
        elif value.get("action") == "separate":
            expected.add("input")
            source = value.get("input")
            if not isinstance(source, dict) or set(source) != {"assetPath", "workDir"} or any(not isinstance(v, str) or not 0 < len(v) <= 4096 for v in source.values()):
                raise ValueError("작업 입력 오류")
        elif value.get("action") == "verify_model":
            expected.add("modelId")
            if value.get("modelId") not in ("basic-pitch", "htdemucs_6s"):
                raise ValueError("미지원 모델")
        elif value.get("action") == "download_model":
            expected.update(("modelId", "input"))
            source = value.get("input")
            if value.get("modelId") not in ("basic-pitch", "htdemucs_6s") or not isinstance(source, dict) or set(source) != {"cacheDir", "workDir"} or any(not isinstance(v, str) or not 0 < len(v) <= 4096 for v in source.values()):
                raise ValueError("다운로드 입력 오류")
        elif value.get("action") in ("prepare_install", "activate_install", "discard_install"):
            expected.update(("modelId", "input"))
            source = value.get("input")
            if value.get("modelId") not in ("basic-pitch", "htdemucs_6s") or not isinstance(source, dict) or set(source) != {"appDataRoot", "environmentId"} or not isinstance(source["appDataRoot"], str) or not 0 < len(source["appDataRoot"]) <= 4096 or not isinstance(source["environmentId"], str) or str(UUID(source["environmentId"])) != source["environmentId"]:
                raise ValueError("설치 입력 오류")
        elif value.get("action") == "check_install":
            expected.add("modelId")
            if value.get("modelId") not in ("basic-pitch", "htdemucs_6s"):
                raise ValueError("미지원 모델")
        elif value.get("action") != "inspect":
            raise ValueError("미지원 작업")
    elif value.get("type") != "cancel":
        raise ValueError("미지원 메시지")
    if set(value) != expected:
        raise ValueError("알 수 없는 필드")
    return value


def serve(input_stream, output_stream, inspect=inspect_runtime) -> int:
    # Windows 수치 라이브러리는 메인 스레드에서 로드하고 취소 입력만 별도로 받습니다.
    input_stream = getattr(input_stream, "raw", input_stream)
    lock = Lock()
    cancel = Event()
    protocol_error = Event()
    done = Event()
    read_control = control_reader(input_stream, done, MAX_LINE + 1)
    def emit(job_id, kind, **fields):
        event = {"protocolVersion": PROTOCOL_VERSION, "type": kind, "jobId": job_id, **fields}
        payload = json.dumps(event, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
        with lock:
            output_stream.write(payload)
            output_stream.flush()
    try:
        first = parse_line(input_stream.readline(MAX_LINE + 1))
        if first["type"] != "start":
            raise ValueError("시작 메시지 필요")
    except (ValueError, UnicodeError, TypeError):
        # 유효한 jobId가 없으므로 경로/원문을 출력하지 않고 종료 코드로 알립니다.
        return 2
    job_id = first["jobId"]
    def run():
        try:
            stage = {"transcribe": "transcription", "separate": "separation", "inspect": "environment", "verify_model": "environment", "download_model": "download",
                     "prepare_install": "installation", "activate_install": "installation", "discard_install": "installation", "check_install": "installation"}[first["action"]]
            progress = lambda percent: emit(job_id, "progress", stage=stage, percent=percent)
            if first["action"] == "transcribe":
                from .transcription.job import transcribe_job
                result = transcribe_job(first, cancel, progress)
            elif first["action"] == "separate":
                from .separation.job import separate_job
                result = separate_job(first, cancel, progress)
            elif first["action"] == "verify_model":
                from .installation import verify_installation
                result = verify_installation(first["modelId"], cancel, progress)
            elif first["action"] == "download_model":
                from pathlib import Path
                from .model_cache import download_cache
                result = download_cache(Path(first["input"]["cacheDir"]), Path(first["input"]["workDir"]), cancel, progress, first["modelId"])
            elif first["action"] in ("prepare_install", "activate_install", "discard_install", "check_install"):
                from pathlib import Path
                from .install_managed import prepare, activate, discard, _self_test
                progress(0)
                if first["action"] == "check_install":
                    from .install_managed import model_settings
                    _self_test(first['modelId'], cancel)
                    result = {"schemaVersion": 1, "modelId": first['modelId'], "modelVersion": model_settings(first['modelId'])['version'], "state": "SELF_TEST_PASSED"}
                else:
                    source = first["input"]
                    root, environment_id = Path(source["appDataRoot"]), source["environmentId"]
                    if first["action"] == "prepare_install":
                        result = prepare(root, cancel, lambda _: None, environment_id, first['modelId'])
                    elif first["action"] == "activate_install":
                        result = activate(root, environment_id, cancel, first['modelId'])
                    else:
                        result = discard(root, environment_id, first['modelId'])
                progress(100)
            else:
                result = inspect(cancel, progress)
            if cancel.is_set():
                raise Canceled()
            emit(job_id, "completed", result=result)
        except Canceled:
            if protocol_error.is_set():
                emit(job_id, "failed", error={"code": "AI_PROTOCOL_INVALID", "message": "작업 메시지가 올바르지 않습니다."})
            else:
                emit(job_id, "canceled")
        except ModelError as cause:
            emit(job_id, "failed", error={"code": cause.code, "message": "로컬 모델 분석을 완료하지 못했습니다."})
        except Exception:
            emit(job_id, "failed", error={"code": "AI_WORKER_FAILED", "message": "AI 작업을 완료하지 못했습니다."})
    def control():
        try:
            line = read_control()
            if done.is_set():
                return
            if not line:
                cancel.set()
                return
            message = parse_line(line)
            if message["type"] != "cancel" or message["jobId"] != job_id:
                raise ValueError("현재 작업의 취소만 허용")
            cancel.set()
        except (ValueError, UnicodeError, TypeError, OSError):
            protocol_error.set()
            cancel.set()
    # raw 입력은 인터프리터 종료 시 BufferedReader 잠금 교착을 만들지 않습니다.
    Thread(target=control, daemon=True).start()
    try:
        run()
    finally:
        done.set()
    return 2 if protocol_error.is_set() else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="strict")
    raise SystemExit(serve(sys.stdin.buffer, sys.stdout))
