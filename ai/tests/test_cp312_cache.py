import hashlib
import io
from threading import Event

from guitarlab_ai import model_cache, runtime_packages


def test_cp312_cache_bounds_protocol_messages_and_reuses_verified_local_fork(tmp_path,monkeypatch):
    monkeypatch.setattr(model_cache.sys,'version_info',(3,12,15))
    cache=tmp_path/'cache'; cache.mkdir()
    work=tmp_path/'work'; work.mkdir()
    fork={'filename':'DEMO-local.whl','bytes':4,'sha256':hashlib.sha256(b'DEMO').hexdigest(),'kind':'LOCAL_ONNX_REPACK'}
    remote={'filename':'DEMO-remote.whl','bytes':4,'sha256':hashlib.sha256(b'DEMO').hexdigest(),'url':'https://files.pythonhosted.org/packages/DEMO.whl'}
    (cache/fork['filename']).write_bytes(b'DEMO')
    monkeypatch.setattr(runtime_packages,'load_plans',lambda:[{'modelId':'basic-pitch','artifacts':[fork,remote]}])
    class Response(io.BytesIO):
        def read(self,_=-1): return super().read(1)
        def geturl(self): return remote['url']
    monkeypatch.setattr(runtime_packages,'_open',lambda _:Response(b'DEMO'))
    progress=[]
    result=model_cache.download_cache(cache,work,Event(),progress.append)
    assert result['artifactCount']==2 and result['reusedFiles']==1
    assert progress==sorted(set(progress)) and progress[0]==0 and progress[-1]==100 and len(progress)<=22
    assert not list(work.iterdir())
