"""고정 로컬 데이터를 새 ZIP/새 복원 폴더에 보존합니다. 실제 AppData 교체·삭제는 수행하지 않습니다."""

import argparse
import ctypes
from ctypes import wintypes
from contextlib import closing
import hashlib
import json
import ntpath
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import shutil
import sqlite3
import stat
import sys
import tempfile
from threading import Event, Thread
import time
import zipfile

MAX_BYTES = 2 * 1024 * 1024 * 1024
MAX_FILES = 10000


class BackupError(Exception):
    pass


def ensure_app_closed():
    if sys.platform != "win32":
        raise BackupError("BACKUP_WINDOWS_REQUIRED")
    # Toolhelp의 프로세스 이름만 조회하며 인수·사용자 경로·오디오를 읽지 않습니다.
    class ProcessEntry(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("usage", wintypes.DWORD), ("pid", wintypes.DWORD),
                    ("heap", ctypes.c_size_t), ("module", wintypes.DWORD), ("threads", wintypes.DWORD),
                    ("parent", wintypes.DWORD), ("priority", wintypes.LONG), ("flags", wintypes.DWORD),
                    ("exe", wintypes.WCHAR * 260)]
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)]
    kernel.Process32FirstW.restype = wintypes.BOOL
    kernel.Process32NextW.argtypes = kernel.Process32FirstW.argtypes
    kernel.Process32NextW.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateToolhelp32Snapshot(2, 0)
    if handle == ctypes.c_void_p(-1).value:
        raise BackupError("BACKUP_PROCESS_CHECK_FAILED")
    try:
        entry = ProcessEntry()
        entry.size = ctypes.sizeof(entry)
        valid = kernel.Process32FirstW(handle, ctypes.byref(entry))
        if not valid:
            raise BackupError("BACKUP_PROCESS_CHECK_FAILED")
        while valid:
            if entry.exe.casefold() == "guitarlab.exe":
                raise BackupError("BACKUP_APP_RUNNING")
            valid = kernel.Process32NextW(handle, ctypes.byref(entry))
        if ctypes.get_last_error() != 18:
            raise BackupError("BACKUP_PROCESS_CHECK_FAILED")
    finally:
        kernel.CloseHandle(handle)


def safe_member(name):
    if not isinstance(name, str):
        raise BackupError("BACKUP_PATH_INVALID")
    path = PurePosixPath(name)
    if (not path.parts or not name or len(name) > 512 or "\\" in name or ":" in name or
            path.is_absolute() or path.as_posix() != name or any(part in (".", "..") for part in path.parts)):
        raise BackupError("BACKUP_PATH_INVALID")
    reserved = getattr(ntpath, "isreserved", None)
    for part in path.parts:
        is_reserved = reserved(part) if reserved is not None else PureWindowsPath(part).is_reserved()
        if (part.endswith((".", " ")) or len(part) > 255 or is_reserved or
                any(ord(char) < 32 or char in '<>"|?*' for char in part)):
            raise BackupError("BACKUP_PATH_INVALID")
    return path


def checked_path(root, path, *, directory=False):
    relative = path.relative_to(root)
    current = root
    for part in (None, *relative.parts):
        if part is not None:
            current = current / part
        info = current.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise BackupError("BACKUP_LINK_NOT_ALLOWED")
    # AppData 리디렉션도 같은 실제 루트를 기준으로 비교하되 위 링크 검사는 유지합니다.
    canonical_root = root.resolve(strict=True)
    if not path.resolve(strict=True).is_relative_to(canonical_root) or not (path.is_dir() if directory else path.is_file()):
        raise BackupError("BACKUP_PATH_INVALID")
    return info


def source_files(root):
    files = []
    visited = 0
    pending = [root / "projects"] if (root / "projects").exists() else []
    while pending:
        folder = pending.pop()
        visited += 1
        if visited > MAX_FILES:
            raise BackupError("BACKUP_LIMIT_EXCEEDED")
        safe_member(folder.relative_to(root).as_posix())
        checked_path(root, folder, directory=True)
        for path in sorted(folder.iterdir()):
            # 먼저 링크 검사를 하므로 디렉터리 링크를 따라가지 않습니다.
            info = path.lstat()
            checked_path(root, path, directory=stat.S_ISDIR(info.st_mode))
            if stat.S_ISDIR(info.st_mode):
                pending.append(path)
            else:
                files.append(path)
            if len(files) + len(pending) > MAX_FILES:
                raise BackupError("BACKUP_LIMIT_EXCEEDED")
    calibration = root / "input-calibrations.json"
    if calibration.exists():
        checked_path(root, calibration)
        files.append(calibration)
    for path in files:
        safe_member(path.relative_to(root).as_posix())
    return sorted(files)


