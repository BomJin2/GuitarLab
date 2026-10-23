"""모델 설치 없이 공개 조각의 변조·경로·참조 경계를 검사합니다."""

import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from benchmark_basic_pitch_short_windows import checked_case, checked_sources


class ShortWindowTests(unittest.TestCase):
    def test_changed_public_source_is_rejected(self):
        with TemporaryDirectory(prefix="guitarlab-short-sources-test-") as folder:
            root = Path(folder).resolve()
            entries = []
            for index in range(8):
                name = f"public-{index}.wav"
                (root / name).write_bytes(b"fixture")
                entries.append({"name": name, "bytes": 7, "sha256": hashlib.sha256(b"fixture").hexdigest()})
            origin = {"files": entries}
            checked_sources(origin, root)
            (root / entries[0]["name"]).write_bytes(b"changed")
            with self.assertRaises(ValueError):
                checked_sources(origin, root)

    def test_exact_window_and_hash_are_required(self):
        with TemporaryDirectory(prefix="guitarlab-short-window-test-") as folder:
            root = Path(folder).resolve()
            raw = bytes(17640 * 4)
            path = root / "case-00001.f32"
            path.write_bytes(raw)
            case = {"kind": "SPECTRUM", "sampleRate": 44100, "frames": 17640,
                "references": [[64]], "file": path.name, "sha256": hashlib.sha256(raw).hexdigest()}
            self.assertEqual(checked_case(case, root), raw)
            for change in ({"sha256": "0" * 64}, {"references": [None]}, {"frames": 44100},
                           {"file": "../case-00001.f32"}, {"sampleRate": 48000}):
                with self.assertRaises(ValueError):
                    checked_case({**case, **change}, root)
            path.write_bytes(raw[:-4])
            with self.assertRaises(ValueError):
                checked_case(case, root)


if __name__ == "__main__":
    unittest.main()
