"""고정 공개 신호의 배음 계수만 관측합니다. 기본음/성부/점수는 판정하지 않습니다."""

import array
import hashlib
import json
import math
from pathlib import Path
import statistics
import struct
import sys
from uuid import uuid4

from audit_guitarset_pitch_windows import checked_pcm, checked_points, context_at, read_json
from backup_local_data import checked_path, safe_member
from benchmark_basic_pitch_short_windows import checked_sources
from package_validation import unique_object
from prepare_guitarset_benchmark import contours, note_masks

PROJECT = Path(__file__).resolve().parents[1]
MULTIPLES = [0.5, 1, 1.5, 2, 2.5, 3]
EXPECTED = {
    "guitarsetBenchmark":"bfa232946a88ff1796f0b8ed7adb021664b8fed0d41ad198e5b4456a255b7be1",
    "guitarsetReport":"e4e96b4378c0a6f100630f38a92f51dc47dc102ff8a68438587177a4d65ab65e",
    "agptBenchmark":"ec3dba627fc9086d189de86906443adc91fcaad51adee4b9857b55ce6377de5b",
    "agptPreviousComparison":"ee92e0a64cd5d4b6e6ccf807ae3449dbcebca22ed3c57786af0da5913a834cde",
    "productDsp":"98c6258fc339d97fed1500e829415e88ff8c8a87a4d8aa903b1f8330e0d75b33",
}


def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def track_window(samples, index):
    if len(samples) != 44100 or type(index) is not int or not 0 <= index < 38:
        raise ValueError("고정 GuitarSet 창 오류")
    mean = 0.0
    for value in samples:
        mean += value
    mean /= len(samples)
    first = index * 367 * 3
    return array.array("f", ((samples[i] + samples[i+1] + samples[i+2]) / 3 - mean
                            for i in range(first, first + 3072, 3)))


def onset_window(samples, emitted):
    if type(emitted) is not int or not 4095 <= emitted < len(samples) or (emitted+1) % 4:
        raise ValueError("고정 AGPT 방출 시각 오류")
    result = []
    for first in range(emitted+1-4096, emitted+1, 4):
        value = 0.0
        for sample in samples[first:first+4]:
            value = f32(value+sample)
        result.append(f32(value/4))
    return result


def features(samples, rate, midi):
    if (len(samples) != 1024 or type(rate) not in (int,float) or rate not in (12000,14700)
            or type(midi) not in (int,float) or not math.isfinite(midi) or not 39.5 <= midi <= 88.5
            or any(not math.isfinite(v) or abs(v) > 1 for v in samples)):
        raise ValueError("배음 관측 입력 오류")
    hz = 440 * 2**((midi-69)/12)
    mean = sum(samples) / len(samples)
    weighted = [(v-mean) * (0.5-0.5*math.cos(math.tau*i/1023)) for i,v in enumerate(samples)]
    amplitudes = []
    for multiple in MULTIPLES:
        angle = math.tau * hz * multiple / rate
        real = sum(v*math.cos(angle*i) for i,v in enumerate(weighted))
        imaginary = sum(v*math.sin(angle*i) for i,v in enumerate(weighted))
        amplitudes.append(math.hypot(real,imaginary)*4/1023)
    odd = sum(amplitudes[i]**2 for i in (0,2,4))
    even = sum(amplitudes[i]**2 for i in (1,3,5))
    return {"detectedHz":hz,"lowerOctaveInEngineRange":hz/2>=70,
            "amplitudes":amplitudes,"oddToEvenPowerDb":10*math.log10(odd/even) if min(odd,even)>1e-24 else None,
            "strongestOddToDetectedDb":20*math.log10(max(amplitudes[0::2])/amplitudes[1])
            if min(max(amplitudes[0::2]),amplitudes[1])>1e-12 else None}


