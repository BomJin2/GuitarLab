"""별도 런타임 검증의 고정 wheel만 재사용하거나 받습니다."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
from threading import Event
from urllib.parse import urlsplit
from urllib.request import build_opener,HTTPRedirectHandler,ProxyHandler
from uuid import uuid4

from .install_managed import AI_ROOT,_cancel,_directory
from .model_cache import _verify_cached,_publish
from .model_integrity import ModelError
from .runtime import Canceled

PLANS={
    'basic-pitch-0.4.0-onnx1-windows-cp312':'e4d75fa2a10e92de7dbb1c828d2102bc0bd76092f766892e41ddb7cde44989f1',
    'demucs-4.1.0-htdemucs-6s-windows-cp312':'2d7760f72cc5cc07aa25cf120b7d478b720941c2513109393d78b3014c70a5e7',
}


def load_plans():
    plans=[]
    for name,digest in PLANS.items():
        plan=json.loads((AI_ROOT/'models'/f'{name}.json').read_text(encoding='utf-8'))
        encoded=json.dumps(plan,sort_keys=True,separators=(',',':')).encode()
        if hashlib.sha256(encoded).hexdigest()!=digest: raise ModelError('AI_CACHE_INTEGRITY')
        plans.append(plan)
    return plans


def _allowed_url(url):
    parsed=urlsplit(url)
    if parsed.scheme != 'https' or parsed.fragment:
        return False
    if parsed.netloc in ('files.pythonhosted.org','download.pytorch.org','download-r2.pytorch.org'):
        return not parsed.query
    revision = '3c5ee475be622df764938de97e4281a7b07ffa58'
    if parsed.netloc == 'huggingface.co':
        files = ('5c90dfd2.safetensors', 'htdemucs_6s.yaml')
        if parsed.path in [f'/adefossez/HTDemucs-6s/resolve/{revision}/{name}' for name in files]:
            return not parsed.query
        return parsed.path == f'/api/resolve-cache/models/adefossez/HTDemucs-6s/{revision}/htdemucs_6s.yaml'
    # 고정 원본에서 이동한 CDN도 최종 바이트 수/SHA 확인 뒤에만 게시합니다.
    return parsed.netloc == 'us.aws.cdn.hf.co' and parsed.path.startswith('/xet-bridge-us/')


class _Redirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not _allowed_url(newurl): raise ModelError('AI_DOWNLOAD_FAILED')
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def _open(url):
    return build_opener(ProxyHandler({}),_Redirect()).open(url,timeout=10)


def stage_artifacts(artifacts,cache: Path,sources,cancel: Event,progress,work_dir: Path | None = None):
    _cancel(cancel)
    if not cache.is_absolute() or not cache.is_dir() or cache.is_symlink(): raise ModelError('AI_SETUP_PATH')
    items={}
    for item in artifacts:
        name=item['filename']
        if (not re.fullmatch(r'[A-Za-z0-9_.+-]+\.(?:whl|safetensors|yaml)',name) or not re.fullmatch('[a-f0-9]{64}',item['sha256'])
                or type(item['bytes']) is not int or not 0<item['bytes']<=768*1024*1024 or
                (name in items and (items[name]['sha256']!=item['sha256'] or items[name]['bytes']!=item['bytes']))):
            raise ModelError('AI_CACHE_INTEGRITY')
        items[name]=item
    total=sum(item['bytes'] for item in items.values())
    missing=sum(item['bytes'] for name,item in items.items() if not (cache/name).exists())
    if total>1024**3 or shutil.disk_usage(cache).free<missing+64*1024*1024: raise ModelError('AI_DISK_SPACE')
    owned_work = work_dir is None
    if owned_work:
        work=cache/('stage-'+str(uuid4())); work.mkdir()
    else:
        work=work_dir
        if not work.is_absolute() or not work.is_dir() or work.is_symlink() or work.resolve()==cache.resolve() or any(work.iterdir()):
            raise ModelError('AI_INPUT_INVALID')
    part=work/('wheel.part' if owned_work else 'download.part')
    completed,reused,downloaded,copied=0,0,0,0
    try:
        progress(0,total)
        for name,item in items.items():
            _cancel(cancel)
            target=cache/name
            if target.exists() or target.is_symlink():
                _verify_cached(target,item,cancel); reused+=1
            else:
                local=next((folder/name for folder in sources if (folder/name).exists()),None)
                if local is not None:
                    _verify_cached(local,item,cancel)
                    input_stream=local.open('rb'); copied+=1
                else:
                    if item.get('kind') in ('LOCAL_ONNX_REPACK','LOCAL_MODEL') or not _allowed_url(item.get('url','')):
                        raise ModelError('AI_CACHE_INTEGRITY')
                    input_stream=_open(item['url'])
                    if not _allowed_url(input_stream.geturl()):
                        input_stream.close(); raise ModelError('AI_DOWNLOAD_FAILED')
                    downloaded+=1
                received,digest=0,hashlib.sha256()
                with input_stream,part.open('xb') as output:
                    while True:
                        _cancel(cancel)
                        block=input_stream.read(65536)
                        if not block: break
                        received+=len(block)
                        if received>item['bytes']: raise ModelError('AI_CACHE_INTEGRITY')
                        output.write(block); digest.update(block)
                        progress(completed+received,total)
                    output.flush(); os.fsync(output.fileno())
                if received!=item['bytes'] or digest.hexdigest()!=item['sha256']:
                    raise ModelError('AI_CACHE_INTEGRITY')
                _cancel(cancel); _publish(part,target)
            completed+=item['bytes']; progress(completed,total)
        return {'schemaVersion':1,'state':'CACHE_VERIFIED','artifactCount':len(items),'totalBytes':completed,
                'reusedFiles':reused,'copiedFiles':copied,'downloadedFiles':downloaded}
    finally:
        try:
            if part.is_file() and not part.is_symlink(): part.unlink()
            if owned_work: work.rmdir()
        except OSError as cause: raise ModelError('AI_CACHE_CLEANUP_FAILED') from cause


def main():
    parser=argparse.ArgumentParser(description='승인된 별도 cp312 검증 파일을 받습니다.')
    choice=parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--stage',action='store_true')
    choice.add_argument('--import-model-cache',action='store_true')
    args=parser.parse_args()
    cancel=Event(); signal.signal(signal.SIGINT,lambda *_:cancel.set())
    try:
        plans=load_plans()
        cache=AI_ROOT.parent/'src-tauri/target/runtime-validation/wheels'; cache.mkdir(exist_ok=True)
        root=Path(os.environ['APPDATA'])/'com.guitarlab.app/ai/downloads'
        if args.import_model_cache:
            for plan in plans:
                items=list(plan['artifacts'])
                old=root/'demucs-4.1.0-htdemucs-6s-windows-cp310'
                if plan['modelId']=='htdemucs_6s':
                    items += [{**item,'filename':item['path'],'kind':'LOCAL_MODEL'} for item in plan['modelFiles']]
                for item in items:
                    _verify_cached((old if item.get('kind')=='LOCAL_MODEL' else cache)/item['filename'],item,cancel)
                target=_directory(root.parent,'downloads',plan['id'])
                result=stage_artifacts(items,target,[cache,old],cancel,lambda *_:None)
                print(json.dumps({'modelId':plan['modelId'],**result}),flush=True)
            return 0
        sources=[root/'basic-pitch-0.4.0-windows-cp310',root/'demucs-4.1.0-htdemucs-6s-windows-cp310']
        last=-1
        def progress(done,total):
            nonlocal last
            percent=done*100//total//5*5
            if percent!=last: print(json.dumps({'percent':percent}),flush=True); last=percent
        result=stage_artifacts([item for plan in plans for item in plan['artifacts']],cache,sources,cancel,progress)
        print(json.dumps(result),flush=True); return 0
    except Exception as cause:
        print(json.dumps({'error':'CANCELED' if isinstance(cause,Canceled) else cause.code if isinstance(cause,ModelError) else 'AI_DOWNLOAD_FAILED'}),flush=True)
        return 1


if __name__=='__main__': raise SystemExit(main())
