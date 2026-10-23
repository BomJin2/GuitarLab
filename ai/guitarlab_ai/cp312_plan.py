"""기존 고정 버전을 유지하며 공식 메타데이터로 cp312 검증 계획을 만듭니다."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit, parse_qs, urljoin
from urllib.request import Request, urlopen

from .install_managed import AI_ROOT
from .model_cache import _plan as basic_plan
from .cache_demucs import load_plan as demucs_plan
from .model_integrity import ModelError

OUTPUT = AI_ROOT.parent / 'src-tauri/target/runtime-validation'


def _read(url):
    with urlopen(Request(url,headers={'User-Agent':'GuitarLab-runtime-validation'}),timeout=20) as response:
        data=response.read(5*1024*1024+1)
    if len(data)>5*1024*1024:
        raise ModelError('AI_RUNTIME_PLAN_FAILED')
    return data


def pick_pypi_artifact(original,metadata):
    from packaging.specifiers import SpecifierSet
    from packaging.tags import cpython_tags, compatible_tags
    from packaging.utils import parse_wheel_filename, canonicalize_name
    from packaging.version import Version
    tags=list(cpython_tags((3,12),abis=['cp312'],platforms=['win_amd64']))+list(compatible_tags((3,12),interpreter='cp312',platforms=['win_amd64']))
    rank={tag:index for index,tag in reversed(list(enumerate(tags)))}
    files=[]
    for item in metadata['urls']:
        if item['packagetype']!='bdist_wheel' or item.get('yanked'): continue
        name,version,_,wheel_tags=parse_wheel_filename(item['filename'])
        matching=[rank[tag] for tag in wheel_tags if tag in rank]
        if name==canonicalize_name(original['name']) and version==Version(original['version']) and matching:
            files.append((min(matching),item))
    reused=[item for _,item in files if item['filename']==original['filename']]
    if reused: item=reused[0]
    elif files:
        best=min(priority for priority,_ in files)
        selected=[item for priority,item in files if priority==best]
        if len(selected)!=1: raise ModelError('AI_RUNTIME_PLAN_FAILED')
        item=selected[0]
    else:
        raise ModelError('AI_RUNTIME_WHEEL_MISSING')
    filename=item['filename']
    requires=item.get('requires_python') or metadata['info'].get('requires_python') or ''
    parsed=urlsplit(item['url'])
    digest=item['digests']['sha256']
    if '3.12.15' not in SpecifierSet(requires):
        raise ModelError('AI_RUNTIME_PYTHON_UNSUPPORTED')
    if (parsed.scheme!='https' or parsed.netloc!='files.pythonhosted.org'
            or not re.fullmatch('[a-f0-9]{64}',digest) or type(item['size']) is not int or not 0<item['size']<1024**3):
        raise ModelError('AI_RUNTIME_PLAN_FAILED')
    return {**original,'filename':filename,'url':item['url'],'bytes':item['size'],'sha256':digest,
            'requiresPython':requires,'requiresDist':metadata['info'].get('requires_dist') or [],
            'metadataSource':f"https://pypi.org/pypi/{original['name']}/{original['version']}/json"}


class _Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a': self.hrefs.extend(value for key,value in attrs if key=='href' and value)


def _artifact(original):
    if original['name']=='torch':
        index='https://download.pytorch.org/whl/cpu/torch/'
        links=_Links(); links.feed(_read(index).decode('utf-8'))
        filename=original['filename'].replace('-cp310-cp310-','-cp312-cp312-')
        urls=[urljoin(index,href) for href in links.hrefs if unquote(urlsplit(href).path.rsplit('/',1)[-1])==filename]
        if len(urls)!=1: raise ModelError('AI_RUNTIME_PLAN_FAILED')
        parsed=urlsplit(urls[0]); digest=parse_qs(parsed.fragment).get('sha256',[''])[0]
        if parsed.scheme!='https' or parsed.hostname not in ('download.pytorch.org','download-r2.pytorch.org') or not re.fullmatch('[a-f0-9]{64}',digest):
            raise ModelError('AI_RUNTIME_PLAN_FAILED')
        url=urls[0].split('#',1)[0]
        with urlopen(Request(url,method='HEAD'),timeout=20) as response:
            size=int(response.headers['Content-Length'])
        if not 0<size<1024**3: raise ModelError('AI_RUNTIME_PLAN_FAILED')
        return {**original,'filename':filename,'url':url,'bytes':size,'sha256':digest,'metadataSource':index}
    metadata=json.loads(_read(f"https://pypi.org/pypi/{original['name']}/{original['version']}/json"))
    return pick_pypi_artifact(original,metadata)


def create_plans():
    original={'basic-pitch':basic_plan(),'htdemucs_6s':demucs_plan()}
    fork=json.loads((OUTPUT/'onnx-wheel.json').read_text(encoding='utf-8'))
    if fork['version']!='0.4.0+guitarlab.onnx1' or fork['sha256']!='53ca6709be7a4599d66df70d5e6618038f2ee5dfa7252eb2b1fda5570a00eed6':
        raise ModelError('AI_CACHE_INTEGRITY')
    all_artifacts={(item['name'].replace('_','-'),item['version']):item for plan in original.values() for item in plan['artifacts'] if item['name']!='basic-pitch'}
    seed={'name':'setuptools','version':'75.3.2','filename':'setuptools-75.3.2-py3-none-any.whl','license':'MIT'}
    all_artifacts[('setuptools','75.3.2')]=seed
    resolved=[]; failed=False
    with ThreadPoolExecutor(max_workers=5) as pool:
        pending=[(item,pool.submit(_artifact,item)) for item in all_artifacts.values()]
        for item,future in pending:
            try: resolved.append(future.result())
            except Exception as cause:
                print(json.dumps({'package':item['name'],'version':item['version'],'error':cause.code if isinstance(cause,ModelError) else 'AI_RUNTIME_METADATA_FAILED'}),flush=True)
                failed=True
    if failed: raise ModelError('AI_RUNTIME_PLAN_FAILED')
    by_key={(item['name'].replace('_','-'),item['version']):item for item in resolved}
    plans=[]
    for model,old in original.items():
        artifacts=[fork if item['name']=='basic-pitch' else by_key[(item['name'].replace('_','-'),item['version'])] for item in old['artifacts']]
        artifacts.append(by_key[('setuptools','75.3.2')])
        plan={'schemaVersion':1,'id':('basic-pitch-0.4.0-onnx1-windows-cp312' if model=='basic-pitch' else 'demucs-4.1.0-htdemucs-6s-windows-cp312'),
              'state':'COMPATIBILITY_VALIDATION_ONLY','python':'3.12.15','platform':'win_amd64','modelId':model,
              'modelVersion':'0.4.0' if model=='basic-pitch' else '4.1.0','artifacts':artifacts,'modelFiles':old['modelFiles'],
              'freeDiskBytesRequired':old['freeDiskBytesRequired'],'modelDownloadAllowed':False}
        plan['packageBytes']=sum(item['bytes'] for item in artifacts)
        for key in ('sources','modelRevision','researchOnly','weightLicenseStatus'):
            if key in old: plan[key]=old[key]
        path=AI_ROOT/'models'/f"{plan['id']}.json"
        with path.open('x',encoding='utf-8') as stream: json.dump(plan,stream,ensure_ascii=False,indent=2)
        plans.append(plan)
        print(json.dumps({'modelId':model,'artifactCount':len(artifacts),'packageBytes':plan['packageBytes'],
                          'planSha256':hashlib.sha256(json.dumps(plan,sort_keys=True,separators=(',',':')).encode()).hexdigest()}),flush=True)
    return plans


if __name__=='__main__':
    try: create_plans()
    except Exception as cause:
        print(json.dumps({'error':cause.code if isinstance(cause,ModelError) else 'AI_RUNTIME_PLAN_FAILED'}),flush=True)
        raise SystemExit(1)
