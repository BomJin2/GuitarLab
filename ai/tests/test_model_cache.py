import hashlib
from http.client import IncompleteRead
import io
from pathlib import Path
from threading import Event
from types import SimpleNamespace
from urllib.error import URLError
from uuid import uuid4

import pytest
from guitarlab_ai import model_cache as cache
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled
from guitarlab_ai.worker import parse_line
from test_worker import line, message


@pytest.fixture
def setup_cache(tmp_path, monkeypatch):
    # DEMO 캐시이며 실제 모델 파일/분석 결과로 사용하지 않습니다.
    contents = {"one.whl": b"DEMO", "two.whl": b"test"}
    plan = {"id": cache.PLAN_ID, "downloadBytes": 8, "artifacts": [
        {"filename": name, "url": "https://files.pythonhosted.org/packages/" + name,
         "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in contents.items()]}
    monkeypatch.setattr(cache, "_plan", lambda: plan)
    monkeypatch.setattr(cache, "ARTIFACT_COUNT", 2)
    monkeypatch.setattr(cache, "TOTAL_BYTES", 8)
    requests = []
    class Response(io.BytesIO):
        def geturl(self):
            return "https://files.pythonhosted.org/packages/test.whl"
    def open_file(url):
        requests.append(url)
        return Response(contents[Path(url).name])
    monkeypatch.setattr(cache, "_open", open_file)
    folder, work = tmp_path / "cache", tmp_path / "work"
    folder.mkdir(); work.mkdir()
    return folder, work, contents, plan, requests


def test_fixed_manifest_fingerprint_and_redirect_policy():
    assert len(cache._plan()["artifacts"]) == 41
    for url in ["http://files.pythonhosted.org/packages/a", "https://evil.example/packages/a",
                "https://files.pythonhosted.org@evil.example/packages/a", "https://files.pythonhosted.org/packages/a?secret=x"]:
        assert not cache._allowed_url(url)
        with pytest.raises(ModelError, match="AI_DOWNLOAD_FAILED"):
            cache._Redirects().redirect_request(None, None, 302, "", {}, url)


def test_exact_download_then_offline_reuse_never_executes_packages(setup_cache, monkeypatch):
    folder, work, contents, _, requests = setup_cache
    progress = []
    result = cache.download_cache(folder, work, Event(), progress.append)
    assert result["state"] == "CACHE_VERIFIED" and result["reusedFiles"] == 0
    assert result["totalBytes"] == 8 and progress == sorted(set(progress)) and progress[-1] == 100
    assert len(requests) == 2 and not list(work.iterdir())
    for name, data in contents.items():
        assert (folder / name).read_bytes() == data
    monkeypatch.setattr(cache, "_open", lambda _: pytest.fail("캐시 재사용 시 네트워크 금지"))
    assert cache.download_cache(folder, work, Event(), lambda _: None)["reusedFiles"] == 2


@pytest.mark.parametrize("data", [b"oops", b"too long", b""])
def test_bad_size_or_hash_never_publishes_and_preserves_existing_cache(setup_cache, monkeypatch, data):
    folder, work, contents, _, _ = setup_cache
    (folder / "one.whl").write_bytes(contents["one.whl"])
    class BadResponse(io.BytesIO):
        def geturl(self):
            return "https://files.pythonhosted.org/packages/two.whl"
    monkeypatch.setattr(cache, "_open", lambda _: BadResponse(data))
    with pytest.raises(ModelError, match="AI_CACHE_INTEGRITY"):
        cache.download_cache(folder, work, Event(), lambda _: None)
    assert (folder / "one.whl").read_bytes() == contents["one.whl"]
    assert not (folder / "two.whl").exists() and not list(work.iterdir())


def test_corrupt_existing_file_or_collision_is_not_overwritten(setup_cache):
    folder, work, _, _, requests = setup_cache
    (folder / "one.whl").write_bytes(b"oops")
    with pytest.raises(ModelError, match="AI_CACHE_INTEGRITY"):
        cache.download_cache(folder, work, Event(), lambda _: None)
    assert (folder / "one.whl").read_bytes() == b"oops" and not requests
    part = work / "publish.part"; part.write_bytes(b"new")
    with pytest.raises(OSError):
        cache._publish(part, folder / "one.whl")
    assert (folder / "one.whl").read_bytes() == b"oops"


def test_cancel_network_failure_disk_space_and_unsafe_names(setup_cache, monkeypatch):
    folder, work, _, plan, _ = setup_cache
    cancel = Event()
    def progress(percent):
        if percent > 0:
            cancel.set()
    with pytest.raises(Canceled):
        cache.download_cache(folder, work, cancel, progress)
    assert not list(work.iterdir()) and not list(folder.iterdir())
    def offline(_):
        raise URLError("private path")
    monkeypatch.setattr(cache, "_open", offline)
    with pytest.raises(ModelError, match="AI_DOWNLOAD_FAILED"):
        cache.download_cache(folder, work, Event(), lambda _: None)
    assert not list(work.iterdir())
    def interrupted(_):
        raise IncompleteRead(b"partial")
    monkeypatch.setattr(cache, "_open", interrupted)
    with pytest.raises(ModelError, match="AI_DOWNLOAD_FAILED"):
        cache.download_cache(folder, work, Event(), lambda _: None)
    assert not list(work.iterdir())
    monkeypatch.setattr(cache.shutil, "disk_usage", lambda _: SimpleNamespace(free=0))
    with pytest.raises(ModelError, match="AI_DISK_SPACE"):
        cache.download_cache(folder, work, Event(), lambda _: None)
    plan["artifacts"][0]["filename"] = "../escape.whl"
    with pytest.raises(ModelError, match="AI_CACHE_INTEGRITY"):
        cache.download_cache(folder, work, Event(), lambda _: None)


def test_download_protocol_rejects_extra_urls_paths_and_unknown_models():
    valid = message(str(uuid4()), action="download_model", modelId="basic-pitch", input={"cacheDir": "cache", "workDir": "work"})
    assert parse_line(line(valid)) == valid
    assert parse_line(line({**valid, "modelId": "htdemucs_6s"}))["modelId"] == "htdemucs_6s"
    for bad in [{**valid, "modelId": "unknown"}, {**valid, "url": "https://evil.example"},
                {**valid, "input": {"cacheDir": "cache", "workDir": "work", "url": "secret"}}]:
        with pytest.raises(ValueError):
            parse_line(line(bad))
