"""닫힌 앱의 관리 데이터만 복원하며 기존 ZIP·파일과 중단 복구 기록을 보존합니다."""

import argparse
from contextlib import closing, contextmanager
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
from uuid import UUID, uuid4
import zipfile

import backup_local_data as backup


POINTER = ".local-restore.json"
MANAGED = ("guitarlab.sqlite", "guitarlab.sqlite-wal", "guitarlab.sqlite-shm",
           "projects", "input-calibrations.json", "settings/input-calibrations.json")
MAX_STATE_BYTES = 16 * 1024 * 1024
PHASES = ("PREPARED", "APPLYING", "ROLLING_BACK", "COMPLETED", "ROLLED_BACK")


def _error(code):
    return backup.BackupError(code)


def _root(root):
    if sys.platform != "win32":
        raise _error("BACKUP_WINDOWS_REQUIRED")
    if not root.is_absolute():
        raise _error("BACKUP_PATH_INVALID")
    backup.checked_path(root, root, directory=True)
    return root.resolve(strict=True)


def _root_hash(root):
    return hashlib.sha256(os.path.normcase(str(root)).encode("utf-8")).hexdigest()


def _kernel():
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                  ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    return kernel


@contextmanager
def _directories(paths):
    kernel = _kernel()
    handles = []
    try:
        for path in paths:
            backup.checked_path(path, path, directory=True)
            handle = kernel.CreateFileW(str(path), 0x80000000, 3, None, 3, 0x02200000, None)
            if handle == ctypes.c_void_p(-1).value:
                raise _error("RESTORE_STATE_INVALID")
            handles.append(handle)
            backup.checked_path(path, path, directory=True)
        yield
    finally:
        for handle in reversed(handles):
            kernel.CloseHandle(handle)


@contextmanager
def _exclusive(root):
    # Rust InstanceGuard의 열린 핸들과도 충돌하도록 공유를 허용하지 않습니다.
    path = root / ".app-instance.lock"
    if os.path.lexists(path):
        if backup.checked_path(root, path).st_size != 0:
            raise _error("RESTORE_STATE_INVALID")
    kernel = _kernel()
    handle = kernel.CreateFileW(str(path), 0xC0000000, 0, None, 4, 0x00200000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise _error("BACKUP_APP_RUNNING")
    try:
        if backup.checked_path(root, path).st_size != 0:
            raise _error("RESTORE_STATE_INVALID")
        yield
    finally:
        kernel.CloseHandle(handle)


def _read_json(root, path, limit=MAX_STATE_BYTES):
    if backup.checked_path(root, path).st_size > limit:
        raise _error("RESTORE_STATE_INVALID")
    def unique(items):
        result = {}
        for key, value in items:
            if key in result:
                raise _error("RESTORE_STATE_INVALID")
            result[key] = value
        return result
    with path.open("rb") as source:
        return json.loads(source.read(limit + 1), object_pairs_hook=unique)


def _write_json(path, value):
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True).encode("utf-8")
    if len(raw) > MAX_STATE_BYTES:
        raise _error("RESTORE_STATE_INVALID")
    temporary = path.parent / (".state-" + str(uuid4()) + ".tmp")
    with temporary.open("xb") as output:
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def _digest(root, path, progress):
    before = backup.checked_path(root, path)
    if before.st_size > backup.MAX_BYTES:
        raise _error("BACKUP_LIMIT_EXCEEDED")
    value = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(65536), b""):
            value.update(chunk)
            size += len(chunk)
            if size > backup.MAX_BYTES:
                raise _error("BACKUP_LIMIT_EXCEEDED")
            progress(0, 0)
    after = backup.checked_path(root, path)
    if (size != before.st_size or
            (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns)):
        raise _error("RESTORE_SOURCE_CHANGED")
    return {"path": path.relative_to(root).as_posix(), "bytes": size, "sha256": value.hexdigest()}


