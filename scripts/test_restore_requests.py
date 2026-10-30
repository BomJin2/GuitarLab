"""예약은 현재 자료를 바꾸지 않고 자체 저장소의 다음 시작에서만 적용하는지 검사합니다."""

from contextlib import closing
import copy
import json
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch
import zipfile

import backup_local_data as backup
import restore_local_data as engine
import restore_requests as requests
import test_restore_local_data as fixtures
from test_restore_local_data import ProcessInterrupted


class RequestTests(unittest.TestCase):
    setUp = fixtures.RestoreTests.setUp
    tearDown = fixtures.RestoreTests.tearDown
    assert_equal_unmanaged = fixtures.RestoreTests.assert_equal_unmanaged

    def prepare(self):
        return requests.prepare(self.root, self.archive, consent=True)

    def schedule(self):
        value = self.prepare()
        return requests.schedule(self.root, value["recoveryId"], value["fingerprint"])

    def test_prepare_schedule_and_cancel_do_not_change_current_data(self):
        value = self.prepare()
        self.assertEqual((value["state"], len(value)), ("PREPARED", 10))
        self.assertEqual(requests.status(self.root), {"schemaVersion": 1, "state": "IDLE"})
        result = requests.schedule(self.root, value["recoveryId"], value["fingerprint"])
        self.assertEqual((result["state"], result["restartRequired"], len(result)), ("SCHEDULED", True, 9))
        self.assertEqual(engine._inventory(self.root), self.before)
        self.assertNotIn("fingerprint", result)
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_NOT_CANCELABLE"):
            requests.cancel(self.root, "00000000-0000-0000-0000-000000000000")
        self.assertEqual(requests.cancel(self.root, value["recoveryId"])["state"], "CANCELED")
        self.assertEqual(requests.startup(self.root)["state"], "CANCELED")
        self.assertEqual(engine._inventory(self.root), self.before)
        self.assert_equal_unmanaged()

    def test_next_start_backs_up_latest_data_and_applies_once(self):
        value = self.schedule()
        with closing(sqlite3.connect(self.root / "guitarlab.sqlite")) as db:
            db.execute("UPDATE projects SET title='예약 뒤 최신 자료'")
            db.commit()
        latest = engine._inventory(self.root)
        result = requests.startup(self.root)
        self.assertEqual(result["state"], "COMPLETED")
        vault = requests._vault(self.root, value["recoveryId"])
        self.assertEqual(engine._inventory(vault / "previous"), latest)
        self.assertEqual(backup.verify(vault / "previous.zip")["state"], "VERIFIED")
        with closing(backup.readonly_database(self.root / "guitarlab.sqlite")) as db:
            self.assertEqual(db.execute("SELECT title FROM projects").fetchone()[0], "백업 자료")
        # 완료 후 정상 편집을 과거 지문 불일치로 막거나 재적용하지 않습니다.
        with closing(sqlite3.connect(self.root / "guitarlab.sqlite")) as db:
            db.execute("UPDATE projects SET title='복원 뒤 편집'")
            db.commit()
        edited = engine._inventory(self.root)
        self.assertEqual(requests.startup(self.root), result)
        self.assertEqual(engine._inventory(self.root), edited)
        self.assert_equal_unmanaged()

    def test_current_active_request_and_standalone_restore_are_not_overwritten(self):
        self.schedule()
        record = (self.root / requests.REQUEST).read_bytes()
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_PENDING"):
            self.prepare()
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_PENDING"):
            engine.restore_closed_app(self.root, self.archive, consent=True, confirm=True, guard=lambda: None)
        self.assertEqual((self.root / requests.REQUEST).read_bytes(), record)
        self.assertEqual(engine._inventory(self.root), self.before)

    def test_consent_and_unchanged_plan_are_required_for_scheduling(self):
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_CONSENT_REQUIRED"):
            requests.prepare(self.root, self.archive)
        value = self.prepare()
        vault = requests._vault(self.root, value["recoveryId"])
        (vault / "incoming/projects/test/자체 음원.wav").write_bytes(b"changed candidate")
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_SOURCE_CHANGED"):
            requests.schedule(self.root, value["recoveryId"], value["fingerprint"])
        self.assertEqual(engine._inventory(self.root), self.before)
        self.assertEqual(requests.status(self.root)["state"], "IDLE")

    def test_candidate_change_after_schedule_fails_before_any_current_move(self):
        value = self.schedule()
        vault = requests._vault(self.root, value["recoveryId"])
        (vault / "incoming/projects/test/자체 음원.wav").write_bytes(b"changed after schedule")
        self.assertEqual(requests.startup(self.root)["state"], "FAILED")
        self.assertEqual(engine._inventory(self.root), self.before)
        self.assertFalse((vault / "previous.zip").exists())

    def test_final_prepare_cancellation_leaves_no_active_authorization(self):
        def stop(*_):
            raise backup.BackupError("CANCELED")
        with self.assertRaisesRegex(backup.BackupError, "CANCELED"):
            requests.prepare(self.root, self.archive, consent=True, progress=stop)
        self.assertEqual(requests.status(self.root)["state"], "IDLE")
        self.assertEqual(engine._inventory(self.root), self.before)

    def test_interrupted_first_move_is_rolled_back_on_next_start_without_retry(self):
        self.schedule()
        move = engine.os.rename
        def interrupt(source, destination):
            result = move(source, destination)
            if Path(destination).parent.name == "previous":
                raise ProcessInterrupted()
            return result
        with patch.object(engine.os, "rename", interrupt), self.assertRaises(ProcessInterrupted):
            requests.startup(self.root)
        self.assertTrue((self.root / engine.POINTER).exists())
        result = requests.startup(self.root)
        self.assertEqual(result["state"], "ROLLED_BACK")
        self.assertEqual(engine._inventory(self.root), self.before)
        self.assertEqual(requests.startup(self.root), result)
        self.assertFalse((self.root / engine.POINTER).exists())

    def test_failure_while_applying_rolls_back_and_reports_neutral_status(self):
        self.schedule()
        move = engine.os.rename
        def fail(source, destination):
            if Path(source).parent.name == "incoming" and Path(source).name == "guitarlab.sqlite":
                raise OSError("자체 오류")
            return move(source, destination)
        with patch.object(engine.os, "rename", fail):
            result = requests.startup(self.root)
        self.assertEqual((result["state"], result["errorCode"]), ("ROLLED_BACK", "RESTORE_ROLLED_BACK"))
        self.assertEqual(engine._inventory(self.root), self.before)

    def test_crash_after_completion_before_terminal_request_does_not_reapply(self):
        self.schedule()
        with patch.object(requests, "_finish", side_effect=ProcessInterrupted()), self.assertRaises(ProcessInterrupted):
            requests.startup(self.root)
        completed = engine._inventory(self.root)
        self.assertFalse((self.root / engine.POINTER).exists())
        self.assertEqual(requests.status(self.root)["state"], "APPLYING")
        self.assertEqual(requests.startup(self.root)["state"], "COMPLETED")
        self.assertEqual(engine._inventory(self.root), completed)

    def test_crash_before_backup_or_before_first_move_is_not_automatically_retried(self):
        value = self.schedule()
        with patch.object(engine, "_apply_incoming", side_effect=ProcessInterrupted()), self.assertRaises(ProcessInterrupted):
            requests.startup(self.root)
        self.assertEqual(requests.startup(self.root)["errorCode"], "RESTORE_ABORTED")
        self.assertEqual(engine._inventory(self.root), self.before)
        self.assertFalse((requests._vault(self.root, value["recoveryId"]) / "previous.zip").exists())
        self.schedule()
        with patch.object(engine.os, "link", side_effect=ProcessInterrupted()), self.assertRaises(ProcessInterrupted):
            requests.startup(self.root)
        self.assertEqual(requests.startup(self.root)["state"], "FAILED")
        self.assertEqual(engine._inventory(self.root), self.before)

    def test_unknown_or_foreign_request_is_never_overwritten(self):
        self.schedule()
        path = self.root / requests.REQUEST
        valid = json.loads(path.read_bytes())
        variants = []
        for key, value in (("schemaVersion", True), ("rootSha256", "0" * 64), ("files", True),
                           ("fingerprint", "bad"), ("databaseVersion", 11), ("phase", "PREPARED"),
                           ("errorCode", "C:/private"), ("path", "arbitrary")):
            changed = copy.deepcopy(valid)
            changed[key] = value
            variants.append(changed)
        for changed in variants:
            engine._write_json(path, changed)
            raw = path.read_bytes()
            with self.assertRaises(backup.BackupError):
                requests.startup(self.root)
            with self.assertRaises(backup.BackupError):
                self.prepare()
            self.assertEqual(path.read_bytes(), raw)
            self.assertEqual(engine._inventory(self.root), self.before)

    def test_changed_recovery_data_blocks_initialization_without_guessing(self):
        self.schedule()
        move = engine.os.rename
        def interrupt(source, destination):
            result = move(source, destination)
            if Path(destination).parent.name == "previous":
                raise ProcessInterrupted()
            return result
        with patch.object(engine.os, "rename", interrupt), self.assertRaises(ProcessInterrupted):
            requests.startup(self.root)
        added = self.root / "projects/test/예상하지 못한 파일.wav"
        added.write_bytes(b"preserve unexpected user content")
        with self.assertRaisesRegex(backup.BackupError, "RESTORE_RECOVERY_REQUIRED"):
            requests.startup(self.root)
        self.assertEqual(added.read_bytes(), b"preserve unexpected user content")
        self.assertTrue((self.root / engine.POINTER).exists())
        self.assertFalse((self.root / "guitarlab.sqlite").exists())

    def test_external_reference_count_is_checked_against_actual_prepared_database(self):
        forged = self.base / "forged.zip"
        with zipfile.ZipFile(self.archive) as source, zipfile.ZipFile(forged, "x") as output:
            for entry in source.infolist():
                data = source.read(entry)
                if entry.filename == "backup-manifest.json":
                    value = json.loads(data)
                    value["externalReferencesNotCopied"] = 1
                    data = json.dumps(value).encode("utf-8")
                output.writestr(entry, data)
        with self.assertRaisesRegex(backup.BackupError, "BACKUP_MANIFEST_INVALID"):
            requests.prepare(self.root, forged, consent=True)
        self.assertEqual(engine._inventory(self.root), self.before)

    def test_wal_snapshot_preparation_does_not_create_unlisted_sidecars(self):
        with closing(sqlite3.connect(self.source / "guitarlab.sqlite")) as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("UPDATE projects SET title='WAL 자체 자료'")
            db.commit()
        archive = self.base / "wal.zip"
        backup.backup(self.source, archive, consent=True, guard=lambda:None)
        value = requests.prepare(self.root, archive, consent=True)
        vault = requests._vault(self.root, value["recoveryId"])
        self.assertFalse((vault / "incoming/guitarlab.sqlite-wal").exists())
        self.assertFalse((vault / "incoming/guitarlab.sqlite-shm").exists())
        requests.schedule(self.root, value["recoveryId"], value["fingerprint"])
        self.assertEqual(requests.startup(self.root)["state"], "COMPLETED")

    def test_candidate_change_during_latest_backup_is_rejected_before_swap(self):
        self.schedule()
        apply = engine._apply_incoming
        def change(root, vault, value, **kwargs):
            (vault / "incoming/projects/test/자체 음원.wav").write_bytes(b"changed during backup")
            return apply(root, vault, value, **kwargs)
        with patch.object(engine, "_apply_incoming", change):
            self.assertEqual(requests.startup(self.root)["state"], "FAILED")
        self.assertEqual(engine._inventory(self.root), self.before)
        self.assertFalse((self.root / engine.POINTER).exists())


if __name__ == "__main__":
    unittest.main()
