"""The approved demo access model, exercised through its public API."""
import json
from pathlib import Path

import pytest
from sqlalchemy import select, delete

from conftest import login
from app.people.models import User, Department
from app.documents.models import Document, DocumentVersion


def test_four_departments_and_reporting_lines(admin, db):
    result = admin.get('/api/people').json()
    assert {d['id'] for d in result['department_records']} == {
        'dept-tehnic', 'dept-achizitii', 'dept-hr', 'dept-conformitate'}
    people = {p['id']: p for p in result['items']}
    assert people['technician']['manager_id'] == 'technical-head'
    assert people['finance']['manager_id'] == 'manager'
    assert people['technical-head']['manager_id'] == 'admin'
    assert people['manager']['manager_id'] == 'admin'
    assert people['hr']['manager_id'] == 'admin'
    assert people['reviewer']['manager_id'] == 'admin'
    assert db.get(User, 'admin').department_id is None


def test_department_less_employee_is_not_a_head_candidate(admin, db):
    person = User(id='test-daniel', name='Daniel Ilie Voicu', email='daniel@demo.example',
        department='Conducere', department_id=None, job_title='Asistent conducere',
        role='Asistent conducere', roles=['employee'], airport_id=db.get(User, 'admin').airport_id,
        active=True, manager_id='admin', password_hash='unused')
    db.add(person)
    db.commit()
    try:
        directory = admin.get('/api/people').json()
        candidate = next(item for item in directory['items'] if item['id'] == person.id)
        assert candidate['can_propose_head'] is False
        assert candidate['department_id'] is None
        response = admin.post('/api/people/appointments', json={
            'user_id': person.id, 'department_id': None,
            'effective_date': directory['reference_date'], 'reason': 'Numire propusă'})
        assert response.status_code == 422
    finally:
        db.delete(person)
        db.commit()


def test_technician_session_and_section_boundaries(client):
    login(client, 'technician')
    user = client.get('/api/session').json()['current_user']
    assert {page for page, allowed in user['permissions']['pages'].items() if allowed} == {
        'home', 'operations', 'documents', 'approvals', 'people', 'reports', 'equipment', 'assistant'}
    assert client.get('/api/contracts').status_code == 403
    assert client.get('/api/audit').status_code == 403
    assert client.get('/api/shares').status_code == 403
    directory = client.get('/api/people').json()
    assert directory['delegations'] == []
    assert all('login_username' not in p and 'provisioning_status' not in p and 'roles' not in p
               for p in directory['items'] if p['id'] != 'technician')


def test_no_general_contract_access_for_compliance_without_assignment(client, db):
    # The seeded delegation grants access only while the assigned task is pending.
    login(client, 'reviewer')
    assert client.get('/api/documents/test-review').status_code == 200
    doc = db.get(Document, 'test-contract')
    previous_owner = doc.owner_id
    doc.owner_id = 'manager'
    db.commit()
    try:
        assert client.get('/api/documents/test-contract').status_code == 404
        assert client.get('/api/documents/test-contract/file').status_code == 404
        assert 'test-contract' not in {d['id'] for d in client.get('/api/documents').json()['items']}
    finally:
        doc.owner_id = previous_owner
        db.commit()


def test_procurement_catalog_hides_banking_and_denies_bank_actions(client):
    login(client, 'manager')
    response = client.get('/api/suppliers')
    assert response.status_code == 200, response.text
    assert response.json()['items']
    for supplier in response.json()['items']:
        assert not {'iban', 'bank_history', 'verified_iban', 'expected_iban'} & supplier.keys()
        assert supplier['can_review_bank'] is False
        detail = client.get('/api/suppliers/' + supplier['id']).json()
        assert not {'iban', 'bank_history', 'verified_iban', 'expected_iban'} & detail.keys()
    assert client.get('/api/supplier-reviews').status_code == 403


def test_technical_head_can_review_department_but_cannot_sign_or_read_hr(client):
    login(client, 'technical-head')
    assert client.get('/api/documents/test-tech').status_code == 200
    assert client.get('/api/documents/test-hr').status_code == 404
    assert client.get('/api/documents/test-contract').status_code == 404
    user = client.get('/api/session').json()['current_user']
    assert 'signer' not in user['roles']
    assert user['permissions']['pages']['contracts']


