"""소유한 앱 잠금 아래 복원 준비·예약·취소·다음 시작 적용을 분리합니다."""

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from uuid import UUID, uuid4
import zipfile

import backup_local_data as backup
import restore_local_data as engine


REQUEST = ".local-restore-request.json"
ACTIVE = ("SCHEDULED", "APPLYING")
TERMINAL = ("COMPLETED", "ROLLED_BACK", "CANCELED", "FAILED")
ERRORS = (None, "RESTORE_ABORTED", "RESTORE_ROLLED_BACK", "RESTORE_PREPARATION_FAILED")
FIELDS = {"schemaVersion", "kind", "phase", "recoveryId", "rootSha256", "fingerprint",
          "files", "bytes", "externalReferencesNotCopied", "databaseVersion", "errorCode"}


def _hex(value):
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _id(value):
    try:
        if not isinstance(value, str) or str(UUID(value)) != value:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise engine._error("RESTORE_STATE_INVALID") from None
    return value


def _validate(root, value, *, prepared=False):
    if (not isinstance(value, dict) or set(value) != FIELDS or
            type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1 or
            value["kind"] != "GUITARLAB_LOCAL_RESTORE_REQUEST" or
            value["phase"] not in (("PREPARED",) if prepared else ACTIVE + TERMINAL) or
            value["rootSha256"] != engine._root_hash(root) or not _hex(value["fingerprint"]) or
            type(value["files"]) is not int or not 1 <= value["files"] < backup.MAX_FILES or
            type(value["bytes"]) is not int or not 1 <= value["bytes"] <= backup.MAX_BYTES or
            type(value["externalReferencesNotCopied"]) is not int or not 0 <= value["externalReferencesNotCopied"] <= 100000 or
            type(value["databaseVersion"]) is not int or value["databaseVersion"] not in (8, 9, 10) or
            value["errorCode"] not in ERRORS):
        raise engine._error("RESTORE_STATE_INVALID")
    _id(value["recoveryId"])
    if (value["phase"] in ("PREPARED", "SCHEDULED", "APPLYING", "COMPLETED", "CANCELED")
            and value["errorCode"] is not None):
        raise engine._error("RESTORE_STATE_INVALID")
    if value["phase"] == "FAILED" and value["errorCode"] not in ("RESTORE_ABORTED", "RESTORE_PREPARATION_FAILED"):
        raise engine._error("RESTORE_STATE_INVALID")
    if value["phase"] == "ROLLED_BACK" and value["errorCode"] != "RESTORE_ROLLED_BACK":
        raise engine._error("RESTORE_STATE_INVALID")
    return value


def status(root):
    if not os.path.lexists(root / REQUEST):
        return {"schemaVersion": 1, "state": "IDLE"}
    return _public(_validate(root, engine._read_json(root, root / REQUEST, 4096)))


def _public(value):
    return {"schemaVersion": 1, "state": value["phase"], "recoveryId": value["recoveryId"],
            **{name: value[name] for name in ("files", "bytes", "externalReferencesNotCopied", "databaseVersion", "errorCode")},
            "restartRequired": value["phase"] == "SCHEDULED"}


def _vault(root, recovery_id):
    path = root.parent / (".guitarlab-restore-" + _id(recovery_id))
    backup.checked_path(root.parent, path, directory=True)
    return path


