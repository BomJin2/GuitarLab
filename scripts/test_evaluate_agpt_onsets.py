"""타격 전용 분모·일대일 대응과 참조 음정 보류/잘못된 검출 기록을 검사합니다."""

import copy
import unittest

from evaluate_agpt_onsets import audit_events, evaluate
from fetch_agpt_audio_sample import PLAN_SHA256


def fixture():
    samples = [{"filename": f"demo{i}.wav", "frames": 48000, "notes": 1} for i in range(8)]
    cases = [{"clipId": sample["filename"], "frames": 48000, "references": [{"sample": 4800,
              "rawPitchMidi": "440" if i == 0 else "64", "sourceSeconds": "0.1",
              "pitchReferenceStatus": "OUTSIDE_MIDI_RANGE" if i == 0 else "UNVERIFIED_RANGE_ONLY"}]}
             for i, sample in enumerate(samples)]
    issues = {"OUTSIDE_MIDI_RANGE": 1, "UNVERIFIED_RANGE_ONLY": 7}
    benchmark = {"schemaVersion": 1, "state": "AGPT_ONSET_BENCHMARK_PREPARED", "source": "AG-PT-set10159492",
                 "license": "cc-by-4.0", "planSha256": PLAN_SHA256, "pitchEvaluationEnabled": False,
                 "referencePolicy": "onset-sample-column-only-v1", "referencePitchIssues": issues,
                 "gainNormalized": False, "tailPaddingFrames": 0, "noiseGateDbfs": -50, "cases": cases}
    report = {"schemaVersion": 1, "state": "COMPLETED", "sampleRate": 48000, "coldStart": True,
              "tailPaddingFrames": 0, "noiseGateDbfs": -50, "actualAppJudgements": False,
              "actualDeviceLatencyMeasured": False, "pitchEvaluationEnabled": False,
              "referencePolicy": benchmark["referencePolicy"], "referencePitchIssues": issues,
              "clips": [{"clipId": sample["filename"], "frames": 48000, "processingMs": 1,
                         "discontinuities": 0, "events": [{"onsetSample": 4800, "emittedSample": 8896,
                                                         "pitchMidi": 64, "confidence": 0.99}]} for sample in samples]}
    return benchmark, report, {"samples": samples}


