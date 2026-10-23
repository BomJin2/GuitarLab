"""검증 ZIP의 입력 지문/경로 경계를 자체 임시 파일로 확인합니다."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from package_validation import checked_payload, verify_archive
from backup_local_data import BackupError


class PackageTests(unittest.TestCase):
    def fixture(self, root, *, change=None, extras=(), manifest_raw=None):
        payload = {name: b"synthetic package fixture" for name in
                   ("GuitarLab.exe", "manage_ai_model.exe", "LICENSE", "Test-ValidationPackage.ps1")}
        manifest = {"schemaVersion": 1, "state": "VALIDATION_ONLY", "appVersion": "0.0.0",
                    "modelWeightsIncluded": False, "legalReviewCompleted": False,
                    "projectLicenseIncluded": True, "cleanWindowsValidated": False,
                    "runtimeBundleLockSha256": "a" * 64,
                    "files": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                              for name, data in payload.items()]}
        if change:
            change(manifest)
        archive = root / "fixture.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as output:
            for name, data in payload.items():
                output.writestr("GuitarLab/" + name, data)
            for entry, data in extras:
                output.writestr(entry, data)
            raw = json.dumps(manifest).encode()
            output.writestr("GuitarLab/VALIDATION.json", manifest_raw(raw) if manifest_raw else raw)
        return archive, hashlib.sha256(archive.read_bytes()).hexdigest()

    def test_full_archive_verification_never_extracts_or_executes(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-test-") as folder:
            root = Path(folder).resolve()
            archive, digest = self.fixture(root)
            original = archive.read_bytes()
            manifest = verify_archive(archive, digest)
            self.assertEqual(len(manifest["files"]), 4)
            self.assertEqual(archive.read_bytes(), original)
            self.assertEqual(list(root.iterdir()), [archive])
            for bad in (None, "A" * 64, "0" * 64):
                with self.assertRaises(ValueError):
                    verify_archive(archive, bad)

    def test_manifest_requires_exact_unambiguous_development_contract(self):
        changes = [lambda m: m.update(schemaVersion=True), lambda m: m.update(state="RELEASE"),
                   lambda m: m.update(modelWeightsIncluded=True), lambda m: m.update(legalReviewCompleted=True),
                   lambda m: m.update(cleanWindowsValidated=True), lambda m: m.update(privatePath="private"),
                   lambda m: m["files"][0].update(bytes=True), lambda m: m["files"][0].update(sha256="0" * 64),
                   lambda m: m["files"][0].update(bytes=1), lambda m: m["files"][0].update(path="../outside"),
                   lambda m: m["files"][0].update(path="CON"), lambda m: m["files"][0].update(path="other.exe"),
                   lambda m: m["files"][1].update(path="guitarlab.EXE")]
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-test-") as folder:
            root = Path(folder).resolve()
            for change in changes:
                with self.subTest(change=changes.index(change)):
                    archive, digest = self.fixture(root, change=change)
                    with self.assertRaises((ValueError, BackupError)):
                        verify_archive(archive, digest)
            archive, digest = self.fixture(root, manifest_raw=lambda raw: raw.replace(b'"schemaVersion": 1', b'"schemaVersion":1,"schemaVersion":1'))
            with self.assertRaisesRegex(ValueError, "중복"):
                verify_archive(archive, digest)

    def test_zip_extra_case_collision_traversal_and_link_are_refused(self):
        link = zipfile.ZipInfo("GuitarLab/link")
        link.create_system = 3
        link.external_attr = 0o120777 << 16
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-test-") as folder:
            root = Path(folder).resolve()
            marker = root / "outside"
            marker.write_bytes(b"preserve")
            for name in ("GuitarLab/extra", "GuitarLab/guitarlab.EXE", "../outside", "GuitarLab/dir/", link):
                archive, digest = self.fixture(root, extras=[(name, b"outside")])
                with self.assertRaises((ValueError, BackupError)):
                    verify_archive(archive, digest)
            self.assertEqual(marker.read_bytes(), b"preserve")

    def test_crc_corruption_is_refused_even_with_updated_outer_hash(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-test-") as folder:
            archive, _ = self.fixture(Path(folder).resolve())
            with zipfile.ZipFile(archive) as package:
                info = package.getinfo("GuitarLab/GuitarLab.exe")
                offset = info.header_offset + 30 + len(info.filename.encode()) + len(info.extra)
            data = bytearray(archive.read_bytes())
            data[offset] ^= 1
            archive.write_bytes(data)
            with self.assertRaises(zipfile.BadZipFile):
                verify_archive(archive, hashlib.sha256(data).hexdigest())

    def test_verified_snapshot_does_not_reopen_replaced_source(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-test-") as folder:
            archive, digest = self.fixture(Path(folder).resolve())
            original = zipfile.ZipFile
            def replaced(source):
                archive.write_bytes(b"changed after trusted hash")
                return original(source)
            with patch("package_validation.zipfile.ZipFile", replaced):
                self.assertEqual(len(verify_archive(archive, digest)["files"]), 4)

    def test_uncompressed_limit_is_checked_before_any_payload_read(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-test-") as folder:
            archive, digest = self.fixture(Path(folder).resolve())
            original = zipfile.ZipFile.infolist
            def oversized(package):
                entries = original(package)
                entries[0].file_size = 64 * 1024 * 1024 + 1
                return entries
            with patch.object(zipfile.ZipFile, "infolist", oversized), patch.object(zipfile.ZipFile, "read", side_effect=AssertionError("한도 확인 전 읽기")):
                with self.assertRaises(ValueError):
                    verify_archive(archive, digest)

    def test_only_original_bounded_file_with_matching_hash_is_selected(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-test-") as folder:
            root = Path(folder).resolve()
            data = b"synthetic package fixture"
            (root / "fixture.txt").write_bytes(data)
            _, entry = checked_payload(root, "fixture.txt", len(data), hashlib.sha256(data).hexdigest())
            self.assertEqual(entry["bytes"], len(data))
            for name, size, digest in [("../outside", None, None), ("fixture.txt", len(data) + 1, None), ("fixture.txt", None, "0" * 64)]:
                with self.assertRaises((ValueError, BackupError)):
                    checked_payload(root, name, size, digest)


if __name__ == "__main__":
    unittest.main()
