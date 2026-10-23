"""공개 DI의 고정 선택·범위/형식·비덮어쓰기와 PCM 변환을 자체 자료로 검사합니다."""

import io
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import guitar_techs_audio_probe as probe


class ProbeTests(unittest.TestCase):
    def test_only_four_fixed_di_files_and_48_windows_are_selected(self):
        self.assertEqual([(p, t) for p, t, _, _ in probe.SELECTION],
                         [(p, t) for p in ("P1", "P2") for t in ("Bendings", "Vibrato")])
        self.assertEqual(probe.START_SECONDS, tuple(range(1, 57, 5)))
        self.assertEqual(4 * len(probe.START_SECONDS), 48)
        with self.assertRaises(ValueError):
            probe.member_name("P3", "../private")

    def test_pcm_signed_endpoints_are_preserved_without_gain_normalization(self):
        for width in (2, 3, 4):
            limit = 1 << (8 * width - 1)
            raw = b"".join(n.to_bytes(width, "little", signed=True) for n in (-limit, 0, limit - 1))
            values = struct.unpack("<3f", probe.pcm_floats(raw, width, 1))
            self.assertEqual(values[:2], (-1.0, 0.0))
            self.assertAlmostEqual(values[2], (limit - 1) / limit, places=6)
        self.assertEqual(struct.unpack("<2f", probe.pcm_floats(struct.pack("<4h", 16384, 16384, 16384, -16384), 2, 2)),
                         (0.5, 0.0))
        for raw, width, channels in [(b"123", 2, 1), (b"1234", 2, 3), (b"1", 1, 1)]:
            with self.assertRaises(ValueError):
                probe.pcm_floats(raw, width, channels)

    def test_member_size_crc_and_new_file_only(self):
        memory = io.BytesIO()
        name = probe.member_name("P1", "Bendings")
        raw = b"own DI fixture"
        with zipfile.ZipFile(memory, "w") as archive:
            archive.writestr(name, raw)
        selection = (("P1", "Bendings", len(raw), len(raw)),)
        with tempfile.TemporaryDirectory(prefix="guitarlab-di-probe-") as folder:
            target = Path(folder) / "own.wav"
            with zipfile.ZipFile(io.BytesIO(memory.getvalue())) as archive:
                with self.assertRaises(ValueError):
                    probe.receive_member(archive, "P1", "Bendings", target)
                with patch.object(probe, "SELECTION", selection):
                    report = probe.receive_member(archive, "P1", "Bendings", target)
                    self.assertEqual(target.read_bytes(), raw)
                    self.assertEqual(probe.file_digest(target), report["sha256"])
                    with self.assertRaises(FileExistsError):
                        probe.receive_member(archive, "P1", "Bendings", target)
            broken = bytearray(memory.getvalue())
            broken[broken.index(raw)] ^= 1
            with zipfile.ZipFile(io.BytesIO(broken)) as archive, patch.object(probe, "SELECTION", selection):
                with self.assertRaises(zipfile.BadZipFile):
                    probe.receive_member(archive, "P1", "Bendings", Path(folder) / "bad.wav")


if __name__ == "__main__":
    unittest.main()
