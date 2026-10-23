"""최대 일대일 onset 대응의 경계·중복·불확정 입력을 검사합니다."""

import unittest
from evaluate_guitarset_onsets import match_onsets, match_times, reference_notes, distribution


def note(onset, pitch=64):
    return {"onsetMs": onset, "offsetMs": onset + 200, "pitchMidi": pitch}


class OnsetTests(unittest.TestCase):
    def test_augmenting_path_preserves_maximum_matching(self):
        self.assertEqual(len(match_onsets([note(100), note(200)], [note(120), note(0)], 120)), 2)
        self.assertEqual(len(match_onsets([note(0), note(0)], [note(0)], 50)), 1)

    def test_timing_pitch_and_octave_boundaries(self):
        self.assertEqual(len(match_onsets([note(0)], [note(120, 64.5)], 120)), 1)
        self.assertFalse(match_onsets([note(0)], [note(120.01)], 120))
        self.assertFalse(match_onsets([note(0)], [note(0, 76)], 120))
        with self.assertRaises(ValueError):
            match_onsets([note(float('nan'))], [], 120)

    def test_only_near_unison_reference_is_merged(self):
        tracks = [{"namespace": "note_midi", "data": []} for _ in range(6)]
        tracks[0]["data"] = [{"time": 0, "duration": 0.2, "value": 64}, {"time": 0.03, "duration": 0.2, "value": 64}]
        tracks[1]["data"] = [{"time": 0.005, "duration": 0.2, "value": 64}]
        values, merged, unsupported = reference_notes({"annotations": tracks})
        self.assertEqual((len(values), merged, unsupported), (2, 1, 0))
        self.assertIsNone(distribution([]))
        self.assertEqual(distribution([-2, 1, 10])["absoluteP95Ms"], 10)

    def test_timing_only_matching_preserves_maximum_pairs_and_inclusive_boundary(self):
        self.assertEqual(len(match_times([10, 20], [1, 11], 10)), 2)
        self.assertEqual(len(match_times([100, 100], [105], 5)), 1)
        self.assertFalse(match_times([100], [105.01], 5))
        self.assertEqual(match_times([], [], 25), [])

    def test_timing_only_rejects_invalid_times_and_unbounded_inputs(self):
        for value in (True, float("nan"), float("inf"), -1, 60001):
            with self.subTest(value=value), self.assertRaises(ValueError): match_times([value], [], 5)
        with self.assertRaises(ValueError): match_times([0] * 513, [], 5)
        with self.assertRaises(ValueError): match_times([], [0] * 2049, 5)
        with self.assertRaises(ValueError): match_times([], [], 1)


if __name__ == "__main__":
    unittest.main()
