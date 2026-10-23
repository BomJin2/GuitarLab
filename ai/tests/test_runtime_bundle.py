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
