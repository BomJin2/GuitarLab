"""공개 분석 창 감사가 중심 시각·불확정/다성 문맥과 실패 분모를 구분하는지 검사합니다."""

from copy import deepcopy
import unittest
from unittest.mock import patch

from audit_guitarset_pitch_windows import checked_points, context_at, geometry, references_equal


class WindowContextTests(unittest.TestCase):
    def test_geometry_matches_original_sample_footprint_not_1024_at_source_rate(self):
        first, last, center = geometry(0, 44100)
        self.assertEqual(first, 0)
        self.assertAlmostEqual(last * 44100, 3071)
        self.assertAlmostEqual(center, 34.81859410430839)
        self.assertAlmostEqual(geometry(1, 44100)[0] * 44100, 1101)
        self.assertLess(geometry(37, 44100)[1], 1)
        for index, rate in [(-1, 44100), (38, 44100), (True, 44100), (0, 48000)]:
            with self.assertRaises(ValueError):
                geometry(index, rate)

    def test_context_does_not_treat_reference_gaps_as_silence_or_clear_mono(self):
        with patch('audit_guitarset_pitch_windows.continuous_reference', side_effect=[[64]] * 8 + [None] + [[64]] * 8):
            result = context_at([], [], 0, 0, 44100, 64)
        self.assertEqual(result['kind'], 'REFERENCE_UNCERTAIN')
        self.assertEqual(result['uncertainProbes'], 1)
        self.assertEqual(result['unvoicedProbes'], 0)
        with patch('audit_guitarset_pitch_windows.continuous_reference', side_effect=[[64]] * 8 + [[]] + [[64]] * 8):
            self.assertEqual(context_at([], [], 0, 0, 44100, 64)['kind'], 'UNVOICED_REFERENCE_PRESENT')

    def test_context_keeps_mixed_flags_and_50_cent_boundary(self):
        with patch('audit_guitarset_pitch_windows.continuous_reference', side_effect=[[64]] * 13 + [[64, 67], [65], None, []]):
            result = context_at([], [], 0, 0, 44100, 64)
        self.assertEqual(result, {'kind': 'POLY_REFERENCE_PRESENT', 'uncertainProbes': 1,
                                 'unvoicedProbes': 1, 'polyProbes': 1, 'differentMonoProbes': 1})
        for offset, expected in [(0.5, 'ANNOTATED_MONO_CONTEXT'), (0.5001, 'CHANGING_MONO_REFERENCE')]:
            with patch('audit_guitarset_pitch_windows.continuous_reference', return_value=[64 + offset]):
                self.assertEqual(context_at([], [], 0, 0, 44100, 64)['kind'], expected)

    def test_report_rejects_wrong_center_reference_missing_and_duplicate_points(self):
        case = {'kind': 'TRACK', 'clipId': 'own', 'startMs': 1000, 'sampleRate': 44100,
                'frames': 44100, 'references': [[64]] * 38}
        detail = {'clipId': 'own', 'startMs': 1000, 'points': [
            {'index': index, 'timeMs': geometry(index, 44100)[2], 'referenceMidi': [64],
             'detectedMidi': None, 'periodicity': None} for index in range(38)]}
        self.assertEqual(len(checked_points(case, detail)), 38)
        for key, value in [('timeMs', geometry(0, 44100)[2] + 1000), ('referenceMidi', []),
                           ('index', True), ('detectedMidi', float('nan')), ('periodicity', 0.95)]:
            wrong = deepcopy(detail)
            wrong['points'][0][key] = value
            with self.assertRaises(ValueError):
                checked_points(case, wrong)
        missing = deepcopy(detail)
        missing['points'].pop()
        with self.assertRaises(ValueError):
            checked_points(case, missing)
        duplicate = deepcopy(detail)
        duplicate['points'][1] = duplicate['points'][0]
        with self.assertRaises(ValueError):
            checked_points(case, duplicate)
        self.assertTrue(references_equal([64], [64 + 1e-13]))
        self.assertFalse(references_equal(None, []))
        self.assertFalse(references_equal([64], [65]))


if __name__ == '__main__':
    unittest.main()
