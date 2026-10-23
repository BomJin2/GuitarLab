"""제품 AppData/프로세스와 분리된 내부 NSIS 검증 설정만 새 폴더에 준비합니다."""

import argparse
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from package_validation import checked_payload

PROJECT = Path(__file__).resolve().parents[1]


def validate_template(template, product):
    bundle = template.get("bundle", {})
    windows = bundle.get("windows", {})
    if (template.get("identifier") != "com.guitarlab.validation" or
            template["identifier"] == product.get("identifier") or
            template.get("productName") != "GuitarLab Validation" or
            template["productName"] == product.get("productName") or
            template.get("mainBinaryName") != "guitarlab-validation" or
            template["mainBinaryName"].casefold() == (product.get("mainBinaryName") or "guitarlab").casefold() or
            bundle.get("active") is not True or bundle.get("targets") != ["nsis"] or
            windows.get("nsis", {}).get("installMode") != "currentUser" or
            windows.get("webviewInstallMode") != {"type": "skip"} or
            bundle.get("licenseFile") != "../LICENSE" or
            bundle.get("resources") != {"../LICENSE": "LICENSE", "../docs/release/": "third-party/",
                                        "../docs/19-BACKUP-AND-RECOVERY.md": "BACKUP-README.ko.md"}):
        raise ValueError("제품과 분리한 고정 설치 검증 설정이 아닙니다.")


def prepare(profile="debug", runtime_resources=None):
    if profile not in ("debug", "release"):
        raise ValueError("지원하지 않는 빌드 프로필입니다.")
    validation = (PROJECT / "src-tauri/target/runtime-validation").resolve(strict=True)
    if runtime_resources is None:
        candidate = json.loads((validation / "portable-candidate.json").read_bytes())
        runtime_resources = candidate["resourcePath"]
    resources = Path(runtime_resources).resolve(strict=True)
    if not resources.is_relative_to((PROJECT / "src-tauri/target/ai-runtime-resources").resolve(strict=True)):
        raise ValueError("고정 런타임 리소스 경로가 아닙니다.")
    lock_raw = (PROJECT / "ai/models/runtime-bundle-lock.json").read_bytes()
    lock = json.loads(lock_raw)
    expected = {entry["path"] for entry in lock["files"]}
    if len(expected) != len(lock["files"]) or expected != {p.relative_to(resources).as_posix() for p in resources.rglob("*") if p.is_file()}:
        raise ValueError("런타임 파일 목록이 다릅니다.")
    for entry in lock["files"]:
        checked_payload(resources, entry["path"], entry["bytes"], entry["sha256"])
    template_raw = (PROJECT / "src-tauri/tauri.validation.conf.json").read_bytes()
    config = json.loads(template_raw)
    validate_template(config, json.loads((PROJECT / "src-tauri/tauri.conf.json").read_bytes()))
    run_id = uuid4()
    # 이전 검증 앱의 보존 데이터를 지우지 않고 새 실행의 AppData를 분리합니다.
    config["identifier"] = "com.guitarlab.validation.run" + run_id.hex
    config["productName"] = "GuitarLab Validation " + run_id.hex
    config["mainBinaryName"] = "guitarlab-validation-" + run_id.hex
    _, index = checked_payload(PROJECT / "dist", "index.html")
    config["build"] = {"beforeBuildCommand": None}
    config["bundle"]["licenseFile"] = str(PROJECT / "LICENSE")
    config["bundle"]["resources"] = {
        (PROJECT / "src-tauri" / source).resolve(strict=True).as_posix() + ("/" if source.endswith("/") else ""): destination
        for source, destination in config["bundle"]["resources"].items()
    }
    config["bundle"]["resources"][resources.as_posix() + "/"] = "ai-runtime/"
    destination = validation / "installer-builds" / str(run_id)
    destination.mkdir(parents=True, exist_ok=False)
    path = destination / "tauri.conf.json"
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    receipt = {"schemaVersion": 1, "state": "VALIDATION_INSTALLER_PREPARED", "configPath": str(path), "buildProfile": profile,
               "identifier": config["identifier"], "productName": config["productName"], "mainBinaryName": config["mainBinaryName"],
               "runtimeFiles": len(expected), "runtimeBundleLockSha256": hashlib.sha256(lock_raw).hexdigest(),
               "templateSha256": hashlib.sha256(template_raw).hexdigest(), "frontendIndexSha256": index["sha256"],
               "modelWeightsIncluded": False, "cleanWindowsValidated": False, "legalReviewCompleted": False}
    (destination / "plan.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    (validation / "validation-installer-plan.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(receipt))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("debug", "release"), default="debug")
    prepare(parser.parse_args().profile)
