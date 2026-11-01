from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from fastapi.testclient import TestClient
from app.main import app
from conftest import login
from test_suppliers import alternative_iban
from test_supplier_catalog import approved_contract

def dossier(client,pdf_bytes,tax_id='12345678',name='New Demo Supplier SRL'):
    doc=approved_contract(client,pdf_bytes,name)
    payload={'name':name,'tax_id':tax_id,'address':'Adresă demonstrativă','category':'Servicii',
        'source_contract_id':doc['id'],'source_version':doc['version'],'proposed_iban':alternative_iban(919),
        'proposed_contact':'contact@new.example','evidence_refs':[{'document_id':doc['id'],'version':doc['version']}]}
    response=client.post('/api/supplier-registrations',json=payload)
    assert response.status_code==201,response.text
    return response.json(),doc

def verify(client,record):
    return client.post(f'/api/supplier-registrations/{record["id"]}/verify',json={
        'contact_used':'contact@new.example','method':'phone','contacted_person':'Demo representative',
        'note':'Contact independently checked using the approved demo evidence.'})

def test_new_supplier_is_untrusted_until_independent_approval(admin,pdf_bytes):
    record,doc=dossier(admin,pdf_bytes)
    assert not any(s['tax_id']=='12345678' for s in admin.get('/api/suppliers').json()['items'])
    assert verify(admin,record).status_code==200
    url=f'/api/supplier-registrations/{record["id"]}/approve'
    assert admin.post(url,json={}).status_code==403
    login(admin,'finance')
    response=admin.post(url,json={});assert response.status_code==200,response.text
    known=admin.get(f'/api/suppliers/{response.json()["supplier_id"]}').json()
    assert known['tax_id']=='12345678' and known['contracts'][0]['id']==doc['id']
    assert len(known['bank_history'])==1
    assert admin.post(url,json={}).status_code==200

def test_changed_evidence_blocks_registration_approval(admin,pdf_bytes):
    record,doc=dossier(admin,pdf_bytes,'12345679')
    assert verify(admin,record).status_code==200
    assert admin.patch(f'/api/documents/{doc["id"]}',json={'title':'Changed evidence'}).status_code==200
    login(admin,'finance')
    assert admin.post(f'/api/supplier-registrations/{record["id"]}/approve',json={}).status_code==404

def test_concurrent_registration_approvals_preserve_unique_tax_id(admin,pdf_bytes):
    records=[dossier(admin,pdf_bytes,'12345680')[0] for _ in range(2)]
    for record in records: assert verify(admin,record).status_code==200
    with TestClient(app) as a,TestClient(app) as b:
        login(a,'finance');login(b,'finance');barrier=Barrier(2)
        def decide(pair):
            client,record=pair;barrier.wait(timeout=5)
            return client.post(f'/api/supplier-registrations/{record["id"]}/approve',json={}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(decide,zip((a,b),records)))==[200,409]

def test_same_name_different_tax_ids_use_explicit_contracts(admin,pdf_bytes):
    name='Identical Name SRL'
    records=[dossier(admin,pdf_bytes,tax,name)[0] for tax in ('12345681','12345682')]
    for item in records: assert verify(admin,item).status_code==200
    login(admin,'finance')
    approved=[admin.post(f'/api/supplier-registrations/{r["id"]}/approve',json={}).json() for r in records]
    assert approved[0]['supplier_id']!=approved[1]['supplier_id']
    assert admin.post('/api/supplier-reviews',json={'supplier_name':name,'observed_iban':alternative_iban(919),'sender_email':'contact@new.example'}).status_code==422
