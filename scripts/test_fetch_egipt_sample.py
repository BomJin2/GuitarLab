"""EG-IPT 수신의 범위·형식·기존 파일 보존을 네트워크 없이 DEMO로 검사합니다."""

import copy
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave
import zipfile

import fetch_egipt_sample as sample
from test_fetch_guitarset_sample import Response


def fixture(channels=1, width=3, rate=96000):
    pcm = io.BytesIO()
    with wave.open(pcm, "wb") as audio:
        audio.setparams((channels, width, rate, 8, "NONE", ""))
        audio.writeframes(b"\0" * 8 * width * channels)
    buffer = io.BytesIO()
    rows = []
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index in range(8):
            name = f"DEMO/demo{index}.wav"
            archive.writestr(name, pcm.getvalue())
            info = archive.getinfo(name)
            rows.append({"member": name, "bytes": info.file_size, "compressedBytes": info.compress_size,
                         "crc32": f"{info.CRC:08x}", "headerOffset": info.header_offset})
    buffer.transferred = 0
    buffer.etag = None
    buffer.seek(0)
    return buffer, rows, pcm.getvalue()


class EgiptSampleTests(unittest.TestCase):
    def test_pinned_plan_default_has_no_network_and_changed_plan_is_rejected(self):
        plan = sample.load_plan()
        self.assertEqual(len(plan["samples"]), 8)
        self.assertEqual(plan["totalAudioBytes"], 10224558)
        self.assertFalse(plan["continuousPitchGroundTruthVerified"])
        with patch.object(sample, "checked_metadata", side_effect=AssertionError("네트워크 금지")), redirect_stdout(io.StringIO()):
            sample.main()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); (root / "fixtures").mkdir()
            (root / "fixtures/egipt-technique-sample-v1.json").write_bytes(b"changed")
            with patch.object(sample, "PROJECT", root), self.assertRaisesRegex(ValueError, "SHA"):
                sample.load_plan()

    def test_metadata_requires_open_fixed_license_version_url_and_archive(self):
        record = {"id": 15205644, "metadata": {"version": "1", "license": {"id": "cc-by-4.0"}, "access_right": "open"},
                  "files": [{"key": "EG-IPT.zip", "size": sample.ARCHIVE_BYTES,
                             "checksum": "md5:" + sample.ARCHIVE_MD5, "links": {"self": sample.ARCHIVE_URL}}]}
        sample.validate_metadata(record)
        for field in ("id", "license", "version", "access", "size", "url", "md5"):
            bad = copy.deepcopy(record)
            if field == "id": bad["id"] = True
            elif field == "license": bad["metadata"]["license"]["id"] = "other"
            elif field == "version": bad["metadata"]["version"] = "2"
            elif field == "access": bad["metadata"]["access_right"] = "restricted"
            elif field == "size": bad["files"][0]["size"] = True
            elif field == "url": bad["files"][0]["links"]["self"] = "https://other.invalid"
            else: bad["files"][0]["checksum"] = "md5:changed"
            with self.subTest(field=field), self.assertRaises(ValueError): sample.validate_metadata(bad)

    def test_only_known_central_directory_is_split_with_total_and_time_limits(self):
        requests = []
        def opening(request, timeout):
            start, end = map(int, request.headers["Range"].removeprefix("bytes=").split("-"))
            requests.append((start, end))
            self.assertLessEqual(end - start + 1, 8 * 1024 * 1024)
            return Response(b"\0" * (end - start + 1), sample.ARCHIVE_URL, start, end, sample.ARCHIVE_BYTES)
        reader = sample.CatalogReader(opening)
        reader.seek(sample.CENTRAL_OFFSET)
        self.assertEqual(len(reader.read(sample.CENTRAL_BYTES)), sample.CENTRAL_BYTES)
        self.assertEqual(len(requests), 3)
        self.assertEqual(reader.transferred, sample.CENTRAL_BYTES)
        reader.seek(0)
        with self.assertRaises(ValueError): reader.read(sample.CENTRAL_BYTES)
        with self.assertRaises(ValueError): reader.read()
        reader.transferred = reader.max_total_bytes
        with self.assertRaises(ValueError): reader.read(1)
        reader.deadline = 0
        with self.assertRaises(TimeoutError): reader.read(1)
        self.assertEqual(len(requests), 3)

    def test_receive_preserves_bytes_rejects_changed_metadata_format_and_overwrite(self):
        buffer, rows, raw = fixture()
        with tempfile.TemporaryDirectory() as folder, zipfile.ZipFile(buffer) as archive:
            target = Path(folder) / "demo.wav"
            report = sample.receive(archive, rows[0], target)
            self.assertEqual(target.read_bytes(), raw)
            self.assertEqual(report["sha256"], hashlib.sha256(raw).hexdigest())
            self.assertEqual(report["frames"], 8)
            with self.assertRaises(FileExistsError): sample.receive(archive, rows[0], target)
            self.assertEqual(target.read_bytes(), raw)
            for key, value in (("bytes", 1), ("compressedBytes", 1), ("crc32", "00000000"), ("headerOffset", 9)):
                bad = {**rows[0], key: value}
                with self.subTest(key=key), self.assertRaises(ValueError): sample.receive(archive, bad, target)
        for channels, width, rate in ((2, 3, 96000), (1, 2, 96000), (1, 3, 48000)):
            buffer, rows, _ = fixture(channels, width, rate)
            with tempfile.TemporaryDirectory() as folder, zipfile.ZipFile(buffer) as archive:
                target = Path(folder) / "wrong.wav"
                with self.assertRaises(ValueError): sample.receive(archive, rows[0], target)
                self.assertFalse(target.exists())

    def test_main_success_failure_and_cancel_keep_previous_and_completed_files(self):
        for failure in (None, ValueError, KeyboardInterrupt):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve()
                previous = root / "fixtures/external/egipt-15205644/previous"
                previous.mkdir(parents=True); (previous / "manifest.json").write_bytes(b"keep")
                buffer, rows, _ = fixture()
                plan = {"samples": rows, "totalAudioBytes": sum(row["bytes"] for row in rows), "license": "DEMO", "source": "DEMO"}
                original_receive = sample.receive
                count = 0
                def receive(archive, row, target):
                    nonlocal count
                    count += 1
                    if count == 2 and failure: raise failure()
                    return original_receive(archive, row, target)
                with patch.object(sample, "PROJECT", root), patch.object(sample, "load_plan", return_value=plan), patch.object(sample, "checked_metadata", return_value="DEMO"), patch.object(sample, "CatalogReader", return_value=buffer), patch.object(sample.shutil, "disk_usage", return_value=SimpleNamespace(free=1024**3)), patch.object(sample, "receive", side_effect=receive), redirect_stdout(io.StringIO()):
                    if failure:
                        with self.assertRaises(failure): sample.main(True)
                    else: sample.main(True)
                receipts = [path for path in previous.parent.glob("*/manifest.json") if path.parent != previous]
                self.assertEqual(len(receipts), 1)
                report = json.loads(receipts[0].read_bytes())
                expected = "CANCELED" if failure is KeyboardInterrupt else "FAILED" if failure else "DI_FILES_VERIFIED_NOT_ANALYZED"
                self.assertEqual(report["state"], expected)
                self.assertEqual(len(report["files"]), 1 if failure else 8)
                self.assertEqual(len(list(receipts[0].parent.glob("*.wav"))), 1 if failure else 8)
                self.assertFalse(report["actualAppJudgements"])
                self.assertEqual((previous / "manifest.json").read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
