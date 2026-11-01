from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from uuid import uuid4

import pytest
from conftest import login
from app.core.models import AuditEvent
from app.documents.models import Document
from app.reports.briefing import local_day


def test_airport_calendar_day_handles_utc_boundaries_and_plain_dates():
    assert local_day('2026-10-30T23:30:00Z') == date(2026, 10, 31)
    assert local_day('2026-10-30') == date(2026, 10, 30)
    assert local_day('2026-10-30T23:30:00') == date(2026, 10, 31)
    assert local_day(None) is None
    assert local_day('invalid') is None


@pytest.mark.parametrize('account', ['admin', 'reviewer', 'finance', 'hr', 'technician'])
def test_briefing_admission_and_report_previews_follow_account_permissions(client, account):
    login(client, account)
    response = client.get('/api/reports/briefing')
    assert response.status_code == 200, response.text
    data = response.json()
    today = datetime.now(ZoneInfo('Europe/Bucharest')).date().isoformat()
    assert data['date'] == today
    permitted = {r['id'] for r in client.get('/api/reports').json()['items']}
    assert {r['report']['id'] for r in data['reports']} == permitted
    for preview in data['reports']:
        report = client.get('/api/reports/' + preview['report']['id'], params={'as_of': today}).json()
        assert preview['total'] == report['total']
        assert preview['metrics'] == report['metrics']
    assert len(data['timeline']) == 30
    assert data['timeline'][-1]['date'] == today
    assert data['summary']['new_today'] == data['timeline'][-1]['documents']
    assert data['summary']['actions_today'] == data['timeline'][-1]['actions']
    document_ids = {r['id'] for r in data['analysis']['documents']}
    assert len(document_ids) == data['summary']['documents']
    assert all(t['document_id'] in document_ids for t in data['analysis']['tasks'])
    assert all(e['document_id'] in document_ids for e in data['analysis']['events'])
    if 'contracts' not in permitted:
        assert data['analysis']['contracts'] == []
    assert 'password_hash' not in response.text
    assert 'expected_iban' not in response.text
    if account == 'technician':
        assert data['summary']['contracts'] == 0
        assert data['summary']['people'] == 0
        assert 'test-hr' not in response.text


def test_briefing_department_filters_every_visible_section(admin):
    data = admin.get('/api/reports/briefing?department=Tehnic').json()
    assert all(p['department'] == 'Tehnic' for p in data['priorities'])
    assert all(d['department'] == 'Tehnic' for d in data['deadlines'])
    assert all(w['name'] == 'Tehnic' for w in data['workload'])
    assert all(r['department'] == 'Tehnic' for r in data['analysis']['documents'])
    assert all(r['department'] == 'Tehnic' for r in data['analysis']['tasks'])
    for preview in data['reports']:
        report = admin.get('/api/reports/' + preview['report']['id'], params={'department':'Tehnic', 'as_of':data['date']}).json()
        assert preview['total'] == report['total']
    empty = admin.get('/api/reports/briefing?department=Missing').json()
    assert empty['summary']['documents'] == 0
    assert empty['priorities'] == empty['deadlines'] == empty['workload'] == []
    assert all(p['total'] == 0 for p in empty['reports'])


def test_briefing_recalculates_current_deadlines_and_excludes_archived_or_unvalidated(admin, db):
    document = db.get(Document, 'test-contract')
    original = document.expires_at, document.status, document.validated
    today = datetime.now(ZoneInfo('Europe/Bucharest')).date()
    try:
        document.expires_at = (today + timedelta(days=2)).isoformat()
        document.status, document.validated = 'approved', True
        db.commit()
        data = admin.get('/api/reports/briefing').json()
        deadline = next(d for d in data['deadlines'] if d['id'] == document.id)
        assert deadline['remaining'] == 2
        detail = admin.get('/api/reports/contracts', params={'as_of':str(today)}).json()
        assert next(r for r in detail['rows'] if r['id']==document.id)['days_remaining'] == 2
        for status, validated in [('archived',True), ('approved',False)]:
            document.status, document.validated = status, validated
            db.commit()
            data = admin.get('/api/reports/briefing').json()
            assert document.id not in {d['id'] for d in data['deadlines']}
    finally:
        document.expires_at, document.status, document.validated = original
        db.commit()


def test_briefing_activity_never_includes_hidden_or_foreign_airport_documents(admin, db):
    before = admin.get('/api/reports/briefing').json()
    events = [AuditEvent(actor='Private actor', actor_id='hr', action='private-'+uuid4().hex,
        document_id=identifier, document_title='Private title', detail='Private details',
        airport_id=airport, created_at=datetime.now(ZoneInfo('Europe/Bucharest')).isoformat())
        for identifier, airport in [('test-hr','dunarea'), ('test-contract','other-airport')]]
    try:
        db.add_all(events); db.commit()
        after = admin.get('/api/reports/briefing').json()
        assert after['summary']['actions_today'] == before['summary']['actions_today']
        assert after['timeline'] == before['timeline']
        assert after['analysis']['events'] == before['analysis']['events']
        assert 'Private title' not in str(after)
    finally:
        for event in events: db.delete(event)
        db.commit()


def test_briefing_requires_authentication(client):
    client.post('/api/auth/logout')
    assert client.get('/api/reports/briefing').status_code == 401
