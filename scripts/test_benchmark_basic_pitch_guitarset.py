"""실제 모델 설치 없이 오프라인 지표의 대응/0점/자료 없음만 검증합니다."""

import unittest
from types import SimpleNamespace
from benchmark_basic_pitch_guitarset import maximum_matches, summarize, evaluate


class ModelMetricTests(unittest.TestCase):
    def test_maximum_pitch_matching_supports_many_predictions_and_no_invented_confidence(self):
        self.assertEqual(maximum_matches([60, 60.6], [59.6, 60.2]), 2)
        self.assertEqual(maximum_matches([40, 52], [40] + list(range(80, 128))), 1)

    def test_zero_f1_and_missing_denominator_are_distinct(self):
        self.assertEqual(summarize({"frames": 1, "expected": 1, "detected": 1, "matched": 0})["f1"], 0)
        self.assertIsNone(summarize({"frames": 1, "expected": 0, "detected": 0, "matched": 0})["f1"])

    def test_only_active_note_sets_are_compared_to_stable_reference_frames(self):
        case = {"kind": "TRACK", "startMs": 0, "sampleRate": 44100, "references": [[64]] * 37 + [None]}
        notes = [SimpleNamespace(onset_ms=0, offset_ms=1000, pitch_midi=64)]
        result = evaluate(notes, [case])
        self.assertEqual(result["all"]["matched"], 37)
        self.assertEqual(result["all"]["f1"], 1)
        self.assertEqual(result["unstableOrUnsupportedReferences"], 1)

    def test_same_stable_spectrum_windows_use_center_time_and_keep_missing_references(self):
        cases = [{"kind": "SPECTRUM", "startMs": 1000, "frames": 17640, "sampleRate": 44100, "references": [[64]]},
                 {"kind": "SPECTRUM", "references": [None]}]
        notes = [SimpleNamespace(onset_ms=1000, offset_ms=1400, pitch_midi=64)]
        result = evaluate(notes, cases)
        self.assertEqual(result["spectrumWindows"]["f1"], 1)
        self.assertEqual(result["unstableSpectrumReferences"], 1)


if __name__ == "__main__":
    unittest.main()
