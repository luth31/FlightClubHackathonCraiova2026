"""Review outcomes must remain tied to their contract and supplier baseline."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.suppliers.models import Supplier
from conftest import login
from test_suppliers import alternative_iban, supplier
from test_workflows import approved


def sample(known, document_id=None, **overrides):
    return {'document_id':document_id,'supplier_name':known['name'],
        'observed_iban':known['expected_iban'],'sender_email':known['verified_contact'],
        'message':'Review boundary fixture '+uuid4().hex,**overrides}


def test_matching_bank_details_without_contract_remain_unresolved(admin):
    known=supplier(admin)
    response=admin.post('/api/supplier-reviews',json=sample(known,invoice_amount=99999999))
    assert response.status_code==201,response.text
    case=response.json()
    assert case['status']=='needs_review'
    assert 'source_not_approved' in {r['code'] for r in case['reasons']}
    assert not case['can_approve']


def test_blank_verification_evidence_is_rejected(admin):
    known=supplier(admin)
    created=admin.post('/api/supplier-reviews',json=sample(known,'test-contract',observed_iban=alternative_iban(904)))
    assert created.status_code==201,created.text
    response=admin.post(f'/api/supplier-reviews/{created.json()["id"]}/verify',json={
        'contact_used':known['verified_contact'],'note':' '*20})
    assert response.status_code==422,response.text


def test_non_finite_invoice_amount_cannot_poison_review_listing(admin):
    response=admin.post('/api/supplier-reviews',content='{"supplier_name":"test","observed_iban":"RO49AAAA1B31007593840000","sender_email":"test@example.test","invoice_amount":1e999}',
        headers={'Content-Type':'application/json'})
    assert response.status_code==422,response.text
    assert admin.get('/api/supplier-reviews').status_code==200


def test_reimport_after_contract_revision_rechecks_source(admin,pdf_bytes):
    known=supplier(admin)
    document_id=approved(admin,pdf_bytes)
    payload=sample(known,document_id)
    first=admin.post('/api/supplier-reviews',json=payload).json()
    assert first['status']=='clear'
    response=admin.patch(f'/api/documents/{document_id}',json={'title':'Revised supplier evidence'})
    assert response.status_code==200,response.text
    second=admin.post('/api/supplier-reviews',json=payload).json()
    assert second['id']!=first['id'] and second['source_version']==2
    assert second['status']=='needs_review'
    assert 'source_not_approved' in {r['code'] for r in second['reasons']}
    assert admin.post('/api/supplier-reviews',json=payload).json()['id']==second['id']


def test_reimport_after_registry_change_rechecks_bank_baseline(admin,db):
    known=supplier(admin)
    payload=sample(known,'test-contract')
    first=admin.post('/api/supplier-reviews',json=payload).json()
    assert first['status']=='clear'
    registry=db.get(Supplier,known['id'])
    original_iban,original_history=registry.expected_iban,list(registry.bank_history)
    try:
        registry.expected_iban=alternative_iban(901)
        registry.bank_history=[*original_history,{'iban':registry.expected_iban,'version':len(original_history)+1}]
        db.commit()
        second=admin.post('/api/supplier-reviews',json=payload).json()
        assert second['id']!=first['id'] and second['status']=='needs_review'
        assert second['expected_iban']==alternative_iban(901)
        assert 'iban_mismatch' in {r['code'] for r in second['reasons']}
    finally:
        registry.expected_iban=original_iban
        registry.bank_history=original_history
        db.commit()


def test_concurrent_bank_changes_cannot_overwrite_new_baseline(admin,db):
    known=supplier(admin)
    registry=db.get(Supplier,known['id'])
    original_iban,original_history,original_trust=registry.expected_iban,list(registry.bank_history),registry.trust_status
    cases=[]
    for suffix in (902,903):
        response=admin.post('/api/supplier-reviews',json=sample(known,'test-contract',observed_iban=alternative_iban(suffix)))
        assert response.status_code==201,response.text
        cases.append(response.json()['id'])
    try:
        with TestClient(app) as verifier:
            login(verifier,'finance')
            for case_id in cases:
                result=verifier.post(f'/api/supplier-reviews/{case_id}/verify',json={
                    'contact_used':known['verified_contact'],
                    'note':'Confirmare independentă fictivă prin contactul cunoscut.'})
                assert result.status_code==200,result.text
        with TestClient(app) as first,TestClient(app) as second:
            login(first,'admin');login(second,'admin')
            start=Barrier(2)
            def decide(pair):
                reviewer,case_id=pair
                start.wait(timeout=5)
                return reviewer.post(f'/api/supplier-reviews/{case_id}/approve',json={'comment':'Second-person approval'})
            with ThreadPoolExecutor(max_workers=2) as executor:
                results=list(executor.map(decide,zip((first,second),cases)))
        assert sorted(r.status_code for r in results)==[200,409],[r.text for r in results]
        db.expire_all()
        registry=db.get(Supplier,known['id'])
        assert len(registry.bank_history)==len(original_history)+1
    finally:
        registry.expected_iban=original_iban
        registry.bank_history=original_history
        registry.trust_status=original_trust
        db.commit()
