import hashlib
from threading import Event

import pytest
from guitarlab_ai import cache_demucs as cache
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


@pytest.fixture
def demo(tmp_path, monkeypatch):
    source = tmp_path / 'source'; source.mkdir()
    artifacts = []
    for name in ('demo.whl', 'demo.safetensors'):
        (source / name).write_bytes(b'DEMO')
        artifacts.append({'filename':name, 'bytes':4, 'sha256':hashlib.sha256(b'DEMO').hexdigest()})
    root = tmp_path / 'app'; root.mkdir()
    monkeypatch.setattr(cache, '_plan', lambda:artifacts)
    monkeypatch.setattr(cache, 'PACKAGE_SOURCE', source)
    monkeypatch.setattr(cache, 'MODEL_SOURCE', source)
    return root, source


def test_fixed_plan_matches_full_artifact_count_and_hash():
    artifacts = cache._plan()
    assert len(artifacts) == 33 and sum(item['bytes'] for item in artifacts) == cache.TOTAL_BYTES


def test_copy_and_reuse_never_execute_install_or_change_sources(demo):
    root, source = demo
    result = cache.stage_cache(root, Event(), lambda _:None)
    assert result['state'] == 'CACHE_VERIFIED' and result['reusedFiles'] == 0
    assert cache.stage_cache(root, Event(), lambda _:None)['reusedFiles'] == 2
    assert (source / 'demo.whl').read_bytes() == b'DEMO'
    assert not list((root / 'ai/cache-imports').iterdir())


@pytest.mark.parametrize('cancel', [True, False])
def test_cancel_or_corruption_keeps_sources_and_cleans_current_part(demo, cancel):
    root, source = demo
    event = Event()
    if not cancel:
        (source / 'demo.safetensors').write_bytes(b'FAIL')
    def progress(value):
        if cancel and value > 0:
            event.set()
    with pytest.raises(Canceled if cancel else ModelError):
        cache.stage_cache(root, event, progress)
    destination = root / 'ai/downloads' / cache.PLAN_ID
    assert (destination / 'demo.whl').read_bytes() == b'DEMO'
    assert not (destination / 'demo.safetensors').exists()
    assert (source / 'demo.whl').read_bytes() == b'DEMO'
    assert not list((root / 'ai/cache-imports').iterdir())
