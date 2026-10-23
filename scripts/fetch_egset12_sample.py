"""공식 EGSet12의 사전에 고른 두 표본만 전체 지문 확인 후 보존합니다."""

import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
from uuid import uuid4

RECORD = "https://zenodo.org/api/records/11406378"
FILES = {
    "01.wav": (8640044, "2eb739c5fb73e6327bb47267afe3eddf"),
    "01.jams": (52172, "083c7dae8e6556c20b9a2d762e2c977f"),
    "12.wav": (6702584, "e1ee73508f37d5c28c69877a588665d2"),
    "12.jams": (47846, "21217bda094eb8f29edfd1ed2f23ba45"),
}


def validate_metadata(metadata):
    if metadata.get("id") != 11406378 or metadata["metadata"].get("license", {}).get("id") != "cc-by-4.0":
        raise ValueError("고정 레코드/허용 조건 오류")
    files = {entry["key"]: entry for entry in metadata["files"]}
    for name, (size, md5) in FILES.items():
        entry = files[name]
        if entry["size"] != size or entry["checksum"] != "md5:" + md5 or entry["links"]["self"] != RECORD + "/files/" + name + "/content":
            raise ValueError("고정 공식 파일 정보가 변경되었습니다.")
    return files


def main(download):
    with urllib.request.urlopen(RECORD, timeout=25) as response:
        raw = response.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("공식 metadata 한도 초과")
    files = validate_metadata(json.loads(raw))
    if not download:
        print(json.dumps({"record": 11406378, "license": "cc-by-4.0", "selected": list(FILES), "downloadBytes": sum(size for size, _ in FILES.values())}))
        return
    target = Path(__file__).resolve().parents[1] / "fixtures/external/egset12-11406378" / str(uuid4())
    target.mkdir(parents=True, exist_ok=False)
    receipt = {"schemaVersion": 1, "source": "https://zenodo.org/records/11406378", "license": "cc-by-4.0", "state": "DOWNLOADING", "selectedIds": ["01", "12"], "selection": "음원을 보기 전 번호 양 끝01/12를 고정", "files": []}
    try:
        for name, (size, md5) in FILES.items():
            request = urllib.request.Request(files[name]["links"]["self"], headers={"User-Agent": "GuitarLab-development-validation"})
            with urllib.request.urlopen(request, timeout=25) as response:
                if response.geturl() != files[name]["links"]["self"]:
                    raise ValueError("공식 파일 주소가 아닙니다.")
                data = response.read(size + 1)
            if len(data) != size or hashlib.md5(data, usedforsecurity=False).hexdigest() != md5:
                raise ValueError("공식 파일 전체 크기/MD5 오류")
            with (target / name).open("xb") as output:
                output.write(data)
            receipt["files"].append({"name": name, "bytes": size, "md5": md5, "sha256": hashlib.sha256(data).hexdigest()})
            print(json.dumps({"file": name, "bytes": size, "verifiedFiles": len(receipt["files"])}), flush=True)
        receipt["state"] = "FILES_VERIFIED"
        (target / "ATTRIBUTION.md").write_text("# EGSet12 외부 검증 표본\n\nHegel Pedroza, Wallace Abreu, Ryan Corey, Iran Roman (2024). EGSet12.\n\n출처: https://zenodo.org/records/11406378\n\nCreative Commons Attribution4.0 — https://creativecommons.org/licenses/by/4.0/\n\n분석 전 번호01/12를 고르고 공식 WAV/JAMS를 변경 없이 전체 MD5/크기 검사 후 보존했습니다. 개별 SHA와 선택 조건은 manifest.json에 기록합니다. 모델 가중치/앱 배포물에 포함하지 않고 개인 오디오를 사용하거나 전송하지 않습니다.\n", encoding="utf-8")
    except (Exception, KeyboardInterrupt) as cause:
        receipt.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (target / "manifest.json").open("x", encoding="utf-8") as output:
            json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(str(target / "manifest.json"), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-samples", action="store_true", help="공식 검증 파일4개/약14.73MiB만 다운로드")
    main(parser.parse_args().download_samples)
