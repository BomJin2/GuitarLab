import hashlib
import io
import tarfile
from threading import Event

import pytest
from guitarlab_ai.runtime_archive import unpack_runtime,verify_runtime_tree
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


def archive(tmp_path, extra=()):
    path = tmp_path / 'DEMO-runtime.tar.gz'
    with tarfile.open(path,'w:gz') as output:
        for name in ('python/python.exe','python/python312.dll','python/LICENSE.txt',*extra):
            item = tarfile.TarInfo(name)
            if name.endswith('link'):
                item.type = tarfile.SYMTYPE; item.linkname = '../outside'
                output.addfile(item)
            else:
                item.size = 4; output.addfile(item,io.BytesIO(b'DEMO'))
    return path, {'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}


def test_verified_archive_extracts_without_executing_and_never_overwrites(tmp_path):
    source, expected = archive(tmp_path)
    target=tmp_path/'new-runtime'
    result=unpack_runtime(source,target,expected,Event(),lambda *_:None)
    assert result['files']==3 and result['unpackedBytes']==12
    assert (target/'python/python.exe').read_bytes()==b'DEMO'
    verify_runtime_tree(source,target,expected,Event())
    with pytest.raises(ModelError):
        unpack_runtime(source,target,expected,Event(),lambda *_:None)
    assert (target/'python/python.exe').read_bytes()==b'DEMO'
    (target/'python/extra.pth').write_bytes(b'DEMO')
    with pytest.raises(ModelError): verify_runtime_tree(source,target,expected,Event())
    (target/'python/extra.pth').unlink()
    (target/'python/python.exe').write_bytes(b'FAIL')
    with pytest.raises(ModelError): verify_runtime_tree(source,target,expected,Event())


@pytest.mark.parametrize('name',['python/../outside','/python/outside','python/a:stream','python/CON.txt','python/trailing.','python/link','python/PYTHON.EXE','python\\outside'])
def test_unsafe_members_remove_only_new_folder(tmp_path,name):
    source,expected=archive(tmp_path,(name,))
    sentinel=tmp_path/'user-data'; sentinel.write_bytes(b'keep')
    with pytest.raises(ModelError):
        unpack_runtime(source,tmp_path/'new-runtime',expected,Event(),lambda *_:None)
    assert not (tmp_path/'new-runtime').exists() and sentinel.read_bytes()==b'keep'


def test_bad_hash_or_mid_extract_cancel_cannot_leave_a_runtime(tmp_path):
    source,expected=archive(tmp_path)
    with pytest.raises(ModelError):
        unpack_runtime(source,tmp_path/'bad',{**expected,'sha256':'0'*64},Event(),lambda *_:None)
    assert not (tmp_path/'bad').exists()
    cancel=Event()
    with pytest.raises(Canceled):
        unpack_runtime(source,tmp_path/'canceled',expected,cancel,lambda *_:cancel.set())
    assert not (tmp_path/'canceled').exists()