def _inventory(root, progress=lambda *_: None):
    files = backup.source_files(root)
    for name in MANAGED[:3]:
        if os.path.lexists(root / name):
            backup.checked_path(root, root / name)
            files.append(root / name)
    if len(files) >= backup.MAX_FILES:
        raise _error("BACKUP_LIMIT_EXCEEDED")
    result = []
    total = 0
    if len({path.relative_to(root).as_posix().casefold() for path in files}) != len(files):
        raise _error("RESTORE_STATE_INVALID")
    for path in sorted(files, key=lambda item: item.relative_to(root).as_posix().casefold()):
        item = _digest(root, path, progress)
        total += item["bytes"]
        if total > backup.MAX_BYTES:
            raise _error("BACKUP_LIMIT_EXCEEDED")
        result.append(item)
    return result


def _names(root):
    result = []
    for name in MANAGED:
        path = root / name
        if os.path.lexists(path):
            backup.checked_path(root, path, directory=name == "projects")
            result.append(name)
    return result


def _pointer(root, session_id):
    return {"schemaVersion": 1, "kind": "GUITARLAB_LOCAL_RESTORE",
            "recoveryId": session_id, "rootSha256": _root_hash(root)}


def _pending(root):
    pointer = _read_json(root, root / POINTER, 1024)
    if not isinstance(pointer, dict) or set(pointer) != {"schemaVersion", "kind", "recoveryId", "rootSha256"}:
        raise _error("RESTORE_STATE_INVALID")
    try:
        session_id = str(UUID(pointer["recoveryId"]))
    except (ValueError, TypeError, AttributeError):
        raise _error("RESTORE_STATE_INVALID") from None
    if type(pointer["schemaVersion"]) is not int or pointer != _pointer(root, session_id):
        raise _error("RESTORE_STATE_INVALID")
    vault = root.parent / (".guitarlab-restore-" + session_id)
    backup.checked_path(root.parent, vault, directory=True)
    state = _read_json(vault, vault / "state.json")
    fields = {"pointer", "phase", "originalNames", "incomingNames", "originalFiles", "incomingFiles",
              "saved", "installed", "action", "result"}
    if not isinstance(state, dict) or set(state) != fields or state["pointer"] != pointer or state["phase"] not in PHASES:
        raise _error("RESTORE_STATE_INVALID")
    if type(state["pointer"]["schemaVersion"]) is not int:
        raise _error("RESTORE_STATE_INVALID")
    for key in ("originalNames", "incomingNames", "saved", "installed"):
        names = state[key]
        if (not isinstance(names, list) or any(not isinstance(name, str) or name not in MANAGED for name in names)
                or len(set(names)) != len(names)):
            raise _error("RESTORE_STATE_INVALID")
        if names != [name for name in MANAGED if name in names]:
            raise _error("RESTORE_STATE_INVALID")
    if (any(name not in state["originalNames"] for name in state["saved"]) or
            any(name not in state["incomingNames"] for name in state["installed"]) or
            state["saved"] != state["originalNames"][:len(state["saved"])] or
            state["installed"] != state["incomingNames"][:len(state["installed"])]):
        raise _error("RESTORE_STATE_INVALID")
    if "guitarlab.sqlite" not in state["originalNames"] or "guitarlab.sqlite" not in state["incomingNames"]:
        raise _error("RESTORE_STATE_INVALID")
    for key in ("originalFiles", "incomingFiles"):
        items = state[key]
        if not isinstance(items, list) or len(items) >= backup.MAX_FILES:
            raise _error("RESTORE_STATE_INVALID")
        for item in items:
            if (not isinstance(item, dict) or set(item) != {"path", "bytes", "sha256"} or
                    type(item["bytes"]) is not int or not 0 <= item["bytes"] <= backup.MAX_BYTES or
                    not isinstance(item["sha256"], str) or len(item["sha256"]) != 64 or
                    any(c not in "0123456789abcdef" for c in item["sha256"])):
                raise _error("RESTORE_STATE_INVALID")
            path = backup.safe_member(item["path"])
            if item["path"] not in MANAGED and path.parts[0] != "projects":
                raise _error("RESTORE_STATE_INVALID")
        if len({item["path"].casefold() for item in items}) != len(items) or sum(item["bytes"] for item in items) > backup.MAX_BYTES:
            raise _error("RESTORE_STATE_INVALID")
    action = state["action"]
    if action is not None and (not isinstance(action, dict) or set(action) != {"kind", "name"} or
                               action["kind"] not in ("SAVE_OLD", "INSTALL_NEW", "REMOVE_NEW", "RESTORE_OLD") or
                               action["name"] not in MANAGED):
        raise _error("RESTORE_STATE_INVALID")
    if state["phase"] in ("PREPARED", "ROLLED_BACK") and (state["saved"] or state["installed"] or action is not None):
        raise _error("RESTORE_STATE_INVALID")
    if state["phase"] == "COMPLETED" and (state["saved"] != state["originalNames"] or
                                          state["installed"] != state["incomingNames"] or action is not None):
        raise _error("RESTORE_STATE_INVALID")
    backup.checked_path(vault, vault / "incoming", directory=True)
    backup.checked_path(vault, vault / "previous", directory=True)
    return vault, state


