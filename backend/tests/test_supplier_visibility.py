import copy
import pytest
from conftest import login
from test_suppliers import create_case, supplier
from test_supplier_catalog import approved_contract
from test_supplier_registration import verify
from test_supplier_registration import dossier
from test_suppliers import alternative_iban
from app.documents.models import Document
from app.suppliers.models import Supplier


@pytest.fixture(autouse=True)
def preserve_demo_registry(admin, db):
    item = db.get(Supplier, supplier(admin)['id'])
    fields = ('expected_iban', 'bank_history', 'registry_revision', 'trust_status')
    baseline = {key: copy.deepcopy(getattr(item, key)) for key in fields}
    yield
    db.expire_all()
    for key, value in baseline.items():
        setattr(item, key, value)
    db.commit()


def hide_from_finance(db, identifier):
    document = db.get(Document, identifier)
    document.department = 'Resurse umane'
    document.owner = 'Ioana Stancu'
    document.created_by = 'seed'
    db.commit()


def profile_responses(client, supplier_id):
    yield client.get(f'/api/suppliers/{supplier_id}').json()
    yield client.get(f'/api/supplier-reviews/registry/{supplier_id}').json()
    yield next(s for s in client.get('/api/suppliers').json()['items'] if s['id'] == supplier_id)
    yield next(s for s in client.get('/api/supplier-reviews').json()['suppliers'] if s['id'] == supplier_id)


def test_bank_history_hides_inaccessible_review_sources_on_every_response(admin, db, pdf_bytes):
    known = supplier(admin)
    document = approved_contract(admin, pdf_bytes, known['name'])
    assert admin.post(f'/api/suppliers/{known["id"]}/contracts', json={
        'document_id': document['id'], 'version': document['version']}).status_code == 200
    login(admin, 'finance')
    case, _ = create_case(admin, supplier_id=known['id'], document_id=document['id'])
    url = f'/api/supplier-reviews/{case["id"]}'
    assert admin.post(url + '/verify', json={'contact_used': known['verified_contact'],
        'note': 'Independently checked the source contact.'}).status_code == 200
    login(admin)
    assert admin.post(url + '/approve', json={}).status_code == 200
    login(admin, 'finance')
    assert all(p['bank_history'][-1]['source_case_id'] == case['id'] for p in profile_responses(admin, known['id']))
    hide_from_finance(db, document['id'])
    assert admin.get(url).status_code == 404
    for profile in profile_responses(admin, known['id']):
        assert len(profile['bank_history']) == 2
        assert 'source_case_id' not in profile['bank_history'][-1]


def test_bank_history_hides_registration_when_evidence_becomes_inaccessible(admin, db, pdf_bytes):
    document = approved_contract(admin, pdf_bytes, 'Visibility Demo SRL')
    # A second approved reference must be accessible throughout the decision.
    evidence = approved_contract(admin, pdf_bytes, 'Evidence Demo SRL')
    created = admin.post('/api/supplier-registrations', json={
        'name': 'Visibility Demo SRL', 'tax_id': '12345991', 'address': 'Demo address',
        'category': 'Services', 'source_contract_id': document['id'], 'source_version': document['version'],
        'proposed_iban': alternative_iban(919), 'proposed_contact': 'contact@new.example',
        'evidence_refs': [{'document_id': evidence['id'], 'version': evidence['version']}]})
    assert created.status_code == 201, created.text
    record = created.json()
    assert verify(admin, record).status_code == 200
    login(admin, 'finance')
    approved = admin.post(f'/api/supplier-registrations/{record["id"]}/approve', json={})
    assert approved.status_code == 200, approved.text
    identifier = approved.json()['supplier_id']
    assert all(p['bank_history'][0]['source_registration_id'] == record['id'] for p in profile_responses(admin, identifier))
    hide_from_finance(db, evidence['id'])
    assert admin.get(f'/api/supplier-registrations/{record["id"]}').status_code == 404
    for profile in profile_responses(admin, identifier):
        assert profile['document_id'] == document['id']
        assert 'source_registration_id' not in profile['bank_history'][0]


def test_recheck_hides_predecessor_after_source_access_is_lost(admin, db, pdf_bytes):
    known = supplier(admin)
    document = approved_contract(admin, pdf_bytes, known['name'])
    assert admin.post(f'/api/suppliers/{known["id"]}/contracts', json={
        'document_id': document['id'], 'version': document['version']}).status_code == 200
    old, _ = create_case(admin, supplier_id=known['id'], document_id=document['id'])
    _, payload = create_case(admin)
    response = admin.post('/api/supplier-reviews', json={**payload, 'previous_review_id': old['id']})
    assert response.status_code == 201, response.text
    recheck = response.json()
    assert recheck['previous_review_id'] == old['id']
    hide_from_finance(db, document['id'])
    login(admin, 'finance')
    assert admin.get(f'/api/supplier-reviews/{old["id"]}').status_code == 404
    detail = admin.get(f'/api/supplier-reviews/{recheck["id"]}').json()
    assert detail['previous_review_id'] is None
    listed = next(c for c in admin.get('/api/supplier-reviews').json()['items'] if c['id'] == recheck['id'])
    assert listed['previous_review_id'] is None


def test_name_only_review_does_not_reveal_a_supplier_without_accessible_contracts(admin, db, pdf_bytes):
    record, document = dossier(admin, pdf_bytes, '12345992', 'Hidden Supplier SRL')
    assert verify(admin, record).status_code == 200
    login(admin, 'finance')
    approved = admin.post(f'/api/supplier-registrations/{record["id"]}/approve', json={})
    assert approved.status_code == 200, approved.text
    hide_from_finance(db, document['id'])
    identifier = approved.json()['supplier_id']
    assert admin.get(f'/api/suppliers/{identifier}').status_code == 404
    response = admin.post('/api/supplier-reviews', json={'supplier_name': 'Hidden Supplier SRL',
        'observed_iban': alternative_iban(919), 'sender_email': 'contact@new.example'})
    assert response.status_code == 201, response.text
    case = response.json()
    assert case['supplier_id'] is None
    assert case['expected_iban'] == '' and case['verified_contact'] == ''
    assert 'unknown_supplier' in {r['code'] for r in case['reasons']}