def readonly_database(path):
    # SQLite URI는 Windows 확장 드라이브 접두사를 authority로 오인합니다.
    if sys.platform == "win32" and len(path.drive) == 6 and path.drive.startswith("\\\\?\\"):
        path = Path(str(path)[4:])
    return sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)


def check_database(db):
    version = db.execute("PRAGMA user_version").fetchone()[0]
    if version not in (8, 9):
        raise BackupError("BACKUP_DATABASE_VERSION")
    if db.execute("PRAGMA quick_check").fetchall() != [("ok",)] or db.execute("PRAGMA foreign_key_check").fetchone() is not None:
        raise BackupError("BACKUP_DATABASE_INVALID")
    if db.execute("SELECT COUNT(*) FROM recorded_takes WHERE state IN ('ARMING','RECORDING','FINALIZING')").fetchone()[0]:
        raise BackupError("BACKUP_RECORDING_ACTIVE")
    if version == 9:
        db.execute("SELECT project_id,trash_id,trashed_at_ms,project_revision FROM project_trash LIMIT 0")
    return version


def backup(root, destination, *, consent=False, guard=ensure_app_closed, progress=lambda *_: None):
    if not consent:
        raise BackupError("BACKUP_CONSENT_REQUIRED")
    if not root.is_absolute() or not destination.is_absolute() or destination.suffix.lower() != ".zip":
        raise BackupError("BACKUP_PATH_INVALID")
    checked_path(root, root, directory=True)
    root = root.resolve(strict=True)
    parent = destination.parent.resolve(strict=True)
    if parent.is_relative_to(root) or os.path.lexists(destination):
        raise BackupError("BACKUP_DESTINATION_INVALID")
    destination = parent / destination.name
    guard()
    database = root / "guitarlab.sqlite"
    checked_path(root, database)
    for suffix in ("-wal", "-shm"):
        sidecar = root / ("guitarlab.sqlite" + suffix)
        if os.path.lexists(sidecar):
            checked_path(root, sidecar)
    files = source_files(root)
    total = database.stat().st_size + sum(path.stat().st_size for path in files)
    if len(files) + 2 > MAX_FILES or total > MAX_BYTES or database.stat().st_size > 128 * 1024 * 1024:
        raise BackupError("BACKUP_LIMIT_EXCEEDED")
    if shutil.disk_usage(parent).free < total + database.stat().st_size + 16 * 1024 * 1024:
        raise BackupError("DISK_SPACE_LOW")
    identity = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in [database, *files]}
    with tempfile.TemporaryDirectory(prefix=".guitarlab-backup-", dir=parent) as folder:
        staging = Path(folder)
        snapshot = staging / "guitarlab.sqlite"
        with closing(readonly_database(database)) as original, closing(sqlite3.connect(snapshot)) as copy:
            check_database(original)
            original.backup(copy, pages=128, progress=lambda *_: progress(0, total), sleep=0.01)
            database_version = check_database(copy)
            references = copy.execute("SELECT COUNT(*) FROM project_assets WHERE storage='REFERENCE'").fetchone()[0]
        part = staging / "backup.zip"
        receipt = {"schemaVersion": 1, "kind": "GUITARLAB_LOCAL_BACKUP", "databaseVersion": database_version,
                   "includesLocalMedia": True, "externalReferencesNotCopied": references,
                   "modelsIncluded": False, "files": []}
        completed = 0
        with zipfile.ZipFile(part, "x", compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
            for path in [snapshot, *files]:
                relative = "guitarlab.sqlite" if path == snapshot else path.relative_to(root).as_posix()
                checked_path(staging if path == snapshot else root, path)
                digest = hashlib.sha256()
                count = 0
                with path.open("rb") as source, archive.open(relative, "w") as output:
                    for chunk in iter(lambda: source.read(65536), b""):
                        count += len(chunk)
                        completed += len(chunk)
                        if completed > MAX_BYTES:
                            raise BackupError("BACKUP_LIMIT_EXCEEDED")
                        output.write(chunk)
                        digest.update(chunk)
                        progress(completed, max(total, completed))
                receipt["files"].append({"path": relative, "bytes": count, "sha256": digest.hexdigest()})
            archive.writestr("backup-manifest.json", json.dumps(receipt, ensure_ascii=False, allow_nan=False).encode())
        for path, before in identity.items():
            checked_path(root, path)
            if before != (path.stat().st_size, path.stat().st_mtime_ns):
                raise BackupError("BACKUP_SOURCE_CHANGED")
        if source_files(root) != files:
            raise BackupError("BACKUP_SOURCE_CHANGED")
        guard()
        verify(part, progress=lambda *_: progress(completed, max(total, completed)))
        with part.open("r+b") as output:
            os.fsync(output.fileno())
        # 새 이름에만 게시하며 동시 생성된 목적지도 원자적으로 보존합니다.
        os.link(part, destination)
    return {"schemaVersion": 1, "state": "COMPLETED", "files": len(receipt["files"]), "bytes": completed,
            "externalReferencesNotCopied": references, "restoreSupported": False}


def verify(path, *, extract_to=None, progress=lambda *_: None):
    if not path.is_file() or path.stat().st_size > MAX_BYTES + 16 * 1024 * 1024:
        raise BackupError("BACKUP_LIMIT_EXCEEDED")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_FILES or len({entry.filename.casefold() for entry in entries}) != len(entries):
            raise BackupError("BACKUP_MANIFEST_INVALID")
        for entry in entries:
            safe_member(entry.filename)
            if entry.filename not in ("guitarlab.sqlite", "input-calibrations.json", "backup-manifest.json") and not entry.filename.startswith("projects/"):
                raise BackupError("BACKUP_MANIFEST_INVALID")
            if entry.compress_type != zipfile.ZIP_STORED or entry.flag_bits & 1 or entry.is_dir() or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG):
                raise BackupError("BACKUP_MANIFEST_INVALID")
        manifest = archive.getinfo("backup-manifest.json")
        if manifest.file_size > 4 * 1024 * 1024 or sum(e.file_size for e in entries) > MAX_BYTES:
            raise BackupError("BACKUP_LIMIT_EXCEEDED")
        receipt = json.loads(archive.read(manifest))
        if (not isinstance(receipt, dict) or len(receipt) != 7 or type(receipt.get("schemaVersion")) is not int or receipt.get("schemaVersion") != 1 or receipt.get("kind") != "GUITARLAB_LOCAL_BACKUP" or
                type(receipt.get("databaseVersion")) is not int or receipt["databaseVersion"] not in (8, 9) or receipt.get("modelsIncluded") is not False or
                receipt.get("includesLocalMedia") is not True or type(receipt.get("externalReferencesNotCopied")) is not int or not 0 <= receipt["externalReferencesNotCopied"] <= 100000 or not isinstance(receipt.get("files"), list) or
                any(not isinstance(item, dict) or set(item) != {"path", "bytes", "sha256"} or not isinstance(item["path"], str) or type(item["bytes"]) is not int or not 0 <= item["bytes"] <= MAX_BYTES or not isinstance(item["sha256"], str) or len(item["sha256"]) != 64 or any(c not in "0123456789abcdef" for c in item["sha256"]) for item in receipt["files"]) or
                len(receipt["files"]) + 1 != len(entries) or
                {item["path"] for item in receipt["files"]} != {entry.filename for entry in entries if entry.filename != "backup-manifest.json"} or
                "guitarlab.sqlite" not in {item["path"] for item in receipt["files"]}):
            raise BackupError("BACKUP_MANIFEST_INVALID")
        total = sum(item["bytes"] for item in receipt["files"])
        completed = 0
        for item in receipt["files"]:
            digest = hashlib.sha256()
            database_header = bytearray()
            entry = archive.getinfo(item["path"])
            if entry.file_size != item["bytes"]:
                raise BackupError("BACKUP_HASH_INVALID")
            output = None
            try:
                if extract_to is not None:
                    destination = extract_to.joinpath(*PurePosixPath(entry.filename).parts)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    checked_path(extract_to, destination.parent, directory=True)
                    output = destination.open("xb")
                with archive.open(entry) as source:
                    for chunk in iter(lambda: source.read(65536), b""):
                        if item["path"] == "guitarlab.sqlite" and len(database_header) < 64:
                            database_header.extend(chunk[:64 - len(database_header)])
                        completed += len(chunk)
                        digest.update(chunk)
                        if output is not None:
                            output.write(chunk)
                        progress(completed, total)
                if output is not None:
                    output.flush()
                    os.fsync(output.fileno())
            finally:
                if output is not None:
                    output.close()
            if digest.hexdigest() != item["sha256"]:
                raise BackupError("BACKUP_HASH_INVALID")
            if item["path"] == "guitarlab.sqlite":
                # SQLite 공식 파일 형식의 offset60 user_version을 전체 지문 검사와 함께 대조합니다.
                if (len(database_header) != 64 or database_header[:16] != b"SQLite format 3\x00"
                        or int.from_bytes(database_header[60:64], "big") != receipt["databaseVersion"]):
                    raise BackupError("BACKUP_DATABASE_VERSION")
    return {"schemaVersion": 1, "state": "VERIFIED", "files": len(receipt["files"]), "bytes": total,
            "externalReferencesNotCopied": receipt["externalReferencesNotCopied"], "restoreSupported": False}