def read_protocol(path):
    path = Path(path).absolute()
    validation = PROJECT / "src-tauri/target/runtime-validation"
    checked_path(validation,path)
    if path.name != "plan.json" or not path.parent.name.startswith("harmonic-evidence-") or path.stat().st_size>32768:
        raise ValueError("등록 계획 경로/크기 오류")
    raw = path.read_bytes()
    plan = json.loads(raw,object_pairs_hook=unique_object)
    if (type(plan["schemaVersion"]) is not int or plan["schemaVersion"]!=1
            or plan["state"]!="FEATURE_POLICY_REGISTERED_BEFORE_COEFFICIENT_MEASUREMENT"
            or plan["frequencyMultiples"]!=MULTIPLES
            or any(type(v) not in (int,float) for v in plan["frequencyMultiples"])
            or plan["newDecisionThreshold"] is not None
            or set(plan["sources"])!=set(EXPECTED)):
        raise ValueError("고정 관측 계획 변경")
    allowed = {
        "guitarsetBenchmark":"fixtures/external/guitarset-v1.1.0/",
        "guitarsetReport":"fixtures/external/guitarset-v1.1.0/",
        "agptBenchmark":"fixtures/external/agpt-audio-10159492/",
        "agptPreviousComparison":"src-tauri/target/runtime-validation/agpt-octave-ratio-8de4be48-69b2-420f-8b29-c56679c98437/",
    }
    paths = {}
    for key,item in plan["sources"].items():
        safe_member(item["path"])
        if ((key=="productDsp" and item["path"]!="src-tauri/src/audio/dsp.rs")
                or (key!="productDsp" and not item["path"].startswith(allowed[key]))):
            raise ValueError("허용한 공개 원본/제품 파일 경로가 아님")
        source = PROJECT / item["path"]
        checked_path(PROJECT,source)
        if (not 0<source.stat().st_size<=4*1024*1024 or source.stat().st_size!=item["bytes"]
                or item["sha256"]!=EXPECTED[key] or hashlib.sha256(source.read_bytes()).hexdigest()!=EXPECTED[key]):
            raise ValueError("고정 입력 지문 변경")
        paths[key]=source
    return paths,hashlib.sha256(raw).hexdigest()


def agpt_pcm(case,root):
    safe_member(case["file"])
    if Path(case["file"]).name!=case["file"] or type(case["frames"]) is not int or not 0<case["frames"]<=3*1024*1024:
        raise ValueError("AGPT 공개 조각 이름/길이 오류")
    path=root/case["file"]; checked_path(PROJECT,path)
    if path.stat().st_size!=case["frames"]*4:
        raise ValueError("AGPT 공개 조각 크기 오류")
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=case["sha256"]:
        raise ValueError("AGPT 공개 조각 SHA 오류")
    values=array.array("f"); values.frombytes(raw)
    if sys.byteorder!="little": values.byteswap()
    if any(not math.isfinite(v) or abs(v)>1 for v in values): raise ValueError("AGPT PCM 값 오류")
    return values


