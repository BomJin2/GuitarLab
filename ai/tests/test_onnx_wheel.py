from email.parser import BytesParser
import hashlib
from threading import Event
import zipfile

import pytest
from guitarlab_ai import onnx_wheel as wheel
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


def demo(tmp_path,monkeypatch):
    path=tmp_path/'DEMO-original.whl'
    with zipfile.ZipFile(path,'w') as archive:
        archive.writestr('basic_pitch/inference.py',b'# DEMO original code\n')
        archive.writestr('basic_pitch/saved_models/nmp.onnx',b'DEMO')
        for name,data in {'METADATA':'Metadata-Version: 2.1\nName: basic-pitch\nVersion: 0.4.0\nRequires-Dist: numpy>=1.18\nRequires-Dist: tensorflow; python_version >= "3.11"\nRequires-Dist: onnxruntime; python_version < "3.11"\nProvides-Extra: tf\nRequires-Dist: tensorflow; extra == "tf"\n\nDEMO description\n',
                          'WHEEL':'Wheel-Version: 1.0\n','LICENSE':'DEMO Apache-2.0 license','NOTICE':'DEMO original notice','RECORD':'DEMO old record'}.items():
            archive.writestr(wheel.ORIGINAL_INFO+name,data)
    monkeypatch.setattr(wheel,'SOURCE',{'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    return path


def test_metadata_fork_is_reproducible_and_preserves_code_models_and_notices(tmp_path,monkeypatch):
    source=demo(tmp_path,monkeypatch)
    outputs=[]
    for name in ('one','two'):
        folder=tmp_path/name; folder.mkdir()
        target=folder/wheel.FILENAME
        report=wheel.build_onnx_wheel(source,target,Event()); outputs.append(target.read_bytes())
        assert report['version']==wheel.VERSION and report['kind']=='LOCAL_ONNX_REPACK'
        with zipfile.ZipFile(source) as original,zipfile.ZipFile(target) as result:
            for path in ('basic_pitch/inference.py','basic_pitch/saved_models/nmp.onnx'):
                assert result.read(path)==original.read(path)
            for path in ('LICENSE','NOTICE'):
                assert result.read(wheel.INFO+path)==original.read(wheel.ORIGINAL_INFO+path)
            metadata=BytesParser().parsebytes(result.read(wheel.INFO+'METADATA'))
            assert metadata['Version']==wheel.VERSION
            assert metadata.get_all('Requires-Dist')==['numpy>=1.18','onnxruntime']
            assert metadata.get_all('Provides-Extra') is None
            assert 'GUITARLAB-MODIFICATIONS.md' in result.read(wheel.INFO+'RECORD').decode()
    assert outputs[0]==outputs[1]


def test_corruption_collision_and_cancel_preserve_original(tmp_path,monkeypatch):
    source=demo(tmp_path,monkeypatch); original=source.read_bytes()
    target=tmp_path/wheel.FILENAME
    cancel=Event(); cancel.set()
    with pytest.raises(Canceled): wheel.build_onnx_wheel(source,target,cancel)
    assert not target.exists()
    target.write_bytes(b'keep')
    with pytest.raises(ModelError): wheel.build_onnx_wheel(source,target,Event())
    assert target.read_bytes()==b'keep' and source.read_bytes()==original
    monkeypatch.setattr(wheel,'SOURCE',{'bytes':len(original),'sha256':'0'*64})
    with pytest.raises(ModelError): wheel.build_onnx_wheel(source,tmp_path/'unused'/wheel.FILENAME,Event())