def _fingerprint(root, value, files):
    contents = {key: value[key] for key in FIELDS - {"phase", "errorCode", "fingerprint"}}
    contents["incomingFiles"] = files
    return hashlib.sha256(json.dumps(contents, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _plan(root, recovery_id, fingerprint, progress=lambda *_: None):
    vault = _vault(root, recovery_id)
    value = _validate(root, engine._read_json(vault, vault / "request.json", 4096), prepared=True)
    if value["recoveryId"] != recovery_id or value["fingerprint"] != fingerprint:
        raise engine._error("RESTORE_SOURCE_CHANGED")
    files = engine._inventory(vault / "incoming", progress)
    if len(files) != value["files"] or sum(item["bytes"] for item in files) != value["bytes"] or _fingerprint(root, value, files) != fingerprint:
        raise engine._error("RESTORE_SOURCE_CHANGED")
    return vault, value, files


def _not_active(root):
    if os.path.lexists(root / engine.POINTER) or status(root)["state"] in ACTIVE:
        raise engine._error("RESTORE_PENDING")


def prepare(root, archive, *, consent=False, progress=lambda *_: None):
    if consent is not True:
        raise engine._error("RESTORE_CONSENT_REQUIRED")
    _not_active(root)
    if not archive.is_absolute() or archive.suffix.lower() != ".zip":
        raise engine._error("BACKUP_PATH_INVALID")
    backup.checked_path(archive.parent, archive)
    recovery_id = str(uuid4())
    vault = root.parent / (".guitarlab-restore-" + recovery_id)
    vault.mkdir(exist_ok=False)
    result = backup.restore_to_new_folder(archive, vault / "incoming", consent=True, progress=progress)
    with closing(backup.readonly_database(vault / "incoming/guitarlab.sqlite", immutable=True)) as db:
        version = backup.check_database(db)
        references = db.execute("SELECT COUNT(*) FROM project_assets WHERE storage='REFERENCE'").fetchone()[0]
    if references != result["externalReferencesNotCopied"]:
        raise engine._error("BACKUP_MANIFEST_INVALID")
    value = {"schemaVersion": 1, "kind": "GUITARLAB_LOCAL_RESTORE_REQUEST", "phase": "PREPARED",
             "recoveryId": recovery_id, "rootSha256": engine._root_hash(root), "fingerprint": "0" * 64,
             **{name: result[name] for name in ("files", "bytes", "externalReferencesNotCopied")},
             "databaseVersion": version, "errorCode": None}
    files = engine._inventory(vault / "incoming", progress)
    if len(files) != value["files"] or sum(item["bytes"] for item in files) != value["bytes"]:
        raise engine._error("RESTORE_SOURCE_CHANGED")
    value["fingerprint"] = _fingerprint(root, value, files)
    engine._write_json(vault / "request.json", _validate(root, value, prepared=True))
    return {**_public(value), "fingerprint": value["fingerprint"]}


def schedule(root, recovery_id, fingerprint, progress=lambda *_: None):
    _not_active(root)
    _, value, _ = _plan(root, recovery_id, fingerprint, progress)
    progress(0, 0)
    # 마지막 취소 지점 이후에는 예약의 실제 상태를 조회해야 합니다.
    value = {**value, "phase": "SCHEDULED"}
    engine._write_json(root / REQUEST, value)
    return _public(value)


def cancel(root, recovery_id):
    value = _validate(root, engine._read_json(root, root / REQUEST, 4096))
    if value["phase"] != "SCHEDULED" or value["recoveryId"] != _id(recovery_id) or os.path.lexists(root / engine.POINTER):
        raise engine._error("RESTORE_NOT_CANCELABLE")
    value = {**value, "phase": "CANCELED"}
    engine._write_json(root / REQUEST, value)
    return _public(value)


def _finish(root, value, phase, code=None):
    value = {**value, "phase": phase, "errorCode": code}
    engine._write_json(root / REQUEST, _validate(root, value))
    return _public(value)


def _same_plan(root, value):
    vault = _vault(root, value["recoveryId"])
    plan = _validate(root, engine._read_json(vault, vault / "request.json", 4096), prepared=True)
    if {**value, "phase": "PREPARED", "errorCode": None} != plan:
        raise engine._error("RESTORE_STATE_INVALID")
    return vault


def startup(root):
    value = None
    if os.path.lexists(root / REQUEST):
        value = _validate(root, engine._read_json(root, root / REQUEST, 4096))
    if os.path.lexists(root / engine.POINTER):
        if value is not None:
            if value["phase"] != "APPLYING":
                raise engine._error("RESTORE_RECOVERY_REQUIRED")
            vault = _same_plan(root, value)
            actual_vault, _ = engine._pending(root)
            if actual_vault != vault:
                raise engine._error("RESTORE_RECOVERY_REQUIRED")
        result = engine._recover_owned(root)
        if value is None:
            return result
        applied = result["appDataReplaced"]
        return _finish(root, value, "COMPLETED" if applied else "ROLLED_BACK",
                       None if applied else "RESTORE_ROLLED_BACK")
    if value is None:
        return {"schemaVersion": 1, "state": "IDLE"}
    if value["phase"] in TERMINAL:
        return _public(value)
    vault = _same_plan(root, value)
    if value["phase"] == "APPLYING":
        # 완료 기록과 root 포인터 해제 사이 종료도 반복 적용하지 않습니다.
        if os.path.lexists(vault / "state.json"):
            state = engine._read_state(root, vault, engine._pointer(root, value["recoveryId"]))
            if state["phase"] in ("COMPLETED", "ROLLED_BACK", "PREPARED"):
                applied = state["phase"] == "COMPLETED"
                expected = "incoming" if applied else "original"
                if engine._names(root) != state[expected + "Names"] or engine._inventory(root) != state[expected + "Files"]:
                    raise engine._error("RESTORE_RECOVERY_REQUIRED")
                if state["phase"] == "PREPARED":
                    return _finish(root, value, "FAILED", "RESTORE_ABORTED")
                return _finish(root, value, "COMPLETED" if applied else "ROLLED_BACK",
                               None if applied else "RESTORE_ROLLED_BACK")
            raise engine._error("RESTORE_RECOVERY_REQUIRED")
        backup.checked_path(root, root / "guitarlab.sqlite")
        return _finish(root, value, "FAILED", "RESTORE_ABORTED")
    try:
        _, _, files = _plan(root, value["recoveryId"], value["fingerprint"])
        engine._write_json(root / REQUEST, {**value, "phase": "APPLYING"})
        engine._apply_incoming(root, vault, value, expected_files=files)
    except Exception as cause:
        if os.path.lexists(root / engine.POINTER):
            raise engine._error("RESTORE_RECOVERY_REQUIRED") from None
        if isinstance(cause, backup.BackupError) and str(cause) == "RESTORE_ROLLED_BACK":
            return _finish(root, value, "ROLLED_BACK", "RESTORE_ROLLED_BACK")
        # 교체 완료 뒤 결과 기록 실패를 적용 전 실패로 해석하지 않습니다.
        if os.path.lexists(vault / "state.json"):
            state = engine._read_state(root, vault, engine._pointer(root, value["recoveryId"]))
            if state["phase"] != "PREPARED":
                raise engine._error("RESTORE_RECOVERY_REQUIRED") from None
        return _finish(root, value, "FAILED", "RESTORE_PREPARATION_FAILED")
    return _finish(root, value, "COMPLETED")


def worker():
    try:
        if len(sys.argv) < 3:
            raise engine._error("RESTORE_STATE_INVALID")
        mode, root = sys.argv[1], engine._root(Path(sys.argv[2]))
        engine._require_inherited_lock(root)
        last_progress = 0.0
        def progress(done, total):
            nonlocal last_progress
            if time.monotonic() - last_progress >= 0.1:
                print(json.dumps({"schemaVersion": 1, "state": "PROGRESS", "completedBytes": done, "totalBytes": total}), flush=True)
                last_progress = time.monotonic()
        with engine._directories((root.parent, root)):
            if mode == "prepare" and len(sys.argv) == 4:
                result = prepare(root, Path(sys.argv[3]), consent=True, progress=progress)
            elif mode == "schedule" and len(sys.argv) == 5:
                result = schedule(root, sys.argv[3], sys.argv[4], progress)
            elif mode == "cancel" and len(sys.argv) == 4:
                result = cancel(root, sys.argv[3])
            elif mode == "startup" and len(sys.argv) == 3:
                result = startup(root)
            else:
                raise engine._error("RESTORE_STATE_INVALID")
        print(json.dumps(result), flush=True)
    except (backup.BackupError, OSError, ValueError, TypeError, KeyError, sqlite3.Error,
            zipfile.BadZipFile, zipfile.LargeZipFile, KeyboardInterrupt) as cause:
        code = str(cause) if isinstance(cause, backup.BackupError) else "RESTORE_RECOVERY_REQUIRED"
        print(json.dumps({"schemaVersion": 1, "state": "FAILED", "errorCode": code}), flush=True)
        raise SystemExit(1) from None
