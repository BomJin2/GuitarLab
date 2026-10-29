"""자체 임시 DB/파일만 사용해 WAL·취소·변조·링크/덮어쓰기 방지를 확인합니다."""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

from backup_local_data import backup, verify, restore_to_new_folder, BackupError, safe_member, checked_path


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="guitarlab-backup-test-")
        self.base = Path(self.directory.name).resolve()
        self.root = self.base / "app-data"
        self.root.mkdir()
        self.db = sqlite3.connect(self.root / "guitarlab.sqlite")
        migrations = Path(__file__).resolve().parents[1] / "src-tauri/src/storage/migrations"
        for path in sorted(migrations.glob("*.sql")):
            self.db.executescript(path.read_text(encoding="utf-8"))
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("INSERT INTO projects VALUES ('test','자체 테스트',NULL,'practice',0,NULL,0,0)")
        self.db.commit()
        (self.root / "projects/test").mkdir(parents=True)
        (self.root / "projects/test/자체 파일.wav").write_bytes(b"synthetic test only")
        (self.root / "input-calibrations.json").write_text('{"schemaVersion":1,"profiles":[]}', encoding="utf-8")
        (self.root / "models").mkdir()
        (self.root / "models/private-model.bin").write_bytes(b"must never be copied")
        self.destination = self.base / "새 백업.zip"

    def tearDown(self):
        self.db.close()
        self.directory.cleanup()

    def create(self, **kwargs):
        return backup(self.root, self.destination, consent=True, guard=lambda: None, **kwargs)

    def test_wal_snapshot_full_hash_and_original_preservation(self):
        before = hashlib.sha256((self.root / "guitarlab.sqlite").read_bytes()).hexdigest()
        result = self.create()
        self.assertEqual((result["state"], result["files"]), ("COMPLETED", 3))
        self.assertEqual(verify(self.destination)["state"], "VERIFIED")
        self.assertEqual(hashlib.sha256((self.root / "guitarlab.sqlite").read_bytes()).hexdigest(), before)
        with zipfile.ZipFile(self.destination) as archive:
            self.assertEqual(set(archive.namelist()), {"guitarlab.sqlite", "input-calibrations.json", "projects/test/자체 파일.wav", "backup-manifest.json"})
            snapshot = self.base / "snapshot.sqlite"
            snapshot.write_bytes(archive.read("guitarlab.sqlite"))
        with closing(sqlite3.connect(snapshot)) as db:
            self.assertEqual(db.execute("SELECT title FROM projects").fetchone()[0], "자체 테스트")
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 10)
        with self.assertRaises(BackupError):
            self.create()
        self.assertFalse(list(self.base.glob(".guitarlab-backup-*")))

    def test_actual_settings_calibration_is_backed_up_without_other_settings(self):
        settings = self.root / "settings"
        settings.mkdir()
        calibration = b'{"schemaVersion":1,"revision":2,"profiles":[]}'
        (settings / "input-calibrations.json").write_bytes(calibration)
        (settings / "unrelated.json").write_bytes(b"keep unrelated settings")
        result = self.create()
        self.assertEqual(result["files"], 4)
        with zipfile.ZipFile(self.destination) as archive:
            self.assertEqual(archive.read("settings/input-calibrations.json"), calibration)
            self.assertNotIn("settings/unrelated.json", archive.namelist())
        destination = self.base / "real-calibration-preview"
        restore_to_new_folder(self.destination, destination, consent=True)
        self.assertEqual((destination / "settings/input-calibrations.json").read_bytes(), calibration)
        self.assertEqual((settings / "unrelated.json").read_bytes(), b"keep unrelated settings")


    def test_exact_payload_limit_excludes_manifest_and_rejects_one_byte_more(self):
        baseline = self.create()
        self.destination = self.base / "exact-limit.zip"
        with patch("backup_local_data.MAX_BYTES", baseline["bytes"]):
            self.assertEqual(self.create()["bytes"], baseline["bytes"])
            self.assertEqual(verify(self.destination)["bytes"], baseline["bytes"])
            (self.root / "projects/test/extra.bin").write_bytes(b"x")
            self.destination = self.base / "over-limit.zip"
            with self.assertRaisesRegex(BackupError, "BACKUP_LIMIT_EXCEEDED"):
                self.create()
            self.assertFalse(self.destination.exists())

    def test_zip64_streaming_records_survive_verify_and_new_folder_preview(self):
        with patch.object(zipfile, "ZIP64_LIMIT", 1024):
            created = self.create()
            self.assertEqual(verify(self.destination)["bytes"], created["bytes"])
            restored = restore_to_new_folder(self.destination, self.base / "zip64-preview", consent=True)
            self.assertEqual(restored["bytes"], created["bytes"])
            self.assertFalse(restored["appDataReplaced"])
        raw = self.destination.read_bytes()
        self.assertIn(b"PK\x06\x06", raw[-4096:])
        self.assertIn(b"PK\x06\x07", raw[-4096:])

    def test_readonly_verification_reports_monotonic_payload_progress_and_cancels_without_writes(self):
        created = self.create()
        before = self.destination.read_bytes()
        progress = []
        result = verify(self.destination, progress=lambda done, total: progress.append((done, total)))
        self.assertEqual(result["bytes"], created["bytes"])
        self.assertEqual(result["state"], "VERIFIED")
        self.assertEqual(progress[-1], (created["bytes"], created["bytes"]))
        self.assertEqual([v[0] for v in progress], sorted(v[0] for v in progress))
        with self.assertRaises(KeyboardInterrupt):
            verify(self.destination, progress=lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        self.assertEqual(self.destination.read_bytes(), before)
        self.assertFalse(list(self.base.glob(".guitarlab-restore-*")))

    def test_no_consent_or_running_app_never_creates_output(self):
        with self.assertRaisesRegex(BackupError, "CONSENT"):
            backup(self.root, self.destination)
        with self.assertRaisesRegex(BackupError, "RUNNING"):
            backup(self.root, self.destination, consent=True, guard=lambda: (_ for _ in ()).throw(BackupError("BACKUP_APP_RUNNING")))
        self.assertFalse(self.destination.exists())

    def test_cancel_and_source_change_clean_only_new_staging(self):
        for error in (KeyboardInterrupt,):
            with self.assertRaises(error):
                self.create(progress=lambda *_: (_ for _ in ()).throw(error()))
            self.assertFalse(self.destination.exists())
            self.assertFalse(list(self.base.glob(".guitarlab-backup-*")))
        changed = False
        def mutate(done, total):
            nonlocal changed
            if done and not changed:
                (self.root / "projects/test/자체 파일.wav").write_bytes(b"changed")
                changed = True
        with self.assertRaisesRegex(BackupError, "SOURCE_CHANGED"):
            self.create(progress=mutate)
        self.assertFalse(self.destination.exists())
        self.assertTrue((self.root / "models/private-model.bin").exists())

    def test_archive_tamper_and_traversal_are_rejected_without_extraction(self):
        self.create()
        tampered = self.base / "tampered.zip"
        with zipfile.ZipFile(self.destination) as original, zipfile.ZipFile(tampered, "x") as changed:
            for entry in original.infolist():
                data = original.read(entry)
                changed.writestr(entry.filename, b"changed" if entry.filename.endswith(".wav") else data)
        with self.assertRaisesRegex(BackupError, "HASH_INVALID"):
            verify(tampered)
        for name in ("../outside", "projects/../outside", "C:/outside", "projects\\outside", "/absolute", "x//y", "x/./y", "projects/CON.txt", "projects/COM¹.txt", "projects/LPT²", "projects/CONIN$", "projects/CONOUT$", "projects/space ", "projects/a.", "projects/LPT1", "projects/a?b", "projects/a\nb", 12):
            with self.assertRaises(BackupError):
                safe_member(name)

    def test_file_added_after_snapshot_is_not_silently_omitted(self):
        added = self.root / "projects/test/작업 중 추가.txt"
        def change(done, total):
            if done and not added.exists():
                added.write_bytes(b"new source must be preserved")
        with self.assertRaisesRegex(BackupError, "SOURCE_CHANGED"):
            self.create(progress=change)
        self.assertFalse(self.destination.exists())
        self.assertEqual(added.read_bytes(), b"new source must be preserved")
        self.assertFalse(list(self.base.glob(".guitarlab-backup-*")))

    def test_database_version_links_low_disk_and_destination_race(self):
        self.db.execute("PRAGMA user_version=11")
        with self.assertRaisesRegex(BackupError, "VERSION"):
            self.create()
        self.db.execute("PRAGMA user_version=10")
        with patch("backup_local_data.shutil.disk_usage", return_value=type("Disk", (), {"free": 0})()):
            with self.assertRaisesRegex(BackupError, "DISK_SPACE"):
                self.create()
        count = 0
        def race():
            nonlocal count
            count += 1
            if count == 2:
                self.destination.write_bytes(b"existing destination")
        with self.assertRaises(FileExistsError):
            backup(self.root, self.destination, consent=True, guard=race)
        self.assertEqual(self.destination.read_bytes(), b"existing destination")
        self.assertFalse(list(self.base.glob(".guitarlab-backup-*")))

    def test_linked_file_is_never_followed(self):
        outside = self.base / "외부 파일.txt"
        outside.write_bytes(b"do not copy")
        link = self.root / "projects/test/linked.txt"
        try:
            link.symlink_to(outside)
        except OSError as cause:
            self.skipTest("이 Windows 계정에 심볼릭 링크 생성 권한이 없습니다: " + type(cause).__name__)
        try:
            with self.assertRaisesRegex(BackupError, "LINK_NOT_ALLOWED"):
                self.create()
            self.assertFalse(self.destination.exists())
        finally:
            link.unlink()

    def test_reparse_attribute_is_rejected_without_link_creation_permission(self):
        original = Path.lstat
        target = self.root / "projects/test/자체 파일.wav"
        def metadata(path):
            info = original(path)
            return SimpleNamespace(st_mode=info.st_mode, st_file_attributes=0x400) if path == target else info
        with patch.object(Path, "lstat", new=metadata):
            with self.assertRaisesRegex(BackupError, "LINK_NOT_ALLOWED"):
                self.create()
        self.assertFalse(self.destination.exists())

    def test_checked_path_accepts_redirected_ancestor_with_canonical_root(self):
        canonical = self.base / "redirected-storage"
        original = Path.resolve
        def resolved(path, strict=False):
            if path.is_relative_to(self.root):
                return canonical / path.relative_to(self.root)
            return original(path, strict=strict)
        with patch.object(Path, "resolve", new=resolved):
            checked_path(self.root, self.root, directory=True)
            checked_path(self.root, self.root / "projects/test", directory=True)
            checked_path(self.root, self.root / "projects/test/자체 파일.wav")

    def test_checked_path_rejects_escape_from_redirected_root(self):
        canonical = self.base / "redirected-storage"
        target = self.root / "projects/test/자체 파일.wav"
        original = Path.resolve
        def resolved(path, strict=False):
            if path == target:
                return self.base / "outside.wav"
            if path.is_relative_to(self.root):
                return canonical / path.relative_to(self.root)
            return original(path, strict=strict)
        with patch.object(Path, "resolve", new=resolved):
            with self.assertRaisesRegex(BackupError, "BACKUP_PATH_INVALID"):
                checked_path(self.root, target)

    def test_checked_path_rejects_reparse_root_before_canonical_comparison(self):
        original = Path.lstat
        def metadata(path):
            info = original(path)
            return SimpleNamespace(st_mode=info.st_mode, st_file_attributes=0x400) if path == self.root else info
        with patch.object(Path, "lstat", new=metadata):
            with self.assertRaisesRegex(BackupError, "BACKUP_LINK_NOT_ALLOWED"):
                checked_path(self.root, self.root, directory=True)

    def test_restore_only_new_folder_and_cancellation_preserve_originals(self):
        self.create()
        target = self.base / "복원 미리보기"
        result = restore_to_new_folder(self.destination, target, consent=True)
        self.assertEqual(result["state"], "RESTORED_TO_NEW_FOLDER")
        self.assertFalse(result["appDataReplaced"])
        self.assertEqual((target / "projects/test/자체 파일.wav").read_bytes(), b"synthetic test only")
        with zipfile.ZipFile(self.destination) as archive:
            self.assertEqual((target / "guitarlab.sqlite").read_bytes(), archive.read("guitarlab.sqlite"))
        with self.assertRaises(BackupError):
            restore_to_new_folder(self.destination, target, consent=True)
        for stage in ("검사", "추출"):
            canceled = self.base / (stage + " 취소한 복원")
            def cancel(done, total):
                if stage == "검사" or done > 0:
                    raise KeyboardInterrupt()
            with self.assertRaises(KeyboardInterrupt):
                restore_to_new_folder(self.destination, canceled, consent=True, progress=cancel)
            self.assertFalse(canceled.exists())
        self.assertFalse(list(self.base.glob(".guitarlab-restore-*")))
        self.assertEqual(verify(self.destination)["state"], "VERIFIED")

    def test_preview_disk_failure_and_publish_race_never_replace_destination(self):
        self.create()
        target = self.base / "새 복원"
        with patch("backup_local_data.shutil.disk_usage", return_value=SimpleNamespace(free=0)):
            with self.assertRaisesRegex(BackupError, "DISK_SPACE"):
                restore_to_new_folder(self.destination, target, consent=True)
        self.assertFalse(target.exists())
        def race(done, total):
            if done == total and done > 0 and not target.exists():
                target.mkdir()
                (target / "기존 파일.txt").write_bytes(b"preserve")
        with self.assertRaises(OSError):
            restore_to_new_folder(self.destination, target, consent=True, progress=race)
        self.assertEqual((target / "기존 파일.txt").read_bytes(), b"preserve")
        self.assertFalse(list(self.base.glob(".guitarlab-restore-*")))

    @unittest.skipUnless(sys.platform == "win32", "Windows 확장 드라이브 경로 검사")
    def test_preview_extended_drive_path_reads_database_and_preserves_archive(self):
        self.create()
        before = self.destination.read_bytes()
        target = Path("\\\\?\\" + str(self.base / "확장 경로 복원"))
        result = restore_to_new_folder(self.destination, target, consent=True)
        self.assertEqual(result["state"], "RESTORED_TO_NEW_FOLDER")
        self.assertEqual((target / "projects/test/자체 파일.wav").read_bytes(), b"synthetic test only")
        self.assertEqual(self.destination.read_bytes(), before)

    def test_preview_rejects_hashed_but_wrong_database_version_before_publication(self):
        self.create()
        bad_db = self.base / "다른 버전.sqlite"
        with zipfile.ZipFile(self.destination) as archive:
            contents = {entry.filename: archive.read(entry) for entry in archive.infolist()}
        bad_db.write_bytes(contents["guitarlab.sqlite"])
        with closing(sqlite3.connect(bad_db)) as db:
            db.execute("PRAGMA user_version=8")
        raw = bad_db.read_bytes()
        contents["guitarlab.sqlite"] = raw
        manifest = json.loads(contents["backup-manifest.json"])
        item = next(item for item in manifest["files"] if item["path"] == "guitarlab.sqlite")
        item.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        contents["backup-manifest.json"] = json.dumps(manifest).encode()
        invalid = self.base / "다른 버전.zip"
        with zipfile.ZipFile(invalid, "x") as archive:
            for name, data in contents.items(): archive.writestr(name, data)
        with self.assertRaisesRegex(BackupError, "DATABASE_VERSION"):
            verify(invalid)
        target = self.base / "만들면 안 되는 복원"
        with self.assertRaisesRegex(BackupError, "DATABASE_VERSION"):
            restore_to_new_folder(invalid, target, consent=True)
        self.assertFalse(target.exists())
        self.assertFalse(list(self.base.glob(".guitarlab-restore-*")))


    def test_previous_version_eight_backup_and_preview_remain_supported(self):
        self.db.execute("DROP TABLE project_purge_intents")
        self.db.execute("DROP TABLE project_trash")
        self.db.execute("PRAGMA user_version=8")
        self.db.commit()
        self.create()
        with zipfile.ZipFile(self.destination) as archive:
            manifest = json.loads(archive.read("backup-manifest.json"))
            self.assertEqual(manifest["databaseVersion"], 8)
        self.assertEqual(verify(self.destination)["state"], "VERIFIED")
        target = self.base / "v8 복원 미리보기"
        restore_to_new_folder(self.destination, target, consent=True)
        with closing(sqlite3.connect(target / "guitarlab.sqlite")) as restored:
            self.assertEqual(restored.execute("PRAGMA user_version").fetchone()[0], 8)
            self.assertEqual(restored.execute("SELECT title FROM projects").fetchone()[0], "자체 테스트")
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 8)

    def test_version_ten_trash_marker_and_all_media_are_preserved(self):
        token = "00000000-0000-4000-8000-000000000001"
        self.db.execute("INSERT INTO project_trash VALUES(?,?,42,0)", ("test", token))
        self.db.commit()
        self.create()
        target = self.base / "v10 보관 복원 미리보기"
        restore_to_new_folder(self.destination, target, consent=True)
        with closing(sqlite3.connect(target / "guitarlab.sqlite")) as restored:
            self.assertEqual(restored.execute("PRAGMA user_version").fetchone()[0], 10)
            self.assertEqual(restored.execute("SELECT project_id,trash_id,trashed_at_ms,project_revision FROM project_trash").fetchall(), [("test", token, 42, 0)])
        self.assertEqual((target / "projects/test/자체 파일.wav").read_bytes(), b"synthetic test only")
        self.assertEqual(self.db.execute("SELECT trash_id FROM project_trash").fetchone()[0], token)

    def test_previous_version_nine_backup_and_preview_remain_supported(self):
        self.db.execute("DROP TABLE project_purge_intents")
        self.db.execute("PRAGMA user_version=9")
        self.db.commit()
        self.create()
        target = self.base / "이전 v9 복원"
        result = restore_to_new_folder(self.destination, target, consent=True)
        self.assertFalse(result["appDataReplaced"])
        with closing(sqlite3.connect(target / "guitarlab.sqlite")) as restored:
            self.assertEqual(restored.execute("PRAGMA user_version").fetchone()[0], 9)

    def test_partial_purge_refuses_new_backup_and_preview_without_replacing_data(self):
        token = "00000000-0000-4000-8000-000000000001"
        self.db.execute("INSERT INTO project_trash VALUES(?,?,42,0)", ("test", token))
        self.db.execute("INSERT INTO project_purge_intents VALUES(?,?,0,43)", ("test", token))
        self.db.commit()
        with self.assertRaisesRegex(BackupError, "BACKUP_PROJECT_PURGE_IN_PROGRESS"):
            self.create()
        self.assertFalse(self.destination.exists())
        with patch("backup_local_data.check_database", return_value=10):
            self.create()
        before = self.destination.read_bytes()
        target = self.base / "중단 자료를 정상 복원하지 않음"
        with self.assertRaisesRegex(BackupError, "BACKUP_PROJECT_PURGE_IN_PROGRESS"):
            restore_to_new_folder(self.destination, target, consent=True)
        self.assertFalse(target.exists())
        self.assertEqual(self.destination.read_bytes(), before)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM project_purge_intents").fetchone()[0], 1)
        self.assertFalse(list(self.base.glob(".guitarlab-restore-*")))


if __name__ == "__main__":
    unittest.main()
