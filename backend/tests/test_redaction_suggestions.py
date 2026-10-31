from conftest import login


def test_suggestions_have_source_evidence_and_do_not_grant_access(admin):
    result = admin.get('/api/documents/test-procedure/redaction-suggestions')
    assert result.status_code == 200
    data=result.json()
    assert data['method']=='rules' and data['source_version']==1
    assert any(item['term']=='Exemplu Tehnic SRL' and item['pages']==[1] for item in data['items'])
    assert all(item['occurrences']>0 for item in data['items'])
    assert admin.get('/api/documents/test-hr/redaction-suggestions').status_code in (403,404)
    login(admin,'technician')
    assert admin.get('/api/documents/test-procedure/redaction-suggestions').status_code==403
