"""사용자 데이터/모델을 제외하고 현재 검증 후보·고지를 새 개발 검증 ZIP에만 묶습니다."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
from uuid import uuid4
import zipfile

from backup_local_data import checked_path, safe_member

PROJECT = Path(__file__).resolve().parents[1]


def unique_object(pairs):
    """JSON의 같은 키를 마지막 값으로 조용히 덮어쓰지 않습니다."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("중복된 패키지 JSON 키")
        result[key] = value
    return result


def verify_archive(path, expected_sha256):
    """신뢰한 외부 지문과 전체 목록/내용을 검사하며 실행·추출하지 않습니다."""
    if not isinstance(expected_sha256, str) or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None:
        raise ValueError("신뢰한 패키지 지문이 필요합니다.")
    checked_path(path.parent, path)
    if path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("패키지 압축 크기 초과")
    with path.open("rb") as source:
        archive_bytes = source.read(64 * 1024 * 1024 + 1)
    if len(archive_bytes) > 64 * 1024 * 1024:
        raise ValueError("패키지 압축 크기 초과")
    if hashlib.sha256(archive_bytes).hexdigest() != expected_sha256:
        raise ValueError("패키지 외부 지문 불일치")
    # 지문 확인 뒤 경로가 바뀌어도 검사한 동일 바이트만 처리합니다.
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        entries = archive.infolist()
        if not 5 <= len(entries) <= 5000:
            raise ValueError("패키지 항목 수 오류")
        names = set()
        total = 0
        for entry in entries:
            safe_member(entry.filename)
            name = entry.filename.casefold()
            kind = (entry.external_attr >> 16) & 0o170000
            if (name in names or not entry.filename.startswith("GuitarLab/") or entry.is_dir()
                    or kind not in (0, 0o100000) or entry.flag_bits & 1
                    or entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    or entry.file_size > 64 * 1024 * 1024):
                raise ValueError("패키지 항목 경계 오류")
            names.add(name)
            total += entry.file_size
        if total > 256 * 1024 * 1024:
            raise ValueError("패키지 전체 크기 초과")
        info = archive.getinfo("GuitarLab/VALIDATION.json")
        if info.file_size > 4 * 1024 * 1024:
            raise ValueError("패키지 목록 크기 초과")
        manifest = json.loads(archive.read(info), object_pairs_hook=unique_object)
        fields = {"schemaVersion", "state", "appVersion", "modelWeightsIncluded", "legalReviewCompleted",
                  "projectLicenseIncluded", "cleanWindowsValidated", "runtimeBundleLockSha256", "files"}
        if (not isinstance(manifest, dict) or set(manifest) != fields
                or type(manifest["schemaVersion"]) is not int or manifest["schemaVersion"] != 1
                or manifest["state"] != "VALIDATION_ONLY"
                or manifest["modelWeightsIncluded"] is not False or manifest["legalReviewCompleted"] is not False
                or manifest["cleanWindowsValidated"] is not False or manifest["projectLicenseIncluded"] is not True
                or not isinstance(manifest["appVersion"], str) or not 1 <= len(manifest["appVersion"]) <= 64
                or not isinstance(manifest["runtimeBundleLockSha256"], str)
                or re.fullmatch(r"[0-9a-f]{64}", manifest["runtimeBundleLockSha256"]) is None
                or not isinstance(manifest["files"], list) or len(manifest["files"]) != len(entries) - 1):
            raise ValueError("패키지 검증 상태/목록 오류")
        expected = {}
        folded = set()
        for entry in manifest["files"]:
            if (not isinstance(entry, dict) or set(entry) != {"path", "bytes", "sha256"}
                    or not isinstance(entry["path"], str) or type(entry["bytes"]) is not int
                    or not 0 <= entry["bytes"] <= 64 * 1024 * 1024 or not isinstance(entry["sha256"], str)
                    or re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]) is None):
                raise ValueError("패키지 파일 계약 오류")
            safe_member(entry["path"])
            name = "GuitarLab/" + entry["path"]
            if name.casefold() in folded or entry["path"].casefold() == "validation.json":
                raise ValueError("패키지 목록 중복")
            expected[name] = entry
            folded.add(name.casefold())
        required = {"GuitarLab/GuitarLab.exe", "GuitarLab/manage_ai_model.exe", "GuitarLab/LICENSE", "GuitarLab/Test-ValidationPackage.ps1"}
        if not required.issubset(expected) or {e.filename for e in entries} != set(expected) | {"GuitarLab/VALIDATION.json"}:
            raise ValueError("패키지 파일 목록 불일치")
        for name, entry in expected.items():
            if archive.getinfo(name).file_size != entry["bytes"]:
                raise ValueError("패키지 파일 크기 불일치")
            raw = archive.read(name)
            if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                raise ValueError("패키지 전체 지문 검증 실패")
    return manifest


