"""앱의 생성/검사/미리보기 모두 CLI와 같은 고정 용량을 사용해야 합니다."""

import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import backup_local_data as backup


class BackupCapacityTests(unittest.TestCase):
    def test_eof_and_explicit_reads_obey_the_same_budget(self):
        with patch.object(backup, "MAX_ZIP_READ_BYTES", 8), \
                backup.BoundedZipReader(io.BytesIO(b"123456789")) as source:
            with self.assertRaisesRegex(backup.BackupError, "BACKUP_MANIFEST_INVALID"):
                source.read()
            with self.assertRaisesRegex(backup.BackupError, "BACKUP_MANIFEST_INVALID"):
                source.read(9)
            source.seek(1)
            self.assertEqual(source.read(), b"23456789")
            source.seek(0)
            self.assertEqual(source.read(8), b"12345678")

    def test_oversized_zip_metadata_is_rejected_before_directory_allocation(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-backup-metadata-") as directory:
            path = Path(directory) / "metadata-only.zip"
            with zipfile.ZipFile(path, "x") as archive:
                for index in range(513):
                    entry = zipfile.ZipInfo(f"projects/test/{index}.bin")
                    entry.comment = b"x" * 65535
                    archive.writestr(entry, b"")
            before = path.stat()
            with self.assertRaisesRegex(backup.BackupError, "BACKUP_MANIFEST_INVALID"):
                backup.verify(path)
            self.assertEqual(path.stat().st_size, before.st_size)
            self.assertEqual(path.stat().st_mtime_ns, before.st_mtime_ns)

    def test_app_modes_keep_two_gib_limit_without_lowering_shared_cli_limit(self):
        modes = {"app-backup": "backup", "app-verify": "verify", "app-preview": "restore_to_new_folder"}
        for mode, function in modes.items():
            with self.subTest(mode=mode), patch.object(backup, "MAX_BYTES", 2 * 1024 ** 3), \
                    patch.object(backup, "Thread"), patch.object(backup, function) as operation, \
                    patch("sys.argv", ["backup", mode, str(Path.cwd()), "--destination",
                                       str(Path.cwd() / "unused-capacity-test.zip")]), \
                    contextlib.redirect_stdout(io.StringIO()):
                def checked(*args, **kwargs):
                    self.assertEqual(backup.MAX_BYTES, 2 * 1024 ** 3)
                    return {"state": "TEST_ONLY"}
                operation.side_effect = checked
                backup.main()
                operation.assert_called_once()


if __name__ == "__main__":
    unittest.main()
