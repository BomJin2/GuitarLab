"""정수 타격 참조·비정규화 PCM24 파생 입력·실패/원문 보존을 검사합니다."""

import copy
from contextlib import redirect_stdout
import csv
import hashlib
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import prepare_agpt_onset_benchmark as benchmark
from test_fetch_agpt_audio_sample import fixture


def note():
    return {"audio_file_path": "demo0.wav", "onset_label_samples": "4", "onset_label_seconds": "0.00010",
            "pitch_midi": "64", "expressive_technique_id": "5", "string_number": "1", "isPercussive": "False"}


def selected():
    return {"filename": "demo0.wav", "frames": 8, "notes": 1, "techniqueId": "5", "stringNumber": "1"}


class BenchmarkTests(unittest.TestCase):
    def test_pcm24_signed_edges_are_exact_little_endian_float_without_gain_changes(self):
        integers = [-8388608, -123456, -1, 0, 1, 123456, 8388607]
        raw = b"".join(value.to_bytes(3, "little", signed=True) for value in integers)
        result = benchmark.pcm24(raw)
        self.assertEqual(struct.unpack("<7f", result), tuple(value / 8388608 for value in integers))
        self.assertEqual(len(result), 4 * len(integers))
        with self.assertRaises(ValueError): benchmark.pcm24(b"\0\0")

    def test_reference_keeps_integer_sample_time_and_rejects_bad_or_missing_rows(self):
        row = note(); sample = selected()
        result = benchmark.references([row], [sample])["demo0.wav"]
        self.assertEqual(result, [{"sample": 4, "rawPitchMidi": "64", "pitchReferenceStatus": "UNVERIFIED_RANGE_ONLY", "sourceSeconds": "0.00010"}])
        for value, status in [("None", "MISSING"), ("440", "OUTSIDE_MIDI_RANGE"), ("nan", "INVALID_NUMERIC")]:
            unknown = benchmark.references([{**row, "pitch_midi": value}], [sample])["demo0.wav"]
            self.assertEqual(len(unknown), 1)
            self.assertEqual(unknown[0]["rawPitchMidi"], value)
            self.assertEqual(unknown[0]["pitchReferenceStatus"], status)
            self.assertNotIn("midi", unknown[0])
        for key, value in [("onset_label_samples", "8"), ("onset_label_seconds", "NaN"),
                           ("onset_label_seconds", "1"),
                           ("expressive_technique_id", "4"), ("string_number", "6"), ("isPercussive", "True")]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                benchmark.references([{**row, key: value}], [sample])
        for rows in ([], [row, copy.deepcopy(row)]):
            with self.assertRaises(ValueError): benchmark.references(rows, [sample])

    def test_source_hash_and_size_are_required_before_conversion(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); source = root / "demo.bin"; source.write_bytes(b"DEMO")
            with patch.object(benchmark, "PROJECT", root):
                self.assertEqual(benchmark.verified_bytes(source, 4, hashlib.sha256(b"DEMO").hexdigest()), b"DEMO")
                with self.assertRaises(ValueError): benchmark.verified_bytes(source, 3, hashlib.sha256(b"DEM").hexdigest())
                with self.assertRaises(ValueError): benchmark.verified_bytes(source, 4, "0" * 64)

    def test_preparation_preserves_sources_and_keeps_failed_output_separate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            audio_root = root / "fixtures/external/agpt-audio-10159492" / str(uuid4())
            metadata_root = root / "fixtures/external/agpt-10159492" / str(uuid4())
            audio_root.mkdir(parents=True); metadata_root.mkdir(parents=True)
            _, _, samples, raw = fixture()
            sample = {**samples[0], **selected()}
            source = {"state": "AUDIO_FILES_VERIFIED_NOT_EVALUATED", "planSha256": benchmark.PLAN_SHA256,
                      "files": [{**sample, "crcVerified": True, "wavFormatVerified": True}]}
            metadata = {"state": "METADATA_VERIFIED_NOT_AUDIO", "recordId": 10159492}
            (audio_root / "manifest.json").write_text(json.dumps(source), encoding="utf-8")
            (metadata_root / "manifest.json").write_text(json.dumps(metadata), encoding="utf-8")
            (audio_root / sample["filename"]).write_bytes(raw)
            table = io.StringIO(newline=""); writer = csv.DictWriter(table, fieldnames=list(note()))
            writer.writeheader(); writer.writerow(note()); csv_raw = table.getvalue().encode()
            (metadata_root / "note_labels.csv").write_bytes(csv_raw)
            snapshot = {path: path.read_bytes() for path in [audio_root / "manifest.json", audio_root / sample["filename"], metadata_root / "manifest.json", metadata_root / "note_labels.csv"]}
            plan = {"samples": [sample]}
            expected = {"note_labels.csv": (len(csv_raw), 0, 0, hashlib.sha256(csv_raw).hexdigest())}
            with patch.object(benchmark, "PROJECT", root), patch.object(benchmark, "load_plan", return_value=plan), patch.object(benchmark, "CSV_FILES", expected), redirect_stdout(io.StringIO()):
                with patch.object(benchmark, "pcm24", side_effect=ValueError("DEMO")), self.assertRaises(ValueError):
                    benchmark.main(audio_root, metadata_root)
                benchmark.main(audio_root, metadata_root)
            outputs = list(audio_root.glob("onset-benchmark-*/benchmark.json"))
            self.assertEqual(len(outputs), 2)
            documents = [(path, json.loads(path.read_bytes())) for path in outputs]
            self.assertEqual(sorted(value["state"] for _, value in documents), ["AGPT_ONSET_BENCHMARK_PREPARED", "FAILED"])
            path, result = next((path, value) for path, value in documents if value["state"] == "AGPT_ONSET_BENCHMARK_PREPARED")
            self.assertFalse(result["gainNormalized"])
            self.assertEqual(result["tailPaddingFrames"], 0)
            self.assertEqual(result["cases"][0]["references"][0]["sample"], 4)
            self.assertEqual((path.parent / "cases/case-00000.f32").read_bytes(), b"\0" * 32)
            for source, previous in snapshot.items(): self.assertEqual(source.read_bytes(), previous)


if __name__ == "__main__":
    unittest.main()
