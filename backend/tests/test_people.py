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
            assert other.post('/api/auth/login', json={'user_id':'finance','password':'AeroDesk2026!'}).status_code == 401
        finally:
            assert admin.patch('/api/people/finance', json={'active': True}).status_code == 200


def test_non_admin_cannot_deactivate_accounts(client):
    login(client, 'technician')
    assert client.patch('/api/people/manager', json={'active': False}).status_code == 403
