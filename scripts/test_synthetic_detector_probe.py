"""개인 오디오나 장치를 사용하지 않는 DSP 관측 도구의 입력/결과 계약을 검사합니다."""

import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipUnless(shutil.which("rustc"), "DSP 관측 도구 검사에는 Rust 컴파일러가 필요합니다.")
class SyntheticDetectorProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="guitarlab-synthetic-detector-")
        cls.executable = Path(cls.temp.name) / "synthetic-detector.exe"
        source = Path(__file__).resolve().parent / "probes/synthetic_detector.rs"
        subprocess.run(
            ["rustc", "--edition=2021", "-O", "--crate-name", "synthetic_detector_test", str(source), "-o", str(cls.executable)],
            check=True, capture_output=True, timeout=60,
        )

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def run_probe(self, *args):
        return subprocess.run([str(self.executable), *args], capture_output=True, text=True, encoding="utf-8", timeout=10)

    def test_short_observation_is_paced_and_uses_expected_frames(self):
        result = self.run_probe("1")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["state"], "SYNTHETIC_DETECTOR_OBSERVED")
        self.assertEqual(report["frames"], 48000)
        self.assertEqual(report["blocks"], 100)
        self.assertEqual(report["outputs"], 43)
        self.assertGreaterEqual(report["elapsedSeconds"], 1)
        self.assertEqual(report["discontinuities"], 0)
        self.assertEqual(report["fullScaleFrames"], 0)
        self.assertGreater(report["pitchOutputs"], 0)
        self.assertGreaterEqual(report["blockWorkMaxMs"], report["blockWorkP95Ms"])

    def test_invalid_duration_is_rejected_before_observation(self):
        for seconds in ("0", "301", "-1", "not-a-number"):
            with self.subTest(seconds=seconds):
                result = self.run_probe(seconds)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")

    def test_missing_or_extra_arguments_are_rejected(self):
        for args in ((), ("1", "extra")):
            with self.subTest(args=args):
                result = self.run_probe(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
