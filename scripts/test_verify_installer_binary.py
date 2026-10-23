"""NSIS 표식 이외의 단 한 바이트 변화와 모호한 입력도 거부합니다."""

import unittest
from verify_installer_binary import nsis_payload, verify


class BinaryTests(unittest.TestCase):
    def test_only_single_known_bundle_marker_may_change(self):
        original = b"MZsynthetic test only__TAURI_BUNDLE_TYPE_VAR_UNKtail"
        installed = nsis_payload(original)
        self.assertEqual(verify(original, installed)["state"], "NSIS_BINARY_VERIFIED")
        for bad in (installed + b"extra", b"X" + installed[1:], original):
            with self.assertRaises(ValueError): verify(original, bad)
        for bad in (b"not a PE", b"MZno marker", original + original):
            with self.assertRaises(ValueError): nsis_payload(bad)


if __name__ == "__main__":
    unittest.main()
