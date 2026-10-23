import hashlib
import io
from pathlib import Path
from threading import Event
from types import SimpleNamespace
from urllib.error import URLError

import pytest
from guitarlab_ai import demucs_cache, model_cache, runtime_packages
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


def test_both_profiles_pin_all_packages_and_two_weights(monkeypatch):
    for version, count, total in [((3, 10, 8), 33, 707117623), ((3, 12, 15), 34, 708033316)]:
        monkeypatch.setattr(model_cache.sys, 'version_info', version)
        plan = demucs_cache.download_plan()
        assert len(plan['artifacts']) + len(plan['modelFiles']) == count
        assert sum(item['bytes'] for item in [*plan['artifacts'], *plan['modelFiles']]) == total
    altered = {**plan, 'researchOnly': False}
    monkeypatch.setattr(demucs_cache, 'load_model_plan', lambda *_: altered)
    with pytest.raises(ModelError, match='AI_CACHE_INTEGRITY'):
        demucs_cache.download_plan()


def test_hugging_face_policy_only_allows_pinned_origin_and_https_cdn():
    revision = '3c5ee475be622df764938de97e4281a7b07ffa58'
    valid = f'https://huggingface.co/adefossez/HTDemucs-6s/resolve/{revision}/5c90dfd2.safetensors'
    assert runtime_packages._allowed_url(valid)
    assert runtime_packages._allowed_url('https://us.aws.cdn.hf.co/xet-bridge-us/hash?Signature=DEMO')
    assert runtime_packages._allowed_url(f'https://huggingface.co/api/resolve-cache/models/adefossez/HTDemucs-6s/{revision}/htdemucs_6s.yaml?etag=DEMO')
    for url in [valid.replace('https:', 'http:'), valid.replace(revision, 'main'), valid.replace('adefossez', 'other'),
                valid.replace('huggingface.co', 'huggingface.co.evil.example'), valid+'?url=private',
                valid.replace('huggingface.co', 'private@huggingface.co'), valid.replace('huggingface.co', 'huggingface.co:443'),
                'https://us.aws.cdn.hf.co/other?Signature=DEMO']:
        assert not runtime_packages._allowed_url(url)
        with pytest.raises(ModelError, match='AI_DOWNLOAD_FAILED'):
            runtime_packages._Redirect().redirect_request(None, None, 302, '', {}, url)


@pytest.fixture
def demo(tmp_path, monkeypatch):
    # DEMO 바이트를 전송 정책 검사용으로만 사용하며 실제 모델로 로드하지 않습니다.
    data = {'DEMO.whl': b'WHEL', '5c90dfd2.safetensors': b'DEMO', 'htdemucs_6s.yaml': b'test'}
    plan = demucs_cache.download_plan()
    def artifact(name):
        return {'filename': name, 'bytes': 4, 'sha256': hashlib.sha256(data[name]).hexdigest(),
                'url': 'https://files.pythonhosted.org/packages/DEMO.whl' if name.endswith('.whl') else
                    next(item['url'] for item in plan['modelFiles'] if item['path'] == name)}
    items = [artifact(name) for name in data]
    monkeypatch.setattr(demucs_cache, 'download_plan', lambda: {
        'artifacts': items[:1], 'modelFiles': [{**item, 'path': item['filename']} for item in items[1:]]})
    cache, work = tmp_path/'cache', tmp_path/'work'
    cache.mkdir(); work.mkdir()
    requests = []
    class Response(io.BytesIO):
        def geturl(self): return 'https://us.aws.cdn.hf.co/xet-bridge-us/DEMO?Signature=DEMO'
    def open_file(url):
        requests.append(url)
        return Response(data[Path(url).name])
    monkeypatch.setattr(runtime_packages, '_open', open_file)
    return cache, work, data, requests, Response


def test_download_and_offline_reuse_bound_progress_and_never_install(demo, monkeypatch):
    cache, work, data, requests, _ = demo
    progress = []
    result = model_cache.download_cache(cache, work, Event(), progress.append, 'htdemucs_6s')
    assert result == {'schemaVersion': 1, 'modelId': 'htdemucs_6s', 'modelVersion': '4.1.0',
                      'state': 'CACHE_VERIFIED', 'artifactCount': 3, 'totalBytes': 12, 'reusedFiles': 0}
    assert len(requests) == 3 and progress == sorted(set(progress)) and progress[-1] == 100 and len(progress) <= 22
    assert not list(work.iterdir())
    for name, value in data.items(): assert (cache/name).read_bytes() == value
    monkeypatch.setattr(runtime_packages, '_open', lambda _: pytest.fail('캐시 재사용 시 네트워크 금지'))
    assert model_cache.download_cache(cache, work, Event(), lambda _: None, 'htdemucs_6s')['reusedFiles'] == 3


@pytest.mark.parametrize('mode', ['corrupt', 'cancel', 'offline', 'disk', 'existing'])
def test_failure_cancel_and_corrupt_existing_preserve_cache_and_remove_only_partial(demo, monkeypatch, mode):
    cache, work, data, requests, Response = demo
    original = cache/'DEMO.whl'; original.write_bytes(data[original.name])
    cancel = Event()
    def open_file(_):
        if mode == 'offline': raise URLError('private URL')
        if mode == 'cancel': cancel.set()
        return Response(b'BAD!' if mode == 'corrupt' else b'DEMO')
    monkeypatch.setattr(runtime_packages, '_open', open_file)
    if mode == 'disk':
        monkeypatch.setattr(runtime_packages.shutil, 'disk_usage', lambda _: SimpleNamespace(free=0))
    if mode == 'existing':
        (cache/'5c90dfd2.safetensors').write_bytes(b'BAD!')
    progress = []
    with pytest.raises(Canceled if mode == 'cancel' else ModelError):
        model_cache.download_cache(cache, work, cancel, progress.append, 'htdemucs_6s')
    assert original.read_bytes() == data[original.name] and not list(work.iterdir()) and 100 not in progress
    if mode == 'existing': assert (cache/'5c90dfd2.safetensors').read_bytes() == b'BAD!'
    else: assert not (cache/'5c90dfd2.safetensors').exists()
