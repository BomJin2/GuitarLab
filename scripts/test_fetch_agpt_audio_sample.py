"""고정 계획·개별 파일 SHA/PCM 형식·취소/기존 파일 보존을 DEMO로 검사합니다."""

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

import fetch_agpt_audio_sample as sample
from test_agpt_audio_catalog import CountingBuffer


def fixture(channels=1, width=3):
    pcm = io.BytesIO()
    with wave.open(pcm, "wb") as audio:
        audio.setparams((channels, width, 48000, 8, "NONE", ""))
        audio.writeframes(b"\0" * 8 * width * channels)
    raw = pcm.getvalue()
    inner = io.BytesIO()
    samples = []
    with zipfile.ZipFile(inner, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index in range(8):
            name = f"demo{index}.wav"
            archive.writestr("audio/" + name, raw)
            info = archive.getinfo("audio/" + name)
            samples.append({"filename": name, "member": info.filename, "bytes": info.file_size,
                            "compressedBytes": info.compress_size, "crc32": f"{info.CRC:08x}",
                            "sha256": hashlib.sha256(raw).hexdigest(), "frames": 8})
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr(sample.MEMBER, inner.getvalue())
    reader = CountingBuffer(outer.getvalue()); reader.etag = None
    inner.seek(0)
    return reader, inner, samples, raw


class AudioSampleTests(unittest.TestCase):
    def test_plan_fingerprint_path_unique_names_and_size_limits(self):
        original = sample.load_plan()
        self.assertEqual(len(original["samples"]), 8)
        self.assertEqual(sum(row["notes"] for row in original["samples"]), 281)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); (root / "fixtures").mkdir()
            target = root / "fixtures/agpt-onset-sample-v1.json"
            target.write_bytes(b"untrusted")
            with patch.object(sample, "PROJECT", root), self.assertRaisesRegex(ValueError, "SHA"): sample.load_plan()
            for mode in ("path", "bool", "duplicates", "total"):
                value = copy.deepcopy(original)
                if mode == "path": value["samples"][0]["filename"] = "../demo.wav"
                elif mode == "bool": value["samples"][0]["bytes"] = True
                elif mode == "duplicates": value["samples"][1] = copy.deepcopy(value["samples"][0])
                else:
                    for row in value["samples"]: row["compressedBytes"] = 12 * 1024 * 1024
                raw = json.dumps(value).encode(); target.write_bytes(raw)
                with self.subTest(mode=mode), patch.object(sample, "PROJECT", root), patch.object(sample, "PLAN_SHA256", hashlib.sha256(raw).hexdigest()), self.assertRaises(ValueError): sample.load_plan()

    def test_receive_checks_crc_sha_and_full_pcm_format_before_writing(self):
        _, buffer, selected, raw = fixture()
        with tempfile.TemporaryDirectory() as folder, zipfile.ZipFile(buffer) as archive:
            target = Path(folder) / "demo.wav"
            result = sample.receive(archive, selected[0], target)
            self.assertTrue(result["wavFormatVerified"])
            self.assertEqual(target.read_bytes(), raw)
            for key, value in [("bytes", 1), ("compressedBytes", 1), ("crc32", "00000000"),
                               ("sha256", "0" * 64), ("frames", 9)]:
                bad = {**selected[0], key: value}
                destination = Path(folder) / (key + ".wav")
                with self.subTest(key=key), self.assertRaises(ValueError): sample.receive(archive, bad, destination)
                self.assertFalse(destination.exists())
        for channels, width in [(2, 3), (1, 2)]:
            _, buffer, selected, _ = fixture(channels, width)
            with tempfile.TemporaryDirectory() as folder, zipfile.ZipFile(buffer) as archive:
                destination = Path(folder) / "wrong.wav"
                with self.assertRaises(ValueError): sample.receive(archive, selected[0], destination)
                self.assertFalse(destination.exists())

    def test_existing_destination_is_never_replaced(self):
        _, buffer, selected, _ = fixture()
        with tempfile.TemporaryDirectory() as folder, zipfile.ZipFile(buffer) as archive:
            target = Path(folder) / "keep.wav"; target.write_bytes(b"keep")
            with self.assertRaises(FileExistsError): sample.receive(archive, selected[0], target)
            self.assertEqual(target.read_bytes(), b"keep")

    def test_main_completion_and_cancel_preserve_previous_data_and_verified_files(self):
        for cancel in (False, True):
            with self.subTest(cancel=cancel), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve()
                previous = root / "fixtures/external/agpt-audio-10159492/previous"
                previous.mkdir(parents=True); (previous / "manifest.json").write_bytes(b"keep")
                reader, inner, selected, _ = fixture()
                plan = {"source": "DEMO", "license": "DEMO", "samples": selected}
                nested_bytes = len(inner.getvalue())
                original_receive = sample.receive
                calls = 0
                def receive(archive, row, destination):
                    nonlocal calls
                    calls += 1
                    if cancel and calls == 2: raise KeyboardInterrupt()
                    return original_receive(archive, row, destination)
                with patch.object(sample, "PROJECT", root), patch.object(sample, "load_plan", return_value=plan), patch.object(sample, "AUDIO_BYTES", nested_bytes), patch.object(sample, "checked_metadata", return_value={"links": {"self": "DEMO"}, "size": reader.size}), patch.object(sample, "RangeReader", return_value=reader) as opening, patch.object(sample.shutil, "disk_usage", return_value=SimpleNamespace(free=1024**3)), patch.object(sample, "receive", side_effect=receive), redirect_stdout(io.StringIO()):
                    if cancel:
                        with self.assertRaises(KeyboardInterrupt): sample.main()
                    else: sample.main()
                    self.assertEqual(opening.call_args.kwargs, {"max_total_bytes": 40 * 1024 * 1024})
                manifests = [path for path in previous.parent.glob("*/manifest.json") if path.parent != previous]
                self.assertEqual(len(manifests), 1)
                receipt = json.loads(manifests[0].read_bytes())
                self.assertEqual(receipt["state"], "CANCELED" if cancel else "AUDIO_FILES_VERIFIED_NOT_EVALUATED")
                self.assertEqual(len(receipt["files"]), 1 if cancel else 8)
                self.assertFalse(receipt["accuracyMeasured"])
                self.assertEqual(len(list(manifests[0].parent.glob("*.wav"))), 1 if cancel else 8)
                self.assertTrue((manifests[0].parent / "ATTRIBUTION.md").is_file())
                self.assertEqual((previous / "manifest.json").read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
