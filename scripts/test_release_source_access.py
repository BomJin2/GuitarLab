"""소스 접근 자료의 버전/고정 경로/검토 상태와 동봉 원본 지문을 확인합니다."""

import json
from pathlib import Path
import tempfile
import unittest
from package_validation import checked_payload, source_archives

RELEASE = Path(__file__).resolve().parents[1] / "docs/release"


class SourceAccessTests(unittest.TestCase):
    def setUp(self):
        self.inventory = json.loads((RELEASE / "dependency-inventory.json").read_bytes())["components"]
        self.original = json.loads((RELEASE / "SOURCE-ACCESS.json").read_bytes())

    def test_all_declared_mpl_versions_have_sources_and_bundled_files_match(self):
        sources = source_archives(RELEASE, self.inventory)
        self.assertEqual(len(self.original["components"]), 6)
        self.assertEqual(len(sources), 5)
        self.assertEqual(sum(s["bytes"] for s in sources), 150290)
        for source in sources:
            checked_payload(RELEASE, source["file"], source["bytes"], source["sha256"])

    def test_missing_duplicate_version_and_review_state_are_refused(self):
        changes = [lambda m: m["components"].pop(),
                   lambda m: m["components"].append(m["components"][0]),
                   lambda m: m["components"][0].update(version="0.0.0"),
                   lambda m: m.update(legalReviewCompleted=True),
                   lambda m: m.update(schemaVersion=True),
                   lambda m: m.update(privatePath="private"),
                   lambda m: m["components"][0].update(name=[])]
        self.refused(changes)

    def test_source_path_hash_archive_origin_and_moving_branch_are_refused(self):
        changes = [lambda m: m["components"][0]["bundledSource"].update(file="../outside"),
                   lambda m: m["components"][0]["bundledSource"].update(sha256="0" * 64),
                   lambda m: m["components"][0]["bundledSource"].update(bytes=True),
                   lambda m: m["components"][0].update(sourceArchiveUrl="https://example.invalid/source"),
                   lambda m: m["components"][-1].update(gitCommit="main"),
                   lambda m: m["components"][-1].update(sourceUrl="https://github.com/CoderLine/alphaTab/tree/main"),
                   lambda m: m["components"][-1].update(bundledSource={})]
        self.refused(changes)

    def refused(self, changes):
        with tempfile.TemporaryDirectory(prefix="guitarlab-source-access-test-") as folder:
            root = Path(folder).resolve()
            for index, change in enumerate(changes):
                with self.subTest(case=index):
                    value = json.loads(json.dumps(self.original))
                    change(value)
                    (root / "SOURCE-ACCESS.json").write_text(json.dumps(value), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        source_archives(root, self.inventory)


if __name__ == "__main__":
    unittest.main()
