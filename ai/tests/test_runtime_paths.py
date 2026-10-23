import hashlib
import os
from pathlib import Path
import sys

import pytest
from guitarlab_ai.runtime_paths import extended_path,configure_windows_paths
from guitarlab_ai.model_integrity import verify_model_file,ModelError


def test_normal_and_extended_model_paths_share_one_containment_check(tmp_path):
    root=tmp_path/'한글 모델'; root.mkdir()
    model=root/'DEMO.onnx'; model.write_bytes(b'DEMO')
    expected={'bytes':4,'sha256':hashlib.sha256(b'DEMO').hexdigest()}
    assert verify_model_file(extended_path(model),root,expected).samefile(model)
    with pytest.raises(ModelError): verify_model_file(extended_path(model),tmp_path/'outside',expected)


@pytest.mark.skipif(os.name!='nt',reason='Windows NT 경로 별칭 검사')
def test_bootstrap_normalizes_import_directories_without_adding_search_paths(tmp_path,monkeypatch):
    package=tmp_path/'가상 환경'; package.mkdir()
    monkeypatch.setattr(sys,'path',[str(package),str(package/'python312.zip')])
    configure_windows_paths()
    assert len(sys.path)==2 and all(path.startswith('\\\\?\\') for path in sys.path)
    assert Path(sys.path[0]).samefile(package)
