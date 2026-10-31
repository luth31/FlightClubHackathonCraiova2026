from conftest import login

def test_requires_session_and_ignores_impersonation_header(client):
    assert client.get('/api/documents',headers={'X-Demo-User':'admin'}).status_code==401
    assert client.get('/api/documents/test-contract/file?as_user=admin').status_code==401
    assert client.post('/api/auth/login',json={'user_id':'admin','password':'wrong'}).status_code==401

def test_role_filters_search_files_assistant_exports(client):
    login(client,'technician')
    items=client.get('/api/documents').json()['items']
    assert all(item['department']=='Tehnic' for item in items)
    assert 'supplier_iban' not in str(items)
    assert 'supplier_iban' not in str(client.get('/api/documents/test-tech').json())
    assert client.get('/api/documents/test-hr').status_code==404
    assert client.get('/api/documents/test-hr/file').status_code==404
    assert client.get('/api/documents/test-contract/file').status_code==404
    assert client.get('/api/documents?q=confidential').json()['total']==0
    assert 'Dosar personal' not in client.get('/api/reports/register.csv').text
    answer=client.post('/api/assistant',json={'question':'dosar personal confidential'}).json()
    assert answer['sources']==[]
    assert client.post('/api/documents/test-tech/actions',json={'action':'approve'}).status_code==403

def test_director_has_no_blanket_hr_access(admin):
    assert admin.get('/api/documents/test-hr').status_code==404
    assert 'test-hr' not in [x['id'] for x in admin.get('/api/documents').json()['items']]

def test_cross_origin_mutation_denied(admin):
    response=admin.post('/api/auth/logout',headers={'Origin':'https://attacker.invalid'})
    assert response.status_code==403
    assert admin.get('/api/documents').status_code==200

def test_dashboard_counts_match_visible_records(admin):
    docs=admin.get('/api/documents?limit=500').json()
    dashboard=admin.get('/api/dashboard').json()
    assert dashboard['stats']['documents']==docs['total']
    assert dashboard['stats']['pending']==sum(d['status']=='in_review' for d in docs['items'])

def test_logout_invalidates_cookie(admin):
    assert admin.post('/api/auth/logout').status_code==200
    assert admin.get('/api/documents').status_code==401


def test_assistant_approval_count_is_grounded(admin):
    response=admin.post('/api/assistant',json={'question':'Câte documente sunt în aprobare?'}).json()
    expected=sum(d['status']=='in_review' and d['validated'] for d in admin.get('/api/documents?limit=500').json()['items'])
    assert response['answer'].startswith(str(expected)+' documente')
    assert response['mode']=='validated-records'


def test_hr_reclassification_cannot_expose_old_or_current_bytes(client,pdf_bytes):
    login(client,'hr')
    response=client.post('/api/documents',files={'file':('personal.pdf',pdf_bytes,'application/pdf')},data={'title':'Fișă personal protejată','category':'Resurse umane','department':'Resurse umane'})
    assert response.status_code==201,response.text
    id=response.json()['id']
    for changes in ({'department':'Tehnic','category':'Procedură','confidentiality':'public'},{'department':'Tehnic'},{'confidentiality':'public'},{'category':'Procedură'}):
        assert client.patch(f'/api/documents/{id}',json=changes).status_code==403
    login(client,'technician')
    assert client.get(f'/api/documents/{id}/file').status_code==404
    assert client.get(f'/api/documents/{id}/file?version=1').status_code==404


def test_nested_active_pdf_content_rejected(admin,pdf_bytes):
    from pypdf import PdfReader,PdfWriter
    from pypdf.generic import DictionaryObject,NameObject,TextStringObject,ArrayObject,NumberObject
    from io import BytesIO
    for action in ('JavaScript','Launch','SubmitForm'):
        writer=PdfWriter();writer.append(PdfReader(BytesIO(pdf_bytes)))
        annotation=DictionaryObject({NameObject('/Type'):NameObject('/Annot'),NameObject('/Subtype'):NameObject('/Link'),NameObject('/Rect'):ArrayObject([NumberObject(0),NumberObject(0),NumberObject(20),NumberObject(20)]),NameObject('/A'):DictionaryObject({NameObject('/S'):NameObject('/'+action),NameObject('/JS'):TextStringObject('void(0)')})})
        writer.pages[0][NameObject('/Annots')]=ArrayObject([writer._add_object(annotation)])
        output=BytesIO();writer.write(output)
        response=admin.post('/api/documents',files={'file':('active.pdf',output.getvalue(),'application/pdf')})
        assert response.status_code==422,(action,response.text)


def test_embedded_pdf_attachment_rejected(admin,pdf_bytes):
    from pypdf import PdfReader,PdfWriter
    from io import BytesIO
    writer=PdfWriter();writer.append(PdfReader(BytesIO(pdf_bytes)));writer.add_attachment('payload.html',b'<script>void(0)</script>')
    output=BytesIO();writer.write(output)
    assert admin.post('/api/documents',files={'file':('attachment.pdf',output.getvalue(),'application/pdf')}).status_code==422


def test_contract_register_excludes_addenda_and_future_contracts_not_active(admin,db):
    from app.documents.models import Document
    from app.documents.service import serialize
    from app.config import settings
    contract=db.get(Document,'test-contract')
    original=contract.extra
    contract.extra={**contract.extra,'metadata':{**contract.extra.get('metadata',{}),'effective_date':'2027-02-01'}}
    assert serialize(contract)['contract_status']=='scheduled'
    contract.extra=original
    addendum=Document(id='test-addendum',title='Act adițional de test',number='ADD-TEST',category='Act adițional',department='Achiziții',status='approved',created_at='2026-10-01',updated_at='2026-10-01',expires_at=None,supplier=None,value=100,currency='RON',owner='Elena Popa',created_by='seed',confidentiality='internal',summary='',searchable_text='',version=1,validated=True,airport_id=settings.airport_id,extra={})
    if not db.get(Document,'test-addendum'): db.add(addendum);db.commit()
    listing=admin.get('/api/contracts').json()
    assert all(d['category']=='Contract' for d in listing['items'])
    assert 'test-addendum' not in [d['id'] for d in listing['items']]
    db.delete(db.get(Document,'test-addendum'));db.commit()


def test_contract_export_matches_contract_register(admin):
    import csv,io
    response=admin.get('/api/reports/register.csv?category=Contract')
    assert response.status_code==200
    rows=list(csv.reader(io.StringIO(response.text.lstrip('\ufeff'))))
    assert all(row[2]=='Contract' for row in rows[1:])
    assert len(rows)-1==admin.get('/api/contracts').json()['total']
    assert admin.get('/api/reports/register.csv?category=Unknown').status_code==422


def test_assistant_expiry_scope_matches_dashboard(admin):
    response=admin.post('/api/assistant',json={'question':'Ce contracte expiră în următoarele 60 de zile?'}).json()
    expected=admin.get('/api/dashboard').json()['stats']['expiring']
    assert response['answer'].startswith(f'{expected} contracte din registrul validat')
