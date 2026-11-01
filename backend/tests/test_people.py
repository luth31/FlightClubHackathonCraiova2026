from conftest import login
from app.people.models import User, Session, Delegation
from app.people.service import can_review_department
from sqlalchemy import select


def test_directory_does_not_expose_passwords_or_unrelated_leave(client):
    login(client, 'technician')
    result = client.get('/api/people').json()
    assert result['total'] >= 6
    assert not result['can_manage_accounts']
    assert all('password_hash' not in p for p in result['items'])
    assert all(item['user_id'] == 'technician' for item in result['leaves'])


def test_leave_requires_independent_reviewer(client):
    login(client, 'technician')
    payload = {'starts_at': '2026-12-07', 'ends_at': '2026-12-09', 'reason': 'Concediu de odihnă'}
    created = client.post('/api/people/leave', json=payload)
    assert created.status_code == 201, created.text
    leave_id = created.json()['id']
    assert client.post(f'/api/people/leave/{leave_id}/decision', json={'action': 'approve'}).status_code == 403
    login(client, 'hr')
    assert client.post(f'/api/people/leave/{leave_id}/decision', json={'action': 'reject'}).status_code == 422
    assert client.post(f'/api/people/leave/{leave_id}/decision', json={'action': 'approve'}).status_code == 200
    assert client.post(f'/api/people/leave/{leave_id}/decision', json={'action': 'approve'}).status_code == 409


def test_invalid_leave_date_and_overlapping_requests(client):
    login(client, 'finance')
    assert client.post('/api/people/leave', json={'starts_at': '2026-12-12', 'ends_at': '2026-12-11'}).status_code == 422
    payload = {'starts_at': '2026-12-01', 'ends_at': '2026-12-02'}
    assert client.post('/api/people/leave', json=payload).status_code == 201
    assert client.post('/api/people/leave', json=payload).status_code == 409


def test_delegation_cannot_grant_signing_or_outlive_interval(admin, db):
    manager, reviewer = db.get(User, 'manager'), db.get(User, 'reviewer')
    delegation = Delegation(id='test-expired-delegation', from_user=manager.id, to_user=reviewer.id,
        starts_at='2026-01-01', ends_at='2026-01-02', reason='Expired', active=True)
    db.add(delegation); db.commit()
    assert not can_review_department(db, reviewer, 'Financiar')
    assert 'signer' not in reviewer.roles
    result = admin.post('/api/people/delegations', json={'from_user': 'manager', 'to_user': 'technician',
        'starts_at': '2026-12-01', 'ends_at': '2026-12-02', 'reason': 'Invalid delegation'})
    assert result.status_code == 422


def test_deactivation_removes_sessions_and_revokes_delegation(admin, db):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as other:
        login(other, 'finance')
        assert other.get('/api/documents').status_code == 200
        try:
            assert admin.patch('/api/people/finance', json={'active': False}).status_code == 200
            assert other.get('/api/documents').status_code == 401
            assert other.post('/api/auth/login', json={'user_id':'finance','password':'FlyLeaf2026!'}).status_code == 401
        finally:
            assert admin.patch('/api/people/finance', json={'active': True}).status_code == 200


def test_non_admin_cannot_deactivate_accounts(client):
    login(client, 'technician')
    assert client.patch('/api/people/manager', json={'active': False}).status_code == 403


def test_attendance_visibility_matches_enforced_nfc_permission(client):
    for username, allowed in [('admin', True), ('technician', True), ('hr', False), ('finance', False)]:
        login(client, username)
        directory = client.get('/api/people').json()
        operations = client.get('/api/operations').json()
        assert directory['can_record_attendance'] is allowed
        assert operations['permissions']['can_control'] is allowed
        if not allowed:
            response = client.post('/api/operations/nfc', json={'card_id': 'DEMO-NFC-101'})
            assert response.status_code == 403


def test_card_endpoint_records_attendance_once_and_links_it_to_the_ledger(admin):
    from uuid import uuid4
    reset = admin.post('/api/operations/control', json={'action': 'reset', 'scenario_mode': 'interactive'})
    assert reset.status_code == 200, reset.text
    body = {'card_id': 'demo-nfc-101', 'action': 'check_in', 'request_id': str(uuid4())}
    first = admin.post('/api/operations/nfc', json=body)
    assert first.status_code == 200, first.text
    repeated = admin.post('/api/operations/nfc', json=body)
    assert repeated.status_code == 200
    assert first.json()['event_count'] == repeated.json()['event_count']
    attendance = [event for event in first.json()['events'] if event['kind'] == 'nfc_check_in' and event['staff_id'] == 'staff-agent-a']
    assert len(attendance) == 1
    assert attendance[0]['source'] == 'operator'
    ledger = admin.get('/api/operations/ledger', params={'scope': 'current', 'run_id': first.json()['simulation']['run_id']})
    assert ledger.status_code == 200
    assert attendance[0]['id'] in ledger.text
    checkout = admin.post('/api/operations/nfc', json={'card_id': 'DEMO-NFC-101', 'action': 'check_out', 'request_id': str(uuid4())})
    assert checkout.status_code == 200
    assert not next(person for person in checkout.json()['staff'] if person['id'] == 'staff-agent-a')['present']
