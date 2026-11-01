from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.people.models import Department, LeaveRequest, User
from app.people.service import can_review_leave
from conftest import login


@pytest.fixture
def hierarchy(client, db):
    people = {uid: db.get(User, uid) for uid in ('admin', 'hr', 'technician', 'technical-head', 'manager', 'finance', 'reviewer')}
    yield people
    db.rollback()


def test_only_immediate_manager_has_decision_authority(db, hierarchy):
    request = SimpleNamespace(user_id='technician')
    for uid, person in hierarchy.items():
        assert can_review_leave(db, person, request) is (uid == 'technical-head')
    # Authority follows the relationship, even without a reviewer role or head appointment.
    hierarchy['technician'].manager_id = 'finance'
    hierarchy['finance'].roles = ['employee']
    assert can_review_leave(db, hierarchy['finance'], request)
    assert not can_review_leave(db, hierarchy['technical-head'], request)


def test_fallback_head_then_director_and_top_level_self_approval(db, hierarchy):
    hierarchy['technician'].manager_id = None
    assert can_review_leave(db, hierarchy['technical-head'], SimpleNamespace(user_id='technician'))
    assert not can_review_leave(db, hierarchy['technician'], SimpleNamespace(user_id='technician'))
    hierarchy['technical-head'].manager_id = None
    assert can_review_leave(db, hierarchy['admin'], SimpleNamespace(user_id='technical-head'))
    assert not can_review_leave(db, hierarchy['technical-head'], SimpleNamespace(user_id='technical-head'))
    assert can_review_leave(db, hierarchy['admin'], SimpleNamespace(user_id='admin'))
    # A director with an explicitly assigned superior is no longer top-level.
    hierarchy['admin'].manager_id = 'technical-head'
    assert not can_review_leave(db, hierarchy['admin'], SimpleNamespace(user_id='admin'))
    assert can_review_leave(db, hierarchy['technical-head'], SimpleNamespace(user_id='admin'))


@pytest.mark.parametrize('invalid', ['inactive', 'foreign', 'missing', 'self'])
def test_invalid_reporting_links_never_allow_self_approval(db, hierarchy, invalid):
    if invalid == 'inactive': hierarchy['technical-head'].active = False
    if invalid == 'foreign': hierarchy['technical-head'].airport_id = 'other-airport'
    if invalid == 'missing': hierarchy['technician'].manager_id = 'missing-person'
    if invalid == 'self': hierarchy['technician'].manager_id = 'technician'
    assert not can_review_leave(db, hierarchy['technician'], SimpleNamespace(user_id='technician'))
    assert not can_review_leave(db, hierarchy['technical-head'], SimpleNamespace(user_id='technician'))


def test_no_manager_or_department_does_not_make_an_employee_top_level(db, hierarchy):
    hierarchy['technician'].manager_id = None
    hierarchy['technician'].department_id = None
    assert not can_review_leave(db, hierarchy['technician'], SimpleNamespace(user_id='technician'))
    assert can_review_leave(db, hierarchy['admin'], SimpleNamespace(user_id='technician'))


def test_top_level_can_approve_own_request_with_pdf_and_one_decision(client, db):
    login(client, 'admin')
    created = client.post('/api/people/leave', json={'starts_at':'2028-02-07', 'ends_at':'2028-02-11'})
    assert created.status_code == 201, created.text
    leave_id = created.json()['id']
    entry = next(item for item in client.get('/api/people').json()['leaves'] if item['id'] == leave_id)
    assert entry['can_decide']
    assert entry['reviewers'] == [{'id':'admin', 'name':'Ana Ionescu'}]
    decision = client.post(f'/api/people/leave/{leave_id}/decision', json={'action':'approve'})
    assert decision.status_code == 200, decision.text
    assert decision.json()['document_version'] == 2
    assert db.get(LeaveRequest, leave_id).approver_id == 'admin'
    assert client.post(f'/api/people/leave/{leave_id}/decision', json={'action':'approve'}).status_code == 409


def test_calendar_shares_only_local_non_rejected_dates(client, db):
    login(client, 'technician')
    other = User(id='calendar-foreign-'+uuid4().hex, name='Foreign colleague', email='foreign@example.test',
                 department='Tehnic', role='employee', roles=['employee'], airport_id='other-airport',
                 active=True, password_hash='unused')
    db.add(other)
    requests = [LeaveRequest(id='calendar-'+uuid4().hex, user_id=uid, starts_at='2028-04-03', ends_at='2028-04-07',
                            reason='Private leave reason', status=status)
                for uid, status in [('finance', 'pending'), ('finance', 'approved'), ('finance', 'rejected'), (other.id, 'approved')]]
    db.add_all(requests); db.commit()
    try:
        result = client.get('/api/people').json()
        entries = {item['id']:item for item in result['leave_calendar']}
        assert requests[0].id in entries and requests[1].id in entries
        assert requests[2].id not in entries and requests[3].id not in entries
        assert set(entries[requests[0].id]) == {'id','user_id','name','department','starts_at','ends_at','status'}
        assert all(item['id'] not in {r.id for r in requests} for item in result['leaves'])
    finally:
        for request in requests: db.delete(request)
        db.delete(other); db.commit()
