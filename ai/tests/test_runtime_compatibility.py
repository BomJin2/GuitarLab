import copy
import hashlib
import struct
from types import ModuleType

import pytest
from guitarlab_ai.runtime_compatibility import compare_notes,compare_stems
from guitarlab_ai.runtime_archive import load_runtime_plan
from guitarlab_ai.model_integrity import ModelError
from guitarlab_ai.separation.wav import float_header
from guitarlab_ai.runtime_probe import check_module_origins


def notes():
    return {'notes':[{'pitch_midi':pitch,'onset_ms':index*500.0,'offset_ms':index*500.0+200,'confidence':0.6} for index,pitch in enumerate([64,67,69,71]*2)],
            'draft':[{'pitchMidi':pitch,'startTick':index*960,'durationTicks':480,'fingering':{'string':2,'fret':5},'reviewReasons':['DEMO']} for index,pitch in enumerate([64,67,69,71]*2)]}


def test_pitch_timing_confidence_and_fingering_comparison_has_real_tolerances():
    baseline=notes(); current=copy.deepcopy(baseline)
    current['notes'][0]['onset_ms']+=0.001
    assert compare_notes(baseline,current)['maxDifference']['onsetMs']==0.001
    for key,value in [('pitch_midi',65),('onset_ms',1.0),('confidence',0.9),('offset_ms',float('nan'))]:
        bad=notes(); bad['notes'][0][key]=value
        with pytest.raises(ModelError): compare_notes(baseline,bad)
    bad=notes(); bad['draft'][0]['fingering']={'string':1,'fret':0}
    with pytest.raises(ModelError): compare_notes(baseline,bad)


def wave_report(root,name,value):
    outputs=[]
    for role in ('GUITAR_FULL','ACCOMPANIMENT'):
        path=root/(name+role+'.wav')
        data=float_header(2)+struct.pack('<4f',value,value,value,value)
        path.write_bytes(data)
        outputs.append({'role':role,'path':str(path),'sha256':hashlib.sha256(data).hexdigest()})
    return {'separation':{'outputs':outputs}}


def test_stem_comparison_rejects_changed_audio_and_foreign_paths(tmp_path):
    baseline=wave_report(tmp_path,'DEMO-old',0.1)
    current=wave_report(tmp_path,'DEMO-new',0.100001)
    assert compare_stems(baseline,current,tmp_path)['GUITAR_FULL']['rmsDifference']<0.00001
    changed=wave_report(tmp_path,'DEMO-changed',0.2)
    with pytest.raises(ModelError): compare_stems(baseline,changed,tmp_path)
    with pytest.raises(ModelError): compare_stems(baseline,current,tmp_path/'different-root')


def test_runtime_plan_is_pinned_and_does_not_claim_release_validation():
    plan=load_runtime_plan()
    assert plan['python']=='3.12.15' and plan['releaseValidated'] is False


def test_virtual_torch_modules_require_the_real_implementation_in_allowed_root(tmp_path):
    source=tmp_path/'DEMO-ops.py'; source.write_text('# DEMO',encoding='utf-8')
    class DemoOps(ModuleType):
        __file__='_ops.py'
    owner=ModuleType('torch._ops'); owner.__file__=str(source); owner._Ops=DemoOps
    module=DemoOps('torch.ops')
    modules={'torch._ops':owner,'torch.ops':module}
    assert check_module_origins(modules,[tmp_path])==(True,['torch.ops'])
    assert check_module_origins(modules,[tmp_path/'other'])[0] is False
    fake=ModuleType('torch.ops'); fake.__file__='_ops.py'
    assert check_module_origins({**modules,'torch.ops':fake},[tmp_path])[0] is False
