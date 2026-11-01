import io
from pathlib import Path
from sqlalchemy import select
from app.database import SessionLocal
from app.documents.models import DocumentVersion
from app.core.signing import verify_file


def upload(client,pdf_bytes):
    response=client.post('/api/documents',files={'file':('contract.pdf',pdf_bytes,'application/pdf')},data={'title':'Contract nou mentenanță','category':'Contract','department':'Achiziții'})
    assert response.status_code==201,response.text
    from app.extraction.worker import drain
    drain()
    return response.json()['id']

def act(client,id,action,**kwargs):
    return client.post(f'/api/documents/{id}/actions',json={'action':action,**kwargs})

def assign_review(client,id,user='admin'):
    task=next(t for t in client.get('/api/tasks').json()['items'] if t['document_id']==id and t['type']=='approval')
    response=client.post(f'/api/tasks/{task["id"]}/assign',json={'assigned_to':user,'comment':'Atribuire explicită pentru verificarea fluxului','version':task['document_version']})
    assert response.status_code==200,response.text

def approved(client,pdf_bytes):
    id=upload(client,pdf_bytes)
    for action in ('validate','submit'):
        response=act(client,id,action)
        assert response.status_code==200,response.text
    assign_review(client,id)
    response=act(client,id,'approve')
    assert response.status_code==200,response.text
    return id

def test_intake_validation_approval_and_audit(admin,pdf_bytes):
    id=upload(admin,pdf_bytes)
    assert act(admin,id,'submit').status_code==409
    assert act(admin,id,'validate').status_code==200
    assert act(admin,id,'submit').status_code==200
    assign_review(admin,id)
    assert act(admin,id,'approve').json()['status']=='approved'
    doc=admin.get(f'/api/documents/{id}').json()
    assert doc['validated'] and {'Document încărcat','Metadate validate','Trimis spre avizare','Document aprobat'}.issubset({e['action'] for e in doc['audit']})
    assert doc['versions'][0]['approved_by']=='admin'

def test_material_change_invalidates_approval(admin,pdf_bytes):
    id=approved(admin,pdf_bytes)
    changed=admin.patch(f'/api/documents/{id}',json={'expires_at':'2027-02-01'})
    assert changed.status_code==200,changed.text
    assert changed.json()['version']==2
    assert changed.json()['status']=='draft'
    assert not changed.json()['validated']
    assert changed.json()['versions'][0]['approved_by'] is None
    assert changed.json()['versions'][1]['metadata_snapshot']['expires_at'] is None
    assert changed.json()['versions'][0]['metadata_snapshot']['expires_at']=='2027-02-01'
    assert act(admin,id,'sign').status_code==409
    assert act(admin,id,'validate',version=1).status_code==409

def test_rejection_requires_reason(admin,pdf_bytes):
    id=upload(admin,pdf_bytes)
    act(admin,id,'validate');act(admin,id,'submit')
    assign_review(admin,id)
    assert act(admin,id,'reject').status_code==422
    response=act(admin,id,'reject',comment='Lipsește anexa tehnică')
    assert response.json()['status']=='draft'
    assert response.json()['audit'][0]['detail'].endswith('Lipsește anexa tehnică')

def test_signature_is_embedded_valid_and_idempotent(admin,pdf_bytes):
    id=approved(admin,pdf_bytes)
    signed=act(admin,id,'sign')
    assert signed.status_code==200,signed.text
    assert signed.json()['status']=='signed'
    result=admin.get(f'/api/documents/{id}/verify').json()
    assert result['signed'] and result['integrity'],result
    assert result['trust']=='demo-certificate'
    assert act(admin,id,'sign').status_code==200
    assert admin.patch(f'/api/documents/{id}',json={'title':'Changed signed title'}).status_code==409
    with SessionLocal() as db:
        v=db.scalar(select(DocumentVersion).where(DocumentVersion.document_id==id))
        original=Path(v.signed_path).read_bytes()
        tampered=original.replace(b'/Type /Page',b'/Type /Pagg',1)
        Path(v.signed_path).write_bytes(tampered)
    result=admin.get(f'/api/documents/{id}/verify').json()
    assert not result['integrity']
    assert admin.get(f'/api/documents/{id}/file').status_code==409

def test_new_file_version_clears_validation(admin,pdf_bytes):
    id=approved(admin,pdf_bytes)
    response=admin.post(f'/api/documents/{id}/versions',files={'file':('revision.pdf',pdf_bytes,'application/pdf')},data={'comment':'Revizuire termeni'})
    assert response.status_code==201,response.text
    assert response.json()['version']==2 and not response.json()['validated']
    assert admin.get(f'/api/documents/{id}/file?version=1').status_code==200

def test_invalid_pdf_rejected(admin):
    response=admin.post('/api/documents',files={'file':('fake.pdf',b'not pdf','application/pdf')})
    assert response.status_code==422


