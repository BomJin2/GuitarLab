"""내부 stored ZIP의 위치 매핑과 전체 건너뛰기/잘못된 헤더 거부를 검사합니다."""

import copy
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import agpt_audio_catalog as catalog
from agpt_audio_catalog import MEMBER, StoredMemberView


class CountingBuffer(io.BytesIO):
    def __init__(self, value):
        super().__init__(value)
        self.size = len(value)
        self.transferred = 0

    def read(self, count=-1):
        value = super().read(count)
        self.transferred += len(value)
        return value


def fixture(method=zipfile.ZIP_STORED):
    inner = io.BytesIO()
    with zipfile.ZipFile(inner, "w") as archive:
        archive.writestr("padding.bin", b"x" * 1024 * 1024)
        archive.writestr("audio/demo.wav", b"DEMO_WAV")
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w", compression=method) as archive:
        archive.writestr("before.txt", b"before")
        archive.writestr(MEMBER, inner.getvalue())
    parent = CountingBuffer(outer.getvalue())
    with zipfile.ZipFile(parent) as archive:
        info = archive.getinfo(MEMBER)
    parent.transferred = 0
    return parent, info, inner.getvalue()


class CatalogTests(unittest.TestCase):
    def test_nested_directory_and_selected_read_skip_one_megabyte_payload(self):
        parent, info, _ = fixture()
        view = StoredMemberView(parent, info)
        with zipfile.ZipFile(view) as archive:
            self.assertEqual(archive.namelist(), ["padding.bin", "audio/demo.wav"])
            self.assertEqual(archive.read("audio/demo.wav"), b"DEMO_WAV")
        self.assertLess(parent.transferred, 2048)
        self.assertLess(parent.transferred, info.file_size)

    def test_seek_read_and_eof_never_leave_member_bounds(self):
        parent, info, raw = fixture()
        view = StoredMemberView(parent, info)
        self.assertTrue(view.seekable())
        self.assertEqual(view.read(0), b"")
        self.assertEqual(view.tell(), 0)
        self.assertEqual(view.read(4), raw[:4])
        self.assertEqual(view.seek(-2, 1), 2)
        self.assertEqual(view.read(4), raw[2:6])
        self.assertEqual(view.seek(-3, 2), len(raw) - 3)
        self.assertEqual(view.read(100), raw[-3:])
        self.assertEqual(view.read(), b"")
        self.assertEqual(view.tell(), len(raw))
        for position, whence in [(-1, 0), (len(raw) + 1, 0), (0, 3), (1.1, 0), (True, 0)]:
            with self.subTest(position=position, whence=whence), self.assertRaises(ValueError): view.seek(position, whence)
        with self.assertRaises(ValueError): view.read(-2)

    def test_compressed_encrypted_other_named_or_out_of_range_members_are_rejected(self):
        parent, info, _ = fixture(zipfile.ZIP_DEFLATED)
        with self.assertRaises(ValueError): StoredMemberView(parent, info)
        parent, info, _ = fixture()
        for key, value in [("filename", "other.zip"), ("flag_bits", 1), ("file_size", info.file_size + 1),
                           ("header_offset", -1), ("header_offset", parent.size)]:
            changed = copy.copy(info)
            setattr(changed, key, value)
            with self.subTest(key=key), self.assertRaises(ValueError): StoredMemberView(parent, changed)

    def test_local_header_signature_flags_method_name_and_lengths_must_match(self):
        for offset, replacement in [(0, b"BAD!"), (6, b"\x01\x00"), (8, b"\x08\x00"),
                                    (26, b"\x00\x00"), (28, b"\xff\xff"), (30, b"x")]:
            parent, info, _ = fixture()
            parent.seek(info.header_offset + offset); parent.write(replacement)
            with self.subTest(offset=offset), self.assertRaises(ValueError): StoredMemberView(parent, info)
        parent, info, _ = fixture()
        parent.size = info.header_offset + 30 + len(MEMBER) + info.file_size - 1
        with self.assertRaises(ValueError): StoredMemberView(parent, info)

    def test_short_parent_response_is_rejected_without_advancing_view(self):
        parent, info, _ = fixture()
        view = StoredMemberView(parent, info)
        parent.seek(view.start + 10); parent.truncate()
        with self.assertRaises(ValueError): view.read(100)
        self.assertEqual(view.tell(), 0)

    def test_catalog_main_preserves_previous_receipts_and_writes_no_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            marker = root / "keep.json"; marker.write_bytes(b"keep")
            for _ in range(2):
                parent, info, _ = fixture()
                with patch.object(catalog, "PROJECT", root), patch.object(catalog, "AUDIO_BYTES", info.file_size), patch.object(catalog, "checked_metadata", return_value={"links": {"self": "DEMO"}, "size": parent.size}), patch.object(catalog, "RangeReader", return_value=parent) as reader, redirect_stdout(io.StringIO()):
                    parent.etag = None
                    catalog.main()
                    self.assertEqual(reader.call_args.kwargs, {"max_total_bytes": 2 * 1024 * 1024})
            receipts = list((root / "src-tauri/target/runtime-validation").glob("agpt-audio-catalog-*.json"))
            self.assertEqual(len(receipts), 2)
            for path in receipts:
                receipt = json.loads(path.read_bytes())
                self.assertEqual(receipt["state"], "AGPT_AUDIO_CATALOG_ONLY")
                self.assertFalse(receipt["wavExtracted"])
                self.assertFalse(receipt["nestedCrcFullyVerified"])
                self.assertLess(receipt["receivedBytes"], 4096)
                self.assertEqual(len(receipt["files"]), 2)
            self.assertEqual(marker.read_bytes(), b"keep")
            self.assertFalse(list(root.rglob("*.wav")))


if __name__ == "__main__":
    unittest.main()
