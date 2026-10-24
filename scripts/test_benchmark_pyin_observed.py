"""추가 모델 없이 DEMO 신호·대응/실패 경계만 검사합니다."""

import array
import copy
from contextlib import redirect_stdout
import hashlib
import io
import json
import math
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

import benchmark_pyin_observed as benchmark


class PyinObservedTests(unittest.TestCase):
    def test_preprocessing_keeps_fixed_geometry_dc_and_common_guards(self):
        reduced, masks = benchmark.preprocess(array.array("f", [0.25] * 44100))
        self.assertEqual(reduced, array.array("f", [0.0] * 14700))
        self.assertEqual(masks, [False] * 38)
        samples = array.array("f", (0.3 * math.sin(math.tau * 330 * i / 44100) for i in range(44100)))
        reduced, masks = benchmark.preprocess(samples)
        self.assertEqual(len(reduced), 14700); self.assertEqual(masks, [True] * 38)
        samples[:50] = array.array("f", [1.0] * 50)
        self.assertEqual(benchmark.preprocess(samples)[1], [False] * 38)
        for samples in ([], [float("nan")] * 44100, [1.1] * 44100):
            with self.assertRaises(ValueError): benchmark.preprocess(samples)

    def test_probability_is_separate_and_common_gate_never_changes_raw_output(self):
        frequencies = [130.8127826502993] * 38
        masks = [False] + [True] * 37
        rows = benchmark.observations(frequencies, [True] * 38, [0.2] * 38, masks)
        self.assertIsNone(rows[0]["candidateMidi"])
        self.assertEqual(rows[0]["rawHz"], frequencies[0])
        self.assertAlmostEqual(rows[1]["candidateMidi"], 48)
        self.assertEqual(rows[1]["voicedProbability"], 0.2)
        self.assertNotIn("confidence", rows[1])
        self.assertIsNone(benchmark.observations([None]*38, [False]*38, [0.1]*38, [True]*38)[0]["candidateMidi"])
        for hz, flags, probability in (([None]*38, [True]*38, [0.2]*38),
                ([float("inf")]*38, [False]*38, [0.2]*38), (frequencies, [1]*38, [0.2]*38),
                (frequencies, [True]*38, [True]*38), (frequencies, [True]*38, [float("nan")]*38),
                (frequencies[:37], [True]*38, [0.2]*38)):
            with self.assertRaises(ValueError): benchmark.observations(hz, flags, probability, [True]*38)

    def test_every_reference_class_and_missing_pitch_remains_in_counts(self):
        examples = [(None, None, 60), ([], None, 60), ([60, 64], 64, None),
                    ([60], 60, 48), ([64], None, 64.5), ([60], None, None)]
        total = {}
        for reference, baseline, candidate in examples:
            for key, value in benchmark.compare(reference, baseline, candidate).items():
                total[key] = total.get(key, 0) + value
        self.assertEqual(total, {"points": 6, "mono": 3, "silent": 1, "unknown": 1, "poly": 1,
            "baselineCorrect": 1, "pyinCorrect": 1, "baselineMissing": 2, "pyinMissing": 1,
            "gains": 1, "losses": 1, "baselineVoicedSilent": 0, "pyinVoicedSilent": 1})

    def test_plan_rejects_source_tampering_private_path_bool_and_tuned_parameters(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            target = root / "src-tauri/target/runtime-validation/pyin-baseline-demo"; target.mkdir(parents=True)
            names = {"originalBenchmark": "fixtures/external/guitarset-v1.1.0/a.json",
                "originalReport": "fixtures/external/guitarset-v1.1.0/b.json",
                "additionalBenchmark": "fixtures/external/guitarset-v1.1.0/c.json",
                "additionalReport": "src-tauri/target/runtime-validation/goertzel-candidate-0004f82b-0b2a-4fca-b5bb-dd8e2d892717/d.json",
                "productDsp": "src-tauri/src/audio/dsp.rs"}
            sources = {}; expected = {}
            for key, name in names.items():
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True)
                raw = ("DEMO " + key).encode(); path.write_bytes(raw)
                expected[key] = hashlib.sha256(raw).hexdigest()
                sources[key] = {"path": name, "bytes": len(raw), "sha256": expected[key]}
            plan = {"schemaVersion": 1, "state": "OFFLINE_COMPARISON_REGISTERED_BEFORE_EXECUTION",
                "posthocObservedData": True, "independentGroundTruthAccepted": False, "productCodeChanged": False,
                "actualAppJudgements": False, "streamingEquivalent": False, "versions": benchmark.VERSIONS,
                "parameters": benchmark.PARAMETERS, "pointsPerCase": 38, "caseCounts": [91, 91], "sources": sources}
            path = target / "plan.json"
            with patch.object(benchmark, "PROJECT", root), patch.object(benchmark, "EXPECTED", expected):
                path.write_text(json.dumps(plan), encoding="utf8")
                self.assertEqual(len(benchmark.protocol(path)[0]), 5)
                for mode in ("schema", "parameter", "path", "hash", "size"):
                    bad = copy.deepcopy(plan)
                    if mode == "schema": bad["schemaVersion"] = True
                    elif mode == "parameter": bad["parameters"]["boltzmann_parameter"] = True
                    elif mode == "path": bad["sources"]["productDsp"]["path"] = "private.txt"
                    elif mode == "hash": bad["sources"]["productDsp"]["sha256"] = "0" * 64
                    else: bad["sources"]["productDsp"]["bytes"] = True
                    path.write_text(json.dumps(bad), encoding="utf8")
                    with self.assertRaises(ValueError): benchmark.protocol(path)

    def test_failure_cancel_preserve_previous_results_and_restore_network_functions(self):
        for failure, state in ((ValueError, "FAILED"), (KeyboardInterrupt, "CANCELED")):
            with self.subTest(state=state), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); path = root / "plan.json"; path.write_bytes(b"DEMO")
                previous = root / "previous.json"; previous.write_bytes(b"keep")
                connect = socket.create_connection
                with patch.object(benchmark, "protocol", return_value=({}, "DEMO")), patch.object(benchmark, "predictor", side_effect=failure()), redirect_stdout(io.StringIO()), self.assertRaises(failure):
                    benchmark.run(path)
                receipt = next(root.glob("pyin-observations-*.json"))
                self.assertEqual(json.loads(receipt.read_text(encoding="utf8"))["state"], state)
                self.assertEqual(previous.read_bytes(), b"keep"); self.assertEqual(path.read_bytes(), b"DEMO")
                self.assertIs(socket.create_connection, connect)


if __name__ == "__main__":
    unittest.main()
