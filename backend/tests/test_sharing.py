import io
from pypdf import PdfReader
from conftest import login

def test_real_redaction_share_revocation(admin):
    preview=admin.post('/api/documents/test-contract/share-preview',json={'redact_terms':['SecretAccount123','Contract mentenanta scari']})
    assert preview.status_code==200,preview.text
    assert preview.json()['redactions'][0]['occurrences']==1
    blob=admin.get(preview.json()['file_url']).content
    assert 'SecretAccount123' not in '\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(blob)).pages)
    assert 'Contract mentenanta scari' not in str(PdfReader(io.BytesIO(blob)).metadata)
    share=admin.post('/api/documents/test-contract/shares',json={'preview_id':preview.json()['preview_id'],'expires_at':'2026-12-31','reviewed':True,'recipient_airport':'Aeroportul Carpați','recipient_airport_id':'carpati'})
    assert share.status_code==201,share.text
    item=share.json()
    assert admin.get(item['file_url']).status_code==200
    assert admin.post(f'/api/shares/{item["id"]}/revoke').json()['revoked']
    assert admin.get(item['file_url']).status_code==403

def test_human_review_and_source_version_required(admin,pdf_bytes):
    from test_workflows import approved
    id=approved(admin,pdf_bytes)
    preview=admin.post(f'/api/documents/{id}/share-preview',json={'redact_terms':[]}).json()
    body={'preview_id':preview['preview_id'],'expires_at':'2026-12-31','reviewed':False}
    assert admin.post(f'/api/documents/{id}/shares',json=body).status_code==422
    admin.patch(f'/api/documents/{id}',json={'title':'New material title'})
    body['reviewed']=True
    assert admin.post(f'/api/documents/{id}/shares',json=body).status_code==409

def test_technician_cannot_share(client):
    login(client,'technician')
    assert client.post('/api/documents/test-tech/share-preview',json={'redact_terms':[]}).status_code==403
