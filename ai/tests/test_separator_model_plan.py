import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from packaging.markers import default_environment
from packaging.requirements import Requirement
from packaging.tags import compatible_tags, cpython_tags
from packaging.utils import canonicalize_name, parse_wheel_filename


def test_separator_plan_has_closed_dependency_graph_pinned_files_and_research_gate():
    root = Path(__file__).resolve().parents[1] / "models"
    plan = json.loads((root / "demucs-4.1.0-htdemucs-6s-windows-cp310.json").read_text(encoding="utf-8"))
    assert plan["schemaVersion"] == 1 and plan["state"] == "INSTALLATION_UNVERIFIED"
    assert plan["python"] == "3.10" and plan["platform"] == "win_amd64"
    assert plan["verified"] is False and plan["commercialRedistributionVerified"] is False
    assert plan["researchOnly"] is True and plan["automaticDownloadAllowed"] is False
    assert plan["weightLicenseStatus"] == "RESEARCH_ONLY_NOTICE" and plan["distributionBlockers"]
    assert plan["weightLicenseSource"] == "https://github.com/facebookresearch/demucs/issues/327"
    target = set(cpython_tags((3, 10), abis=["cp310", "abi3", "none"], platforms=["win_amd64"]))
    target.update(compatible_tags((3, 10), interpreter="cp310", platforms=["win_amd64"]))
    expected = {}
    for artifact in plan["artifacts"]:
        name, version, _, tags = parse_wheel_filename(artifact["filename"])
        assert name == canonicalize_name(artifact["name"]) and str(version) == artifact["version"]
        assert tags & target and name not in expected
        url = urlparse(artifact["url"])
        assert url.scheme == "https" and url.hostname in {"files.pythonhosted.org", "download-r2.pytorch.org"}
        assert unquote(url.path).endswith("/" + artifact["filename"])
        assert re.fullmatch(r"[0-9a-f]{64}", artifact["sha256"]) and artifact["bytes"] > 0
        assert artifact["license"] and artifact["license"] != "METADATA_UNVERIFIED"
        assert "NonCommercial" not in artifact["license"] and "CC-BY-NC" not in artifact["license"]
        expected[name] = (artifact["version"], artifact["sha256"])
    locked = {}
    for line in (root / "requirements-demucs-windows-cp310.lock").read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        spec, sha = line.split(" --hash=sha256:")
        requirement = Requirement(spec)
        versions = list(requirement.specifier)
        assert not requirement.extras and requirement.url is None and requirement.marker is None
        assert len(versions) == 1 and versions[0].operator == "=="
        name = canonicalize_name(requirement.name)
        assert name not in locked
        locked[name] = (versions[0].version, sha)
    assert expected == locked and len(expected) == 31
    assert not {"diffq", "diffq-fixed", "audio-separator", "torchaudio", "torchvision"} & expected.keys()
    environment = default_environment()
    environment.update(python_version="3.10", python_full_version="3.10.8", sys_platform="win32",
                       os_name="nt", platform_system="Windows", platform_machine="AMD64", extra="")
    assert set(plan["requires"]) == set(expected)
    for requirements in plan["requires"].values():
        for text in requirements:
            requirement = Requirement(text)
            if requirement.marker and not requirement.marker.evaluate(environment):
                continue
            name = canonicalize_name(requirement.name)
            assert not requirement.extras and requirement.url is None
            assert name in expected and requirement.specifier.contains(expected[name][0])
    assert plan["sources"] == ["drums", "bass", "other", "vocals", "guitar", "piano"]
    assert plan["leadRhythmSupported"] is False
    assert {file["path"] for file in plan["modelFiles"]} == {"5c90dfd2.safetensors", "htdemucs_6s.yaml"}
    for file in plan["modelFiles"]:
        assert re.fullmatch(r"[0-9a-f]{64}", file["sha256"]) and file["bytes"] > 0
        assert file["url"] == ("https://huggingface.co/adefossez/HTDemucs-6s/resolve/"
                               + plan["modelRevision"] + "/" + file["path"])
    assert plan["packageDownloadBytes"] == sum(a["bytes"] for a in plan["artifacts"])
    assert plan["downloadBytes"] == plan["packageDownloadBytes"] + sum(f["bytes"] for f in plan["modelFiles"])
    assert plan["downloadBytes"] == 707117623 and plan["freeDiskBytesRequired"] >= 4 * 1024**3