def source_archives(root, components):
    """현재 고정 의존성과 일치하는 소스 검토 자료만 패키지에 전달합니다."""
    path = root / "SOURCE-ACCESS.json"
    checked_path(root, path)
    if path.stat().st_size > 128 * 1024:
        raise ValueError("소스 접근 목록 크기 초과")
    manifest = json.loads(path.read_bytes(), object_pairs_hook=unique_object)
    if (not isinstance(manifest, dict) or set(manifest) != {"schemaVersion", "state", "legalReviewCompleted", "scope", "components"}
            or type(manifest.get("schemaVersion")) is not int or manifest["schemaVersion"] != 1
            or manifest.get("state") != "SOURCE_ACCESS_REVIEW" or manifest.get("legalReviewCompleted") is not False
            or not isinstance(manifest.get("scope"), str) or not 1 <= len(manifest["scope"]) <= 200
            or not isinstance(manifest.get("components"), list) or len(manifest["components"]) > 100):
        raise ValueError("소스 접근 검토 상태 오류")
    expected = {(c["ecosystem"], c["name"], c["version"]) for c in components if c["declaredLicense"] == "MPL-2.0"}
    found = set()
    result = []
    for component in manifest["components"]:
        if not isinstance(component, dict):
            raise ValueError("소스 접근 구성요소 오류")
        identity = tuple(component.get(k) for k in ("ecosystem", "name", "version"))
        if any(not isinstance(v, str) for v in identity) or identity not in expected or identity in found or component.get("declaredLicense") != "MPL-2.0":
            raise ValueError("소스 접근 버전/구성요소 불일치")
        found.add(identity)
        ecosystem, name, version = identity
        source = component.get("bundledSource")
        if ecosystem == "cargo":
            archive = f"sources/{name}-{version}.crate"
            if (not isinstance(source, dict) or set(source) != {"file", "bytes", "sha256"}
                    or source["file"] != archive or type(source["bytes"]) is not int or not 0 < source["bytes"] <= 4 * 1024 * 1024
                    or not isinstance(source["sha256"], str) or re.fullmatch(r"[0-9a-f]{64}", source["sha256"]) is None
                    or source["sha256"] != component.get("sourceArchiveSha256")
                    or component.get("sourceArchiveUrl") != f"https://static.crates.io/crates/{name}/{name}-{version}.crate"):
                raise ValueError("동봉 소스 지문/경로 오류")
            safe_member(archive)
            result.append(source)
        elif ecosystem == "npm":
            commit = component.get("gitCommit")
            if (name != "@coderline/alphatab" or source is not None or not isinstance(commit, str)
                    or re.fullmatch(r"[0-9a-f]{40}", commit) is None
                    or component.get("sourceUrl") != f"https://github.com/CoderLine/alphaTab/tree/{commit}"):
                raise ValueError("고정 npm 소스 경로 오류")
        else:
            raise ValueError("소스 접근 생태계 오류")
    if found != expected:
        raise ValueError("소스 접근 구성요소 누락")
    return result


def checked_payload(root, name, size=None, digest=None):
    safe_member(name)
    path = root.joinpath(*name.split("/"))
    checked_path(root, path)
    length = path.stat().st_size
    if length > 64 * 1024 * 1024 or (size is not None and size != length):
        raise ValueError("검증 파일 크기 오류")
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest is not None and digest != actual:
        raise ValueError("검증 파일 지문 오류")
    return path, {"path": name, "bytes": length, "sha256": actual}


