"""타격 전용 분모·일대일 대응과 참조 음정 보류/잘못된 검출 기록을 검사합니다."""

import copy
import unittest

from evaluate_agpt_onsets import evaluate
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


if __name__ == "__main__":
    unittest.main()