def _locations(root, vault, action):
    name = action["name"]
    return {"SAVE_OLD": (root / name, vault / "previous" / name),
            "INSTALL_NEW": (vault / "incoming" / name, root / name),
            "REMOVE_NEW": (root / name, vault / "incoming" / name),
            "RESTORE_OLD": (vault / "previous" / name, root / name)}[action["kind"]]


def _record_action(state, action):
    kind, name = action["kind"], action["name"]
    if kind in ("SAVE_OLD", "INSTALL_NEW"):
        field = "saved" if kind == "SAVE_OLD" else "installed"
        allowed = state["originalNames" if kind == "SAVE_OLD" else "incomingNames"]
        if name not in allowed or name in state[field]:
            raise _error("RESTORE_STATE_INVALID")
        state[field].append(name)
    else:
        field = "installed" if kind == "REMOVE_NEW" else "saved"
        if not state[field] or state[field][-1] != name:
            raise _error("RESTORE_STATE_INVALID")
        state[field].pop()
    state["action"] = None


def _move(root, vault, state, kind, name):
    action = {"kind": kind, "name": name}
    source, destination = _locations(root, vault, action)
    for parent in (source.parent, destination.parent):
        backup.checked_path(root.parent, parent, directory=True)
    backup.checked_path(root.parent, source, directory=name == "projects")
    if os.path.lexists(destination):
        raise _error("RESTORE_STATE_INVALID")
    # 기록과 이동 사이 종료도 다음 복구에서 두 경로를 대조해 판별합니다.
    state["action"] = action
    _write_json(vault / "state.json", state)
    os.rename(source, destination)
    _record_action(state, action)
    _write_json(vault / "state.json", state)


def _settle_action(root, vault, state):
    action = state["action"]
    if action is None:
        return
    source, destination = _locations(root, vault, action)
    source_exists, destination_exists = os.path.lexists(source), os.path.lexists(destination)
    if source_exists == destination_exists:
        raise _error("RESTORE_RECOVERY_REQUIRED")
    path = source if source_exists else destination
    backup.checked_path(root.parent, path, directory=action["name"] == "projects")
    if destination_exists:
        _record_action(state, action)
    else:
        state["action"] = None
    _write_json(vault / "state.json", state)


def _clear_pointer(root, state):
    if _read_json(root, root / POINTER, 1024) != state["pointer"]:
        raise _error("RESTORE_STATE_INVALID")
    (root / POINTER).unlink()


