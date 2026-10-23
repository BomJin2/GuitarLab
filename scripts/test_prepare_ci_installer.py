"""CI 준비기의 명시적 수신·지문·취소·기존 파일/현재 후보 보존을 검사합니다."""

from contextlib import redirect_stdout
import hashlib
import io
from pathlib import Path
import tempfile
from threading import Event
import unittest
from unittest.mock import patch

import prepare_ci_installer as ci
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.runtime import Canceled


def artifact(raw=b'own'):
    return {'filename': 'own.tar.gz', 'url': ci.BASE_URL + 'own.tar.gz',
            'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


class CiInstallerTests(unittest.TestCase):
    def test_missing_cache_requires_explicit_download_and_valid_cache_never_connects(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            record = artifact()
            with patch.object(ci, 'PROJECT', root), patch.object(ci, 'urlopen') as connect:
                with self.assertRaises(FileNotFoundError):
                    ci.cached_archive(record, root, False, Event())
                target = root / record['filename']
                target.write_bytes(b'own')
                self.assertEqual(ci.cached_archive(record, root, True, Event()), target)
                self.assertEqual(target.read_bytes(), b'own')
                connect.assert_not_called()

    def test_verified_download_is_published_once_without_overwriting_other_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            marker = root / 'keep.txt'
            marker.write_bytes(b'keep')
            with patch.object(ci, 'PROJECT', root), patch.object(ci, 'urlopen', return_value=io.BytesIO(b'own')) as connect, redirect_stdout(io.StringIO()):
                target = ci.cached_archive(artifact(), root, True, Event())
                self.assertEqual(target.read_bytes(), b'own')
                ci.cached_archive(artifact(), root, True, Event())
                self.assertEqual(connect.call_count, 1)
            self.assertEqual(marker.read_bytes(), b'keep')
            self.assertFalse(list(root.glob('*.part')))

    def test_bad_hash_oversize_and_canceled_download_remove_only_own_partial(self):
        for mode in ('hash', 'size', 'cancel'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as folder:
                root = Path(folder).resolve()
                marker = root / 'keep.txt'
                marker.write_bytes(b'keep')
                cancel = Event()
                class Response(io.BytesIO):
                    def read(self, size):
                        if mode == 'cancel':
                            cancel.set()
                        return super().read(size)
                raw = b'bad' if mode == 'hash' else b'oversize' if mode == 'size' else b'own'
                with patch.object(ci, 'PROJECT', root), patch.object(ci, 'urlopen', return_value=Response(raw)), redirect_stdout(io.StringIO()):
                    with self.assertRaises((ValueError, ModelError, Canceled)):
                        ci.cached_archive(artifact(), root, True, cancel)
                self.assertEqual(list(root.iterdir()), [marker])
                self.assertEqual(marker.read_bytes(), b'keep')

    def test_invalid_address_path_cache_and_early_cancel_never_download_or_replace(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            record = artifact()
            target = root / record['filename']
            target.write_bytes(b'bad')
            with patch.object(ci, 'PROJECT', root), patch.object(ci, 'urlopen') as connect:
                with self.assertRaises(ModelError):
                    ci.cached_archive(record, root, True, Event())
                for key, value in [('url', 'https://example.com/own.tar.gz'), ('filename', '../own.tar.gz'),
                                   ('bytes', True), ('sha256', 'invalid')]:
                    with self.assertRaises(ValueError):
                        ci.cached_archive({**record, key: value}, root, True, Event())
                canceled = Event()
                canceled.set()
                with self.assertRaises(Canceled):
                    ci.cached_archive(record, root, True, canceled)
                connect.assert_not_called()
            self.assertEqual(target.read_bytes(), b'bad')

    def test_publish_race_reuses_only_identical_cache_and_keeps_own_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            def race(_part, target):
                target.write_bytes(b'own')
                raise FileExistsError()
            with patch.object(ci, 'PROJECT', root), patch.object(ci, 'urlopen', return_value=io.BytesIO(b'own')), patch.object(ci, '_publish', side_effect=race), redirect_stdout(io.StringIO()):
                target = ci.cached_archive(artifact(), root, True, Event())
            self.assertEqual(list(root.iterdir()), [target])
            self.assertEqual(target.read_bytes(), b'own')

    def test_prepare_uses_two_fixed_archives_and_never_changes_current_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            validation = root / 'src-tauri/target/runtime-validation'
            validation.mkdir(parents=True)
            current = validation / 'portable-candidate.json'
            current.write_bytes(b'current candidate')
            resources = root / 'resources'
            with patch.object(ci, 'PROJECT', root), patch.object(ci, 'load_runtime_plan', return_value=artifact()), patch.object(ci, 'cached_archive') as cached, patch.object(ci, 'prepare_bundle', return_value=(resources, {'files': []})), patch.object(ci, 'prepare_installer') as installer, redirect_stdout(io.StringIO()):
                event = Event()
                ci.prepare(False, event)
                self.assertEqual(cached.call_count, 2)
                self.assertEqual(cached.call_args_list[0].args, (artifact(), validation / 'downloads', False, event))
                self.assertEqual(cached.call_args_list[1].args[0]['sha256'], ci.FULL_ARCHIVE['sha256'])
                installer.assert_called_once_with('release', runtime_resources=resources)
            self.assertEqual(current.read_bytes(), b'current candidate')


if __name__ == '__main__':
    unittest.main()