def test_own_technical_draft_is_visible_but_not_another_technicians_draft(client, db, pdf_bytes):
    login(client, 'technician')
    response = client.post('/api/documents', files={'file': ('own.pdf', pdf_bytes, 'application/pdf')},
                           data={'category': 'Raport de mentenanță', 'department': 'Tehnic'})
    assert response.status_code == 201, response.text
    identifier = response.json()['id']
    try:
        assert client.get('/api/documents/' + identifier).status_code == 200
        document = db.get(Document, identifier)
        document.created_by = 'technical-head'
        document.owner_id = 'technical-head'
        db.commit()
        assert client.get('/api/documents/' + identifier).status_code == 404
    finally:
        from app.tasks.models import WorkflowTask, TaskEvent
        task_ids = list(db.scalars(select(WorkflowTask.id).where(WorkflowTask.document_id == identifier)))
        db.execute(delete(TaskEvent).where(TaskEvent.task_id.in_(task_ids)))
        db.execute(delete(WorkflowTask).where(WorkflowTask.document_id == identifier))
        db.execute(delete(DocumentVersion).where(DocumentVersion.document_id == identifier))
        db.execute(delete(Document).where(Document.id == identifier))
        db.commit()


def test_fresh_realms_include_stable_technical_head_identity():
    root = Path(__file__).resolve().parents[2]
    from app.identity.service import DEMO_SUBJECTS
    for airport in ('craiova', 'sibiu'):
        realm = json.loads((root / 'deploy' / 'keycloak' / f'{airport}-realm.json').read_text(encoding='utf-8'))
        account = next(user for user in realm['users'] if user.get('username') == 'technical-head')
        assert DEMO_SUBJECTS[airport][account['id']] == 'technical-head'
        assert account['credentials'][0]['value'] == 'FlyLeaf2026!'


def test_repeated_seeding_preserves_custom_head_and_reporting_links(client, db):
    from app.seed import seed
    head = db.get(Department, 'dept-tehnic')
    technician = db.get(User, 'technician')
    original_head, original_manager = head.head_user_id, technician.manager_id
    try:
        head.head_user_id = 'technician'
        technician.manager_id = None
        db.commit()
        seed()
        db.expire_all()
        assert head.head_user_id == 'technician'
        assert technician.manager_id is None
    finally:
        head.head_user_id, technician.manager_id = original_head, original_manager
        db.commit()


@pytest.mark.parametrize('seeded_identity', [False, True])
def test_existing_realm_upgrade_does_not_reset_existing_account_credentials(client, db, monkeypatch, seeded_identity):
    from app.config import settings
    from app.identity import provisioning
    from app.people.sync_demo_organization import sync_technical_head
    head = db.get(User, 'technical-head')
    original_subject, original_issuer = head.identity_subject, head.identity_issuer
    remote = {}
    created = []
    monkeypatch.setattr(settings, 'auth_mode', 'oidc')
    monkeypatch.setattr(provisioning, 'connection', lambda: ('https://identity/users', {}))
    monkeypatch.setattr(provisioning, 'owned_user', lambda base, headers, person: remote.get(person.identity_subject))
    import httpx
    monkeypatch.setattr(provisioning, 'request', lambda method, url, **kwargs:
        httpx.Response(200 if url.rsplit('/', 1)[-1] in remote else 404,
                       json=remote.get(url.rsplit('/', 1)[-1], {})))
    def provision(person):
        created.append(person.id)
        remote['new-stable-subject'] = {'id': 'new-stable-subject', 'username': 'technical-head'}
        return {'subject': 'new-stable-subject', 'temporary_password': 'once-only'}
    monkeypatch.setattr(provisioning, 'provision', provision)
    try:
        from app.identity.service import DEMO_SUBJECTS
        fixture_subject = next(subject for subject, user in DEMO_SUBJECTS[head.airport_id].items()
                               if user == 'technical-head')
        head.identity_subject = fixture_subject if seeded_identity else None
        head.identity_issuer = None
        db.commit()
        result = sync_technical_head(db)
        assert result['temporary_password'] == 'once-only'
        assert head.identity_subject == 'new-stable-subject'
        assert sync_technical_head(db) == {'status': 'existing', 'username': 'technical-head'}
        assert created == ['technical-head']
    finally:
        head.identity_subject, head.identity_issuer = original_subject, original_issuer
        db.commit()
