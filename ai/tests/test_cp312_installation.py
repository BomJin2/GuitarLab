import hashlib
import json
from pathlib import Path
from threading import Event
from types import SimpleNamespace
from uuid import uuid4

import pytest
from guitarlab_ai import install_managed as setup, runtime_packages
from guitarlab_ai.model_integrity import ModelError


def test_cp312_prepare_and_marker_never_reuse_or_replace_legacy_environment(tmp_path,monkeypatch):
    monkeypatch.setattr(setup.sys,'version_info',(3,12,15))
    monkeypatch.setattr(setup.metadata,'version',lambda _: '26.2.1')
    model=setup.model_settings()
    artifact={'name':'DEMO','version':'1','filename':'DEMO.whl','bytes':4,'sha256':hashlib.sha256(b'DEMO').hexdigest()}
    plan={'modelId':'basic-pitch','freeDiskBytesRequired':1,'artifacts':[artifact]}
    monkeypatch.setattr(runtime_packages,'load_plans',lambda:[plan])
    cache=tmp_path/'ai/downloads'/model['planId']; cache.mkdir(parents=True)
    (cache/'DEMO.whl').write_bytes(b'DEMO')
    legacy=tmp_path/'ai/basic-pitch-active.json'; legacy.write_bytes(b'KEEP LEGACY')
    def create(path):
        (path/'Scripts').mkdir(); (path/'Scripts/python.exe').write_bytes(b'DEMO executable, never run')
    monkeypatch.setattr(setup.venv,'EnvBuilder',lambda **_:SimpleNamespace(create=create))
    environment_id=str(uuid4())
    report=setup.prepare(tmp_path,Event(),lambda _:None,environment_id)
    assert report['state']=='PREPARED'
    environment=tmp_path/'ai/environments'/model['folder']/environment_id
    assert 'DEMO==1 --hash=sha256:' in (environment/'requirements.lock').read_text(encoding='utf-8')
    assert not list((environment/'setup-bootstrap').iterdir())
    assert setup.activate(tmp_path,environment_id,Event())['state']=='INSTALLED'
    marker=tmp_path/'ai'/model['marker']; value=json.loads(marker.read_text(encoding='utf-8'))
    assert value['bootstrapSha256']=='7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad'
    assert value['planSha256']==model['planHash'] and legacy.read_bytes()==b'KEEP LEGACY'
    assert setup.discard(tmp_path,environment_id)['state']=='KEPT_ACTIVE'
    value['bootstrapSha256']=setup.BOOTSTRAP['sha256']
    marker.write_text(json.dumps(value),encoding='utf-8')
    with pytest.raises(ModelError,match='AI_SETUP_MARKER_INVALID'):
        setup._read_active(marker)


def test_unverified_python_patch_cannot_prepare_a_model(tmp_path,monkeypatch):
    monkeypatch.setattr(setup.sys,'version_info',(3,12,16))
    with pytest.raises(ModelError,match='AI_SETUP_VERSION'):
        setup.prepare(tmp_path,Event(),lambda _:None)
    assert not list(tmp_path.iterdir())
