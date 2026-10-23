"""공개 DI4개와 고정48개 창만 준비합니다. 주법 정답/점수 평가가 아닙니다."""

import argparse
import array
import hashlib
import json
from pathlib import Path
import shutil
import sys
import wave
from uuid import uuid4
import zipfile

from fetch_guitar_techs_sample import checked_metadata
from fetch_guitarset_sample import RangeReader

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = "https://zenodo.org/records/14963133"
SELECTION = (
    ("P1", "Bendings", 68258484, 28783710),
    ("P1", "Vibrato", 139700670, 58185196),
    ("P2", "Bendings", 50112690, 20675886),
    ("P2", "Vibrato", 126720690, 54509597),
)
START_SECONDS = tuple(1 + 5 * i for i in range(12))


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def member_name(player, technique):
    if (player, technique) not in {(p, t) for p, t, _, _ in SELECTION}:
        raise ValueError("고정 DI 표본이 아닙니다.")
    return f"{player}_techniques/audio/directinput/directinput_{technique}.wav"


def receive_member(archive, player, technique, target):
    expected = next((x for x in SELECTION if x[:2] == (player, technique)), None)
    if expected is None:
        raise ValueError("고정 DI 표본이 아닙니다.")
    info = archive.getinfo(member_name(player, technique))
    if info.is_dir() or info.flag_bits & 1 or (info.file_size, info.compress_size) != expected[2:]:
        raise ValueError("DI 파일의 고정 크기/형식이 다릅니다.")
    digest, total = hashlib.sha256(), 0
    with archive.open(info) as source, target.open("xb") as output:
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            if total > info.file_size:
                raise ValueError("DI 파일 수신 크기 초과")
            output.write(chunk)
            digest.update(chunk)
    if total != info.file_size:
        raise ValueError("DI 파일이 잘렸습니다.")
    return {"name": target.name, "player": player, "category": technique,
            "archive": f"{player}_techniques.zip", "member": info.filename,
            "bytes": total, "crc32": f"{info.CRC:08x}", "sha256": digest.hexdigest()}


def download():
    files = checked_metadata()
    parent = PROJECT / "fixtures/external/guitar-techs-14963133"
    parent.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(parent).free < 1024 * 1024 * 1024:
        raise ValueError("공개 DI 검증에 여유 공간1GiB가 필요합니다.")
    root = parent / str(uuid4())
    root.mkdir(exist_ok=False)
    receipt = {"schemaVersion": 1, "state": "DOWNLOADING", "source": SOURCE,
               "license": "cc-by-4.0", "archiveMd5FullyVerified": False,
               "continuousPitchGroundTruth": False, "files": []}
    try:
        for player in ("P1", "P2"):
            name = f"{player}_techniques.zip"
            entry = files[name]
            reader = RangeReader(entry["links"]["self"], entry["size"],
                                 max_total_bytes=96 * 1024 * 1024)
            with zipfile.ZipFile(reader) as archive:
                for technique in ("Bendings", "Vibrato"):
                    target = root / f"{player}_{technique}_DI.wav"
                    receipt["files"].append(receive_member(archive, player, technique, target))
            print(json.dumps({"player": player, "receivedBytes": reader.transferred}), flush=True)
        receipt["state"] = "DI_FILES_VERIFIED"
        (root / "ATTRIBUTION.md").write_text(
            "# Guitar-TECHS 직접 입력 검증 자료\n\n"
            "Pedroza Villalobos, Hegel Emmanuel; Taheri, Termeh; Abreu, Wallace; Corey, Ryan; Roman, Iran R. (2025). Guitar-TECHS.\n\n"
            + SOURCE + "\n\nCreative Commons Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/\n\n"
            "고정 DI WAV4개를 변경 없이 CRC 검사 후 보존했습니다. 개별 크기/SHA는 manifest에 있습니다. 전체 ZIP의 MD5를 직접 확인한 것은 아닙니다. "
            "≤100ms 정렬 오차 및 연속 음정 정답 부재로 파일 이름을 구간별 주법 정답으로 간주하지 않습니다. Git/앱 배포물에서 제외합니다.\n", encoding="utf-8")
    except (Exception, KeyboardInterrupt) as cause:
        receipt.update(state="CANCELED" if isinstance(cause, KeyboardInterrupt) else "FAILED", errorType=type(cause).__name__)
        raise
    finally:
        with (root / "manifest.json").open("x", encoding="utf-8") as output:
            json.dump(receipt, output, ensure_ascii=False, indent=2)
    print(json.dumps({"state": receipt["state"], "path": str(root / "manifest.json")}), flush=True)


