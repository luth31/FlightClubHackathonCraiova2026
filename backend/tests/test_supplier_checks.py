import pytest
from conftest import login
from app.database import SessionLocal
from app.suppliers.models import Supplier, SupplierReview
from test_suppliers import create_case, supplier, alternative_iban
from test_workflows import approved


def test_missing_inputs_are_not_checked(admin):
    known = supplier(admin)
    case, _ = create_case(admin, iban=known['expected_iban'])
    assert case['status'] == 'clear'
    checks = {c['code']: c['result'] for c in case['checks']}
    assert checks == {'iban': 'passed', 'sender': 'passed', 'source': 'passed', 'amount': 'not_checked', 'service_period': 'not_checked'}


def test_stale_contract_disables_actions_and_blocks_post(admin, pdf_bytes):
    known = supplier(admin)
    document = approved(admin, pdf_bytes)
    case, _ = create_case(admin, document_id=document)
    url = f'/api/supplier-reviews/{case["id"]}'
    login(admin, 'finance')
    assert admin.post(url+'/verify', json={'contact_used':known['verified_contact'], 'note':'Independent demo confirmation.'}).status_code == 200
    login(admin)
    assert admin.patch(f'/api/documents/{document}', json={'title':'Changed source'}).status_code == 200
    listed = next(c for c in admin.get('/api/supplier-reviews').json()['items'] if c['id'] == case['id'])
    assert listed['freshness']['state'] == 'stale'
    assert not listed['can_approve']
    assert admin.post(url+'/approve', json={}).status_code == 409


@pytest.mark.parametrize('field,value', [('verified_contact','new@contact.example'), ('registry_revision',99), ('expected_iban',alternative_iban(907))])
def test_registry_changes_disable_verification(admin, field, value):
    known = supplier(admin)
    case, _ = create_case(admin)
    with SessionLocal() as db:
        record = db.get(Supplier, known['id'])
        old = getattr(record, field)
        try:
            setattr(record, field, value); db.commit()
            listed = next(c for c in admin.get('/api/supplier-reviews').json()['items'] if c['id'] == case['id'])
            assert listed['freshness']['state'] == 'stale'
            assert not listed['can_verify']
            assert admin.post(f'/api/supplier-reviews/{case["id"]}/verify', json={'contact_used':known['verified_contact'],'note':'Independent demo confirmation.'}).status_code == 409
        finally:
            setattr(record, field, old); db.commit()


def test_legacy_context_is_unrecorded_without_rewriting_history(admin):
    case, _ = create_case(admin)
    with SessionLocal() as db:
        record = db.get(SupplierReview, case['id'])
        record.contract_snapshot = None; record.registry_revision = None; db.commit()
    listed = next(c for c in admin.get('/api/supplier-reviews').json()['items'] if c['id'] == case['id'])
    assert listed['freshness']['state'] == 'unrecorded'
    assert listed['status'] == 'needs_review'
    assert not listed['can_verify']


@pytest.mark.parametrize('sender', ['not-an-email','Person <x@furnizor.example>','a@example.test,b@example.test'])
def test_bad_sender_is_rejected(admin, sender):
    response = admin.post('/api/supplier-reviews', json={'sender_email':sender,'observed_iban':alternative_iban()})
    assert response.status_code == 422


@pytest.mark.parametrize('sender', ['contact@furnizor.example','contact@furnizor.test'])
def test_demo_domains_are_accepted(admin, sender):
    create_case(admin, sender=sender)


def test_different_currency_is_not_compared_or_approved(admin):
    case, _ = create_case(admin, invoice_amount=700, invoice_currency='EUR')
    assert 'currency_mismatch' in {r['code'] for r in case['reasons']}
    assert next(c for c in case['checks'] if c['code']=='amount')['result'] == 'not_checked'
    assert not case['can_approve']