def run(plan_path):
    paths,plan_sha=read_protocol(plan_path)
    result={"schemaVersion":1,"state":"MEASURING","planSha256":plan_sha,"frequencyMultiples":MULTIPLES,
            "auditScriptSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),"pythonVersion":sys.version.split()[0],
            "posthocCohortSelection":True,"productCodeChanged":False,"actualAppJudgements":False,
            "independentGroundTruthAccepted":False,"newDecisionThreshold":None,"guitarset":[],"agpt":[]}
    destination=Path(plan_path).absolute().parent/("harmonic-observations-"+str(uuid4())+".json")
    try:
        benchmark,_=read_json(paths["guitarsetBenchmark"],2*1024*1024)
        report,_=read_json(paths["guitarsetReport"],4*1024*1024)
        root=paths["guitarsetBenchmark"].parent
        source=root.parent
        origin,origin_sha=read_json(source/"manifest.json",128*1024)
        if origin_sha!=benchmark["sourceManifestSha256"] or report["sourceManifestSha256"]!=origin_sha:
            raise ValueError("GuitarSet 원본 manifest 지문 오류")
        checked_sources(origin,source)
        annotations={}
        for clip in origin["selectedIds"]:
            doc,_=read_json(source/(clip+".jams"),16*1024*1024)
            annotations[clip]=contours(doc),note_masks(doc)
        totals={"allPoints":0,"monoPoints":0,"candidate":0,"missing":0,"within50":0,"over50":0}
        for ordinal,(case,detail) in enumerate(zip(benchmark["cases"],report["trackCases"])):
            checked_path(PROJECT,root/"cases"/case["file"])
            pcm=checked_pcm(case,root/"cases")
            for point in checked_points(case,detail):
                totals["allPoints"]+=1
                reference=point["referenceMidi"]
                if reference is None or len(reference)!=1: continue
                totals["monoPoints"]+=1
                if point["detectedMidi"] is None:
                    totals["missing"]+=1; continue
                totals["candidate"]+=1
                group="within50" if abs(point["detectedMidi"]-reference[0])*100<=50 else "over50"
                totals[group]+=1
                context=context_at(*annotations[case["clipId"]],case["startMs"]/1000,point["index"],44100,reference[0])
                result["guitarset"].append({"clipId":case["clipId"],"startMs":case["startMs"],"pointIndex":point["index"],
                    "baselineMidi":point["detectedMidi"],"referenceMidi":reference[0],"referenceGroup":group,
                    "context":context,"pcmSha256":case["sha256"],**features(track_window(pcm,point["index"]),14700,point["detectedMidi"])})
            if ordinal%10==0: print(f"공개 창 관측 {ordinal+1}/91",flush=True)
        if totals!={"allPoints":3458,"monoPoints":838,"candidate":677,"missing":161,"within50":629,"over50":48}:
            raise ValueError("기존 고정 평가 분모 변경")
        result["totals"]=totals
        agpt,_=read_json(paths["agptBenchmark"],128*1024)
        comparison,_=read_json(paths["agptPreviousComparison"],128*1024)
        cases={case["clipId"]:case for case in agpt["cases"]}
        for clip in comparison["clips"]:
            if not clip["changes"]: continue
            case=cases[clip["clipId"]]
            pcm=agpt_pcm(case,paths["agptBenchmark"].parent/"cases")
            for change in clip["changes"]:
                baseline=change["baseline"]
                result["agpt"].append({"clipId":clip["clipId"],"emittedSample":baseline["emittedSample"],
                    "baselineMidi":baseline["pitchMidi"],"fileCategory":"palmmute" if "palmmute" in clip["clipId"] else "harmonics",
                    "referenceAccepted":False,"pcmSha256":case["sha256"],
                    **features(onset_window(pcm,baseline["emittedSample"]),12000,baseline["pitchMidi"])})
        if len(result["agpt"])!=10: raise ValueError("이전 가설 변경점 분모 변경")
        checked_sources(origin,source)
        if read_protocol(plan_path)[1]!=plan_sha: raise ValueError("관측 중 등록 계획 변경")
        for case in benchmark["cases"]:
            checked_path(PROJECT,root/"cases"/case["file"])
            checked_pcm(case,root/"cases")
        for clip in comparison["clips"]:
            if clip["changes"]: agpt_pcm(cases[clip["clipId"]],paths["agptBenchmark"].parent/"cases")
        result["summary"]={}
        for group in ("within50","over50"):
            values=[row["oddToEvenPowerDb"] for row in result["guitarset"] if row["referenceGroup"]==group and row["oddToEvenPowerDb"] is not None]
            result["summary"][group]={"count":len(values),"minimumDb":min(values),"medianDb":statistics.median(values),"maximumDb":max(values)}
        result["state"]="HARMONIC_COEFFICIENTS_OBSERVED_WITHOUT_DECISION"
    except (Exception,KeyboardInterrupt) as cause:
        result.update(state="CANCELED" if isinstance(cause,KeyboardInterrupt) else "FAILED",errorType=type(cause).__name__)
        raise
    finally:
        with destination.open("x",encoding="utf8") as output:
            json.dump(result,output,ensure_ascii=False,indent=2,allow_nan=False)
    print(str(destination),flush=True)
    return destination


if __name__=="__main__":
    if len(sys.argv)!=2: raise SystemExit("등록한 plan.json 경로만 지정하세요.")
    run(Path(sys.argv[1]))