def restore_to_new_folder(archive, destination, *, consent=False, progress=lambda *_: None):
    if not consent:
        raise BackupError("BACKUP_CONSENT_REQUIRED")
    if sys.platform != "win32":
        raise BackupError("BACKUP_WINDOWS_REQUIRED")
    if not destination.is_absolute() or os.path.lexists(destination):
        raise BackupError("BACKUP_DESTINATION_INVALID")
    parent = destination.parent.resolve(strict=True)
    destination = parent / destination.name
    verify(archive, progress=lambda _, total: progress(0, total))
    with zipfile.ZipFile(archive) as source:
        total = sum(entry.file_size for entry in source.infolist())
    if shutil.disk_usage(parent).free < total + 16 * 1024 * 1024:
        raise BackupError("DISK_SPACE_LOW")
    with tempfile.TemporaryDirectory(prefix=".guitarlab-restore-", dir=parent) as folder:
        staging = Path(folder)
        restored = staging / "restored"
        restored.mkdir()
        result = verify(archive, extract_to=restored, progress=progress)
        with closing(readonly_database(restored / "guitarlab.sqlite")) as database:
            check_database(database)
        progress(result["bytes"], result["bytes"])
        # Windows rename은 새 목적지만 허용합니다. 실제 AppData 교체는 하지 않습니다.
        os.rename(restored, destination)
    return {**result, "state": "RESTORED_TO_NEW_FOLDER", "appDataReplaced": False, "restoreSupported": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("backup", "verify", "restore-preview", "app-backup", "app-verify", "app-preview"))
    parser.add_argument("path", type=Path)
    parser.add_argument("--destination", type=Path)
    parser.add_argument("--consent-local-media-and-private-metadata", action="store_true",
                        help="개인 녹음·메모·외부 경로를 포함한 로컬 메타데이터의 백업에 동의")
    arguments = parser.parse_args()
    integrated = arguments.mode in ("app-backup", "app-verify", "app-preview")
    cancel = Event()
    last_progress = 0.0
    def report(done, total):
        nonlocal last_progress
        if cancel.is_set():
            raise BackupError("CANCELED")
        if time.monotonic() - last_progress >= 0.1:
            print(json.dumps({"schemaVersion": 1, "state": "PROGRESS", "completedBytes": done, "totalBytes": total}), flush=True)
            last_progress = time.monotonic()
    if integrated:
        global MAX_BYTES
        MAX_BYTES = 256 * 1024 * 1024
        def read_cancel():
            line = os.read(0, 64)
            if line == b"cancel\n" or not line:
                cancel.set()
        Thread(target=read_cancel, daemon=True).start()
    try:
        if arguments.mode in ("backup", "app-backup"):
            if arguments.destination is None:
                parser.error("새 ZIP 목적지가 필요합니다.")
            result = backup(arguments.path, arguments.destination, consent=arguments.consent_local_media_and_private_metadata,
                            guard=(lambda: None) if integrated else ensure_app_closed, progress=report if integrated else lambda *_: None)
        elif arguments.mode in ("restore-preview", "app-preview"):
            if arguments.destination is None:
                parser.error("새 복원 폴더가 필요합니다.")
            result = restore_to_new_folder(arguments.path, arguments.destination, consent=arguments.consent_local_media_and_private_metadata,
                                           progress=report if integrated else lambda *_: None)
        else:
            result = verify(arguments.path, progress=report if integrated else lambda *_: None)
        print(json.dumps(result))
    except (BackupError, OSError, ValueError, TypeError, KeyError, sqlite3.Error, zipfile.BadZipFile, zipfile.LargeZipFile, KeyboardInterrupt) as cause:
        code = str(cause) if isinstance(cause, BackupError) else "CANCELED" if isinstance(cause, KeyboardInterrupt) else "BACKUP_FAILED"
        print(json.dumps({"schemaVersion": 1, "state": "CANCELED" if code == "CANCELED" else "FAILED", "errorCode": code}))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