def _rollback(root, vault, state):
    _settle_action(root, vault, state)
    def selected(items, names):
        return [item for item in items if any(item["path"] == name or
                (name == "projects" and item["path"].startswith("projects/")) for name in names)]
    existing = selected(state["originalFiles"], [name for name in state["originalNames"] if name not in state["saved"]])
    current = sorted(existing + selected(state["incomingFiles"], state["installed"]), key=lambda item: item["path"].casefold())
    if (_inventory(root) != current or
            _inventory(vault / "previous") != selected(state["originalFiles"], state["saved"]) or
            _inventory(vault / "incoming") != selected(state["incomingFiles"], [name for name in state["incomingNames"] if name not in state["installed"]])):
        raise _error("RESTORE_RECOVERY_REQUIRED")
    state["phase"] = "ROLLING_BACK"
    _write_json(vault / "state.json", state)
    for name in list(reversed(state["installed"])):
        _move(root, vault, state, "REMOVE_NEW", name)
    for name in list(reversed(state["saved"])):
        _move(root, vault, state, "RESTORE_OLD", name)
    if _names(root) != state["originalNames"] or _inventory(root) != state["originalFiles"]:
        raise _error("RESTORE_RECOVERY_REQUIRED")
    state["phase"] = "ROLLED_BACK"
    _write_json(vault / "state.json", state)
    _clear_pointer(root, state)


def _result(state, applied):
    result = state["result"]
    if (not isinstance(result, dict) or set(result) != {"files", "bytes", "externalReferencesNotCopied"} or
            type(result["files"]) is not int or not 1 <= result["files"] < backup.MAX_FILES or
            type(result["bytes"]) is not int or not 1 <= result["bytes"] <= backup.MAX_BYTES or
            type(result["externalReferencesNotCopied"]) is not int or not 0 <= result["externalReferencesNotCopied"] <= 100000):
        raise _error("RESTORE_STATE_INVALID")
    return {"schemaVersion": 1, "state": "LOCAL_DATA_RESTORED" if applied else "LOCAL_DATA_ROLLED_BACK",
            "recoveryId": state["pointer"]["recoveryId"], **result, "appDataReplaced": applied}


def recover_closed_app(root, *, guard=backup.ensure_app_closed):
    root = _root(root)
    guard()
    with _exclusive(root), _directories((root.parent, root)):
        if not os.path.lexists(root / POINTER):
            return {"schemaVersion": 1, "state": "RESTORE_NOT_PENDING"}
        vault, state = _pending(root)
        result = _result(state, state["phase"] == "COMPLETED")
        parents = _restore_parents(root, vault, state)
        with _directories(parents):
            if state["phase"] == "COMPLETED":
                if _names(root) != state["incomingNames"] or _inventory(root) != state["incomingFiles"]:
                    raise _error("RESTORE_RECOVERY_REQUIRED")
                _clear_pointer(root, state)
            elif state["phase"] == "ROLLED_BACK":
                if _names(root) != state["originalNames"] or _inventory(root) != state["originalFiles"]:
                    raise _error("RESTORE_RECOVERY_REQUIRED")
                _clear_pointer(root, state)
            else:
                _rollback(root, vault, state)
        return result


def _restore_parents(root, vault, state):
    parents = [vault, vault / "incoming", vault / "previous"]
    if "settings/input-calibrations.json" in state["originalNames"] + state["incomingNames"]:
        parents.extend((root / "settings", vault / "incoming/settings", vault / "previous/settings"))
    return parents


