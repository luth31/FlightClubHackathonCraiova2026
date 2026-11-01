from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.config import settings
from app.core.models import AuditEvent
from app.people.leave_routing import leave_routes
from app.people.models import Delegation, LeaveRequest, User, UserProfile
from app.people.service import can_review_department, can_review_leave
from conftest import login


@pytest.fixture
def coverage(client, db, monkeypatch):
    monkeypatch.setattr(settings, 'reference_date', date(2028, 6, 12))
    people = {uid: db.get(User, uid) for uid in ('admin','technical-head','technician','reviewer','hr','manager')}
    yield people
    db.rollback()


def absent(db, user, status='approved', start='2028-06-12', end='2028-06-16'):
    db.add(LeaveRequest(id='coverage-leave-'+uuid4().hex, user_id=user, starts_at=start, ends_at=end,
                        status=status, reason='Coverage test'))


def delegate(db, source='technical-head', target='reviewer', start='2028-06-12', end='2028-06-16', active=True):
    row = Delegation(id='coverage-delegation-'+uuid4().hex, from_user=source, to_user=target,
                     starts_at=start, ends_at=end, active=active, reason='Coverage test')
    db.add(row)
    return row


def reviewers(db, people, requester='technician'):
    return [route.reviewer.id for route in leave_routes(db, people[requester])]


def test_approved_absence_uses_delegate_and_explains_coverage(db, coverage):
    absent(db, 'technical-head'); delegate(db)
    assert reviewers(db, coverage) == ['reviewer']
    request = SimpleNamespace(user_id='technician')
    assert can_review_leave(db, coverage['reviewer'], request)
    assert not can_review_leave(db, coverage['technical-head'], request)
    assert leave_routes(db, coverage['technician'])[0].summary() == {
        'id':'reviewer','name':'Elena Popa','delegated_from_id':'technical-head',
        'delegated_from_name':'Sorin Pavel','via':'delegation'}


def test_dated_delegation_also_covers_other_unavailability(db, coverage):
    grant = delegate(db)
    assert reviewers(db, coverage) == ['reviewer']
    grant.active = False
    assert reviewers(db, coverage) == ['technical-head']


@pytest.mark.parametrize('start,end,active', [
    ('2028-06-01','2028-06-11',True), ('2028-06-13','2028-06-20',True),
    ('2028-06-12','2028-06-16',False),
])
def test_expired_future_or_revoked_grants_do_not_confer_authority(db, coverage, start, end, active):
    absent(db, 'technical-head'); delegate(db,start=start,end=end,active=active)
    assert reviewers(db, coverage) == ['admin']


def test_coverage_includes_boundary_days_and_returns_when_absence_ends(db, coverage, monkeypatch):
    absent(db,'technical-head'); delegate(db)
    monkeypatch.setattr(settings,'reference_date',date(2028,6,16))
    assert reviewers(db, coverage) == ['reviewer']
    monkeypatch.setattr(settings,'reference_date',date(2028,6,17))
    assert reviewers(db, coverage) == ['technical-head']


@pytest.mark.parametrize('status', ['pending','rejected'])
def test_unapproved_absence_does_not_reroute(db, coverage, status):
    absent(db,'technical-head',status=status)
    assert reviewers(db, coverage) == ['technical-head']


def test_present_chat_status_does_not_override_approved_absence(db, coverage):
    profile = db.get(UserProfile, 'technical-head')
    if profile is None:
        profile=UserProfile(user_id='technical-head',presence='available'); db.add(profile)
    profile.presence='available'
    absent(db,'technical-head')
    assert reviewers(db, coverage) == ['admin']


@pytest.mark.parametrize('unavailable', ['leave','inactive','foreign','requester','missing'])
def test_unavailable_or_invalid_delegate_escalates_original_reporting_line(db, coverage, unavailable):
    absent(db,'technical-head')
    target='reviewer'
    if unavailable=='leave': absent(db,target)
    if unavailable=='inactive': coverage[target].active=False
    if unavailable=='foreign': coverage[target].airport_id='other-airport'
    if unavailable=='requester': target='technician'
    if unavailable=='missing': target='missing-person'
    delegate(db,target=target)
    assert reviewers(db, coverage) == ['admin']
    assert leave_routes(db, coverage['technician'])[0].summary()['via']=='hierarchy'


