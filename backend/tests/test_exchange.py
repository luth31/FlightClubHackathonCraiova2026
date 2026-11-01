from app.config import settings
from app.sharing.models import Share
from conftest import login


def gateway_headers(monkeypatch, tmp_path, airport='sibiu', roles='reviewer'):
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
        'reviewed':True,'expires_at':'2026-12-31','recipient_airport_id':'sibiu','recipient_airport':'Aeroportul Sibiu'})
    assert created.status_code == 201, created.text
    share_id = created.json()['id']
    assert any(s['id']==share_id for s in admin.get('/api/exchange/shares', headers=headers).json()['items'])
    downloaded=admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers)
    assert downloaded.status_code == 200 and downloaded.content.startswith(b'%PDF')
    thumbnail=admin.get(f'/api/shares/{share_id}/thumbnail')
    assert thumbnail.status_code==200 and thumbnail.content.startswith(b'\x89PNG')
    assert thumbnail.headers['cache-control']=='no-store'
    from io import BytesIO
    from pypdf import PdfReader
    assert 'SecretAccount123' not in ''.join(p.extract_text() for p in PdfReader(BytesIO(downloaded.content)).pages)
    assert admin.post(f'/api/shares/{share_id}/revoke').status_code == 200
    assert admin.get(f'/api/exchange/shares/{share_id}/file',headers=headers).status_code == 403
    assert admin.get(f'/api/shares/{share_id}/thumbnail').status_code==403


def test_exchange_unavailable_does_not_break_local_access(admin, monkeypatch):
    monkeypatch.setattr(settings,'exchange_url','')
    assert admin.get('/api/received').status_code == 503
    assert admin.get('/api/documents').status_code == 200
    login(admin,'technician')
    assert admin.get('/api/received').status_code == 403


def test_received_libraries_route_copies_by_source_and_tolerate_one_offline_peer(admin,monkeypatch,tmp_path):
    import httpx
    from app.exchange import service
    gateway_headers(monkeypatch,tmp_path)
    monkeypatch.setattr(settings,'exchange_peers',{'sibiu':'http://sibiu.test','cluj':'http://cluj.test','iasi':'http://iasi.test'})
    calls=[]
    def transport(url,**kwargs):
        calls.append(url)
        if 'iasi.test' in url:raise httpx.ConnectError('offline')
        if url.endswith('/file'):return httpx.Response(200,content=b'%PDF-Cluj',headers={'content-type':'application/pdf'})
        return httpx.Response(200,json={'items':[{'id':'share-same-id','file_url':'https://untrusted.invalid/file','source_airport_id':'untrusted'}]})
    monkeypatch.setattr(service.httpx,'get',transport)
    result=admin.get('/api/received')
    assert result.status_code==200,result.text
    libraries=result.json()
    assert {item['source_airport_id'] for item in libraries['items']}=={'sibiu','cluj'}
    assert [item['airport_id'] for item in libraries['unavailable']]==['iasi']
    assert all(item['file_url']==f'/api/received/share-same-id/file?airport_id={item["source_airport_id"]}' for item in libraries['items'])
    downloaded=admin.get('/api/received/share-same-id/file?airport_id=cluj')
    assert downloaded.status_code==200 and downloaded.content==b'%PDF-Cluj'
    assert calls[-1]=='http://cluj.test/outgoing/shares/share-same-id/file'
    previous=len(calls)
    assert admin.get('/api/received/share-same-id/file?airport_id=unknown').status_code==503
    assert len(calls)==previous


def test_department_scoped_share_excludes_other_reviewers_and_directors(admin,monkeypatch,tmp_path):
    from urllib.parse import quote
    headers=gateway_headers(monkeypatch,tmp_path)
    preview=admin.post('/api/documents/test-procedure/share-preview',json={'redact_terms':[]}).json()
    response=admin.post('/api/documents/test-procedure/shares',json={'preview_id':preview['preview_id'],
        'reviewed':True,'expires_at':'2026-12-31','recipient_airport_id':'sibiu','recipient_department':'Achiziții'})
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
        'reviewed':True,'expires_at':'2026-12-31','recipient_airport_id':'sibiu','recipient_department':'Unknown department'})
    assert bad.status_code==422
