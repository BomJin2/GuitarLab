"""ZIP 선택 수신의 제한·변경 감지·CRC를 네트워크 없이 검사합니다."""

import io
import re
import unittest
import zipfile
from fetch_guitarset_sample import RangeReader, read_member, sample_ids


class Response(io.BytesIO):
    def __init__(self, data, url, start, end, size):
        super().__init__(data)
        self.status = 206
        self.url = url
        self.headers = {"Content-Range": f"bytes {start}-{end}/{size}", "ETag": "고정"}

    def geturl(self):
        return self.url


class RangeTests(unittest.TestCase):
    def reader(self, raw, change=None):
        def open_response(request, timeout):
            self.assertEqual(timeout, 25)
            match = re.fullmatch(r"bytes=(\d+)-(\d+)", request.headers["Range"])
            self.assertIsNotNone(match)
            start, end = map(int, match.groups())
            response = Response(raw[start:end + 1], request.full_url, start, end, len(raw))
            if change:
                change(response)
            return response
        return RangeReader("https://zenodo.org/test", len(raw), open_response)

    def test_range_seek_zip_and_crc(self):
        target = io.BytesIO()
        with zipfile.ZipFile(target, "w") as archive:
            archive.writestr("source/00_BN1-129-Eb_solo.jams", b"testsample")
        raw = target.getvalue()
        reader = self.reader(raw)
        with zipfile.ZipFile(reader) as archive:
            info, data = read_member(archive, "source/00_BN1-129-Eb_solo.jams")
            self.assertEqual(data, b"testsample")
            self.assertEqual(info.file_size, 10)
        broken = bytearray(raw)
        broken[raw.index(b"testsample")] ^= 1
        with zipfile.ZipFile(self.reader(bytes(broken))) as archive:
            with self.assertRaises(zipfile.BadZipFile):
                read_member(archive, "source/00_BN1-129-Eb_solo.jams")

    def test_full_download_redirect_wrong_range_and_truncation_are_rejected(self):
        for change in [lambda r: setattr(r, "status", 200),
                       lambda r: setattr(r, "url", "https://other.invalid/test"),
                       lambda r: r.headers.update({"Content-Range": "bytes 1-2/20"}),
                       lambda r: r.truncate(1)]:
            with self.assertRaises(ValueError):
                self.reader(b"1234567890", change).read(4)

    def test_budget_and_changed_etag_are_rejected_before_using_data(self):
        reader = self.reader(b"1234567890")
        reader.read(1)
        reader.etag = "변경됨"
        with self.assertRaises(ValueError):
            reader.read(1)
        reader = self.reader(b"1234567890")
        reader.transferred = 15 * 1024 * 1024
        with self.assertRaises(ValueError):
            reader.read(1)
        with self.assertRaises(ValueError):
            reader.seek(-1)

    def test_sample_selection_is_fixed_before_quality_results(self):
        selected = ["00_BN1-129-Eb_solo", "01_Jazz1-200-B_solo", "00_Rock1-90-C_comp", "01_Funk1-114-Ab_comp"]
        names = ["source/" + name + ".jams" for name in selected]
        self.assertEqual(sample_ids(list(reversed(names))), selected)
        with self.assertRaises(ValueError):
            sample_ids(names[:-1])

    def test_larger_public_audio_budget_keeps_per_request_limit(self):
        for limit in (0, True, 256 * 1024 * 1024 + 1):
            with self.assertRaises(ValueError):
                RangeReader("https://zenodo.org/test", 20, max_total_bytes=limit)
        reader = self.reader(b"1234567890")
        reader.max_total_bytes = 3
        reader.read(3)
        with self.assertRaises(ValueError):
            reader.read(1)
        reader = RangeReader("https://zenodo.org/test", 100 * 1024 * 1024,
                             max_total_bytes=96 * 1024 * 1024)
        with self.assertRaises(ValueError):
            reader.read(8 * 1024 * 1024 + 1)


if __name__ == "__main__":
    unittest.main()