class EvaluationTests(unittest.TestCase):
    def test_bad_reference_pitch_is_retained_in_timing_denominator_without_pitch_accuracy(self):
        benchmark, report, plan = fixture()
        result = evaluate(benchmark, report, plan)
        self.assertFalse(result["pitchEvaluationEnabled"])
        self.assertEqual(result["referencePitchIssues"], {"OUTSIDE_MIDI_RANGE": 1, "UNVERIFIED_RANGE_ONLY": 7})
        for row in result["totals"].values():
            self.assertEqual((row["expected"], row["detected"], row["matched"]), (8, 8, 8))
            self.assertEqual(row["f1"], 1)
        self.assertNotIn("pitchAccuracy", result)
        self.assertAlmostEqual(result["emissionDelayMs"]["absoluteMedianMs"], 4096 / 48)

    def test_extra_and_unverified_attacks_are_not_hidden_or_counted_twice(self):
        benchmark, report, plan = fixture()
        report["clips"][0]["events"].append({"onsetSample": 10000, "emittedSample": 14096,
                                               "pitchMidi": None, "confidence": None})
        result = evaluate(benchmark, report, plan)
        self.assertEqual(result["unverifiedEvents"], 1)
        self.assertEqual(result["pitchReturnedEvents"], 8)
        self.assertEqual(result["totals"]["5"]["detected"], 9)
        self.assertEqual(result["totals"]["5"]["extraDetectedEvents"], 1)
        self.assertEqual(result["totals"]["5"]["matched"], 8)
        self.assertEqual(result["eventAudit50ms"], {"matchedWithPitch": 8, "matchedUnverified": 0,
            "extraWithPitch": 0, "extraUnverified": 1,
            "extraInsideReferenceWindow": 0, "extraOutsideReferenceWindow": 1})

    def test_pitch_candidate_does_not_replace_already_matched_unverified_attack(self):
        benchmark, report, plan = fixture()
        events = report["clips"][0]["events"]
        events[0].update(onsetSample=4320, pitchMidi=None, confidence=None)
        events.append({"onsetSample": 5760, "emittedSample": 9856, "pitchMidi": 64, "confidence": 0.99})
        result = evaluate(benchmark, report, plan)
        row = result["perClip"]["demo0.wav"]
        self.assertEqual(row["perTolerance"]["50"]["pairs"][0]["detectedIndex"], 0)
        self.assertEqual(row["eventAudit50ms"], {"matchedWithPitch": 0, "matchedUnverified": 1,
            "extraWithPitch": 1, "extraUnverified": 0,
            "extraInsideReferenceWindow": 1, "extraOutsideReferenceWindow": 0,
            "extraEvents": [{"detectedIndex": 1, "nearestReferenceIndex": 0,
                "nearestReferenceMatchedDetectedIndex": 0, "deltaToNearestMs": 20,
                "insideReferenceWindow": True, "pitchReturned": True}]})
        self.assertEqual(result["totals"]["50"]["detected"], 9)

    def test_nearest_reference_tie_and_exact_window_boundary_are_deterministic(self):
        events = [{"onsetSample": 7200, "pitchMidi": None}, {"onsetSample": 12048, "pitchMidi": None}]
        row = audit_events([100, 200], events, [])
        self.assertEqual(row["extraInsideReferenceWindow"], 1)
        self.assertEqual(row["extraOutsideReferenceWindow"], 1)
        self.assertEqual(row["extraEvents"][0]["nearestReferenceIndex"], 0)
        self.assertEqual(row["extraEvents"][0]["deltaToNearestMs"], 50)
        self.assertIsNone(row["extraEvents"][0]["nearestReferenceMatchedDetectedIndex"])
        self.assertEqual(audit_events([100], [], []), {"matchedWithPitch": 0, "matchedUnverified": 0,
            "extraWithPitch": 0, "extraUnverified": 0, "extraInsideReferenceWindow": 0,
            "extraOutsideReferenceWindow": 0, "extraEvents": []})

    def test_changed_mode_missing_clips_and_invalid_timestamps_never_produce_metrics(self):
        for mode in ("pitch", "source", "duplicate", "negative", "bool", "late", "nan", "denominator"):
            benchmark, report, plan = fixture()
            event = report["clips"][0]["events"][0]
            if mode == "pitch": report["pitchEvaluationEnabled"] = True
            elif mode == "source": benchmark["source"] = "DEMO_UNKNOWN"
            elif mode == "duplicate": report["clips"][1] = copy.deepcopy(report["clips"][0])
            elif mode == "negative": event["onsetSample"] = -1
            elif mode == "bool": event["onsetSample"] = True
            elif mode == "late": event["emittedSample"] = 48000
            elif mode == "nan": event["pitchMidi"] = float("nan")
            else: benchmark["referencePitchIssues"] = {}
            with self.subTest(mode=mode), self.assertRaises(ValueError): evaluate(benchmark, report, plan)

    def test_json_booleans_cannot_masquerade_as_contract_version_padding_or_count(self):
        for mode in ("benchmark_version", "report_version", "benchmark_padding", "report_padding", "count"):
            benchmark, report, plan = fixture()
            if mode == "benchmark_version": benchmark["schemaVersion"] = True
            elif mode == "report_version": report["schemaVersion"] = True
            elif mode == "benchmark_padding": benchmark["tailPaddingFrames"] = False
            elif mode == "report_padding": report["tailPaddingFrames"] = False
            else: benchmark["referencePitchIssues"]["OUTSIDE_MIDI_RANGE"] = True
            with self.subTest(mode=mode), self.assertRaises(ValueError): evaluate(benchmark, report, plan)


if __name__ == "__main__":
    unittest.main()
