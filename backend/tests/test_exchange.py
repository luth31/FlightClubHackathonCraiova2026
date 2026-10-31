from app.config import settings
from app.sharing.models import Share
from conftest import login


def gateway_headers(monkeypatch, tmp_path, airport='carpati', roles='reviewer'):
    token = tmp_path/'token'; token.write_text('local-test-exchange-secret')
    monkeypatch.setattr(settings, 'exchange_token_file', token)
    return {'Authorization':'Bearer local-test-exchange-secret', 'X-Peer-Airport':airport,
        'X-Requester-Id':'reviewer', 'X-Requester-Roles':roles}


def test_gateway_authentication_rejects_browser_spoofing(admin, monkeypatch, tmp_path):
    headers = gateway_headers(monkeypatch, tmp_path)
    assert admin.get('/api/exchange/shares', headers={**headers,'Authorization':'Bearer incorrect'}).status_code == 401
    assert admin.get('/api/exchange/shares', headers={**headers,'X-Peer-Airport':'unknown'}).status_code == 403
    assert admin.get('/api/exchange/shares', headers={**headers,'X-Requester-Roles':'technician'}).status_code == 403


def test_peer_share_read_and_immediate_revocation(admin, monkeypatch, tmp_path):
    headers = gateway_headers(monkeypatch, tmp_path)
    preview = admin.post('/api/documents/test-procedure/share-preview', json={'redact_terms':['SecretAccount123']})
    assert preview.status_code == 200, preview.text
    created = admin.post('/api/documents/test-procedure/shares', json={'preview_id':preview.json()['preview_id'],
        'reviewed':True,'expires_at':'2026-12-31','recipient_airport_id':'carpati','recipient_airport':'Aeroportul Carpați'})
    assert created.status_code == 201, created.text
    share_id = created.json()['id']
    assert any(s['id']==share_id for s in admin.get('/api/exchange/shares', headers=headers).json()['items'])
    downloaded=admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers)
    assert downloaded.status_code == 200 and downloaded.content.startswith(b'%PDF')
    from io import BytesIO
    from pypdf import PdfReader
    assert 'SecretAccount123' not in ''.join(p.extract_text() for p in PdfReader(BytesIO(downloaded.content)).pages)
    assert admin.post(f'/api/shares/{share_id}/revoke').status_code == 200
    assert admin.get(f'/api/exchange/shares/{share_id}/file',headers=headers).status_code == 403


def test_exchange_unavailable_does_not_break_local_access(admin, monkeypatch):
    monkeypatch.setattr(settings,'exchange_url','')
    assert admin.get('/api/received').status_code == 503
    assert admin.get('/api/documents').status_code == 200
    login(admin,'technician')
    assert admin.get('/api/received').status_code == 403


def test_department_scoped_share_excludes_other_reviewers_and_directors(admin,monkeypatch,tmp_path):
    from urllib.parse import quote
    headers=gateway_headers(monkeypatch,tmp_path)
    preview=admin.post('/api/documents/test-procedure/share-preview',json={'redact_terms':[]}).json()
    response=admin.post('/api/documents/test-procedure/shares',json={'preview_id':preview['preview_id'],
        'reviewed':True,'expires_at':'2026-12-31','recipient_airport_id':'carpati','recipient_department':'Achiziții'})
    assert response.status_code==201,response.text
    identifier=response.json()['id']
    allowed={**headers,'X-Requester-Department':quote('Achiziții',safe='')}
    assert any(s['id']==identifier for s in admin.get('/api/exchange/shares',headers=allowed).json()['items'])
    assert admin.get(f'/api/exchange/shares/{identifier}/file',headers=allowed).status_code==200
    for denied in (headers,{**headers,'X-Requester-Department':'Conformitate'},
                   {**headers,'X-Requester-Roles':'director','X-Requester-Department':'Conformitate'}):
        assert all(s['id']!=identifier for s in admin.get('/api/exchange/shares',headers=denied).json()['items'])
        assert admin.get(f'/api/exchange/shares/{identifier}/file',headers=denied).status_code==404
    bad=admin.post('/api/documents/test-procedure/shares',json={'preview_id':preview['preview_id'],
        'reviewed':True,'expires_at':'2026-12-31','recipient_airport_id':'carpati','recipient_department':'Unknown department'})
    assert bad.status_code==422
