"""파일 시스템 접근 전 Windows 백업 경로의 버전 호환·예약 이름 거부를 확인합니다."""

from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zipfile

from backup_local_data import BackupError, safe_member, verify


class BackupPathTests(unittest.TestCase):
    def test_reserved_devices_and_invalid_members_are_rejected_at_any_depth(self):
        reserved = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$", "con "]
        reserved += [f"{prefix}{number}" for prefix in ("COM", "LPT") for number in "123456789¹²³"]
        invalid = ["", ".", "..", "../outside", "/absolute", "C:/drive", "projects//test",
                   "projects/./test", "projects/test/", "projects\\test", "projects/test:stream",
                   "projects/end.", "projects/end ", "projects/" + "a" * 256]
        invalid += [f"projects/test/bad{char}.wav" for char in '<>"|?*\x00\x1f']
        for name in reserved:
            invalid.extend((f"projects/test/{name}.wav", f"projects/{name}/take.wav"))
        for member in invalid:
            with self.subTest(member=member):
                with self.assertRaisesRegex(BackupError, "^BACKUP_PATH_INVALID$"):
                    safe_member(member)

    def test_ordinary_korean_and_reserved_name_prefixes_remain_valid(self):
        for member in ("guitarlab.sqlite", "input-calibrations.json", "backup-manifest.json",
                       "projects/test/내 리드 기타.wav", "projects/test/CONcert.wav",
                       "projects/test/COM10.wav", "projects/test/LPT10.wav"):
            with self.subTest(member=member):
                self.assertEqual(safe_member(member).as_posix(), member)

    def test_available_windows_checker_does_not_call_removed_pathlib_api(self):
        checker = Mock(return_value=False)
        with patch("backup_local_data.ntpath", SimpleNamespace(isreserved=checker), create=True), \
                patch("backup_local_data.PureWindowsPath.is_reserved", create=True,
                      side_effect=AssertionError("폐기된 API를 호출했습니다")):
            self.assertEqual(safe_member("projects/test/내 기타.wav").name, "내 기타.wav")
            checker.assert_any_call("내 기타.wav")
            checker.return_value = True
            with self.assertRaisesRegex(BackupError, "^BACKUP_PATH_INVALID$"):
                safe_member("new-reserved-name")

    def test_reserved_zip_member_fails_before_extraction_and_preserves_archive(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-backup-path-") as directory:
            root = Path(directory)
            archive = root / "malformed.zip"
            destination = root / "must-not-exist"
            with zipfile.ZipFile(archive, "x") as output:
                output.writestr("projects/test/aux.wav", b"synthetic invalid member")
            original = archive.read_bytes()
            with self.assertRaisesRegex(BackupError, "^BACKUP_PATH_INVALID$"):
                verify(archive, extract_to=destination)
            self.assertEqual(archive.read_bytes(), original)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
