import json
import re
from pathlib import Path
from urllib.parse import urlparse
from packaging.requirements import Requirement
from packaging.tags import cpython_tags, compatible_tags
from packaging.utils import canonicalize_name, parse_wheel_filename


def test_official_pinned_wheels_match_lock_target_and_declared_download_size():
    root = Path(__file__).resolve().parents[1] / "models"
    plan = json.loads((root / "basic-pitch-0.4.0-windows-cp310.json").read_text(encoding="utf-8"))
    assert plan["schemaVersion"] == 1 and plan["state"] == "INSTALLATION_UNVERIFIED"
    assert plan["python"] == "3.10" and plan["platform"] == "win_amd64"
    target = set(cpython_tags((3, 10), abis=["cp310", "abi3", "none"], platforms=["win_amd64"]))
    target.update(compatible_tags((3, 10), interpreter="cp310", platforms=["win_amd64"]))
    expected = {}
    for artifact in plan["artifacts"]:
        name, version, _, tags = parse_wheel_filename(artifact["filename"])
        assert name == canonicalize_name(artifact["name"]) and str(version) == artifact["version"]
        assert tags & target
        assert urlparse(artifact["url"]).scheme == "https" and urlparse(artifact["url"]).hostname == "files.pythonhosted.org"
        assert artifact["url"].endswith("/" + artifact["filename"])
        assert urlparse(artifact["metadataSource"]).hostname == "pypi.org"
        assert re.fullmatch(r"[0-9a-f]{64}", artifact["sha256"])
        assert artifact["bytes"] > 0 and artifact["license"]
        assert name not in expected
        expected[name] = (artifact["version"], artifact["sha256"])
    locked = {}
    for line in (root / "requirements-basic-pitch-windows-cp310.lock").read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        spec, sha = line.split(" --hash=sha256:")
        requirement = Requirement(spec)
        assert not requirement.extras and requirement.url is None and requirement.marker is None
        version = next(iter(requirement.specifier))
        assert version.operator == "==" and len(list(requirement.specifier)) == 1
        name = canonicalize_name(requirement.name)
        assert name not in locked
        locked[name] = (version.version, sha)
    assert expected == locked and len(expected) == 41
    assert plan["downloadBytes"] == sum(a["bytes"] for a in plan["artifacts"])
    assert plan["freeDiskBytesRequired"] >= 1024**3
