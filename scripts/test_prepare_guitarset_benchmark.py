"""공개 참조의 전환·범위·불안정 제외를 실제 검출 결과와 독립적으로 확인합니다."""

import math
import unittest
from prepare_guitarset_benchmark import contours, reference_at, stable_reference, continuous_reference, note_masks


def value(midi):
    return {"voiced": True, "index": 0, "frequency": 440 * 2 ** ((midi - 69) / 12)}


class ReferenceTests(unittest.TestCase):
    def test_closest_voiced_reference_has_a_strict_time_limit_and_deduplicates_unisons(self):
        tracks = [([1.0], [value(64.0)]), ([1.0], [value(64.1)])]
        self.assertAlmostEqual(reference_at(tracks, 1.003)[64], 64.05)
        self.assertEqual(reference_at(tracks, 1.004), {})
        self.assertIsNone(reference_at([([1.0], [value(100)])], 1.0))
        self.assertIsNone(reference_at([([1.0], [{"voiced": True, "frequency": 0}])], 1.0))

    def test_stable_unvoiced_and_mono_windows_and_transitions_are_distinct(self):
        times = [i / 1000 for i in range(1001)]
        tracks = [(times, [value(64)] * len(times))]
        self.assertAlmostEqual(stable_reference(tracks, 0.5, 0.2, 17)[0], 64)
        self.assertEqual(stable_reference([], 0.5, 0.2, 17), [])
        changed = [(times, [value(64 if t < 0.5 else 67) for t in times])]
        self.assertIsNone(stable_reference(changed, 0.5, 0.2, 17))
        drift = [(times, [value(64 + 0.9 * t) for t in times])]
        self.assertIsNone(stable_reference(drift, 0.4, 0.35, 17))

    def test_continuous_reference_preserves_changes_without_stable_filter_or_quantization(self):
        times = [i / 1000 for i in range(1001)]
        silent = (times, [{"voiced": False, "frequency": 0}] * len(times))
        moving = (times, [value(64 + 2 * t) for t in times])
        tracks = [moving] + [silent] * 5
        self.assertIsNone(stable_reference(tracks, 0.5, 0.2, 17))
        self.assertAlmostEqual(continuous_reference(tracks, 0.251)[0], 64.502)
        self.assertAlmostEqual(continuous_reference(tracks, 0.751)[0], 65.502)
        self.assertEqual(continuous_reference([silent] * 6, 0.5), [])
        chord = [moving, (times, [value(69)] * len(times))] + [silent] * 4
        self.assertEqual(continuous_reference(chord, 0.5), [65, 69])

    def test_continuous_reference_does_not_turn_missing_conflicting_or_out_of_range_labels_into_silence(self):
        silent = ([1.0], [{"voiced": False, "frequency": 0}])
        self.assertIsNone(continuous_reference([silent] * 6, 1.004))
        self.assertIsNone(continuous_reference([silent] * 5 + [([], [])], 1.0))
        for bad in [value(100), {"voiced": True, "frequency": 0}]:
            self.assertIsNone(continuous_reference([silent] * 5 + [([1.0], [bad])], 1.0))
        with self.assertRaises(ValueError):
            continuous_reference([silent], 1.0)

    def test_note_mask_requires_active_f0_and_rejects_boundaries_and_conflicts(self):
        times = [i / 1000 for i in range(1001)]
        moving = (times, [value(64 + 2 * t) for t in times])
        empty = ([], [])
        tracks = [moving] + [empty] * 5
        masks = [[(0.0, 1.0)]] + [[]] * 5
        self.assertAlmostEqual(continuous_reference(tracks, 0.5, masks)[0], 65)
        self.assertIsNone(continuous_reference(tracks, 0.02, masks))
        self.assertIsNone(continuous_reference([empty] * 6, 0.5, masks))
        self.assertIsNone(continuous_reference(tracks, 0.5, [[]] * 6))
        self.assertEqual(continuous_reference([empty] * 6, 0.5, [[]] * 6), [])
        with self.assertRaises(ValueError):
            continuous_reference(tracks, 0.5, [])

    def test_note_mask_schema_matches_six_strings_and_rejects_invalid_intervals(self):
        annotations = [{"namespace": kind, "annotation_metadata": {"data_source": str(i)},
                        "data": []} for kind in ("pitch_contour", "note_midi") for i in range(6)]
        document = {"annotations": annotations}
        self.assertEqual(note_masks(document), [[]] * 6)
        for notes in [[{"time": 1, "duration": -1}], [{"time": math.nan, "duration": 1}],
                      [{"time": 1, "duration": 2}, {"time": 2, "duration": 1}]]:
            annotations[6]["data"] = notes
            with self.assertRaises(ValueError):
                note_masks(document)
        annotations[6]["data"] = []
        annotations[6]["annotation_metadata"]["data_source"] = '5'
        with self.assertRaises(ValueError):
            note_masks(document)

    def test_reference_schema_must_have_six_ordered_finite_strings(self):
        data = {"time": [0.1], "duration": [0.0], "value": [value(64)], "confidence": [None]}
        document = {"annotations": [{"namespace": "pitch_contour", "data": data} for _ in range(6)]}
        self.assertEqual(len(contours(document)), 6)
        for times in [[0.1, 0.1], [math.nan]]:
            bad = {**data, "time": times}
            with self.assertRaises(ValueError):
                contours({"annotations": [{"namespace": "pitch_contour", "data": bad}]})


if __name__ == "__main__":
    unittest.main()
