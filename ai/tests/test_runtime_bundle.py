import hashlib
from threading import Event

import pytest
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled
from guitarlab_ai.runtime_bundle import inventory


def test_resource_inventory_detects_changes_and_remains_deterministic(tmp_path):
    (tmp_path/'worker').mkdir()
    (tmp_path/'worker/자체.py').write_bytes(b'DEMO source')
    before = inventory(tmp_path, Event())
    assert before['files'] == [{'path':'worker/자체.py','bytes':11,'sha256':hashlib.sha256(b'DEMO source').hexdigest()}]
    assert inventory(tmp_path, Event()) == before
    (tmp_path/'worker/자체.py').write_bytes(b'changed')
    assert inventory(tmp_path, Event()) != before
    cancel = Event()
    cancel.set()
    with pytest.raises(Canceled):
        inventory(tmp_path, cancel)


def test_resource_inventory_refuses_oversized_files(tmp_path):
    with (tmp_path/'DEMO-large.bin').open('wb') as stream:
        stream.truncate(64*1024*1024+1)
    with pytest.raises(ModelError, match='AI_CACHE_INTEGRITY'):
        inventory(tmp_path, Event())


def test_vc_runtime_sources_take_only_pinned_redist_files(tmp_path, monkeypatch):
    from guitarlab_ai import runtime_bundle
    good = {'msvcp140.dll': b'DEMO pinned', 'vcomp140.dll': b'DEMO openmp'}
    monkeypatch.setattr(runtime_bundle, 'VC_RUNTIME', {n: (len(d), hashlib.sha256(d).hexdigest()) for n, d in good.items()})
    redist = tmp_path/'VS/18/BuildTools/VC/Redist/MSVC'
    (redist/'14.00.0/x64/Microsoft.VC145.CRT').mkdir(parents=True)
    (redist/'14.00.0/x64/Microsoft.VC145.CRT/msvcp140.dll').write_bytes(b'DEMO other version')
    with pytest.raises(ModelError, match='VC_RUNTIME_SOURCE_MISSING'):
        runtime_bundle.vc_runtime_sources(Event(), [tmp_path/'VS'])
    for folder, name in (('Microsoft.VC145.CRT', 'msvcp140.dll'), ('Microsoft.VC145.OpenMP', 'vcomp140.dll')):
        (redist/'14.51.1/x64'/folder).mkdir(parents=True)
        (redist/'14.51.1/x64'/folder/name).write_bytes(good[name])
    found = runtime_bundle.vc_runtime_sources(Event(), [tmp_path/'VS'])
    assert {name: path.read_bytes() for name, path in found.items()} == good


def test_runtime_lock_ships_pinned_vc_runtime_next_to_python():
    import json
    from guitarlab_ai.install_managed import AI_ROOT
    from guitarlab_ai.runtime_bundle import VC_RUNTIME
    lock = json.loads((AI_ROOT/'models/runtime-bundle-lock.json').read_text(encoding='utf-8'))
    files = {item['path']: (item['bytes'], item['sha256']) for item in lock['files']}
    assert all(files.get('runtime/python/'+name) == pinned for name, pinned in VC_RUNTIME.items())
