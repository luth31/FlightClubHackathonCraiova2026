from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from conftest import login
from app.config import settings
from app.core.models import AuditEvent
from app.renewals.models import ContractRenewal, RenewalReminder
from app.renewals.service import sync_all
from app.tasks.models import WorkflowTask
from test_personal_workspace import document


def detail(client, doc):
    response = client.get('/api/documents/' + doc.id)
    assert response.status_code == 200, response.text
    return response.json()


def update(client, doc, action, **fields):
    current = detail(client, doc)
    personal = action in ('snooze', 'clear_reminder')
    return client.post(f'/api/documents/{doc.id}/follow-up', json={
        'action': action, 'version': current['version'],
        'revision': current['follow_up']['reminder_revision' if personal else 'decision_revision'], **fields})


def actions(client, doc):
    return [a for a in client.get('/api/workspace/home').json()['actions'] if a.get('document_id') == doc.id]


def test_date_ranges_are_inclusive_and_ordering_precedes_pagination(client, db):
    owner = 'Dates ' + uuid4().hex
    docs = [document(db, owner=owner, created_at=created, expires_at=expiry, value=value)
        for created, expiry, value in [
            ('2026-09-30T23:59:00', '2026-12-01', 100),
            ('2026-10-01T00:00:00', '2026-12-02', 25),
            ('2026-10-02T23:59:59', '2026-12-03', 9),
            ('2026-10-03T00:00:00', None, None)]]
    login(client)
    result = client.get('/api/workspace/documents', params={'owner': owner,
        'created_from': '2026-10-01', 'created_to': '2026-10-02',
        'expires_from': '2026-12-02', 'expires_to': '2026-12-03', 'sort_by': 'created_at', 'sort_order': 'asc'}).json()
    assert [d['id'] for d in result['items']] == [docs[1].id, docs[2].id]
    for direction, expected in [('asc', [2, 1, 0, 3]), ('desc', [0, 1, 2, 3])]:
        ids = []
        for offset in (0, 2):
            page = client.get('/api/workspace/documents', params={'owner': owner,
                'sort_by': 'value', 'sort_order': direction, 'offset': offset, 'limit': 2}).json()
            ids += [d['id'] for d in page['items']]
        assert ids == [docs[i].id for i in expected]
    result = client.get('/api/workspace/documents', params={'owner': owner, 'sort_by': 'expires_at', 'sort_order': 'desc'}).json()
    assert [d['id'] for d in result['items']] == [docs[i].id for i in (2, 1, 0, 3)]


@pytest.mark.parametrize('query', [
    {'created_from':'2026-11-03','created_to':'2026-11-01'}, {'expires_from':'2026-02-30'},
    {'expires_from':'2026-11-03','expires_to':'2026-11-01'}, {'sort_by':'password_hash'},
    {'sort_order':'invalid'}, {'metadata_value':'value without a key'},
])
def test_invalid_filters_are_rejected(client, query):
    login(client)
    assert client.get('/api/workspace/documents', params=query).status_code == 422


def test_metadata_filtering_respects_field_visibility_and_airport_scope(client, db):
    owner = 'Metadata ' + uuid4().hex
    doc = document(db, owner=owner, category='Raport de mentenanță', department='Tehnic',
        extra={'metadata':{'equipment_id':'BB-02', 'supplier_iban':'SecretAccount'}})
    document(db, owner=owner, department='Resurse umane', confidentiality='restricted',
        extra={'metadata':{'hr_private_key':'hidden'}})
    document(db, owner=owner, airport_id='other-airport', extra={'metadata':{'foreign_key':'hidden'}})
    login(client, 'technician')
    result = client.get('/api/workspace/documents', params={'owner': owner, 'metadata_key':'equipment_id', 'metadata_value':'bb-02', 'validated':'yes'}).json()
    assert [item['id'] for item in result['items']] == [doc.id]
    assert not {'hr_private_key', 'foreign_key', 'supplier_iban'} & set(result['facets']['metadata_keys'])
    assert client.get('/api/workspace/documents', params={'owner': owner, 'metadata_key':'supplier_iban'}).json()['total'] == 0


def test_personal_snooze_persists_and_does_not_hide_other_users_or_approval_tasks(client, db, monkeypatch):
    doc = document(db, owner_id='admin', created_by='manager', expires_at=str(settings.reference_date + timedelta(days=10)))
    db.add(WorkflowTask(id='task-' + doc.id, document_id=doc.id, document_version=1, type='signature', status='pending',
        assigned_to='admin', due_date=str(settings.reference_date), created_at='2026-10-01', updated_at='2026-10-01'))
    db.commit(); login(client)
    due = settings.reference_date + timedelta(days=2)
    response = update(client, doc, 'snooze', remind_on=str(due))
    assert response.status_code == 200, response.text
    assert response.json()['snoozed']
    assert [a['type'] for a in actions(client, doc)] == ['signature']
    login(client, 'manager')
    assert not detail(client, doc)['follow_up']['snoozed']
    assert any(a['type'] == 'expiry' for a in actions(client, doc))
    login(client)
    assert detail(client, doc)['follow_up']['remind_on'] == str(due)
    monkeypatch.setattr(settings, 'reference_date', due)
    assert any(a['type'] == 'reminder' and a['due_date'] == str(due) for a in actions(client, doc))
    assert update(client, doc, 'clear_reminder').status_code == 200
    assert any(a['type'] == 'expiry' for a in actions(client, doc))


