import json
import ssl
from urllib.request import HTTPSHandler

import pytest

from guitarlab_ai import model_cache, runtime_packages, tls
from guitarlab_ai.install_managed import AI_ROOT


def test_https_context_keeps_certificate_and_hostname_verification():
    context = tls.https_context()
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_https_context_uses_windows_trust_when_pip_vendors_truststore():
    truststore = pytest.importorskip('pip._vendor.truststore')
    assert isinstance(tls.https_context(), truststore.SSLContext)


def test_bundled_runtime_ships_truststore_and_the_tls_worker_module():
    lock = json.loads((AI_ROOT / 'models/runtime-bundle-lock.json').read_text(encoding='utf-8'))
    paths = {item['path'] for item in lock['files']}
    assert 'runtime/python/Lib/site-packages/pip/_vendor/truststore/__init__.py' in paths
    assert 'worker/guitarlab_ai/tls.py' in paths


@pytest.mark.parametrize('module', [model_cache, runtime_packages])
def test_download_openers_use_the_shared_tls_context(module, monkeypatch):
    sentinel = ssl.create_default_context()
    monkeypatch.setattr(module, 'https_context', lambda: sentinel)
    seen = []

    class Opener:
        def open(self, url, timeout):
            return url

    def build_opener(*handlers):
        seen.extend(handlers)
        return Opener()

    monkeypatch.setattr(module, 'build_opener', build_opener)
    assert module._open('https://files.pythonhosted.org/x') == 'https://files.pythonhosted.org/x'
    https = [h for h in seen if isinstance(h, HTTPSHandler)]
    assert len(https) == 1 and https[0]._context is sentinel
