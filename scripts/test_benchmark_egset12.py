"""외부 주석 전환·unison·24bit 부호와 원본 경로 경계를 검사합니다."""

import unittest
from pathlib import Path
from benchmark_egset12 import mono_24_stereo, reference_interval, checked_source


class EGSetTests(unittest.TestCase):
    def test_signed_24bit_and_stereo_downmix(self):
        raw = b"".join(x.to_bytes(3, "little", signed=True) for x in (-8388608, -8388608, 8388607, 8388607, -100, 100))
        samples, difference = mono_24_stereo(raw)
        self.assertEqual(samples[0], -1)
        self.assertAlmostEqual(samples[1], 8388607 / 8388608)
        self.assertEqual(samples[2], 0)
        self.assertEqual(difference, 200 / 8388608)
        with self.assertRaises(ValueError):
            mono_24_stereo(raw[:-1])

    def test_guard_catches_even_short_transition_between_probes(self):
        notes = [{"onsetMs": 100, "offsetMs": 900, "pitchMidi": 64}, {"onsetMs": 451, "offsetMs": 452, "pitchMidi": 67}]
        self.assertIsNone(reference_interval(notes, 400, 500))
        self.assertIsNone(reference_interval(notes, 130, 200))
        self.assertEqual(reference_interval(notes, 131, 200), [64])
        self.assertEqual(reference_interval(notes + [notes[0]], 131, 200), [64])
        self.assertEqual(reference_interval(notes, 1000, 1100), [])
        with self.assertRaises(ValueError):
            reference_interval(notes, 500, 400)

    def test_non_fixture_path_is_rejected_before_loading(self):
        with self.assertRaises(ValueError):
            checked_source(Path(__file__))


if __name__ == "__main__":
    unittest.main()
