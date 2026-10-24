"""배음 계수/전처리/허용 경로를 DEMO 합성 입력으로 검사합니다."""

import array
import copy
from contextlib import redirect_stdout
import hashlib
import io
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_harmonic_evidence as audit


class HarmonicEvidenceTests(unittest.TestCase):
    def test_coefficients_keep_known_amplitudes_without_inferring_fundamental(self):
        rate=12000; hz=375; midi=69+12*math.log2(hz/440)
        plain=[0.8*math.sin(math.tau*hz*i/rate) for i in range(1024)]
        rich=[v+0.1*math.sin(math.tau*hz/2*i/rate)+0.1*math.sin(math.tau*hz*1.5*i/rate) for i,v in enumerate(plain)]
        first=audit.features(plain,rate,midi); second=audit.features(rich,rate,midi)
        self.assertAlmostEqual(first["amplitudes"][1],0.8,delta=0.001)
        self.assertAlmostEqual(second["amplitudes"][0],0.1,delta=0.001)
        self.assertAlmostEqual(second["amplitudes"][2],0.1,delta=0.001)
        self.assertLess(first["oddToEvenPowerDb"],-60)
        self.assertAlmostEqual(second["oddToEvenPowerDb"],10*math.log10(0.02/0.64),delta=0.01)
        self.assertNotIn("fundamentalHz",second)

    def test_native_preprocessing_keeps_f32_bucket_order_and_track_dc(self):
        pcm=[0.1,0.2,-0.3,0.4]*1024
        expected=audit.f32(audit.f32(audit.f32(audit.f32(0.1)+0.2)-0.3)+0.4)/4
        self.assertEqual(audit.onset_window(pcm,4095),[audit.f32(expected)]*1024)
        cancellation=array.array("f",[1.0,1e-8,-1.0,1e-8]*1024)
        self.assertEqual(audit.onset_window(cancellation,4095),[audit.f32(cancellation[1]/4)]*1024)
        track=array.array("f",[0.25]*44100)
        self.assertEqual(audit.track_window(track,37),array.array("f",[0.0]*1024))
        for index in (-1,38,True):
            with self.assertRaises(ValueError): audit.track_window(track,index)

    def test_invalid_shapes_nonfinite_or_unaligned_end_are_rejected(self):
        for values,rate,midi in (([],12000,64),([0.0]*1024,True,64),([0.0]*1024,12000,True),([float("nan")]*1024,12000,64)):
            with self.assertRaises(ValueError): audit.features(values,rate,midi)
        with self.assertRaises(ValueError): audit.onset_window([0.0]*5000,4096)

    def test_protocol_rejects_private_paths_sha_and_threshold_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve(); directory=root/"src-tauri/target/runtime-validation/harmonic-evidence-demo"; directory.mkdir(parents=True)
            names={"guitarsetBenchmark":"fixtures/external/guitarset-v1.1.0/a.json","guitarsetReport":"fixtures/external/guitarset-v1.1.0/b.json",
                   "agptBenchmark":"fixtures/external/agpt-audio-10159492/a.json","agptPreviousComparison":"src-tauri/target/runtime-validation/agpt-octave-ratio-8de4be48-69b2-420f-8b29-c56679c98437/a.json","productDsp":"src-tauri/src/audio/dsp.rs"}
            sources={}; expected={}
            for key,name in names.items():
                path=root/name; path.parent.mkdir(parents=True,exist_ok=True); raw=("DEMO-"+key).encode(); path.write_bytes(raw)
                expected[key]=hashlib.sha256(raw).hexdigest(); sources[key]={"path":name,"bytes":len(raw),"sha256":expected[key]}
            plan={"schemaVersion":1,"state":"FEATURE_POLICY_REGISTERED_BEFORE_COEFFICIENT_MEASUREMENT","frequencyMultiples":audit.MULTIPLES,"newDecisionThreshold":None,"sources":sources}
            path=directory/"plan.json"; path.write_text(json.dumps(plan),encoding="utf8")
            with patch.object(audit,"PROJECT",root),patch.object(audit,"EXPECTED",expected):
                loaded,_=audit.read_protocol(path); self.assertEqual(len(loaded),5)
                for mode in ("path","hash","threshold","bool"):
                    bad=copy.deepcopy(plan)
                    if mode=="path": bad["sources"]["productDsp"]["path"]="private.txt"
                    elif mode=="hash": bad["sources"]["productDsp"]["sha256"]="0"*64
                    elif mode=="threshold": bad["newDecisionThreshold"]=0.4
                    else: bad["frequencyMultiples"][1]=True
                    path.write_text(json.dumps(bad),encoding="utf8")
                    with self.assertRaises(ValueError): audit.read_protocol(path)

    def test_failure_and_cancel_keep_existing_files_and_never_claim_completion(self):
        for failure,state in ((ValueError,"FAILED"),(KeyboardInterrupt,"CANCELED")):
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as folder:
                root=Path(folder); plan=root/"plan.json"; plan.write_bytes(b"DEMO")
                previous=root/"harmonic-observations-previous.json"; previous.write_bytes(b"keep")
                with patch.object(audit,"read_protocol",return_value=({"guitarsetBenchmark":root/"DEMO"},"DEMO")),patch.object(audit,"read_json",side_effect=failure()),redirect_stdout(io.StringIO()):
                    with self.assertRaises(failure): audit.run(plan)
                reports=[p for p in root.glob("harmonic-observations-*.json") if p!=previous]
                self.assertEqual(len(reports),1)
                result=json.loads(reports[0].read_bytes())
                self.assertEqual(result["state"],state)
                self.assertFalse(result["productCodeChanged"])
                self.assertFalse(result["actualAppJudgements"])
                self.assertEqual(previous.read_bytes(),b"keep")
                self.assertEqual(plan.read_bytes(),b"DEMO")


if __name__=="__main__":
    unittest.main()