def test_lifecycle_diagram_preserves_return_and_unsigned_archive_branches(admin,pdf_bytes):
    id=approved(admin,pdf_bytes)
    doc=admin.get(f'/api/documents/{id}').json()
    graph=doc['workflow']['diagram']
    transitions={(t['source'],t['target'],t['action']) for t in graph['transitions']}
    assert ('in_review','draft','reject') in transitions
    assert ('approved','archived','archive') in transitions
    assert ('signed','archived','archive') in transitions
    assert ('draft','draft','validate') in transitions
    assert ('draft','signed','sign') not in transitions
    response=act(admin,id,'archive')
    assert response.status_code==200,response.text
    flow=response.json()['workflow']
    assert flow['diagram']['current']=='archived'
    assert not flow['diagram']['version_signed']
    assert next(s for s in flow['steps'] if s['label']=='Semnare')['status']=='not_required'


def test_archived_signed_document_still_shows_the_signature_completed(admin,pdf_bytes):
    id=approved(admin,pdf_bytes)
    assert act(admin,id,'sign').status_code==200
    response=act(admin,id,'archive')
    assert response.status_code==200,response.text
    flow=response.json()['workflow']
    assert flow['diagram']['version_signed']
    assert next(s for s in flow['steps'] if s['label']=='Semnare')['status']=='done'


def test_concurrent_uploads_keep_distinct_versions(admin,pdf_bytes):
    from concurrent.futures import ThreadPoolExecutor
    id=approved(admin,pdf_bytes)
    def revise(index):
        return admin.post(f'/api/documents/{id}/versions',files={'file':(f'rev-{index}.pdf',pdf_bytes,'application/pdf')},data={'comment':f'Concurrent revision {index}'})
    with ThreadPoolExecutor(max_workers=2) as executor:
        results=list(executor.map(revise,[1,2]))
    assert all(r.status_code==201 for r in results),[r.text for r in results]
    assert {r.json()['version'] for r in results}=={2,3}
    doc=admin.get(f'/api/documents/{id}').json()
    assert len(doc['versions'])==3 and doc['version']==3


def test_pdf_full_text_search_updates_with_version(admin):
    from reportlab.pdfgen import canvas
    def make_pdf(text):
        output=io.BytesIO();c=canvas.Canvas(output);c.drawString(40,700,text);c.save();return output.getvalue()
    id=upload(admin,make_pdf('UniqueArchiveToken'))
    assert any(d['id']==id for d in admin.get('/api/documents?q=UniqueArchiveToken').json()['items'])
    record=admin.get(f'/api/documents/{id}').json()
    assert 'searchable_text' not in str(record) and 'text_excerpt' not in str(record)
    admin.post(f'/api/documents/{id}/versions',files={'file':('new.pdf',make_pdf('ReplacementArchiveToken'),'application/pdf')})
    from app.extraction.worker import drain
    drain()
    assert not any(d['id']==id for d in admin.get('/api/documents?q=UniqueArchiveToken').json()['items'])
    assert any(d['id']==id for d in admin.get('/api/documents?q=ReplacementArchiveToken').json()['items'])

def test_explicit_null_clears_metadata(admin,pdf_bytes):
    id=upload(admin,pdf_bytes)
    admin.patch(f'/api/documents/{id}',json={'supplier':'A supplier','value':200,'expires_at':'2027-01-01'})
    response=admin.patch(f'/api/documents/{id}',json={'supplier':None,'value':None,'expires_at':None})
    assert response.status_code==200,response.text
    assert response.json()['supplier'] is None and response.json()['value'] is None and response.json()['expires_at'] is None

def test_multiline_romanian_evidence_and_amount_suggestions():
    from app.documents.service import evidence_from_text,suggested_values
    evidence=evidence_from_text(['Furnizor\nFurnizor Demo SRL\nValoare fără TVA\n86 400,00 RON\nData expirării\n19.11.2026'])
    values=suggested_values(evidence)
    assert values=={'supplier':'Furnizor Demo SRL','value':86400.0,'expires_at':'2026-11-19'}


def test_signed_idempotency_does_not_bypass_signer_authority(admin,pdf_bytes):
    from conftest import login
    id=approved(admin,pdf_bytes)
    assert act(admin,id,'sign').status_code==200
    login(admin,'finance')
    assert act(admin,id,'sign').status_code==403


def test_asset_identifier_search_does_not_match_word_prefix_and_date(admin):
    from reportlab.pdfgen import canvas
    def make_pdf(text):
        output=io.BytesIO();c=canvas.Canvas(output);c.drawString(40,700,text);c.save();return output.getvalue()
    exact=upload(admin,make_pdf('Asset SP-02 requires maintenance'))
    noisy=upload(admin,make_pdf('Spatiu comercial deschis la 02 noiembrie'))
    hits={d['id'] for d in admin.get('/api/documents?q=SP-02&limit=500').json()['items']}
    assert exact in hits and noisy not in hits
