"""기존 환경을 보존하며 cp312 설치·실제 기준 비교를 수행하는 개발 도구입니다."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import signal
import struct
from threading import Event
from uuid import uuid4

from .install_managed import AI_ROOT,_cancel,_directory,_run,_write_new,_remove_new_environment
from .model_cache import _verify_cached
from .model_integrity import ModelError
from .runtime import Canceled
from .runtime_archive import verify_runtime_tree,load_runtime_plan
from .runtime_packages import load_plans
from .separation.wav import read_wav


def compare_notes(before,after):
    if len(before['notes'])!=8 or len(after['notes'])!=8 or len(before['draft'])!=8 or len(after['draft'])!=8:
        raise ModelError('AI_RUNTIME_COMPARISON_FAILED')
    maxima={'onsetMs':0.0,'offsetMs':0.0,'confidence':0.0}
    for left,right in zip(before['notes'],after['notes']):
        if left['pitch_midi']!=right['pitch_midi']: raise ModelError('AI_RUNTIME_COMPARISON_FAILED')
        for output,key,limit in [('onsetMs','onset_ms',0.05),('offsetMs','offset_ms',0.05),('confidence','confidence',0.0001)]:
            difference=abs(left[key]-right[key])
            if not math.isfinite(difference) or difference>limit: raise ModelError('AI_RUNTIME_COMPARISON_FAILED')
            maxima[output]=max(maxima[output],difference)
    for left,right in zip(before['draft'],after['draft']):
        for key in ('pitchMidi','startTick','durationTicks','fingering','reviewReasons'):
            if left[key]!=right[key]: raise ModelError('AI_RUNTIME_COMPARISON_FAILED')
    return {'notes':8,'draftPreserved':True,'maxDifference':maxima}


def compare_stems(before,after,root):
    results={}
    for role in ('GUITAR_FULL','ACCOMPANIMENT'):
        waves=[]
        for report in (before,after):
            outputs=report['separation']['outputs']
            item=next(value for value in outputs if value['role']==role)
            path=Path(item['path']).resolve(strict=True)
            if not path.is_relative_to(root.resolve()): raise ModelError('AI_SETUP_PATH')
            data=read_wav(path,root,Event())
            if hashlib.sha256(data.raw).hexdigest()!=item['sha256'] or not data.floating:
                raise ModelError('AI_MODEL_INTEGRITY')
            waves.append(data)
        left,right=waves
        if (left.sample_rate,left.channels,left.frames)!=(right.sample_rate,right.channels,right.frames):
            raise ModelError('AI_RUNTIME_COMPARISON_FAILED')
        differences=[a[0]-b[0] for a,b in zip(struct.iter_unpack('<f',left.pcm),struct.iter_unpack('<f',right.pcm))]
        maximum=max(map(abs,differences)); rms=math.sqrt(math.fsum(value*value for value in differences)/len(differences))
        if not math.isfinite(maximum) or not math.isfinite(rms) or maximum>0.0001 or rms>0.00001:
            raise ModelError('AI_RUNTIME_COMPARISON_FAILED')
        results[role]={'maxAbsoluteDifference':maximum,'rmsDifference':rms,'frames':left.frames}
    return results


def _snapshot(job):
    snapshot=job/'snapshot'; snapshot.mkdir()
    source=AI_ROOT/'guitarlab_ai'
    for path in source.rglob('*.py'):
        target=snapshot/'guitarlab_ai'/path.relative_to(source)
        target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(path,target)
    (snapshot/'models').mkdir()
    for path in (AI_ROOT/'models').glob('*.json'): shutil.copyfile(path,snapshot/'models'/path.name)
    (snapshot/'fixtures').mkdir()
    shutil.copyfile(AI_ROOT.parent/'public/fixtures/sine.wav',snapshot/'fixtures/sine.wav')
    (snapshot/'launch_probe.py').write_text('from pathlib import Path\nimport sys\nsys.path.insert(0,str(Path(__file__).resolve().parent))\nfrom guitarlab_ai.runtime_probe import main\nraise SystemExit(main())\n',encoding='utf-8')
    return snapshot


def validate(cancel: Event,progress):
    root=AI_ROOT.parent/'src-tauri/target/runtime-validation'
    bootstrap=json.loads((root/'runtime-bootstrap.json').read_text(encoding='utf-8'))
    runtime=Path(bootstrap['runtimePath']).resolve(strict=True)
    if not runtime.is_relative_to(root.resolve()): raise ModelError('AI_SETUP_PATH')
    runtime_plan=load_runtime_plan()
    archive=root/'downloads'/runtime_plan['filename']
    verify_runtime_tree(archive,runtime.parent,runtime_plan,cancel)
    plans=load_plans()
    wheels=root/'wheels'
    for plan in plans:
        for item in plan['artifacts']: _verify_cached(wheels/item['filename'],item,cancel)
    required=sum(plan['freeDiskBytesRequired'] for plan in plans)
    if shutil.disk_usage(root).free<required: raise ModelError('AI_DISK_SPACE')
    parent=_directory(root,'jobs')
    job_id=str(uuid4()); job=parent/job_id; job.mkdir()
    windows=Path(os.environ['SystemRoot'])
    environment={'PATH':str(windows/'System32')+os.pathsep+str(windows)}
    success=False
    try:
        snapshot=_snapshot(job)
        _write_new(job/'runtime-bootstrap.json',bootstrap)
        environments={}
        for plan in plans:
            _cancel(cancel)
            model=plan['modelId']
            progress(model,'별도 환경 생성')
            folder=_directory(job,'environments',str(uuid4()))
            _run([str(runtime/'python.exe'),'-I','-B','-m','venv','--without-pip',str(folder)],cancel,timeout=90,cwd=job,environment=environment)
            python=folder/'Scripts/python.exe'
            runner=runtime/'Lib/site-packages/pip/__pip-runner__.py'
            pip=[str(python),'-I','-B',str(runner),'--isolated','--disable-pip-version-check','--no-input']
            lock=folder/'requirements.lock'
            lock.write_text(''.join(f"{item['name']}=={item['version']} --hash=sha256:{item['sha256']}\n" for item in plan['artifacts']),encoding='utf-8')
            progress(model,'고정 캐시 오프라인 설치')
            _run([*pip,'install','--no-index','--find-links',str(wheels),'--require-hashes','--only-binary=:all:','--no-deps','--no-compile','--no-cache-dir','-r',str(lock)],cancel,cwd=job,environment=environment)
            _run([*pip,'check'],cancel,timeout=60,cwd=job,environment=environment)
            if model=='htdemucs_6s':
                base=folder/'models/htdemucs_6s'; base.mkdir(parents=True)
                old_cache=Path(os.environ['APPDATA'])/'com.guitarlab.app/ai/downloads/demucs-4.1.0-htdemucs-6s-windows-cp310'
                for item in plan['modelFiles']:
                    _verify_cached(old_cache/item['path'],item,cancel)
                    with (old_cache/item['path']).open('rb') as source,(base/item['path']).open('xb') as target:
                        for block in iter(lambda:source.read(65536),b''):
                            _cancel(cancel); target.write(block)
                        target.flush(); os.fsync(target.fileno())
                    _verify_cached(base/item['path'],item,cancel)
            environments[model]=str(folder)
        results={}
        for plan in plans:
            model=plan['modelId']; folder=Path(environments[model])
            original=AI_ROOT/('.venv-basic-pitch' if model=='basic-pitch' else '.venv-demucs')/'Scripts/python.exe'
            progress(model,'기존 환경과 새 환경의 실제 자체 음원 비교')
            for baseline,python in ((True,original),(False,folder/'Scripts/python.exe')):
                args=[str(python),'-I','-B',str(snapshot/'launch_probe.py'),'--root',str(job),'--model',model]
                if baseline: args.append('--baseline')
                _run(args,cancel,timeout=300,report=True,cwd=job,environment=environment)
            before=json.loads((job/f'baseline-{model}-result.json').read_text(encoding='utf-8'))
            after=json.loads((job/f'cp312-{model}-result.json').read_text(encoding='utf-8'))
            results[model]=compare_notes(before,after) if model=='basic-pitch' else compare_stems(before,after,job)
        verify_runtime_tree(archive,runtime.parent,runtime_plan,cancel)
        receipt={'schemaVersion':1,'state':'COMPATIBILITY_PASSED','pythonVersion':'3.12.15','runtimeArchiveSha256':runtime_plan['sha256'],
                 'environments':environments,'results':results,'nativeActivated':False}
        _write_new(job/'compatibility.json',receipt)
        success=True
        return receipt
    finally:
        if not success: _remove_new_environment(job,parent,job_id)


def main():
    parser=argparse.ArgumentParser(description='별도 cp312 오프라인 설치와 실제 결과 비교')
    parser.add_argument('--validate',action='store_true',required=True); parser.parse_args()
    cancel=Event(); signal.signal(signal.SIGINT,lambda *_:cancel.set())
    try:
        report=validate(cancel,lambda model,stage:print(json.dumps({'modelId':model,'stage':stage}),flush=True))
        print(json.dumps({key:value for key,value in report.items() if key!='environments'}),flush=True)
        return 0
    except Exception as cause:
        print(json.dumps({'error':'CANCELED' if isinstance(cause,Canceled) else cause.code if isinstance(cause,ModelError) else 'AI_RUNTIME_COMPATIBILITY_FAILED','exceptionType':type(cause).__name__}),flush=True)
        return 1


if __name__=='__main__': raise SystemExit(main())
