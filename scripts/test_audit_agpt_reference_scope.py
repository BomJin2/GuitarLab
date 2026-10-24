"""DEMO 참조로 범위/분모·실패 시 출력 없음·원본 보존을 검사합니다."""

from contextlib import redirect_stdout
import csv
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import audit_agpt_reference_scope as audit
from test_prepare_agpt_onset_benchmark import note, selected


class ScopeTests(unittest.TestCase):
    def test_filename_priority_and_integer_upper_bound_do_not_convert_pitch_units(self):
        for name in ("unpitched_impro.wav", "demo.wav"):
            self.assertEqual(audit.scope_status(name, "None"), "AUTHOR_FILENAME_FILTER_EXCLUDED")
        for raw in ("-1", "0", "64", "107"):
            self.assertEqual(audit.scope_status("pitched_demo.wav", raw), "AUTHOR_TASK_A_INCLUDED")
        for raw in ("108", "127", "440"):
            self.assertEqual(audit.scope_status("pitched_demo.wav", raw), "AUTHOR_UPPER_BOUND_EXCLUDED")
        for raw in ("", "None", "NaN", "inf", "64.0", " 64", "64 "):
            self.assertEqual(audit.scope_status("pitched_demo.wav", raw), "RAW_PITCH_UNRESOLVED")
        for raw in (True, 64, None, "1" * 129):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                audit.scope_status("pitched_demo.wav", raw)

    def test_all_reference_rows_and_denominators_are_kept_without_accuracy(self):
        events = [{"sample": i, "rawPitchMidi": raw} for i, raw in enumerate(("64", "108", "None"))]
        report = audit.summarize({"pitched_demo.wav": events, "demo.wav": events})
        self.assertEqual(report["sourceReferences"], 6)
        self.assertEqual(report["counts"], {"AUTHOR_TASK_A_INCLUDED": 1, "AUTHOR_UPPER_BOUND_EXCLUDED": 1,
                                          "RAW_PITCH_UNRESOLVED": 1, "AUTHOR_FILENAME_FILTER_EXCLUDED": 3})
        self.assertEqual([{k: row[k] for k in event} for row, event in zip(report["cases"][0]["references"], events)], events)
        for key in ("pitchEvaluationEnabled", "groundTruthQualityAccepted", "independentHeldOutEvaluation", "actualAppJudgements"):
            self.assertIs(report[key], False)
        self.assertNotIn("pitchAccuracy", report)
        self.assertTrue(all("scopeStatus" not in event for event in events))

    def test_cli_checks_provenance_before_output_and_never_overwrites_sources_or_prior_results(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            metadata = root / "fixtures/external/agpt-10159492" / str(uuid4())
            metadata.mkdir(parents=True)
            notebook = root / "src-tauri/target/runtime-validation/DEMO.ipynb"
            notebook.parent.mkdir(parents=True)
            notebook_raw = b'DEMO: raise RuntimeError("must never execute")'
            notebook.write_bytes(notebook_raw)
            manifest = metadata / "manifest.json"
            manifest.write_text(json.dumps({"schemaVersion": 1, "state": "METADATA_VERIFIED_NOT_AUDIO", "recordId": 10159492}), encoding="utf-8")
            row = note(); row["audio_file_path"] = "pitched_demo.wav"
            sample = {**selected(), "filename": row["audio_file_path"]}
            table = io.StringIO(newline="")
            writer = csv.DictWriter(table, fieldnames=list(row))
            writer.writeheader(); writer.writerow(row)
            data = table.getvalue().encode()
            source = metadata / "note_labels.csv"; source.write_bytes(data)
            expected = {"note_labels.csv": (len(data), 0, 0, hashlib.sha256(data).hexdigest())}
            snapshot = {path: path.read_bytes() for path in (source, manifest, notebook)}
            with patch.object(audit, "PROJECT", root), patch.object(audit.sources, "PROJECT", root), \
                    patch.object(audit, "NOTEBOOK_BYTES", len(notebook_raw)), \
                    patch.object(audit, "NOTEBOOK_SHA256", hashlib.sha256(notebook_raw).hexdigest()), \
                    patch.object(audit, "CSV_FILES", expected), patch.object(audit, "load_plan", return_value={"samples": [sample]}), \
                    redirect_stdout(io.StringIO()):
                with patch.object(audit, "NOTEBOOK_SHA256", "0" * 64), self.assertRaisesRegex(ValueError, "SHA"):
                    audit.main(metadata, notebook)
                outside = root / "DEMO.ipynb"; outside.write_bytes(notebook_raw)
                with self.assertRaisesRegex(ValueError, "경로"):
                    audit.main(metadata, outside)
                self.assertEqual(list(metadata.glob("author-pitch-scope-*.json")), [])
                source.write_bytes(b"corrupt")
                with self.assertRaises(ValueError): audit.main(metadata, notebook)
                source.write_bytes(data)
                manifest.write_text(json.dumps({"schemaVersion": 1, "state": "METADATA_VERIFIED_NOT_AUDIO", "recordId": True}), encoding="utf-8")
                with self.assertRaises(ValueError): audit.main(metadata, notebook)
                manifest.write_text(json.dumps({"schemaVersion": True, "state": "METADATA_VERIFIED_NOT_AUDIO", "recordId": 10159492}), encoding="utf-8")
                with self.assertRaises(ValueError): audit.main(metadata, notebook)
                manifest.write_bytes(snapshot[manifest])
                self.assertEqual(list(metadata.glob("author-pitch-scope-*.json")), [])
                first = audit.main(metadata, notebook); first_raw = first.read_bytes()
                second = audit.main(metadata, notebook)
                self.assertNotEqual(first, second)
                self.assertEqual(first.read_bytes(), first_raw)
                self.assertEqual(first_raw, second.read_bytes())
                self.assertEqual(json.loads(first_raw)["sourceReferences"], 1)
            for path, raw in snapshot.items(): self.assertEqual(path.read_bytes(), raw)


if __name__ == "__main__":
    unittest.main()
