import json
from pathlib import Path

import pytest
from guitarlab_ai import model_integrity as integrity


@pytest.mark.parametrize('model_id,filename,count', [
    ('basic-pitch', 'basic-pitch-0.4.0-windows-cp310.json', 42),
    ('htdemucs_6s', 'demucs-4.1.0-htdemucs-6s-windows-cp310.json', 32),
])
def test_supported_profile_is_exact_pinned_and_legacy_plan_is_preserved(monkeypatch, tmp_path, model_id, filename, count):
    path = Path(__file__).parents[1] / 'models' / filename
    original = json.loads(path.read_text(encoding='utf-8'))
    monkeypatch.setattr(integrity.sys, 'version_info', (3, 10, 8))
    assert integrity.load_model_plan(path, model_id) == original
    monkeypatch.setattr(integrity.sys, 'version_info', (3, 12, 15))
    current = integrity.load_model_plan(path, model_id)
    assert current['python'] == '3.12.15' and len(current['artifacts']) == count
    if model_id == 'basic-pitch':
        assert next(item['version'] for item in current['artifacts'] if item['name'] == 'basic-pitch') == '0.4.0+guitarlab.onnx1'
    target = tmp_path / (current['id'] + '.json')
    current['artifacts'][0]['version'] = 'DEMO-untrusted'
    target.write_text(json.dumps(current), encoding='utf-8')
    with pytest.raises(integrity.ModelError, match='AI_MODEL_INTEGRITY'):
        integrity.load_model_plan(tmp_path / filename, model_id)
    for version in [(3, 12, 14), (3, 12, 16), (3, 11, 15), (3, 13, 1)]:
        monkeypatch.setattr(integrity.sys, 'version_info', version)
        with pytest.raises(integrity.ModelError, match='AI_MODEL_VERSION'):
            integrity.load_model_plan(path, model_id)


def test_missing_or_malformed_profile_is_reported_without_leaking_path(monkeypatch, tmp_path):
    monkeypatch.setattr(integrity.sys, 'version_info', (3, 10, 8))
    path = tmp_path / 'private.json'
    for content in [None, '{}', 'invalid json']:
        if content is not None:
            path.write_text(content, encoding='utf-8')
        with pytest.raises(integrity.ModelError, match='^AI_MODEL_INTEGRITY$'):
            integrity.load_model_plan(path, 'basic-pitch')