def test_disabled_manager_escalates_without_using_stale_delegation(db, coverage):
    coverage['technical-head'].active=False; delegate(db)
    assert reviewers(db, coverage) == ['admin']


def test_delegation_chain_is_supported_but_cycles_do_not_grant_self_approval(db, coverage):
    absent(db,'technical-head'); absent(db,'reviewer')
    delegate(db); second=delegate(db,source='reviewer',target='hr')
    assert reviewers(db, coverage) == ['hr']
    second.to_user='technical-head'
    assert reviewers(db, coverage) == ['admin']
    absent(db,'admin')
    assert reviewers(db, coverage) == []


def test_director_absence_can_be_covered_without_granting_delegate_self_approval(db, coverage):
    absent(db,'admin'); delegate(db,source='admin',target='reviewer')
    assert reviewers(db, coverage, requester='technical-head') == ['reviewer']
    assert reviewers(db, coverage, requester='reviewer') == []
    assert reviewers(db, coverage, requester='admin') == ['reviewer']


def test_ordinary_reporting_manager_can_designate_a_replacement(client, db, coverage):
    manager=coverage['technician']
    report=User(id='coverage-report-'+uuid4().hex, name='Reporting colleague', email='report@example.test',
                department='Tehnic', department_id='dept-tehnic', role='employee', roles=['employee'],
                airport_id=manager.airport_id, manager_id=manager.id, active=True, password_hash='unused')
    db.add(report); db.commit()
    login(client,'technician')
    grant_id=None
    try:
        result=client.get('/api/people').json()
        assert result['can_manage_delegations']
        assert next(person for person in result['items'] if person['id']=='technician')['can_delegate_approvals']
        response=client.post('/api/people/delegations',json={
            'from_user':'technician','to_user':'reviewer','starts_at':'2028-06-12','ends_at':'2028-06-16','reason':'Replacement'})
        assert response.status_code==201,response.text
        grant_id=response.json()['id']
        assert not can_review_department(db,coverage['reviewer'],'Tehnic')
        assert client.post('/api/people/delegations',json={
            'from_user':'hr','to_user':'reviewer','starts_at':'2028-06-12','ends_at':'2028-06-16','reason':'Unauthorized'}).status_code==403
    finally:
        db.expire_all()
        if grant_id: db.delete(db.get(Delegation,grant_id))
        db.delete(report)
        db.commit()


def test_delegate_can_read_and_decide_only_covered_request_and_audit_names_principal(client, db, coverage):
    absent(db,'technical-head'); grant=delegate(db); db.commit()
    login(client,'technician')
    created=client.post('/api/people/leave',json={'starts_at':'2028-07-10','ends_at':'2028-07-14'})
    assert created.status_code==201,created.text
    item=created.json()
    login(client,'reviewer')
    try:
        entry=next(leave for leave in client.get('/api/people').json()['leaves'] if leave['id']==item['id'])
        assert entry['can_decide'] and entry['reviewers'][0]['delegated_from_id']=='technical-head'
        assert client.get(item['document_url']).status_code==200
        assert client.get('/api/documents/test-hr').status_code==404
        # Permission is rechecked at mutation time, not trusted from the rendered list.
        grant.active=False; db.commit()
        assert client.post(f"/api/people/leave/{item['id']}/decision",json={'action':'approve'}).status_code==403
        grant.active=True; db.commit()
        result=client.post(f"/api/people/leave/{item['id']}/decision",json={'action':'approve'})
        assert result.status_code==200,result.text
        assert result.json()['document_version']==2
        db.expire_all()
        assert db.get(LeaveRequest,item['id']).approver_id=='reviewer'
        audit=db.scalar(select(AuditEvent).where(AuditEvent.document_id==item['document_id'],AuditEvent.action=='leave_approved'))
        assert 'Sorin Pavel (technical-head)' in audit.detail and 'delegation' in audit.detail
    finally:
        db.delete(grant)
        for absence in db.scalars(select(LeaveRequest).where(LeaveRequest.user_id=='technical-head',LeaveRequest.reason=='Coverage test')):
            db.delete(absence)
        db.commit()
