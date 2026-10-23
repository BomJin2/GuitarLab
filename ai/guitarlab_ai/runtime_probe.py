"""자체 음원만 사용해 새 런타임의 실제 분석 결과를 기록합니다."""
import argparse
from dataclasses import asdict
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import sys
import tempfile
from threading import Event
from uuid import uuid4

from .install_managed import _directory,_write_new
from .model_integrity import ModelError,verify_model_file
from .runtime_packages import load_plans

FIXTURE_SHA='7d519e32205014966c602feab05b5cae21e57ef66c60576781880013f2e8d386'


def check_module_origins(modules,allowed):
    virtual={'torch.ops':('_ops.py','torch._ops','_Ops'),'torch.classes':('_classes.py','torch._classes','_Classes')}
    accepted=[]
    for name,module in modules.items():
        file=getattr(module,'__file__',None)
        if file is None or (isinstance(file,str) and file.startswith('<')): continue
        if not isinstance(file,str): return False,accepted
        if name in virtual:
            marker,owner_name,class_name=virtual[name]
            owner=modules.get(owner_name)
            owner_file=getattr(owner,'__file__',None)
            if (file==marker and type(module) is getattr(owner,class_name,None) and isinstance(owner_file,str)
                    and Path(owner_file).is_file() and any(Path(owner_file).resolve().is_relative_to(base) for base in allowed)):
                accepted.append(name); continue
        if not any(Path(file).resolve().is_relative_to(base) for base in allowed): return False,accepted
    return True,sorted(accepted)


def run_probe(root: Path,model_id: str,baseline: bool):
    if model_id not in ('basic-pitch','htdemucs_6s'): raise ModelError('AI_PROTOCOL_INVALID')
    root=root.resolve(strict=True)
    fixture=root/'snapshot/fixtures/sine.wav'
    if hashlib.sha256(fixture.read_bytes()).hexdigest()!=FIXTURE_SHA:
        raise ModelError('AI_SETUP_FIXTURE_INVALID')
    if sys.flags.isolated!=1 or sys.version_info[:2] != ((3,10) if baseline else (3,12)):
        raise ModelError('AI_SETUP_VERSION')
    cancel=Event()
    work=_directory(root,'probe-results',('baseline-' if baseline else 'cp312-')+model_id+'-'+str(uuid4()))
    os.environ['NUMBA_CACHE_DIR']=str(work/'numba-cache')
    temporary=work/'runtime-temp'; temporary.mkdir()
    os.environ['TEMP']=os.environ['TMP']=str(temporary)
    tempfile.tempdir=str(temporary)
    os.environ['HF_HUB_OFFLINE']='1'
    os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
    result={'schemaVersion':1,'state':'MODEL_PROBE_PASSED','modelId':model_id,'baseline':baseline,
            'pythonVersion':'.'.join(map(str,sys.version_info[:3])),'fixtureSha256':FIXTURE_SHA}
    if not baseline:
        if sys.version_info[:3]!=(3,12,15) or not Path(sys.prefix).resolve().is_relative_to(root/'environments'):
            raise ModelError('AI_SETUP_PATH')
        runtime=json.loads((root/'runtime-bootstrap.json').read_text(encoding='utf-8'))
        if Path(sys.base_prefix).resolve()!=Path(runtime['runtimePath']).resolve():
            raise ModelError('AI_SETUP_PATH')
        plan=next(plan for plan in load_plans() if plan['modelId']==model_id)
        for item in plan['artifacts']:
            if metadata.version(item['name'])!=item['version']: raise ModelError('AI_MODEL_VERSION')
        model_files=plan['modelFiles']
        if model_id=='basic-pitch':
            distribution=metadata.distribution('basic-pitch')
            model_path=verify_model_file(Path(distribution.locate_file(model_files[0]['path'])),Path(sys.prefix),model_files[0])
        else:
            base=Path(sys.prefix)/'models/htdemucs_6s'
            for item in model_files: verify_model_file(base/item['path'],base,item,max_bytes=64*1024*1024)
            model_path=base/model_files[0]['path']
    if model_id=='basic-pitch':
        from .transcription.basic_pitch import transcribe_wav,_transcribe_with_model
        from .transcription.draft import build_draft
        notes=transcribe_wav(fixture,fixture.parent,cancel) if baseline else _transcribe_with_model(fixture,fixture.parent,cancel,lambda:model_path)
        if [note.pitch_midi for note in notes]!=[64,67,69,71]*2: raise ModelError('AI_SETUP_SELF_TEST_FAILED')
        result['notes']=[asdict(note) for note in notes]
        result['draft']=build_draft(notes,[(0,0),(7680,4000)],(64,59,55,50,45,40),cancel=cancel)
    else:
        from .separation.demucs import separate_wav,_separate_with_model
        split=separate_wav(fixture,root,work,cancel,lambda _:None) if baseline else _separate_with_model(fixture,root,work,cancel,lambda _:None,lambda:(model_path,plan))
        if split['frames']!=176400 or split['channels']!=2: raise ModelError('AI_SETUP_SELF_TEST_FAILED')
        result['separation']=split
    if not baseline:
        allowed=[root/'snapshot',Path(sys.prefix).resolve(),Path(sys.base_prefix).resolve(),temporary]
        result['moduleOriginsIsolated'],result['virtualModules']=check_module_origins(dict(sys.modules),allowed)
        result['searchPathsIsolated']=all(any(Path(path).resolve().is_relative_to(base) for base in allowed) for path in sys.path)
        if not result['moduleOriginsIsolated'] or not result['searchPathsIsolated']:
            raise ModelError('AI_SETUP_PATH')
    path=root/(('baseline-' if baseline else 'cp312-')+model_id+'-result.json')
    _write_new(path,result)
    return path


def main():
    parser=argparse.ArgumentParser(description='자체 음원의 실제 런타임 호환성 검사')
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--model',choices=('basic-pitch','htdemucs_6s'),required=True)
    parser.add_argument('--baseline',action='store_true')
    args=parser.parse_args()
    try:
        run_probe(args.root,args.model,args.baseline)
        print(json.dumps({'state':'MODEL_PROBE_PASSED','modelId':args.model,'baseline':args.baseline}),flush=True)
        return 0
    except Exception as cause:
        failure={'error':cause.code if isinstance(cause,ModelError) else 'AI_RUNTIME_PROBE_FAILED','exceptionType':type(cause).__name__}
        if isinstance(cause,ModuleNotFoundError) and isinstance(cause.name,str) and len(cause.name)<100 and all(c.isalnum() or c in '._' for c in cause.name): failure['missingModule']=cause.name
        print(json.dumps(failure),flush=True)
        return 1


if __name__=='__main__': raise SystemExit(main())
