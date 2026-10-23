"""공식 Guitar-TECHS의 작은 평가 표본만 선택합니다. 모델 가중치는 받지 않습니다."""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import urllib.request
from uuid import uuid4
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_guitarset_sample import RangeReader, read_member

RECORD = "https://zenodo.org/api/records/14963133"
ARCHIVES = {
    "P1_singlenotes.zip": (108626613, "ca0c4674dde3805574685a313f7c39eb"),
    "P2_singlenotes.zip": (116133457, "40fbf03d8b04bb2cf42df20f36dc2254"),
    "P1_techniques.zip": (326280863, "18634a41a6db5a8de10d07eb3122a872"),
    "P2_techniques.zip": (395839610, "f4189251ce50be25f06a173b2c2bba00"),
    "P1_chords.zip": (981741162, "be9ef8bbdceb1912d565254e607a6d94"),
    "P2_chords.zip": (1150819056, "eb6f74dd19162237189281688ad7ad2e"),
}


def checked_metadata():
    with urllib.request.urlopen(RECORD, timeout=25) as response:
        raw = response.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("공식 metadata 크기 초과")
    metadata = json.loads(raw)
    return validate_metadata(metadata)


def validate_metadata(metadata):
    if metadata.get("id") != 14963133 or metadata["metadata"].get("license", {}).get("id") != "cc-by-4.0":
        raise ValueError("고정 데이터 레코드/허용 조건 오류")
    files = {value["key"]: value for value in metadata["files"]}
    for name, (size, md5) in ARCHIVES.items():
        entry = files[name]
        if entry["size"] != size or entry["checksum"] != "md5:" + md5 or entry["links"]["self"] != RECORD + "/files/" + name + "/content":
            raise ValueError("고정 ZIP metadata가 변경되었습니다.")
    return files


def midi_members(archive):
    if archive not in ARCHIVES:
        raise ValueError("고정 검증 ZIP이 아닙니다.")
    suffixes = ["midi_allsinglenotes.mid"] if "singlenotes" in archive else ["midi_Vibrato.mid", "midi_Bendings.mid"] if "techniques" in archive else ["midi_Set1_maj.mid"]
    return [archive[:-4] + "/midi/" + suffix for suffix in suffixes]


def inventory():
    files = checked_metadata()
    result = {"schemaVersion": 1, "record": 14963133, "license": "cc-by-4.0", "archives": {}}
    for name in ARCHIVES:
        reader = RangeReader(files[name]["links"]["self"], files[name]["size"])
        with zipfile.ZipFile(reader) as archive:
            entries = [{"name": value.filename, "bytes": value.file_size, "compressedBytes": value.compress_size, "crc32": f"{value.CRC:08x}"} for value in archive.infolist() if not value.is_dir() and "__MACOSX" not in value.filename]
        result["archives"][name] = {"receivedBytes": reader.transferred, "files": entries}
        print(json.dumps({"archive": name, "count": len(entries), "receivedBytes": reader.transferred, "firstNames": [value["name"] for value in entries[:12]]}), flush=True)
    root = Path(__file__).resolve().parents[1] / "src-tauri/target/runtime-validation"
    target = root / ("guitar-techs-inventory-" + str(uuid4()) + ".json")
    with target.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
    print(str(target), flush=True)


def midi_samples():
    files = checked_metadata()
    root = Path(__file__).resolve().parents[1] / "fixtures/external/guitar-techs-14963133" / str(uuid4())
    root.mkdir(parents=True, exist_ok=False)
    receipt = {"schemaVersion": 1, "record": 14963133, "license": "cc-by-4.0", "state": "DOWNLOADING", "archiveMd5FullyVerified": False, "files": [], "audioPresent": False}
    try:
        for name in ARCHIVES:
            reader = RangeReader(files[name]["links"]["self"], files[name]["size"])
            with zipfile.ZipFile(reader) as archive:
                for member in midi_members(name):
                    suffix = Path(member).name
                    info, data = read_member(archive, member)
                    target = name[:2] + "_" + suffix
                    with (root / target).open("xb") as output:
                        output.write(data)
                    receipt["files"].append({"name": target, "archive": name, "member": member, "bytes": len(data), "crc32": f"{info.CRC:08x}", "sha256": hashlib.sha256(data).hexdigest()})
            print(json.dumps({"archive": name, "midiFiles": len(midi_members(name)), "receivedBytes": reader.transferred}), flush=True)
        receipt["state"] = "MIDI_VERIFIED"
        (root / "ATTRIBUTION.md").write_text("# Guitar-TECHS MIDI 검증 표본\n\n출처: https://zenodo.org/records/14963133\n\nPedroza Villalobos, Hegel Emmanuel; Taheri, Termeh; Abreu, Wallace; Corey, Ryan; Roman, Iran R. (2025). Guitar-TECHS.\n\nCreative Commons Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/\n\n공식 ZIP의 선택 MIDI를 수정 없이 전체 CRC 검사 후 보존했습니다. 개별 SHA/원본 이름을 manifest.json에 기록합니다. 전체 ZIP MD5는 직접 검증하지 않았고 음원·모델 가중치는 받지 않았습니다. Git/앱 배포물에서 제외합니다.\n", encoding="utf-8")
    except (Exception, KeyboardInterrupt) as cause:
        receipt.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (root / "manifest.json").open("x", encoding="utf-8") as output:
            json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(str(root / "manifest.json"), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-midi", action="store_true", help="고정 MIDI8개만 CRC 확인 후 새 폴더에 보존")
    if parser.parse_args().download_midi:
        midi_samples()
    else:
        inventory()
