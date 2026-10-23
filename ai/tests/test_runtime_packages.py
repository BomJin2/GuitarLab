import hashlib
import io
from threading import Event
import pytest
from guitarlab_ai import runtime_packages as packages
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


def item():
    return {'filename':'demo-1.0-py3-none-any.whl','bytes':4,'sha256':hashlib.sha256(b'DEMO').hexdigest(),'url':'https://files.pythonhosted.org/packages/DEMO.whl'}


class Response(io.BytesIO):
    def geturl(self): return item()['url']


def test_copy_and_reuse_validate_cache_without_installing_or_network(tmp_path,monkeypatch):
    source=tmp_path/'source'; source.mkdir(); (source/item()['filename']).write_bytes(b'DEMO')
    cache=tmp_path/'cache'; cache.mkdir()
    monkeypatch.setattr(packages,'_open',lambda _:pytest.fail('네트워크 불필요'))
    assert packages.stage_artifacts([item()],cache,[source],Event(),lambda *_:None)['copiedFiles']==1
    assert packages.stage_artifacts([item()],cache,[source],Event(),lambda *_:None)['reusedFiles']==1
    assert (source/item()['filename']).read_bytes()==b'DEMO'


@pytest.mark.parametrize('mode',['success','corrupt','cancel'])
def test_bounded_download_hash_cancel_and_partial_cleanup(tmp_path,monkeypatch,mode):
    monkeypatch.setattr(packages,'_open',lambda _:Response(b'DEMO' if mode!='corrupt' else b'BAD!!'))
    cancel=Event()
    def progress(done,_):
        if done and mode=='cancel': cancel.set()
    if mode=='success':
        assert packages.stage_artifacts([item()],tmp_path,[],cancel,progress)['downloadedFiles']==1
    else:
        with pytest.raises(Canceled if mode=='cancel' else ModelError): packages.stage_artifacts([item()],tmp_path,[],cancel,progress)
        assert not (tmp_path/item()['filename']).exists()
    assert not list(tmp_path.glob('stage-*'))


def test_pinned_plans_and_unsigned_or_external_files_are_rejected(tmp_path):
    assert [p['python'] for p in packages.load_plans()]==['3.12.15','3.12.15']
    for bad in [{**item(),'url':'https://example.invalid/a.whl'},{**item(),'filename':'../private.whl'}]:
        with pytest.raises(ModelError): packages.stage_artifacts([bad],tmp_path,[],Event(),lambda *_:None)


def test_native_owned_work_directory_is_kept_empty_after_success_and_cancel(tmp_path,monkeypatch):
    cache=tmp_path/'cache'; cache.mkdir()
    work=tmp_path/'work'; work.mkdir()
    monkeypatch.setattr(packages,'_open',lambda _:Response(b'DEMO'))
    packages.stage_artifacts([item()],cache,[],Event(),lambda *_:None,work_dir=work)
    assert work.is_dir() and not list(work.iterdir())
    (cache/item()['filename']).unlink()
    cancel=Event()
    def progress(done,_):
        if done: cancel.set()
    with pytest.raises(Canceled): packages.stage_artifacts([item()],cache,[],cancel,progress,work_dir=work)
    assert not list(work.iterdir()) and not (cache/item()['filename']).exists()


def test_local_model_artifacts_are_never_fetched_from_network(tmp_path,monkeypatch):
    monkeypatch.setattr(packages,'_open',lambda _:pytest.fail('로컬 모델의 네트워크 금지'))
    artifact={**item(),'filename':'DEMO.safetensors','kind':'LOCAL_MODEL'}
    with pytest.raises(ModelError): packages.stage_artifacts([artifact],tmp_path,[],Event(),lambda *_:None)
