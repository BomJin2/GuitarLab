"""주기 조건 감사를 합성 궤적으로 검사합니다. 실제 주법 정답이 아닙니다."""

import copy
import hashlib
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import audit_egipt_periodicity as audit


def curve(at):
    return [{"timeMs":30+i*25, "midi":64+at(0.03+i*0.025)/100, "confidence":0.99} for i in range(38)]


class PeriodicityAuditTests(unittest.TestCase):
    def test_existing_fit_and_rejection_conditions_remain_distinct(self):
        result = audit.audit_points(curve(lambda t:40*math.sin(math.tau*6*t+0.4)))
        best = result["bestWithinExisting3To9Hz"]
        self.assertEqual(result["unmetExistingConditions"], [])
        self.assertAlmostEqual(best["rateHz"], 6, delta=0.2)
        self.assertAlmostEqual(best["depthCents"], 80, delta=8)
        self.assertGreater(best["fit"], 0.9)
        drift = audit.audit_points(curve(lambda t:200*t+40*math.sin(math.tau*6*t)))
        self.assertIn("LINEAR_DRIFT_OVER_50_CENTS", drift["unmetExistingConditions"])
        wide = audit.audit_points(curve(lambda t:100*math.sin(math.tau*4*t)))
        self.assertIn("DEPTH_OUTSIDE_35_TO_150_CENTS", wide["unmetExistingConditions"])
        self.assertEqual(audit.audit_points(curve(lambda t:0))["unmetExistingConditions"], ["NO_PERIODIC_VARIATION"])

    def test_malformed_and_weak_discontinuous_points_cannot_get_a_candidate(self):
        original = curve(lambda t:40*math.sin(math.tau*6*t))
        for field, value in (("midi", float("nan")), ("confidence", True), ("timeMs", -1), ("timeMs", 1000)):
            bad = copy.deepcopy(original); bad[1][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError): audit.audit_points(bad)
        low = copy.deepcopy(original); low[0]["confidence"] = 0.94
        self.assertEqual(audit.audit_points(low)["unmetExistingConditions"], ["POINT_QUALITY_OR_CONTINUITY"])
        negative = copy.deepcopy(original); negative[0]["timeMs"] = -0.5
        with self.assertRaises(ValueError): audit.audit_points(negative)
        gap = copy.deepcopy(original)
        for point in gap[10:13]: point.update(midi=None, confidence=None)
        self.assertIsNone(audit.audit_points(gap)["bestWithinExisting3To9Hz"])
        missing = copy.deepcopy(original)
        for point in missing[:5]: point.update(midi=None, confidence=None)
        self.assertIsNone(audit.audit_points(missing)["bestWithinExisting3To9Hz"])

    def test_fixed_input_sha_new_output_and_source_preservation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            parent = root / "fixtures/external/egipt-15205644" / str(uuid4()); parent.mkdir(parents=True)
            source = parent / "pitch-observations-demo.json"
            rows = [{"file":"DEMO-vibrato.wav", "startMs":i*1000, "coverage":1.0, "minConfidence":0.99,
                     "points":curve(lambda t:40*math.sin(math.tau*6*t))} for i in range(3)]
            rows += [{"file":"DEMO-ordinary.wav", "coverage":0} for _ in range(28)]
            raw = json.dumps({"state":"EGIPT_PITCH_MOTION_OBSERVED", "observations":rows}).encode()
            source.write_bytes(raw)
            with patch.object(audit, "PROJECT", root):
                with self.assertRaisesRegex(ValueError, "SHA"): audit.audit(source)
                with patch.object(audit, "OBSERVATION_SHA", hashlib.sha256(raw).hexdigest()):
                    first = audit.audit(source); second = audit.audit(source)
            self.assertNotEqual(first, second)
            self.assertEqual(source.read_bytes(), raw)
            report = json.loads(first.read_bytes())
            self.assertTrue(report["posthocSelection"])
            self.assertFalse(report["productThresholdsChanged"])
            self.assertFalse(report["actualAppJudgements"])
            self.assertEqual(len(report["cases"]), 3)


if __name__ == "__main__":
    unittest.main()
