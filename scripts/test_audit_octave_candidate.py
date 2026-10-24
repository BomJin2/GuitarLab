"""기존 적중·누락·무음·불확실 참조를 DEMO 결과로 모두 보존합니다."""

from contextlib import redirect_stdout
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_octave_candidate as audit


def demo():
    points = [{"index": i, "referenceMidi": None, "baseline": [None, None], "candidate": [None, None]}
              for i in range(38)]
    for index, reference, before, after in (
        (0, [64], None, 64.5), (1, [60], None, 48), (2, [], None, 56),
        (3, None, None, 44), (4, [55, 67], None, 55), (5, [60], 60, None),
    ):
        points[index].update(referenceMidi=reference, baseline=[before, 0.95 if before is not None else None],
                             candidate=[after, 0.95 if after is not None else None])
    return {"schemaVersion": 1, "state": "REJECTED_HELDOUT_REGRESSION", "productCodeChanged": False,
            "actualAppJudgements": False, "independentTechniqueGroundTruthAccepted": False,
            "cases": [{"clipId": "DEMO_fixed", "startMs": 0, "points": points}],
            "frozen": {"allCases": 1, "allPoints": 38, "monoPoints": 3, "silentPoints": 1, "unknownPoints": 33},
            "totals": {"points": 38, "mono": 3, "baselineCorrect": 1, "candidateCorrect": 1,
                       "baselineMissing": 2, "candidateMissing": 1, "regressions": 1, "improvements": 1,
                       "silentPoints": 1, "newVoicedSilent": 1, "changes": 6}}


class OctaveCandidateTests(unittest.TestCase):
    def test_improvement_cannot_hide_regression_new_wrong_silence_or_unknown(self):
        result = audit.summarize(demo())
        self.assertEqual(result["candidateState"], "REJECTED_HELDOUT_REGRESSION")
        self.assertEqual(result["totals"], demo()["totals"])
        self.assertEqual(result["diagnostics"], {
            "unknownPoints": 33, "polyPoints": 1, "newIncorrectMonoFromMissing": 1, "newVoicedUncertain": 1})

    def test_missing_stays_in_denominator_and_no_improvement_is_rejected(self):
        document = demo()
        for point in document["cases"][0]["points"]:
            point["referenceMidi"] = [64]
            point["baseline"] = point["candidate"] = [None, None]
        document["state"] = "REJECTED_NO_HELDOUT_IMPROVEMENT"
        document["frozen"].update(monoPoints=38, silentPoints=0, unknownPoints=0)
        document["totals"] = {key: 0 for key in document["totals"]}
        document["totals"].update(points=38, mono=38, baselineMissing=38, candidateMissing=38)
        self.assertEqual(audit.summarize(document)["totals"]["baselineMissing"], 38)

    def test_mutated_counts_indices_duplicate_windows_and_nonfinite_are_rejected(self):
        changes = [
            lambda d: d.update(schemaVersion=True),
            lambda d: d["frozen"].update(allCases=True),
            lambda d: d["totals"].update(regressions=True),
            lambda d: d["totals"].update(newVoicedSilent=0),
            lambda d: d.update(state="HELDOUT_QUALITY_PASSED_PERFORMANCE_PENDING"),
            lambda d: d["cases"].append(copy.deepcopy(d["cases"][0])),
            lambda d: d["cases"][0]["points"][0].update(index=True),
            lambda d: d["cases"][0]["points"][0].update(referenceMidi=[True]),
            lambda d: d["cases"][0]["points"][0].pop("referenceMidi"),
            lambda d: d["cases"][0]["points"][0].update(candidate=[64, float("nan")]),
            lambda d: d["cases"][0]["points"][0].update(candidate=[64, None]),
            lambda d: d["cases"][0]["points"][0].update(candidate=[64, 0.89]),
        ]
        for change in changes:
            document = demo(); change(document)
            with self.subTest(change=change), self.assertRaises(ValueError):
                audit.summarize(document)

    def test_cli_checks_source_hash_writes_new_receipt_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            directory = root / "src-tauri/target/runtime-validation/goertzel-candidate-demo"
            directory.mkdir(parents=True)
            path = directory / "heldout-results-demo.json"
            raw = json.dumps(demo()).encode(); path.write_bytes(raw)
            sha = hashlib.sha256(raw).hexdigest()
            with patch.object(audit, "PROJECT", root), redirect_stdout(io.StringIO()):
                first = audit.run(path, sha); second = audit.run(path, sha)
            self.assertNotEqual(first, second)
            self.assertEqual(path.read_bytes(), raw)
            receipt = json.loads(first.read_text(encoding="utf8"))
            self.assertEqual(receipt["state"], "AUDITED_WITHOUT_PRODUCT_ADOPTION")
            self.assertEqual(receipt["candidateState"], "REJECTED_HELDOUT_REGRESSION")
            with patch.object(audit, "PROJECT", root), self.assertRaises(ValueError):
                audit.run(path, "0" * 64)
            self.assertTrue(any(json.loads(p.read_text(encoding="utf8"))["state"] == "FAILED"
                                for p in directory.glob("candidate-audit-*.json")))
            private = root / "private.json"; private.write_bytes(raw)
            with patch.object(audit, "PROJECT", root), self.assertRaises(Exception):
                audit.run(private, sha)

    def test_failure_cancel_and_duplicate_json_keys_never_claim_completion(self):
        for failure, state in ((ValueError, "FAILED"), (KeyboardInterrupt, "CANCELED")):
            with self.subTest(state=state), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve()
                directory = root / "src-tauri/target/runtime-validation/goertzel-candidate-demo"
                directory.mkdir(parents=True)
                path = directory / "heldout-results-demo.json"
                raw = json.dumps(demo()).encode(); path.write_bytes(raw)
                old = directory / "candidate-audit-old.json"; old.write_bytes(b"keep")
                with patch.object(audit, "PROJECT", root), patch.object(audit, "summarize", side_effect=failure()), self.assertRaises(failure):
                    audit.run(path, hashlib.sha256(raw).hexdigest())
                receipt = next(p for p in directory.glob("candidate-audit-*.json") if p != old)
                self.assertEqual(json.loads(receipt.read_text(encoding="utf8"))["state"], state)
                self.assertEqual(path.read_bytes(), raw); self.assertEqual(old.read_bytes(), b"keep")
                duplicate = b'{"schemaVersion":1,"schemaVersion":2}'
                path.write_bytes(duplicate)
                with patch.object(audit, "PROJECT", root), self.assertRaises(ValueError):
                    audit.run(path, hashlib.sha256(duplicate).hexdigest())


if __name__ == "__main__":
    unittest.main()
