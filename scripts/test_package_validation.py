"""검증 ZIP의 입력 지문/경로 경계를 자체 임시 파일로 확인합니다."""

import hashlib
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch
import zipfile
import package_validation
from package_validation import checked_payload, verify_archive, verify_manager_build
from backup_local_data import BackupError


class PackageTests(unittest.TestCase):
    def test_manager_build_info_uses_only_fixed_bounded_metadata_command(self):
        manager = Path("manager.exe").resolve()
        digest = "a" * 64
        output = json.dumps({"schemaVersion": 1, "tool": "GUITARLAB_MODEL_MANAGER", "runtimeBundleLockSha256": digest}).encode()
        result = subprocess.CompletedProcess([], 0, output, b"")
        with patch("package_validation.subprocess.run", return_value=result) as run:
            verify_manager_build(manager, digest)
        run.assert_called_once_with(
            [str(manager), "build-info"], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5, check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )

    def test_manager_build_info_refuses_old_wrong_ambiguous_or_unbounded_response(self):
        value = {"schemaVersion": 1, "tool": "GUITARLAB_MODEL_MANAGER", "runtimeBundleLockSha256": "a" * 64}
        for change in ({"schemaVersion": True}, {"schemaVersion": 2}, {"tool": "other"},
                       {"runtimeBundleLockSha256": "b" * 64}, {"privatePath": "not allowed"}):
            with self.subTest(change=change):
                result = subprocess.CompletedProcess([], 0, json.dumps({**value, **change}).encode(), b"")
                with patch("package_validation.subprocess.run", return_value=result):
                    with self.assertRaisesRegex(ValueError, "다시 빌드"):
                        verify_manager_build(Path("manager.exe"), "a" * 64)
        raw = json.dumps(value).encode()
        for result in (
            subprocess.CompletedProcess([], 1, b'{"error":"INVALID_REQUEST"}', b""),
            subprocess.CompletedProcess([], 0, raw, b"unexpected diagnostics"),
            subprocess.CompletedProcess([], 0, b"x" * 4097, b""),
            subprocess.CompletedProcess([], 0, b"", b""),
            subprocess.CompletedProcess([], 0, b"\xff", b""),
            subprocess.CompletedProcess([], 0, b"[]", b""),
            subprocess.CompletedProcess([], 0, raw.replace(b'"schemaVersion": 1', b'"schemaVersion":1,"schemaVersion":1'), b""),
        ):
            with self.subTest(response=result):
                with patch("package_validation.subprocess.run", return_value=result):
                    with self.assertRaisesRegex(ValueError, "다시 빌드"):
                        verify_manager_build(Path("manager.exe"), "a" * 64)

    def test_manager_timeout_or_launch_failure_does_not_fall_back_or_install(self):
        for error in (OSError("synthetic launch failure"), subprocess.TimeoutExpired(["manager.exe"], 5)):
            with self.subTest(error=type(error).__name__):
                with patch("package_validation.subprocess.run", side_effect=error) as run:
                    with self.assertRaisesRegex(ValueError, "다시 빌드"):
                        verify_manager_build(Path("manager.exe"), "a" * 64)
                self.assertEqual(run.call_count, 1)
        with patch("package_validation.subprocess.run") as run:
            with self.assertRaisesRegex(ValueError, "lock 지문"):
                verify_manager_build(Path("manager.exe"), "invalid")
            run.assert_not_called()

    def test_old_manager_is_rejected_before_package_output_directory_exists(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-package-manager-test-") as directory:
            root = Path(directory).resolve()
            validation = root / "src-tauri/target/runtime-validation"
            source = validation / "portable/current"
            source.mkdir(parents=True)
            exe = source / "GuitarLab.exe"
            exe.write_bytes(b"synthetic application, never executed")
            manager = root / "src-tauri/target/debug/examples/manage_ai_model.exe"
            manager.parent.mkdir(parents=True)
            manager.write_bytes(b"synthetic manager, never executed")
            lock = root / "ai/models/runtime-bundle-lock.json"
            lock.parent.mkdir(parents=True)
            lock.write_bytes(b'{"files":[]}\n')
            candidate = validation / "candidate.json"
            candidate.write_text(json.dumps({"destination": str(source), "executableBytes": exe.stat().st_size,
                                             "executableSha256": hashlib.sha256(exe.read_bytes()).hexdigest()}))
            before = {path.relative_to(root): path.read_bytes() for path in root.rglob("*") if path.is_file()}
            result = subprocess.CompletedProcess([], 1, b'{"error":"INVALID_REQUEST"}', b"")
            with patch.object(package_validation, "PROJECT", root), patch("package_validation.subprocess.run", return_value=result):
                with self.assertRaisesRegex(ValueError, "다시 빌드"):
                    package_validation.package(candidate)
            self.assertFalse((validation / "validation-packages").exists())
            self.assertEqual(before, {path.relative_to(root): path.read_bytes() for path in root.rglob("*") if path.is_file()})

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