def _apply_prepared(root, vault, state, guard, progress):
    parents = _restore_parents(root, vault, state)
    for path in parents:
        if not os.path.lexists(path):
            path.mkdir(exist_ok=False)
    with _directories(parents):
        _write_json(vault / "state.json", state)
        _write_json(vault / "pointer.json", state["pointer"])
        guard()
        progress(0, 0)
        if ("guitarlab.sqlite" not in state["originalNames"] or "guitarlab.sqlite" not in state["incomingNames"] or
                _inventory(root, progress) != state["originalFiles"]):
            raise _error("RESTORE_SOURCE_CHANGED")
        os.link(vault / "pointer.json", root / POINTER)
        try:
            state["phase"] = "APPLYING"
            _write_json(vault / "state.json", state)
            for name in state["originalNames"]:
                progress(0, 0)
                _move(root, vault, state, "SAVE_OLD", name)
            if _inventory(vault / "previous", progress) != state["originalFiles"]:
                raise _error("RESTORE_SOURCE_CHANGED")
            for name in state["incomingNames"]:
                progress(0, 0)
                _move(root, vault, state, "INSTALL_NEW", name)
            if _inventory(root, progress) != state["incomingFiles"] or _names(root) != state["incomingNames"]:
                raise _error("RESTORE_SOURCE_CHANGED")
            # 준비본은 WAL 없는 독립 snapshot이므로 검사가 sidecar를 새로 만들지 않게 합니다.
            database = root / "guitarlab.sqlite"
            with closing(sqlite3.connect(database.as_uri() + "?mode=ro&immutable=1", uri=True)) as db:
                backup.check_database(db)
            state["phase"] = "COMPLETED"
            _write_json(vault / "state.json", state)
        except (Exception, KeyboardInterrupt):
            try:
                # 메모리 상태가 아니라 마지막 내구 기록으로 모호한 이동부터 복구합니다.
                vault, state = _pending(root)
                _result(state, False)
                _rollback(root, vault, state)
            except (Exception, KeyboardInterrupt):
                raise _error("RESTORE_RECOVERY_REQUIRED") from None
            raise _error("RESTORE_ROLLED_BACK") from None
        _clear_pointer(root, state)
        return _result(state, True)


def restore_closed_app(root, archive, *, consent=False, confirm=False,
                       guard=backup.ensure_app_closed, progress=lambda *_: None):
    if not consent or not confirm:
        raise _error("RESTORE_CONSENT_REQUIRED")
    root = _root(root)
    guard()
    with _exclusive(root), _directories((root.parent, root)):
        if os.path.lexists(root / POINTER):
            raise _error("RESTORE_PENDING")
        if not archive.is_absolute():
            raise _error("BACKUP_PATH_INVALID")
        backup.checked_path(archive.parent, archive)
        session_id = str(uuid4())
        vault = root.parent / (".guitarlab-restore-" + session_id)
        vault.mkdir(exist_ok=False)
        backup.checked_path(root.parent, vault, directory=True)
        prepared = backup.restore_to_new_folder(archive, vault / "incoming", consent=True, progress=progress)
        backup.backup(root, vault / "previous.zip", consent=True, guard=guard, progress=progress)
        backup.verify(vault / "previous.zip", progress=progress)
        (vault / "previous").mkdir(exist_ok=False)
        state = {"pointer": _pointer(root, session_id), "phase": "PREPARED",
                 "originalNames": _names(root), "incomingNames": _names(vault / "incoming"),
                 "originalFiles": _inventory(root, progress), "incomingFiles": _inventory(vault / "incoming", progress),
                 "saved": [], "installed": [], "action": None,
                 "result": {name: prepared[name] for name in ("files", "bytes", "externalReferencesNotCopied")}}
        _result(state, False)
        return _apply_prepared(root, vault, state, guard, progress)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("restore", "recover"))
    parser.add_argument("root", type=Path)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--consent-local-data", action="store_true")
    parser.add_argument("--confirm-replace-current-data", action="store_true")
    args = parser.parse_args()
    try:
        if args.mode == "restore":
            if args.archive is None:
                parser.error("검사할 백업 ZIP이 필요합니다.")
            result = restore_closed_app(args.root, args.archive, consent=args.consent_local_data,
                                        confirm=args.confirm_replace_current_data)
        else:
            result = recover_closed_app(args.root)
        print(json.dumps(result))
    except (backup.BackupError, OSError, ValueError, TypeError, KeyError, sqlite3.Error,
            zipfile.BadZipFile, zipfile.LargeZipFile, KeyboardInterrupt) as cause:
        code = str(cause) if isinstance(cause, backup.BackupError) else "RESTORE_FAILED"
        print(json.dumps({"schemaVersion": 1, "state": "FAILED", "errorCode": code}))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
