"""고정 공개 참조의 저자 평가 범위만 감사하며 음정 정답/검출 성능은 판단하지 않습니다."""

from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sys
from uuid import uuid4

from backup_local_data import checked_path
from fetch_agpt_audio_sample import PLAN_SHA256, load_plan
from fetch_agpt_metadata import CSV_FILES, csv_shape
import prepare_agpt_onset_benchmark as sources

PROJECT = Path(__file__).resolve().parents[1]
AUTHOR_COMMIT = "fb7ea0b2d06162c3fc21c8480b6e65d236c0d46f"
NOTEBOOK_BYTES = 36290
NOTEBOOK_SHA256 = "62e8990af578e7778dbf55650ec71ff9821b0a74c4fc3ad7692031a670f07f71"


def scope_status(filename, raw_pitch):
    if (not isinstance(filename, str) or not 1 <= len(filename) <= 256
            or not isinstance(raw_pitch, str) or len(raw_pitch) > 128):
        raise ValueError("참조 파일명/음정 원문 형식 오류")
    if "pitched" not in filename or "impro" in filename:
        return "AUTHOR_FILENAME_FILTER_EXCLUDED"
    if re.fullmatch(r"[+-]?[0-9]+", raw_pitch) is None:
        return "RAW_PITCH_UNRESOLVED"
    return "AUTHOR_TASK_A_INCLUDED" if int(raw_pitch) < 108 else "AUTHOR_UPPER_BOUND_EXCLUDED"


def summarize(references):
    cases = []
    totals = Counter()
    for filename, events in references.items():
        rows = [{**event, "scopeStatus": scope_status(filename, event["rawPitchMidi"])} for event in events]
        counts = Counter(row["scopeStatus"] for row in rows)
        totals.update(counts)
        cases.append({"filename": filename, "sourceReferences": len(rows), "counts": dict(counts), "references": rows})
    return {"schemaVersion": 1, "state": "AUTHOR_REFERENCE_SCOPE_AUDITED",
            "sourceCommit": AUTHOR_COMMIT, "filterCellIndex": 2,
            "scopePolicy": "filename-then-integer-upper-bound-no-pitch-unit-conversion-v1",
            "posthocScopeAudit": True,
            "pitchEvaluationEnabled": False, "groundTruthQualityAccepted": False,
            "independentHeldOutEvaluation": False, "actualAppJudgements": False,
            "sourceReferences": sum(totals.values()), "counts": dict(totals), "cases": cases}


def main(metadata_root, notebook):
    metadata_root = sources.source_root(metadata_root, "agpt-10159492")
    notebook = notebook.absolute()
    checked_path(PROJECT, notebook)
    if (not notebook.resolve(strict=True).is_relative_to(PROJECT / "src-tauri/target/runtime-validation")
            or notebook.suffix != ".ipynb"):
        raise ValueError("보존한 저자 노트북 원문 경로가 아닙니다.")
    print("고정 노트북·공개 CSV 원문 확인 중", flush=True)
    sources.verified_bytes(notebook, NOTEBOOK_BYTES, NOTEBOOK_SHA256)
    manifest, manifest_sha = sources.read_manifest(metadata_root)
    if (type(manifest.get("schemaVersion")) is not int or manifest["schemaVersion"] != 1
            or manifest.get("state") != "METADATA_VERIFIED_NOT_AUDIO"
            or type(manifest.get("recordId")) is not int or manifest["recordId"] != 10159492):
        raise ValueError("고정 공개 참조 수신 계약 오류")
    tables = {name: sources.verified_bytes(metadata_root / name, size, digest)
              for name, (size, _, _, digest) in CSV_FILES.items()}
    shapes = {name: csv_shape(raw) for name, raw in tables.items()}
    plan = load_plan()
    references = sources.references(csv.DictReader(io.StringIO(tables["note_labels.csv"].decode("utf-8-sig"), newline="")), plan["samples"])
    report = summarize(references)
    report.update(planSha256=PLAN_SHA256, notebookSha256=NOTEBOOK_SHA256,
                  metadataManifestSha256=manifest_sha,
                  csvFiles={name: {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), **shapes[name]}
                            for name, raw in tables.items()})
    raw = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
    destination = metadata_root / ("author-pitch-scope-" + str(uuid4()) + ".json")
    with destination.open("xb") as output:
        output.write(raw)
    print(json.dumps({"state": report["state"], "sourceReferences": report["sourceReferences"], "counts": report["counts"]}))
    print(str(destination), flush=True)
    return destination


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("검증한 공개 CSV UUID 폴더·보존한 저자 노트북 원문 경로가 필요합니다.")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