def package(candidate_path):
    validation = (PROJECT / "src-tauri/target/runtime-validation").resolve(strict=True)
    candidate_path = candidate_path.resolve(strict=True)
    if not candidate_path.is_relative_to(validation) or candidate_path.stat().st_size > 128 * 1024:
        raise ValueError("검증 후보 경로 오류")
    candidate = json.loads(candidate_path.read_bytes())
    source = Path(candidate["destination"]).resolve(strict=True)
    if not source.is_relative_to(validation / "portable"):
        raise ValueError("검증 후보 실행 폴더 오류")
    payloads = []
    def add(root, name, destination=None, size=None, digest=None):
        path, entry = checked_payload(root, name, size, digest)
        entry["path"] = destination or name
        safe_member(entry["path"])
        payloads.append((path, entry))
    add(source, "GuitarLab.exe", size=candidate["executableBytes"], digest=candidate["executableSha256"])
    manager = PROJECT / "src-tauri/target/debug/examples"
    add(manager, "manage_ai_model.exe")
    lock_raw = (PROJECT / "ai/models/runtime-bundle-lock.json").read_bytes()
    lock = json.loads(lock_raw)
    for entry in lock["files"]:
        add(source / "ai-runtime", entry["path"], "ai-runtime/" + entry["path"], entry["bytes"], entry["sha256"])
    legal = PROJECT / "docs/release"
    inventory = json.loads((legal / "dependency-inventory.json").read_bytes())
    sources = source_archives(legal, inventory["components"])
    unique = {notice["file"]: notice for component in inventory["components"] for notice in component["notices"]}
    tools = json.loads((legal / "INSTALLER-TOOLS.json").read_bytes())
    if tools["schemaVersion"] != 1 or tools["legalReviewCompleted"] is not False:
        raise ValueError("설치 도구 고지의 검토 상태가 다릅니다.")
    for tool in tools["tools"]:
        for notice in tool["notices"]:
            unique[notice["file"]] = notice
    for name in ("dependency-inventory.json", "THIRD_PARTY_NOTICES.md", "README.md", "CI-ACTIONS.json", "INSTALLER-TOOLS.json"):
        add(legal, name, "third-party/" + name)
    for name in ("SOURCE-ACCESS.json", "SOURCE-ACCESS.ko.md"):
        add(legal, name, "third-party/" + name)
    for source in sources:
        add(legal, source["file"], "third-party/" + source["file"], source["bytes"], source["sha256"])
    for name, notice in sorted(unique.items()):
        add(legal, name, "third-party/" + name, notice["bytes"], notice["sha256"])
    add(PROJECT / "scripts", "Test-ValidationPackage.ps1")
    license_included = (PROJECT / "LICENSE").is_file()
    if license_included:
        add(PROJECT, "LICENSE")
    names = {entry["path"].casefold() for _, entry in payloads}
    total = sum(entry["bytes"] for _, entry in payloads)
    if len(names) != len(payloads) or len(names) > 4997 or total > 256 * 1024 * 1024:
        raise ValueError("검증 패키지 개수/용량 오류")
    app_version = json.loads((PROJECT / "package.json").read_bytes())["version"]
    manifest = {"schemaVersion": 1, "state": "VALIDATION_ONLY", "appVersion": app_version, "modelWeightsIncluded": False,
                "legalReviewCompleted": False, "projectLicenseIncluded": license_included, "cleanWindowsValidated": False,
                "runtimeBundleLockSha256": hashlib.sha256(lock_raw).hexdigest(), "files": [entry for _, entry in payloads]}
    readme = "# GuitarLab 개발 검증 패키지\n\n현재 PC 검증용이며 최종 배포/installer가 아닙니다. 전체 폴더를 푼 뒤 Test-ValidationPackage.ps1로 지문·독립 Python을 확인합니다. 앱 실행과 모델 설치는 이 스크립트가 자동 수행하지 않습니다.\n\n모델·사용자 프로젝트/녹음·API 키·개발 환경은 포함하지 않습니다. 실행 시 기존 GuitarLab 앱 데이터를 사용할 수 있으므로 동시에 여러 버전을 열지 마세요. 별도 새 Windows의 WebView2/DLL/권한·백신 수용은 미실행입니다. GuitarLab 자체 소스는 MIT이며 LICENSE를 확인하세요. 제3자 고지·모델 조건 검토가 완료된 것으로 간주하지 마세요. third-party/README.md를 함께 확인하세요.\n"
    readme_raw = readme.encode("utf-8")
    manifest["files"].append({"path": "VALIDATION-README.ko.md", "bytes": len(readme_raw), "sha256": hashlib.sha256(readme_raw).hexdigest()})
    destination = validation / "validation-packages" / str(uuid4())
    destination.mkdir(parents=True, exist_ok=False)
    archive_path = destination / "GuitarLab-validation.zip"
    created = False
    try:
        with zipfile.ZipFile(archive_path, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=False) as archive:
            created = True
            for path, entry in payloads:
                archive.write(path, "GuitarLab/" + entry["path"])
            archive.writestr("GuitarLab/VALIDATION-README.ko.md", readme_raw)
            archive.writestr("GuitarLab/VALIDATION.json", json.dumps(manifest, ensure_ascii=False, allow_nan=False).encode())
        verify_archive(archive_path, hashlib.sha256(archive_path.read_bytes()).hexdigest())
    except BaseException:
        if created:
            archive_path.unlink(missing_ok=True)
        raise
    receipt = {"schemaVersion": 1, "state": "VALIDATION_PACKAGE_CREATED", "path": str(archive_path), "bytes": archive_path.stat().st_size,
               "sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(), "files": len(manifest["files"]) + 1,
               "cleanWindowsValidated": False, "legalReviewCompleted": False}
    with (destination / "receipt.json").open("x", encoding="utf-8") as output:
        json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(json.dumps(receipt))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    package(parser.parse_args().candidate)