def pcm_floats(raw, width, channels):
    if width not in (2, 3, 4) or channels not in (1, 2) or len(raw) % (width * channels):
        raise ValueError("mono/stereo PCM16/24/32만 지원합니다.")
    data = array.array("f", (sum(int.from_bytes(raw[i + c * width:i + (c + 1) * width], "little", signed=True)
                                for c in range(channels)) / channels / (1 << (width * 8 - 1))
                             for i in range(0, len(raw), width * channels)))
    if sys.byteorder != "little":
        data.byteswap()
    return data.tobytes()


def prepare(manifest):
    external = (PROJECT / "fixtures/external/guitar-techs-14963133").resolve(strict=True)
    if manifest.is_symlink():
        raise ValueError("manifest 링크는 거부합니다.")
    manifest = manifest.resolve(strict=True)
    if not manifest.is_relative_to(external) or manifest.stat().st_size > 32768:
        raise ValueError("공개 DI manifest 경로/크기 오류")
    raw = manifest.read_bytes()
    source = json.loads(raw)
    if (source["schemaVersion"] != 1 or source["state"] != "DI_FILES_VERIFIED" or source["source"] != SOURCE or
            source["license"] != "cc-by-4.0" or source["continuousPitchGroundTruth"] is not False or len(source["files"]) != 4):
        raise ValueError("검증한 고정 공개 DI4개가 아닙니다.")
    before = {}
    for entry, (player, category, size, _) in zip(source["files"], SELECTION):
        path = manifest.parent / f"{player}_{category}_DI.wav"
        if (entry["name"] != path.name or entry["player"] != player or entry["category"] != category or
                path.is_symlink() or not path.resolve(strict=True).is_relative_to(manifest.parent) or
                path.stat().st_size != size or entry["bytes"] != size):
            raise ValueError("DI 원본 경로/고정 크기 오류")
        digest = file_digest(path)
        if digest != entry["sha256"]:
            raise ValueError("DI 원본 지문이 다릅니다.")
        before[path] = (size, path.stat().st_mtime_ns, digest)
    target = manifest.parent / ("probe-" + str(uuid4()))
    (target / "cases").mkdir(parents=True, exist_ok=False)
    data = {"schemaVersion": 1, "source": SOURCE, "license": "cc-by-4.0",
            "sourceManifestSha256": hashlib.sha256(raw).hexdigest(),
            "windowPolicy": "first-12-1s-windows-at-1-plus-5i-seconds-v1",
            "continuousPitchGroundTruth": False, "cases": []}
    for entry in source["files"]:
        with wave.open(str(manifest.parent / entry["name"]), "rb") as audio:
            rate, width, channels = audio.getframerate(), audio.getsampwidth(), audio.getnchannels()
            if rate not in (44100, 48000, 96000) or width not in (2, 3, 4) or channels not in (1, 2) or audio.getnframes() < 57 * rate:
                raise ValueError("DI WAV의 형식/길이가 예상과 다릅니다.")
            for start in START_SECONDS:
                audio.setpos(start * rate)
                raw = pcm_floats(audio.readframes(rate), width, channels)
                if len(raw) != rate * 4:
                    raise ValueError("1초 DI PCM이 아닙니다.")
                name = f"case-{len(data['cases']):03}.f32"
                with (target / "cases" / name).open("xb") as output:
                    output.write(raw)
                data["cases"].append({"clipId": Path(entry["name"]).stem, "category": entry["category"],
                                      "startMs": start * 1000, "sampleRate": rate, "sourceChannels": channels, "file": name,
                                      "sha256": hashlib.sha256(raw).hexdigest()})
    for path, (size, mtime, digest) in before.items():
        if (path.stat().st_size, path.stat().st_mtime_ns) != (size, mtime) or file_digest(path) != digest:
            raise ValueError("준비 중 원본 DI 파일이 변경됐습니다.")
    with (target / "probe.json").open("x", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
    print(json.dumps({"state": "DI_PROBE_PREPARED", "cases": len(data["cases"]), "path": str(target / "probe.json")}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--download", action="store_true", help="공식 DI4개만 새 폴더에 수신")
    mode.add_argument("--prepare", type=Path, help="수신한 DI4개에서 고정48창 준비")
    args = parser.parse_args()
    download() if args.download else prepare(args.prepare)
