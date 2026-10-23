"""설치된 배포 의존성의 버전·고지 원문만 로컬에 수집합니다. 이용 허가 검토 완료 판정은 아닙니다."""

import argparse
import hashlib
import json
from pathlib import Path
from uuid import uuid4

PROJECT = Path(__file__).resolve().parents[1]


def production_nodes(document, root):
    if not isinstance(document, list) or len(document) != 1 or Path(document[0]["path"]).resolve() != root.resolve():
        raise ValueError("현재 프로젝트 pnpm 목록이 아닙니다.")
    pending = list(document[0]["dependencies"].items())
    result = {}
    while pending:
        name, item = pending.pop()
        key = (name, item["version"])
        if key in result:
            continue
        result[key] = item
        if len(result) > 1000:
            raise ValueError("의존성 개수 한도 초과")
        pending.extend(item.get("dependencies", {}).items())
    return result


def rust_nodes(document):
    packages = {item["id"]: item for item in document["packages"]}
    nodes = {item["id"]: item for item in document["resolve"]["nodes"]}
    root = document["resolve"]["root"]
    pending, visited = [root], set()
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        if len(visited) > 2000:
            raise ValueError("의존성 개수 한도 초과")
        for dep in nodes[current]["deps"]:
            if any(kind["kind"] in (None, "build") for kind in dep["dep_kinds"]):
                pending.append(dep["pkg"])
    return [packages[key] for key in sorted(visited) if key != root]


def notice_files(root, license_file=None):
    root = root.resolve(strict=True)
    result = set()
    if license_file:
        result.add(root / license_file)
    for path in root.iterdir():
        if path.name.casefold().startswith(("license", "licence", "notice", "copying", "copyright")):
            if path.is_dir():
                result.update(p for p in path.iterdir() if p.is_file())
            elif path.is_file():
                result.add(path)
    if len(result) > 64:
        raise ValueError("고지 파일 개수 한도 초과")
    checked = []
    for path in sorted(result):
        canonical = path.resolve(strict=True)
        if not canonical.is_relative_to(root) or path.is_symlink() or not canonical.is_file() or path.stat().st_size > 1024 * 1024:
            raise ValueError("고지 파일 경로/크기 오류")
        checked.append(path)
    return checked


def checked_json(path):
    allowed = (PROJECT / "src-tauri/target/runtime-validation").resolve(strict=True)
    path = path.resolve(strict=True)
    if not path.is_relative_to(allowed) or path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("개발 검증 metadata 경로/크기 오류")
    raw = path.read_bytes()
    return json.loads(raw.decode("utf-8-sig")), hashlib.sha256(raw).hexdigest()


