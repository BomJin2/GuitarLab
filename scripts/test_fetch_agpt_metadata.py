"""작은 공개 주석만 선택하고 기존 자료·실패 영수증을 보존하는지 검사합니다."""

from contextlib import redirect_stdout
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import fetch_agpt_metadata as sample


def metadata():
    return {"id": 10159492, "metadata": {"license": {"id": "cc-by-4.0"}}, "files": [{
        "key": sample.ARCHIVE, "size": sample.ARCHIVE_BYTES, "checksum": "md5:" + sample.ARCHIVE_MD5,
        "links": {"self": sample.RECORD + "/files/" + sample.ARCHIVE + "/content"}}]}


def archive_fixture():
    output = io.BytesIO()
    raw = b'first,second\r\n1,"two\nlines"\r\n'
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("aGPTset/metadata/demo.csv", raw)
        archive.writestr("aGPTset/data/audio.zip", b"must not read")
    output.seek(0)
    with zipfile.ZipFile(output) as archive:
        info = archive.getinfo("aGPTset/metadata/demo.csv")
        expected = {"demo.csv": (info.file_size, info.compress_size, info.CRC, hashlib.sha256(raw).hexdigest())}
    output.seek(0)
    output.transferred = 123
    output.etag = None
    return output, raw, expected


class AgptTests(unittest.TestCase):
    def test_fixed_metadata_rejects_changed_source_and_duplicate_files(self):
        value = metadata()
        self.assertEqual(sample.validate_metadata(value), value["files"][0])
        for change in ("record", "license", "size", "checksum", "url", "duplicate"):
            wrong = copy.deepcopy(value)
            if change == "record": wrong["id"] = 1
            elif change == "license": wrong["metadata"]["license"]["id"] = "unknown"
            elif change == "size": wrong["files"][0]["size"] -= 1
            elif change == "checksum": wrong["files"][0]["checksum"] = "md5:" + "0" * 32
            elif change == "url": wrong["files"][0]["links"]["self"] = "https://example.com/archive.zip"
            else: wrong["files"].append(copy.deepcopy(wrong["files"][0]))
            with self.subTest(change=change), self.assertRaises(ValueError): sample.validate_metadata(wrong)

    def test_metadata_response_is_bounded_before_parsing(self):
        for raw, accepted in [(json.dumps(metadata()).encode(), True), (b"x" * 65537, False)]:
            with patch.object(sample.urllib.request, "urlopen", return_value=io.BytesIO(raw)) as connect:
                if accepted: self.assertEqual(sample.checked_metadata()["size"], sample.ARCHIVE_BYTES)
                else:
                    with self.assertRaises(ValueError): sample.checked_metadata()
                self.assertEqual(connect.call_args.kwargs["timeout"], 25)

    def test_only_fixed_csv_crc_size_and_method_can_be_read(self):
        buffer, raw, expected = archive_fixture()
        with patch.object(sample, "CSV_FILES", expected), zipfile.ZipFile(buffer) as archive:
            self.assertEqual(sample.selected_bytes(archive, "demo.csv"), raw)
            with self.assertRaises(KeyError): sample.selected_bytes(archive, "../data/audio.zip")
            expected["demo.csv"] = (len(raw), expected["demo.csv"][1], 0, hashlib.sha256(raw).hexdigest())
            with patch.object(sample, "read_member") as read:
                with self.assertRaises(ValueError): sample.selected_bytes(archive, "demo.csv")
                read.assert_not_called()
            info = archive.getinfo("aGPTset/metadata/demo.csv")
            expected["demo.csv"] = (info.file_size, info.compress_size, info.CRC, "0" * 64)
            with self.assertRaisesRegex(ValueError, "SHA"): sample.selected_bytes(archive, "demo.csv")
            info.compress_type = zipfile.ZIP_STORED
            with self.assertRaises(ValueError): sample.selected_bytes(archive, "demo.csv")

    def test_csv_structure_supports_quoted_lines_but_rejects_ambiguous_or_broken_rows(self):
        self.assertEqual(sample.csv_shape(b'\xef\xbb\xbfa,b\r\n1,"two\nlines"\r\n'), {"columns": ["a", "b"], "rows": 1})
        for raw in (b"", b"a,a\n1,2\n", b"a,\n1,2\n", b"a,b\n1\n", b"a\n\x00\n", b"a\n\xff\n", b'a\n"unfinished'):
            with self.subTest(raw=raw), self.assertRaises((ValueError, UnicodeError, sample.csv.Error)): sample.csv_shape(raw)
        with self.assertRaises(ValueError): sample.csv_shape(b"a\n" + b"1\n" * 100001)

    def test_download_preserves_original_bytes_and_never_reads_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            marker = root / "keep.txt"; marker.write_bytes(b"keep")
            buffer, raw, expected = archive_fixture()
            with patch.object(sample, "PROJECT", root), patch.object(sample, "CSV_FILES", expected), patch.object(sample, "checked_metadata", return_value=metadata()["files"][0]), patch.object(sample, "RangeReader", return_value=buffer) as reader, redirect_stdout(io.StringIO()):
                sample.main()
                self.assertEqual(reader.call_args.kwargs, {"max_total_bytes": 2 * 1024 * 1024})
            manifests = list((root / "fixtures/external/agpt-10159492").glob("*/manifest.json"))
            self.assertEqual(len(manifests), 1)
            receipt = json.loads(manifests[0].read_bytes())
            self.assertEqual(receipt["state"], "METADATA_VERIFIED_NOT_AUDIO")
            self.assertFalse(receipt["audioDownloaded"])
            self.assertFalse(receipt["archiveMd5FullyVerified"])
            self.assertIsNone(receipt["etag"])
            self.assertEqual(receipt["files"][0]["rows"], 1)
            self.assertEqual((manifests[0].parent / "demo.csv").read_bytes(), raw)
            self.assertFalse(list(root.rglob("*.zip")))
            self.assertEqual(marker.read_bytes(), b"keep")

    def test_failed_or_canceled_read_leaves_receipt_without_replacing_existing_data(self):
        for cause in (ValueError("DEMO"), KeyboardInterrupt()):
            with self.subTest(error=type(cause).__name__), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve()
                previous = root / "fixtures/external/agpt-10159492/existing"
                previous.mkdir(parents=True); (previous / "manifest.json").write_bytes(b"keep")
                buffer, _, expected = archive_fixture()
                with patch.object(sample, "PROJECT", root), patch.object(sample, "CSV_FILES", expected), patch.object(sample, "checked_metadata", return_value=metadata()["files"][0]), patch.object(sample, "RangeReader", return_value=buffer), patch.object(sample, "selected_bytes", side_effect=cause), self.assertRaises(type(cause)):
                    sample.main()
                self.assertEqual((previous / "manifest.json").read_bytes(), b"keep")
                receipts = [json.loads(p.read_bytes()) for p in previous.parent.glob("*/manifest.json") if p.parent != previous]
                self.assertEqual(len(receipts), 1)
                self.assertEqual(receipts[0]["state"], "CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED")


if __name__ == "__main__":
    unittest.main()