def test_reminder_validation_and_concurrent_updates(client, db):
    doc = document(db); login(client)
    assert update(client, doc, 'snooze', remind_on=str(settings.reference_date)).status_code == 422
    assert update(client, doc, 'snooze').status_code == 422
    payload = {'action':'snooze','version':1,'revision':0,'remind_on':str(settings.reference_date + timedelta(days=2))}
    assert client.post(f'/api/documents/{doc.id}/follow-up', json=payload).status_code == 200
    assert client.post(f'/api/documents/{doc.id}/follow-up', json=payload).status_code == 409
    login(client, 'technician')
    assert client.post(f'/api/documents/{doc.id}/follow-up', json=payload).status_code == 404


def test_nonrenewal_stops_followup_for_everyone_without_changing_document_and_can_resume(client, db, monkeypatch):
    doc = document(db, owner_id='admin', created_by='manager', expires_at=str(settings.reference_date + timedelta(days=70)))
    login(client); sync_all(); db.expire_all()
    case = db.scalar(select(ContractRenewal).where(ContractRenewal.contract_id == doc.id))
    old_revision = case.revision
    response = update(client, doc, 'do_not_renew', responsible_id='manager', reason='Serviciul nu mai este necesar aeroportului.')
    assert response.status_code == 200, response.text
    result = detail(client, doc)
    assert result['follow_up']['decision']['responsible_id'] == 'manager'
    assert result['expires_at'] == doc.expires_at and result['status'] == 'approved' and result['version'] == 1
    assert not actions(client, doc)
    monkeypatch.setattr(settings, 'reference_date', settings.reference_date + timedelta(days=45))
    sync_all(); db.expire_all()
    assert not db.get(RenewalReminder, (case.id, 60)).triggered_at
    login(client, 'manager')
    assert not actions(client, doc)
    assert case.id not in [r['id'] for r in client.get('/api/contract-renewals').json()['items']]
    closed = client.get('/api/contract-renewals?status=closed').json()['items']
    assert next(r for r in closed if r['id'] == case.id)['status'] == 'not_renewing'
    assert client.post(f'/api/contract-renewals/{case.id}/acknowledge', json={'revision':old_revision}).status_code == 409
    assert update(client, doc, 'resume_renewal', reason='Decizia este revizuită; serviciul continuă.').status_code == 200
    assert actions(client, doc)
    sync_all(); db.expire_all()
    assert db.get(RenewalReminder, (case.id, 60)).triggered_at
    assert db.scalar(select(AuditEvent).where(AuditEvent.document_id == doc.id, AuditEvent.action == 'Contractul nu se reînnoiește'))


def test_nonrenewal_requires_authority_reason_and_valid_responsible(client, db):
    doc = document(db, expires_at=str(settings.reference_date + timedelta(days=10)))
    login(client, 'finance')
    assert update(client, doc, 'do_not_renew', responsible_id='manager', reason='Serviciul este oprit în acest an.').status_code == 403
    login(client)
    assert update(client, doc, 'do_not_renew', responsible_id='manager', reason='scurt').status_code == 422
    assert update(client, doc, 'do_not_renew', responsible_id='technician', reason='Serviciul este oprit în acest an.').status_code == 422
    assert update(client, doc, 'do_not_renew', reason='Serviciul este oprit în acest an.').status_code == 422


def test_source_changes_invalidate_snooze_and_nonrenewal_and_archive_removes_alerts(client, db):
    doc = document(db, owner_id='admin', expires_at=str(settings.reference_date + timedelta(days=10)))
    login(client)
    assert update(client, doc, 'snooze', remind_on=str(settings.reference_date + timedelta(days=2))).status_code == 200
    assert update(client, doc, 'do_not_renew', responsible_id='manager', reason='Contractul va fi înlocuit de o achiziție nouă.').status_code == 200
    db.expire_all(); doc.expires_at = str(settings.reference_date + timedelta(days=20)); db.commit()
    current = detail(client, doc)['follow_up']
    assert not current['snoozed'] and not current['not_renewing']
    assert actions(client, doc)
    result = client.post(f'/api/documents/{doc.id}/actions', json={'action':'archive', 'version':1, 'comment':'Ieșit din circuitul activ.'})
    assert result.status_code == 200, result.text
    assert not actions(client, doc)
    assert not detail(client, doc)['follow_up']['can_remind']
    assert update(client, doc, 'snooze', remind_on=str(settings.reference_date + timedelta(days=3))).status_code == 409
    assert detail(client, doc)['versions']


def test_new_document_version_never_inherits_old_alert_suppression(client, db):
    doc = document(db, expires_at=str(settings.reference_date + timedelta(days=10)))
    login(client)
    assert update(client, doc, 'snooze', remind_on=str(settings.reference_date + timedelta(days=3))).status_code == 200
    assert update(client, doc, 'do_not_renew', responsible_id='manager', reason='Contractul urmează să fie înlocuit.').status_code == 200
    response = client.patch('/api/documents/' + doc.id, json={'title':'Contract actualizat pentru verificare'})
    assert response.status_code == 200, response.text
    current = response.json()
    assert current['version'] == 2
    assert not current['follow_up']['snoozed'] and not current['follow_up']['not_renewing']
    stale = client.post(f'/api/documents/{doc.id}/follow-up', json={'action':'snooze','version':1,'revision':1,
        'remind_on':str(settings.reference_date + timedelta(days=4))})
    assert stale.status_code == 409