def collect(npm_path, rust_path, upstream_path=None, runtime_resources=None, include_assets=False):
    npm, npm_sha = checked_json(npm_path)
    rust, rust_sha = checked_json(rust_path)
    selected = production_nodes(npm, PROJECT)
    declared = json.loads((PROJECT / "package.json").read_bytes())["dependencies"]
    if set(npm[0]["dependencies"]) != set(declared) or any(npm[0]["dependencies"][key]["version"] != value for key, value in declared.items()):
        raise ValueError("직접 배포 의존성이 package.json과 다릅니다.")
    destination = PROJECT / "src-tauri/target/runtime-validation" / ("release-notices-" + str(uuid4()))
    destination.mkdir(exist_ok=False)
    (destination / "notices").mkdir()
    inventory = {"schemaVersion": 1, "state": "INVENTORY_CREATED", "target": "x86_64-pc-windows-msvc",
                 "npmMetadataSha256": npm_sha, "rustMetadataSha256": rust_sha,
                 "scope": "npm 배포 의존성/peer와 Rust Windows normal·build 의존성, dev-only 제외",
                 "legalReviewCompleted": False, "components": [], "reviewRequired": []}
    upstream = {}
    if upstream_path is not None:
        document, upstream_sha = checked_json(upstream_path)
        if document["schemaVersion"] != 1 or document["state"] not in ("COLLECTED", "PARTIAL"):
            raise ValueError("원문 수집 결과 계약 오류")
        inventory["upstreamSourcesSha256"] = upstream_sha
        for entry in document["entries"]:
            key = (entry["name"], entry["version"])
            if key in upstream:
                raise ValueError("중복 원문 수집 결과")
            upstream[key] = entry
    def record(ecosystem, name, version, license_expression, directory, license_file=None, repository=None):
        notices = []
        for path in notice_files(directory, license_file):
            raw = path.read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            target = destination / "notices" / (digest + ".txt")
            if not target.exists():
                with target.open("xb") as output:
                    output.write(raw)
            notices.append({"name": path.relative_to(directory).as_posix(), "bytes": len(raw), "sha256": digest, "file": "notices/" + digest + ".txt"})
        if not notices and (name, version) in upstream:
            entry = upstream[(name, version)]
            vcs = json.loads((directory / ".cargo_vcs_info.json").read_bytes())
            declared_repository = (repository or "").removesuffix(".git")
            if declared_repository == "https://github.com/rustaudio/sample":
                declared_repository = "https://github.com/RustAudio/dasp"
            if entry["commit"] != vcs["git"]["sha1"] or entry["repository"] != declared_repository or len(entry["notices"]) > 6:
                raise ValueError("배포된 crate commit/공식 원문 저장소 불일치")
            for notice in entry["notices"]:
                name_in_source = notice["name"]
                expected_url = "https://raw.githubusercontent.com/" + declared_repository.removeprefix("https://github.com/") + "/" + entry["commit"] + "/" + name_in_source
                if Path(name_in_source).name != name_in_source or notice["sourceUrl"] != expected_url or notice["file"] != notice["sha256"] + ".txt":
                    raise ValueError("공식 원문 주소/이름 오류")
                path = upstream_path.resolve(strict=True).parent / notice["file"]
                if not path.resolve(strict=True).is_relative_to(upstream_path.resolve(strict=True).parent) or path.stat().st_size != notice["bytes"] or notice["bytes"] > 1024 * 1024:
                    raise ValueError("원문 경로/크기 오류")
                raw = path.read_bytes()
                if hashlib.sha256(raw).hexdigest() != notice["sha256"]:
                    raise ValueError("원문 지문 오류")
                target = destination / "notices" / notice["file"]
                if not target.exists():
                    with target.open("xb") as output:
                        output.write(raw)
                notices.append({**notice, "file": "notices/" + notice["file"], "commit": entry["commit"]})
        component = {"ecosystem": ecosystem, "name": name, "version": version, "declaredLicense": license_expression, "notices": notices}
        inventory["components"].append(component)
        if not isinstance(license_expression, str) or not license_expression or not notices:
            inventory["reviewRequired"].append({"component": ecosystem + ":" + name + "@" + version, "reason": "선언 라이선스 또는 배포 고지 원문 없음"})
    node_root = (PROJECT / "node_modules").resolve(strict=True)
    for (name, version), entry in sorted(selected.items()):
        directory = Path(entry["path"]).resolve(strict=True)
        if not directory.is_relative_to(node_root):
            raise ValueError("현재 node_modules 밖의 배포 의존성")
        package = json.loads((directory / "package.json").read_bytes())
        if (package["name"], package["version"]) != (name, version):
            raise ValueError("설치된 npm 이름/버전 불일치")
        record("npm", name, version, package.get("license"), directory)
    for package in rust_nodes(rust):
        if not (package.get("source") or "").startswith("registry+"):
            raise ValueError("허용한 registry 외 Rust 의존성")
        directory = Path(package["manifest_path"]).resolve(strict=True).parent
        record("cargo", package["name"], package["version"], package.get("license"), directory, package.get("license_file"), package.get("repository"))
    # 폰트/음색/번들 런타임·모델·앱 자체 허가는 패키지 metadata만으로 완료 처리하지 않습니다.
    inventory["reviewRequired"].extend([
        {"component": "GuitarLab", "reason": "프로젝트 자체 배포 라이선스 선택/저작권자 확인 필요"},
        {"component": "배포 자산", "reason": "Bravura·SONiVOX 음색 출처/원문·하위 구성요소 범위 확인 필요"},
        {"component": "번들 Python", "reason": "기존 runtime notices 및 포함 라이브러리 원문 연결 필요"},
        {"component": "모델", "reason": "선택 다운로드 모델/가중치별 조건·고지를 앱 배포와 분리해 확인 필요"},
    ])
    if include_assets:
        distribution = node_root / ".pnpm/@coderline+alphatab@1.6.1/node_modules/@coderline/alphatab/dist"
        groups = {"font": ("Bravura-FONTLOG.txt", "Bravura-OFL-FAQ.txt", "Bravura-OFL.txt", "Bravura.eot", "Bravura.otf", "Bravura.svg", "Bravura.woff", "Bravura.woff2"),
                  "soundfont": ("LICENSE", "README.md", "sonivox.sf2", "sonivox.sf3")}
        for directory, names in groups.items():
            files = []
            for name in names:
                path = PROJECT / "public" / directory / name
                expected = distribution / directory / name
                if path.is_symlink() or path.stat().st_size > 2 * 1024 * 1024 or path.read_bytes() != expected.read_bytes():
                    raise ValueError("배포 자산이 설치 alphaTab1.6.1 원본과 다릅니다.")
                files.append({"path": "public/" + directory + "/" + name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
            record("asset", "Bravura" if directory == "font" else "SONiVOX", "alphaTab1.6.1 동봉본", "OFL-1.1" if directory == "font" else "Apache-2.0 (배포자 선언)", PROJECT / "public" / directory, "Bravura-OFL.txt" if directory == "font" else "README.md")
            inventory["components"][-1]["assetFiles"] = files
            inventory["components"][-1]["sourceUrl"] = "https://www.alphatab.net/docs/getting-started/installation-web/"
        inventory["reviewRequired"] = [item for item in inventory["reviewRequired"] if item["component"] != "배포 자산"]
    if runtime_resources is not None:
        runtime_resources = runtime_resources.resolve(strict=True)
        allowed = (PROJECT / "src-tauri/target/ai-runtime-resources").resolve(strict=True)
        if not runtime_resources.is_relative_to(allowed):
            raise ValueError("검증용 runtime 리소스 경로 오류")
        raw = (PROJECT / "ai/models/runtime-bundle-lock.json").read_bytes()
        bundle = json.loads(raw)
        if bundle["pythonVersion"] != "3.12.15" or bundle["state"] != "RUNTIME_RESOURCE_CANDIDATE":
            raise ValueError("runtime 고지 계약 오류")
        expected = [entry for entry in bundle["files"] if entry["path"].startswith("notices/")]
        for entry in expected:
            path = (runtime_resources / entry["path"]).resolve(strict=True)
            if not path.is_relative_to(runtime_resources) or path.stat().st_size != entry["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
                raise ValueError("runtime 고지 지문 오류")
        record("runtime", "CPython 및 동봉 라이브러리 고지", "3.12.15", "PSF-2.0 및 파일별 별도 조건", runtime_resources / "notices", "README.md")
        if len(inventory["components"][-1]["notices"]) != len(expected):
            raise ValueError("runtime 고지 목록 불일치")
        inventory["runtimeBundleManifestSha256"] = hashlib.sha256(raw).hexdigest()
        inventory["reviewRequired"] = [item for item in inventory["reviewRequired"] if item["component"] != "번들 Python"]
    inventory["components"].sort(key=lambda c: (c["ecosystem"], c["name"], c["version"]))
    with (destination / "inventory.json").open("x", encoding="utf-8") as output:
        json.dump(inventory, output, ensure_ascii=False, allow_nan=False, indent=2)
    rows = ["# 배포 의존성 고지 수집", "", "설치된 버전의 원문을 변경 없이 복사한 개발 산출물입니다. 최종 이용 허가/배포 검토 완료를 뜻하지 않습니다.", "", "| 구분 | 구성요소 | 설치 버전 | 선언 조건 | 원문 |", "| --- | --- | --- | --- | --- |"]
    for item in inventory["components"]:
        links = ", ".join(f"[{notice['name']}]({notice['file']})" for notice in item["notices"]) or "없음 · 검토 필요"
        rows.append(f"| {item['ecosystem']} | {item['name']} | {item['version']} | {item['declaredLicense'] or '미표기'} | {links} |")
    rows.extend(["", "## 남은 검토", ""])
    rows.extend("- " + item["component"] + ": " + item["reason"] for item in inventory["reviewRequired"])
    with (destination / "NOTICES.md").open("x", encoding="utf-8") as output:
        output.write("\n".join(rows) + "\n")
    print(json.dumps({"state": inventory["state"], "components": len(inventory["components"]), "reviewRequired": len(inventory["reviewRequired"]), "path": str(destination)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("npm_metadata", type=Path)
    parser.add_argument("rust_metadata", type=Path)
    parser.add_argument("--upstream-sources", type=Path)
    parser.add_argument("--runtime-resources", type=Path)
    parser.add_argument("--include-assets", action="store_true")
    args = parser.parse_args()
    collect(args.npm_metadata, args.rust_metadata, args.upstream_sources, args.runtime_resources, args.include_assets)
