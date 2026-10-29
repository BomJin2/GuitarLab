"""실제 사용자 경로 대신 자체 DB/음원으로 교체·실패·중단 복구를 검사합니다."""

from contextlib import closing
import json
import copy
from pathlib import Path
from queue import Queue
import sqlite3
import subprocess
import sys
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch
import zipfile

import backup_local_data as backup
import restore_local_data as restore


class ProcessInterrupted(BaseException):
    pass


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="guitarlab-restore-test-")
        self.base = Path(self.temporary.name).resolve()
        self.root = self.base / "current"
        self.source = self.base / "source"
        for root, title in ((self.root, "현재 자료"), (self.source, "백업 자료")):
            root.mkdir()
            with closing(sqlite3.connect(root / "guitarlab.sqlite")) as db:
                migrations = Path(__file__).resolve().parents[1] / "src-tauri/src/storage/migrations"
                for path in sorted(migrations.glob("*.sql")):
                    db.executescript(path.read_text(encoding="utf-8"))
                db.execute("INSERT INTO projects VALUES ('test',?,NULL,'practice',0,NULL,0,0)", [title])
                db.commit()
            (root / "projects/test").mkdir(parents=True)
            (root / "projects/test/자체 음원.wav").write_bytes(title.encode("utf-8"))
            (root / "input-calibrations.json").write_text(
                json.dumps({"schemaVersion": 1, "revision": 1 if root == self.root else 2, "profiles": []}), encoding="utf-8")
        (self.root / "ai/models").mkdir(parents=True)
        (self.root / "ai/models/keep.bin").write_bytes(b"keep model")
        (self.root / "unknown.txt").write_bytes(b"keep unknown file")
        self.external = self.base / "external.wav"
        self.external.write_bytes(b"keep external source")
        self.archive = self.base / "source.zip"
        backup.backup(self.source, self.archive, consent=True, guard=lambda: None)
        self.before = restore._inventory(self.root)
        self.archive_before = self.archive.read_bytes()

    def tearDown(self):
        self.temporary.cleanup()

    def apply(self, **kwargs):
        return restore.restore_closed_app(self.root, self.archive, consent=True, confirm=True,
                                          guard=lambda: None, **kwargs)

    def recover(self):
        return restore.recover_closed_app(self.root, guard=lambda: None)

    def assert_original(self):
        self.assertEqual(restore._inventory(self.root), self.before)
        self.assertFalse((self.root / restore.POINTER).exists())
        self.assert_equal_unmanaged()

    def assert_equal_unmanaged(self):
        self.assertEqual((self.root / "ai/models/keep.bin").read_bytes(), b"keep model")
        self.assertEqual((self.root / "unknown.txt").read_bytes(), b"keep unknown file")
        self.assertEqual(self.external.read_bytes(), b"keep external source")
        self.assertEqual(self.archive.read_bytes(), self.archive_before)

    def test_success_preserves_previous_zip_raw_files_and_unmanaged_data(self):
        result = self.apply()
        self.assertEqual((result["state"], result["appDataReplaced"]), ("LOCAL_DATA_RESTORED", True))
        vault = self.base / (".guitarlab-restore-" + result["recoveryId"])
        state = json.loads((vault / "state.json").read_text(encoding="utf-8"))
        self.assertEqual(restore._inventory(self.root), state["incomingFiles"])
        with closing(backup.readonly_database(self.root / "guitarlab.sqlite")) as db:
            self.assertEqual(db.execute("SELECT title FROM projects").fetchone()[0], "백업 자료")
        self.assertEqual(restore._inventory(vault / "previous"), self.before)
        self.assertEqual(backup.verify(vault / "previous.zip")["state"], "VERIFIED")
        self.assertFalse((self.root / restore.POINTER).exists())
        self.assertEqual(self.recover()["state"], "RESTORE_NOT_PENDING")
        self.assert_equal_unmanaged()

    def test_two_consents_and_closed_app_guard_are_required_before_any_output(self):
        for consent, confirm in ((False, False), (False, True), (True, False)):
            with self.assertRaisesRegex(backup.BackupError, "RESTORE_CONSENT_REQUIRED"):
                restore.restore_closed_app(self.root, self.archive, consent=consent, confirm=confirm)
        def active():
            raise backup.BackupError("BACKUP_APP_RUNNING")
        with self.assertRaisesRegex(backup.BackupError, "BACKUP_APP_RUNNING"):
            restore.restore_closed_app(self.root, self.archive, consent=True, confirm=True, guard=active)
        self.assertFalse(list(self.base.glob(".guitarlab-restore-*")))
        self.assert_original()

    def test_same_root_open_lock_is_rejected_without_changing_any_files(self):
        with restore._exclusive(self.root):
            with self.assertRaisesRegex(backup.BackupError, "BACKUP_APP_RUNNING"):
                self.apply()
        self.assert_original()

    def test_corrupt_zip_and_unsupported_database_preserve_current_data(self):
        self.archive.write_bytes(b"invalid ZIP")
        with self.assertRaises(zipfile.BadZipFile):
            self.apply()
        self.assertEqual(restore._inventory(self.root), self.before)
        self.archive.write_bytes(self.archive_before)
        with closing(sqlite3.connect(self.root / "guitarlab.sqlite")) as db:
            db.execute("PRAGMA user_version=11")
        before = restore._inventory(self.root)
        with self.assertRaisesRegex(backup.BackupError, "BACKUP_DATABASE_VERSION"):
            self.apply()
        self.assertEqual(restore._inventory(self.root), before)
        self.assertFalse((self.root / restore.POINTER).exists())

    def test_cancel_before_copy_and_after_first_install_preserves_original(self):
        def cancel_before(*_):
            raise backup.BackupError("CANCELED")
        with self.assertRaisesRegex(backup.BackupError, "CANCELED"):
            self.apply(progress=cancel_before)
        self.assert_original()
        def cancel_after(*_):
            if (self.root / restore.POINTER).exists():
                _, state = restore._pending(self.root)
                if state["installed"]:
                    raise backup.BackupError("CANCELED")
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_ROLLED_BACK"):
            self.apply(progress=cancel_after)
        self.assert_original()

    def test_rename_failure_at_every_forward_boundary_rolls_back_both_db_and_files(self):
        original = restore.os.rename
        for boundary in range(1, 7):
            calls = 0
            def fail_once(source, destination):
                nonlocal calls
                # 복원 미리보기 게시 이동은 실제 관리 항목 교체 경계가 아닙니다.
                if Path(destination).name in restore.MANAGED:
                    calls += 1
                    if calls == boundary:
                        raise PermissionError("자체 잠금 실패")
                return original(source, destination)
            with self.subTest(boundary=boundary), patch.object(restore.os, "rename", fail_once):
                with self.assertRaisesRegex(backup.BackupError, "RESTORE_ROLLED_BACK"):
                    self.apply()
            self.assert_original()

    def test_interruption_after_each_move_recovers_from_durable_intent(self):
        original = restore.os.rename
        for boundary in range(1, 7):
            calls = 0
            def interrupt(source, destination):
                nonlocal calls
                result = original(source, destination)
                if Path(destination).name in restore.MANAGED:
                    calls += 1
                    if calls == boundary:
                        raise ProcessInterrupted()
                return result
            with self.subTest(boundary=boundary), patch.object(restore.os, "rename", interrupt):
                with self.assertRaises(ProcessInterrupted):
                    self.apply()
            self.assertTrue((self.root / restore.POINTER).exists())
            with self.assertRaisesRegex(backup.BackupError, "RESTORE_PENDING"):
                self.apply()
            self.assertEqual(self.recover()["state"], "LOCAL_DATA_ROLLED_BACK")
            self.assert_original()

    def test_interrupted_rollback_can_recover_again_without_overwriting_paths(self):
        original = restore.os.rename
        calls = 0
        def interrupt_rollback(source, destination):
            nonlocal calls
            if Path(destination).name in restore.MANAGED:
                calls += 1
                if calls == 2:
                    raise PermissionError("자체 두 번째 이동 실패")
                result = original(source, destination)
                if calls == 3:
                    raise ProcessInterrupted()
                return result
            return original(source, destination)
        with patch.object(restore.os, "rename", interrupt_rollback), self.assertRaises(ProcessInterrupted):
            self.apply()
        self.assertEqual(self.recover()["state"], "LOCAL_DATA_ROLLED_BACK")
        self.assert_original()

    def test_completed_state_before_pointer_cleanup_keeps_restored_data(self):
        with patch.object(restore, "_clear_pointer", side_effect=ProcessInterrupted()), self.assertRaises(ProcessInterrupted):
            self.apply()
        self.assertEqual(self.recover()["state"], "LOCAL_DATA_RESTORED")
        with closing(backup.readonly_database(self.root / "guitarlab.sqlite")) as db:
            self.assertEqual(db.execute("SELECT title FROM projects").fetchone()[0], "백업 자료")
        self.assert_equal_unmanaged()

    def test_recovery_conflict_preserves_both_unknown_target_and_previous_file(self):
        original = restore.os.rename
        def interrupt(source, destination):
            result = original(source, destination)
            if Path(destination).name == "guitarlab.sqlite":
                raise ProcessInterrupted()
            return result
        with patch.object(restore.os, "rename", interrupt), self.assertRaises(ProcessInterrupted):
            self.apply()
        (self.root / "guitarlab.sqlite").write_bytes(b"keep conflicting bytes")
        vault, _ = restore._pending(self.root)
        saved = (vault / "previous/guitarlab.sqlite").read_bytes()
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_RECOVERY_REQUIRED"):
            self.recover()
        self.assertEqual((self.root / "guitarlab.sqlite").read_bytes(), b"keep conflicting bytes")
        self.assertEqual((vault / "previous/guitarlab.sqlite").read_bytes(), saved)
        self.assertEqual(backup.verify(vault / "previous.zip")["state"], "VERIFIED")

    def test_foreign_pointer_duplicate_fields_and_invalid_lock_are_preserved(self):
        pointer = self.root / restore.POINTER
        for raw in (b'{"schemaVersion":1,"schemaVersion":1}', b'{"root":"../other"}'):
            pointer.write_bytes(raw)
            with self.assertRaises(backup.BackupError):
                self.recover()
            self.assertEqual(pointer.read_bytes(), raw)
            pointer.unlink()
        lock = self.root / ".app-instance.lock"
        lock.write_bytes(b"keep unknown lock data")
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_STATE_INVALID"):
            self.apply()
        self.assertEqual(lock.read_bytes(), b"keep unknown lock data")

    def test_actual_calibration_is_replaced_and_other_settings_are_preserved(self):
        for root, revision in ((self.root, 11), (self.source, 22)):
            (root / "settings").mkdir()
            (root / "settings/input-calibrations.json").write_text(
                json.dumps({"schemaVersion": 1, "revision": revision, "profiles": []}), encoding="utf-8")
        (self.root / "settings/keep.json").write_bytes(b"keep other settings")
        self.archive = self.base / "with-real-calibration.zip"
        backup.backup(self.source, self.archive, consent=True, guard=lambda: None)
        self.archive_before = self.archive.read_bytes()
        self.before = restore._inventory(self.root)
        result = self.apply()
        self.assertEqual(json.loads((self.root / "settings/input-calibrations.json").read_text())["revision"], 22)
        vault = self.base / (".guitarlab-restore-" + result["recoveryId"])
        self.assertEqual(restore._inventory(vault / "previous"), self.before)
        self.assertEqual((self.root / "settings/keep.json").read_bytes(), b"keep other settings")
        self.assert_equal_unmanaged()

    def test_real_child_process_kill_releases_lock_and_recovers_durable_intent(self):
        program = '''
from pathlib import Path
import sys
import tempfile
import restore_local_data as restore
root, archive = map(Path, sys.argv[1:3])
assert root.parent.name.startswith("guitarlab-restore-test-")
assert root.parent.parent == Path(tempfile.gettempdir()).resolve()
original = restore.os.rename
def pause_after_move(source, destination):
    result = original(source, destination)
    if Path(destination).name == "guitarlab.sqlite":
        print("OWN_FIXTURE_MOVED", flush=True)
        sys.stdin.buffer.read(1)
    return result
restore.os.rename = pause_after_move
restore.restore_closed_app(root, archive, consent=True, confirm=True, guard=lambda: None)
'''
        received = Queue()
        with subprocess.Popen([sys.executable, "-B", "-X", "utf8", "-c", program, str(self.root), str(self.archive)],
                              cwd=Path(__file__).resolve().parent, stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE) as child:
            reader = Thread(target=lambda: received.put(child.stdout.readline()), daemon=True)
            reader.start()
            try:
                self.assertEqual(received.get(timeout=20).strip(), b"OWN_FIXTURE_MOVED")
                self.assertTrue((self.root / restore.POINTER).exists())
            finally:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=10)
                reader.join(timeout=2)
        self.assertEqual(self.recover()["state"], "LOCAL_DATA_ROLLED_BACK")
        self.assert_original()

    def test_corrupt_state_types_paths_and_action_are_rejected_before_any_move(self):
        with patch.object(restore, "_clear_pointer", side_effect=ProcessInterrupted()), self.assertRaises(ProcessInterrupted):
            self.apply()
        vault, valid = restore._pending(self.root)
        current = restore._inventory(self.root)
        variants = []
        value = copy.deepcopy(valid)
        value["extra"] = True
        variants.append(value)
        value = copy.deepcopy(valid)
        value["pointer"]["schemaVersion"] = True
        variants.append(value)
        value = copy.deepcopy(valid)
        value["originalNames"].reverse()
        variants.append(value)
        value = copy.deepcopy(valid)
        value["action"] = {"kind": "INSTALL_NEW", "name": "../external.wav"}
        variants.append(value)
        value = copy.deepcopy(valid)
        value["originalFiles"][0]["path"] = "../external.wav"
        variants.append(value)
        value = copy.deepcopy(valid)
        value["result"]["files"] = True
        variants.append(value)
        for value in variants:
            restore._write_json(vault / "state.json", value)
            with self.assertRaises(backup.BackupError):
                self.recover()
            self.assertEqual(restore._inventory(self.root), current)
            self.assert_equal_unmanaged()
        restore._write_json(vault / "state.json", valid)
        self.assertEqual(self.recover()["state"], "LOCAL_DATA_RESTORED")

    def test_files_changed_after_interruption_are_not_overwritten_during_recovery(self):
        original = restore.os.rename
        def interrupt(source, destination):
            result = original(source, destination)
            if Path(destination).name == "guitarlab.sqlite":
                raise ProcessInterrupted()
            return result
        with patch.object(restore.os, "rename", interrupt), self.assertRaises(ProcessInterrupted):
            self.apply()
        vault, _ = restore._pending(self.root)
        old_database = (vault / "previous/guitarlab.sqlite").read_bytes()
        added = self.root / "projects/test/보존할 변경.wav"
        added.write_bytes(b"preserve unexpected content")
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_RECOVERY_REQUIRED"):
            self.recover()
        self.assertEqual(added.read_bytes(), b"preserve unexpected content")
        self.assertEqual((vault / "previous/guitarlab.sqlite").read_bytes(), old_database)
        self.assertFalse((self.root / "guitarlab.sqlite").exists())
        self.assertEqual(backup.verify(vault / "previous.zip")["state"], "VERIFIED")

    def test_directory_handles_prevent_parent_replacement_without_permission_changes(self):
        with restore._directories((self.root,)):
            with self.assertRaises(PermissionError):
                self.root.rename(self.base / "unexpected-move")
        self.assert_original()


if __name__ == "__main__":
    unittest.main()
