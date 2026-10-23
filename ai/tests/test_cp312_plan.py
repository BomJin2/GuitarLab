import pytest
from guitarlab_ai.cp312_plan import pick_pypi_artifact
from guitarlab_ai.model_integrity import ModelError


def metadata(filename,requires='>=3.10'):
    return {'info':{'requires_python':requires,'requires_dist':['DEMO dependency']},'urls':[{'filename':filename,'packagetype':'bdist_wheel',
        'url':'https://files.pythonhosted.org/packages/DEMO.whl','size':4,'digests':{'sha256':'a'*64},'yanked':False}]}


def test_new_abi_and_stable_abi_preserve_versions_and_require_supported_python():
    for old,new in [('demo-1.0-cp310-cp310-win_amd64.whl','demo-1.0-cp312-cp312-win_amd64.whl'),('demo-1.0-cp310-abi3-win_amd64.whl','demo-1.0-cp310-abi3-win_amd64.whl'),('demo-1.0-cp310-cp310-win_amd64.whl','demo-1.0-cp311-abi3-win_amd64.whl')]:
        original={'name':'demo','version':'1.0','filename':old}
        result=pick_pypi_artifact(original,metadata(new))
        assert result['version']=='1.0' and result['filename']==new
        with pytest.raises(ModelError): pick_pypi_artifact(original,metadata(new,'<3.12'))
        with pytest.raises(ModelError): pick_pypi_artifact(original,metadata('other-1.0-py3-none-any.whl'))


def test_untrusted_download_host_hash_and_yanked_artifacts_are_refused():
    original={'name':'demo','version':'1.0','filename':'demo-1.0-py3-none-any.whl'}
    for key,value in [('url','http://files.pythonhosted.org/DEMO.whl'),('yanked',True),('digests',{'sha256':'bad'}),('size',True)]:
        bad=metadata(original['filename']); bad['urls'][0][key]=value
        with pytest.raises(ModelError): pick_pypi_artifact(original,bad)
