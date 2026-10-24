"""실제 배포 그래프 선택·중복/개발 전용 제외와 고지 경로 이탈을 검사합니다."""

from pathlib import Path
from contextlib import redirect_stdout
import hashlib
import io
import json
import tempfile
import unittest
from unittest.mock import patch
from collect_release_inventory import production_nodes, rust_nodes, notice_files, collect, dependency_inputs, DEPENDENCY_FILES, DEPENDENCY_NORMALIZATION


class InventoryTests(unittest.TestCase):
    def test_dependency_inputs_keep_crlf_equivalent_and_detect_each_semantic_change(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-dependency-inputs-") as folder:
            root = Path(folder).resolve()
            for name in DEPENDENCY_FILES:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"DEMO dependency\nversion=1\n")
            expected = dependency_inputs(root)
            for name in DEPENDENCY_FILES:
                path = root / name
                path.write_bytes(b"DEMO dependency\r\nversion=1\r\n")
            self.assertEqual(dependency_inputs(root), expected)
            for name in DEPENDENCY_FILES:
                path = root / name; original = path.read_bytes()
                path.write_bytes(b"DEMO dependency\nversion=2\n")
                changed = dependency_inputs(root)
                self.assertEqual([key for key in expected if changed[key] != expected[key]], [name])
                path.write_bytes(original)
            path.write_bytes(b"\xff")
            with self.assertRaises(UnicodeError): dependency_inputs(root)
            path.write_bytes(b"")
            with self.assertRaises(ValueError): dependency_inputs(root)

    def test_npm_excludes_unsaved_dev_tree_and_deduplicates_peer(self):
        root = Path.cwd()
        leaf = {"version": "1", "path": "unused"}
        tree = [{"path": str(root), "dependencies": {"a": {"version": "1", "dependencies": {"b": leaf}}, "b": leaf}, "unsavedDependencies": {"dev": leaf}}]
        self.assertEqual(set(production_nodes(tree, root)), {("a", "1"), ("b", "1")})
        with self.assertRaises(ValueError):
            production_nodes(tree, root / "other")

    def test_rust_build_and_normal_are_included_but_dev_only_is_excluded(self):
        metadata = {"packages": [{"id": key} for key in ("app", "normal", "build", "dev")], "resolve": {"root": "app", "nodes": [{"id": "app", "deps": [{"pkg": "normal", "dep_kinds": [{"kind": None}, {"kind": "dev"}]}, {"pkg": "build", "dep_kinds": [{"kind": "build"}]}, {"pkg": "dev", "dep_kinds": [{"kind": "dev"}]}]}, *[{"id": key, "deps": []} for key in ("normal", "build", "dev")] ]}}
        self.assertEqual({value["id"] for value in rust_nodes(metadata)}, {"normal", "build"})

    def test_declared_license_file_cannot_escape_package(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-notice-test-") as folder:
            root = Path(folder) / "package"
            root.mkdir()
            (root / "LICENSE").write_text("test notice", encoding="utf-8")
            (root.parent / "private.txt").write_text("must not be copied", encoding="utf-8")
            self.assertEqual([p.name for p in notice_files(root)], ["LICENSE"])
            with self.assertRaises(ValueError):
                notice_files(root, "../private.txt")

    def test_upstream_notice_requires_the_exact_installed_commit_and_hash(self):
        with tempfile.TemporaryDirectory(prefix="guitarlab-notice-contract-") as folder:
            root = Path(folder).resolve()
            (root / "node_modules").mkdir()
            (root / "package.json").write_text('{"dependencies":{}}', encoding="utf-8")
            validation = root / "src-tauri/target/runtime-validation"
            validation.mkdir(parents=True)
            for name in DEPENDENCY_FILES[1:]:
                (root / name).write_bytes(b"DEMO dependency input\n")
            crate = root / "crate"
            crate.mkdir()
            sha = "1" * 40
            (crate / "Cargo.toml").write_text("fixture", encoding="utf-8")
            (crate / ".cargo_vcs_info.json").write_text(json.dumps({"git": {"sha1": sha}}), encoding="utf-8")
            npm = validation / "npm.json"
            npm.write_text(json.dumps([{"path": str(root), "dependencies": {}}]), encoding="utf-8")
            rust = validation / "rust.json"
            rust.write_text(json.dumps({"packages": [{"id": "app"}, {"id": "pkg", "name": "pkg", "version": "1", "source": "registry+fixture", "manifest_path": str(crate / "Cargo.toml"), "license": "MIT", "repository": "https://github.com/example/pkg"}], "resolve": {"root": "app", "nodes": [{"id": "app", "deps": [{"pkg": "pkg", "dep_kinds": [{"kind": None}]}]}, {"id": "pkg", "deps": []}]}}), encoding="utf-8")
            raw = b"fixture notice"
            digest = hashlib.sha256(raw).hexdigest()
            (validation / (digest + ".txt")).write_bytes(raw)
            entry = {"name": "pkg", "version": "1", "commit": sha, "repository": "https://github.com/example/pkg", "notices": [{"name": "LICENSE", "sourceUrl": "https://raw.githubusercontent.com/example/pkg/" + sha + "/LICENSE", "file": digest + ".txt", "sha256": digest, "bytes": len(raw)}]}
            upstream = validation / "sources.json"
            def write():
                upstream.write_text(json.dumps({"schemaVersion": 1, "state": "COLLECTED", "entries": [entry]}), encoding="utf-8")
            with patch("collect_release_inventory.PROJECT", root), redirect_stdout(io.StringIO()):
                write()
                collect(npm, rust, upstream)
                collected = next(validation.glob("release-notices-*/inventory.json"))
                inventory = json.loads(collected.read_text(encoding="utf8"))
                self.assertEqual(inventory["dependencyInputs"], dependency_inputs(root))
                self.assertEqual(inventory["dependencyInputNormalization"], DEPENDENCY_NORMALIZATION)
                entry["commit"] = "2" * 40
                write()
                with self.assertRaises(ValueError):
                    collect(npm, rust, upstream)
                entry["commit"] = sha
                (validation / (digest + ".txt")).write_bytes(b"tampered")
                write()
                with self.assertRaises(ValueError):
                    collect(npm, rust, upstream)


if __name__ == "__main__":
    unittest.main()
