import asyncio
import hashlib
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, inspect, select

from conftest import login
from app.config import settings
from app.core.models import AuditEvent
from app.database import SessionLocal, engine
from app.documents.models import Document, DocumentVersion
from app.main import app
from app.people.models import Delegation, User
from app.renewals import service as renewal_service
from app.renewals.models import ContractRenewal, RenewalEvent, RenewalReminder
from app.renewals.service import sync_all
from app.tasks.models import TaskEvent, WorkflowTask
from test_workflows import act, approved


BASE = '/api/contract-renewals'


def columns(record):
    return {column.key: getattr(record, column.key) for column in inspect(record).mapper.columns}


@pytest.fixture
def contract_factory(admin, pdf_bytes, tmp_path):
    ids = []

    def create(days=60, **overrides):
        document_id = f'renewal-test-{uuid.uuid4().hex}'
        path = tmp_path / f'{document_id}.pdf'
        path.write_bytes(pdf_bytes)
        with SessionLocal() as db:
            department = db.get(User, 'manager').department
            fields = dict(id=document_id, title='Contract renewal test', number=document_id,
                category='Contract', department=department, status='approved',
                created_at='2026-10-01T10:00:00', updated_at='2026-10-01T10:00:00',
                expires_at=(settings.reference_date + timedelta(days=days)).isoformat(),
                supplier='Example Supplier', value=1000, currency='RON', owner='Elena Popa',
                created_by='seed', confidentiality='internal', summary='Renewal test',
                searchable_text='', version=1, validated=True, airport_id=settings.airport_id,
                extra={'metadata': {'supplier_iban': 'Original account'}})
            fields.update(overrides)
            document = Document(**fields)
            db.add(document)
            db.flush()
            db.add(DocumentVersion(id=f'{document_id}-v1', document_id=document_id, version=1,
                file_path=str(path), filename=path.name, sha256=hashlib.sha256(pdf_bytes).hexdigest(),
                created_at='2026-10-01T10:00:00', created_by='seed', comment='Original contract',
                snapshot=fields.copy(), approved_by='admin', approved_at='2026-10-01T11:00:00'))
            db.commit()
        ids.append(document_id)
        return document_id

    create.ids = ids
    yield create

    # Remove only documents created by these tests
    with SessionLocal() as db:
        renewal_ids = list(db.scalars(select(ContractRenewal.id).where(ContractRenewal.contract_id.in_(ids))))
        task_ids = list(db.scalars(select(WorkflowTask.id).where(WorkflowTask.document_id.in_(ids))))
        db.execute(delete(RenewalEvent).where(RenewalEvent.renewal_id.in_(renewal_ids)))
        db.execute(delete(RenewalReminder).where(RenewalReminder.renewal_id.in_(renewal_ids)))
        db.execute(delete(ContractRenewal).where(ContractRenewal.id.in_(renewal_ids)))
        db.execute(delete(TaskEvent).where(TaskEvent.task_id.in_(task_ids)))
        db.execute(delete(WorkflowTask).where(WorkflowTask.id.in_(task_ids)))
        db.execute(delete(AuditEvent).where(AuditEvent.document_id.in_(ids)))
        db.execute(delete(DocumentVersion).where(DocumentVersion.document_id.in_(ids)))
        db.execute(delete(Document).where(Document.id.in_(ids)))
        db.commit()


def get_case(client, document_id):
    response = client.get(BASE, params={'status': 'all'})
    assert response.status_code == 200, response.text
    return next(item for item in response.json()['items'] if item['contract_id'] == document_id)


def synchronize(client, document_id):
    response = client.post(f'{BASE}/synchronize')
    assert response.status_code == 200, response.text
    return get_case(client, document_id)


def action(client, item, name, **payload):
    return client.post(f'{BASE}/{item["id"]}/{name}', json={'revision': item['revision'], **payload})


def acknowledge_assigned(client, item):
    login(client, item['assigned_to'])
    response = action(client, item, 'acknowledge')
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize('days,triggered', [
    (91, None), (90, {90}), (61, {90}), (60, {90, 60}),
    (31, {90, 60}), (30, {90, 60, 30}), (-1, {90, 60, 30}),
])
def test_thresholds_and_expired_contracts(admin, contract_factory, days, triggered):
    document_id = contract_factory(days)
    sync_all()
    response = admin.get(BASE, params={'status': 'all'})
    assert response.status_code == 200, response.text
    matching = [item for item in response.json()['items'] if item['contract_id'] == document_id]
    if triggered is None:
        assert matching == []
        return
    item, = matching
    assert item['days_remaining'] == days
    assert item['assigned_to'] == 'manager'
    assert item['due_date'] == (settings.reference_date + timedelta(days=days - 30)).isoformat()
    assert {reminder['threshold_days'] for reminder in item['reminders']} == {90, 60, 30}
    assert {reminder['threshold_days'] for reminder in item['reminders'] if reminder['triggered_at']} == triggered
    for reminder in item['reminders']:
        assert reminder['due_date'] == (settings.reference_date + timedelta(days=days - reminder['threshold_days'])).isoformat()


def test_time_progression_is_persistent_and_sync_does_not_duplicate(admin, contract_factory, monkeypatch):
    original_date = settings.reference_date
    document_id = contract_factory(90)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda _: sync_all(), range(3)))
    first = get_case(admin, document_id)
    first_trigger = next(r['triggered_at'] for r in first['reminders'] if r['threshold_days'] == 90)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda _: sync_all(), range(3)))
    unchanged = get_case(admin, document_id)
    assert unchanged['id'] == first['id']
    assert unchanged['history'] == first['history']
    assert unchanged['reminders'] == first['reminders']
    monkeypatch.setattr(settings, 'reference_date', original_date + timedelta(days=30))
    second = synchronize(admin, document_id)
    assert second['days_remaining'] == 60
    assert next(r['triggered_at'] for r in second['reminders'] if r['threshold_days'] == 90) == first_trigger
    assert {r['threshold_days'] for r in second['reminders'] if r['triggered_at']} == {90, 60}
    monkeypatch.setattr(settings, 'reference_date', original_date + timedelta(days=60))
    third = synchronize(admin, document_id)
    assert {r['threshold_days'] for r in third['reminders'] if r['triggered_at']} == {90, 60, 30}
    with SessionLocal() as db:
        assert len(list(db.scalars(select(ContractRenewal).where(ContractRenewal.contract_id == document_id)))) == 1
        assert len(list(db.scalars(select(RenewalReminder).where(RenewalReminder.renewal_id == first['id'])))) == 3


@pytest.mark.parametrize('changes', [
    {'category': 'Procedură'}, {'status': 'draft'}, {'status': 'in_review'},
    {'status': 'archived'}, {'validated': False}, {'expires_at': None},
    {'expires_at': 'invalid-date'}, {'airport_id': 'another-airport'},
])
def test_only_current_validated_approved_contracts_enter_the_queue(admin, contract_factory, changes):
    document_id = contract_factory(**changes)
    sync_all()
    with SessionLocal() as db:
        assert db.scalar(select(ContractRenewal).where(ContractRenewal.contract_id == document_id)) is None


def test_gets_are_read_only_and_return_scoped_counts(admin, contract_factory):
    document_id = contract_factory(-1)
    item = synchronize(admin, document_id)
    writes = []

    def record_write(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE', 'REPLACE')):
            writes.append(statement)

    event.listen(engine, 'before_cursor_execute', record_write)
    try:
        first = admin.get(BASE, params={'status': 'open'})
        detail = admin.get(f'{BASE}/{item["id"]}')
        second = admin.get(BASE, params={'status': 'open'})
    finally:
        event.remove(engine, 'before_cursor_execute', record_write)
    assert first.status_code == detail.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert detail.json()['reminders'] == item['reminders']
    assert writes == []
    payload = first.json()
    assert payload['total'] == len(payload['items'])
    assert payload['counters']['open'] == payload['total']
    assert payload['counters']['overdue'] == sum(record['overdue'] for record in payload['items'])
    assert payload['reference_date'] == settings.reference_date.isoformat()


def test_assignment_is_required_even_for_director_and_approval_delegate(admin, contract_factory):
    document_id = contract_factory()
    item = synchronize(admin, document_id)
    assert item['assigned_to'] == 'manager'
    assert item['can_reassign'] and not item['can_acknowledge']
    assert 'reviewer' not in {person['id'] for person in item['eligible_assignees']}
    assert action(admin, item, 'acknowledge').status_code == 403
    login(admin, 'reviewer')
    # Current permissions do not expose this procurement contract to the compliance reviewer.
    assert action(admin, item, 'acknowledge').status_code == 404
    assert action(admin, item, 'assign', assigned_to='reviewer', comment='Delegated approval is separate').status_code == 404
    assert admin.post(f'{BASE}/synchronize').status_code == 403
    login(admin)
    for target in ('reviewer', 'technician', 'missing-user'):
        assert action(admin, item, 'assign', assigned_to=target, comment='Invalid renewal owner').status_code == 422
    acknowledged = acknowledge_assigned(admin, item)
    assert acknowledged['status'] == 'acknowledged'
    assert acknowledged['acknowledged_by'] == 'manager'


def test_progress_close_reasons_revisions_and_history(admin, contract_factory):
    document_id = contract_factory()
    item = synchronize(admin, document_id)
    login(admin, 'manager')
    assert action(admin, item, 'progress', comment='Contact supplier').status_code == 409
    assert action(admin, item, 'close', comment='Contract remains unchanged').status_code == 409
    acknowledged = acknowledge_assigned(admin, item)
    assert action(admin, item, 'progress', comment='Old revision').status_code == 409
    repeated = action(admin, acknowledged, 'acknowledge')
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()['history'] == acknowledged['history']
    assert action(admin, acknowledged, 'progress', comment='  ').status_code == 422
    assert action(admin, acknowledged, 'close', comment='Done').status_code == 422
    assert action(admin, acknowledged, 'close', comment='                 ').status_code == 422
    next_due = (settings.reference_date + timedelta(days=10)).isoformat()
    progressed = action(admin, acknowledged, 'progress', comment='Supplier asked for a quotation', next_due_date=next_due)
    assert progressed.status_code == 200, progressed.text
    progressed = progressed.json()
    assert progressed['status'] == 'in_progress' and progressed['due_date'] == next_due
    assert progressed['revision'] > acknowledged['revision']
    closed = action(admin, progressed, 'close', comment='Tracking concluded after documented internal review')
    assert closed.status_code == 200, closed.text
    closed = closed.json()
    assert closed['status'] == 'completed' and closed['closed_by'] == 'manager'
    assert closed['closed_at'] and not closed['can_progress'] and not closed['can_close']
    comments = {record['comment'] for record in closed['history']}
    assert any('Supplier asked for a quotation' in comment for comment in comments)
    assert 'Tracking concluded after documented internal review' in comments
    assert action(admin, closed, 'progress', comment='Cannot reopen completed tracking').status_code == 409
    login(admin)
    sync_all()
    persisted = get_case(admin, document_id)
    assert persisted['status'] == 'completed' and persisted['history'] == closed['history']
    assert not any(record['contract_id'] == document_id for record in admin.get(BASE).json()['items'])


def test_reassignment_retains_history_resets_acknowledgement_and_changes_authority(admin, contract_factory):
    document_id = contract_factory()
    original = synchronize(admin, document_id)
    acknowledged = acknowledge_assigned(admin, original)
    login(admin)
    assert action(admin, acknowledged, 'assign', assigned_to='admin', comment=' ').status_code == 422
    assert action(admin, acknowledged, 'assign', assigned_to='admin', comment='Take responsibility', due_date='not-a-date').status_code == 422
    due_date = (settings.reference_date + timedelta(days=5)).isoformat()
    response = action(admin, acknowledged, 'assign', assigned_to='admin', comment='Director takes responsibility', due_date=due_date)
    assert response.status_code == 200, response.text
    reassigned = response.json()
    assert reassigned['assigned_to'] == 'admin' and reassigned['status'] == 'pending'
    assert reassigned['acknowledged_by'] is None and reassigned['acknowledged_at'] is None
    assert reassigned['due_date'] == due_date and reassigned['revision'] > acknowledged['revision']
    assert {record['id'] for record in acknowledged['history']} <= {record['id'] for record in reassigned['history']}
    assert action(admin, acknowledged, 'acknowledge').status_code == 409
    login(admin, 'manager')
    assert action(admin, reassigned, 'acknowledge').status_code == 403
    login(admin)
    assert action(admin, reassigned, 'acknowledge').status_code == 200


@pytest.mark.parametrize('change', ['expires_at', 'version', 'status', 'validated'])
def test_changed_source_is_read_only_then_cancelled_without_losing_history(admin, contract_factory, change):
    document_id = contract_factory()
    original = synchronize(admin, document_id)
    acknowledged = acknowledge_assigned(admin, original)
    login(admin)
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        if change == 'version':
            source = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == document_id))
            version = columns(source)
            version.update(id=f'{document_id}-v2', version=2)
            db.add(DocumentVersion(**version))
            document.version = 2
        elif change == 'expires_at':
            document.expires_at = (settings.reference_date + timedelta(days=80)).isoformat()
        elif change == 'status':
            document.status = 'archived'
        else:
            document.validated = False
        db.commit()
    stale = admin.get(f'{BASE}/{original["id"]}')
    assert stale.status_code == 200, stale.text
    assert not stale.json()['source_current']
    assert not stale.json()['can_acknowledge'] and not stale.json()['can_close']
    login(admin, 'manager')
    assert action(admin, acknowledged, 'progress', comment='Cannot alter stale source').status_code == 409
    sync_all()
    cancelled = admin.get(f'{BASE}/{original["id"]}').json()
    assert cancelled['status'] == 'cancelled'
    assert {record['id'] for record in acknowledged['history']} <= {record['id'] for record in cancelled['history']}
    with SessionLocal() as db:
        cases = list(db.scalars(select(ContractRenewal).where(ContractRenewal.contract_id == document_id)))
        assert len(cases) == (2 if change in ('version', 'expires_at') else 1)


def test_inaccessible_cases_are_hidden_and_api_requires_login(admin, contract_factory):
    document_id = contract_factory()
    item = synchronize(admin, document_id)
    login(admin, 'technician')
    assert admin.get(f'{BASE}/{item["id"]}').status_code == 404
    assert action(admin, item, 'acknowledge').status_code == 404
    assert document_id not in {record['contract_id'] for record in admin.get(BASE).json()['items']}
    login(admin, 'hr')
    assert admin.get(f'{BASE}/{item["id"]}').status_code == 404
    assert admin.get(f'{BASE}/missing-renewal').status_code == 404
    login(admin)
    with SessionLocal() as db:
        db.get(Document, document_id).airport_id = 'another-airport'
        db.get(ContractRenewal, item['id']).airport_id = 'another-airport'
        db.commit()
    assert admin.get(f'{BASE}/{item["id"]}').status_code == 404
    assert action(admin, item, 'assign', assigned_to='admin', comment='Foreign case').status_code == 404
    with TestClient(app) as anonymous:
        assert anonymous.get(BASE).status_code == 401
        assert anonymous.post(f'{BASE}/synchronize').status_code == 401


def test_hr_contracts_keep_existing_document_confidentiality(admin, contract_factory):
    with SessionLocal() as db:
        hr = db.get(User, 'hr')
        department, owner = hr.department, hr.name
    document_id = contract_factory(department=department, owner=owner, confidentiality='restricted')
    sync_all()
    assert document_id not in {record['contract_id'] for record in admin.get(BASE, params={'status': 'all'}).json()['items']}
    login(admin, 'hr')
    item = get_case(admin, document_id)
    assert item['assigned_to'] == 'hr' and item['can_acknowledge']
    login(admin, 'reviewer')
    assert admin.get(f'{BASE}/{item["id"]}').status_code == 404


def test_offboarding_and_reactivation_require_explicit_reassignment(admin, contract_factory):
    document_id = contract_factory()
    item = synchronize(admin, document_id)
    item = acknowledge_assigned(admin, item)
    progress = action(admin, item, 'progress', comment='Supplier discussion already started')
    assert progress.status_code == 200, progress.text
    item = progress.json()
    login(admin)
    with SessionLocal() as db:
        delegation_states = {record.id: record.active for record in db.scalars(select(Delegation).where(
            (Delegation.from_user == 'manager') | (Delegation.to_user == 'manager')))}
    try:
        response = admin.patch('/api/people/manager', json={'active': False})
        assert response.status_code == 200, response.text
        sync_all()
        orphan = get_case(admin, document_id)
        assert orphan['assigned_to'] is None and orphan['assignment_state'] == 'needs_reassignment'
        assert orphan['status'] == 'pending' and orphan['revision'] > item['revision']
        assert orphan['acknowledged_by'] is None and orphan['acknowledged_at'] is None
        assert len(orphan['history']) > len(item['history'])
        assert {record['id'] for record in item['history']} <= {record['id'] for record in orphan['history']}
        assert 'manager' not in {person['id'] for person in orphan['eligible_assignees']}
        assert admin.get(BASE).json()['counters']['needs_reassignment'] >= 1
        assert action(admin, orphan, 'assign', assigned_to='manager', comment='Inactive person').status_code == 422
        assert admin.patch('/api/people/manager', json={'active': True}).status_code == 200
        sync_all()
        reactivated = get_case(admin, document_id)
        assert reactivated['assigned_to'] is None and reactivated['assignment_state'] == 'needs_reassignment'
        assert reactivated['status'] == 'pending' and reactivated['revision'] == orphan['revision']
        assert reactivated['history'] == orphan['history']
        login(admin, 'manager')
        assert action(admin, reactivated, 'acknowledge').status_code == 403
        login(admin)
        reassigned = action(admin, reactivated, 'assign', assigned_to='manager', comment='Explicit ownership after account reactivation')
        assert reassigned.status_code == 200, reassigned.text
        reassigned = reassigned.json()
        assert reassigned['assignment_state'] == 'assigned' and reassigned['assigned_to'] == 'manager'
        assert reassigned['revision'] > reactivated['revision']
        login(admin, 'manager')
        assert action(admin, reassigned, 'acknowledge').status_code == 200
    finally:
        login(admin)
        assert admin.patch('/api/people/manager', json={'active': True}).status_code == 200
        with SessionLocal() as db:
            for delegation_id, active in delegation_states.items():
                db.get(Delegation, delegation_id).active = active
            db.commit()


def test_monitor_cancellation_waits_for_active_synchronization(monkeypatch):
    started = threading.Event()
    release = threading.Event()
    finished = threading.Event()
    real_sleep = asyncio.sleep

    async def immediate_tick(seconds):
        await real_sleep(0)

    def blocked_sync():
        started.set()
        assert release.wait(timeout=5), 'Synchronization was not released by the test'
        finished.set()

    monkeypatch.setattr(renewal_service.asyncio, 'sleep', immediate_tick)
    monkeypatch.setattr(renewal_service, 'sync_all', blocked_sync)

    async def cancel_while_running():
        monitor = asyncio.create_task(renewal_service.monitor())
        try:
            assert await asyncio.to_thread(started.wait, 5)
            monitor.cancel()
            await real_sleep(0)
            await real_sleep(0)
            assert not monitor.done()
            assert not finished.is_set()
            release.set()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(monitor, timeout=5)
            assert finished.is_set()
        finally:
            release.set()
            if not monitor.done():
                monitor.cancel()
                try:
                    await monitor
                except asyncio.CancelledError:
                    pass

    asyncio.run(cancel_while_running())


def source_evidence(document_id):
    with SessionLocal() as db:
        document = columns(db.get(Document, document_id))
        versions = [columns(record) for record in db.scalars(select(DocumentVersion).where(
            DocumentVersion.document_id == document_id).order_by(DocumentVersion.version))]
        tasks = [columns(record) for record in db.scalars(select(WorkflowTask).where(
            WorkflowTask.document_id == document_id).order_by(WorkflowTask.id))]
        task_ids = [record['id'] for record in tasks]
        events = [columns(record) for record in db.scalars(select(TaskEvent).where(
            TaskEvent.task_id.in_(task_ids)).order_by(TaskEvent.id))]
    files = {path: Path(path).read_bytes() for version in versions
        for path in (version['file_path'], version['signed_path']) if path}
    return document, versions, tasks, events, files


def test_tracking_actions_and_restart_preserve_signed_contract_and_workflow_evidence(admin, pdf_bytes, contract_factory):
    document_id = approved(admin, pdf_bytes)
    contract_factory.ids.append(document_id)
    with SessionLocal() as db:
        db.get(Document, document_id).expires_at = (settings.reference_date + timedelta(days=60)).isoformat()
        db.commit()
    signed = act(admin, document_id, 'sign')
    assert signed.status_code == 200, signed.text
    before = source_evidence(document_id)
    item = synchronize(admin, document_id)
    item = acknowledge_assigned(admin, item)
    progress = action(admin, item, 'progress', comment='Start supplier discussions')
    assert progress.status_code == 200, progress.text
    login(admin)
    assigned = action(admin, progress.json(), 'assign', assigned_to='admin', comment='Director coordinates the renewal')
    assert assigned.status_code == 200, assigned.text
    item = acknowledge_assigned(admin, assigned.json())
    closed = action(admin, item, 'close', comment='Tracking complete with supporting internal review')
    assert closed.status_code == 200, closed.text
    sync_all()
    assert source_evidence(document_id) == before
    with TestClient(app) as restarted:
        login(restarted)
        persisted = restarted.get(f'{BASE}/{item["id"]}')
        assert persisted.status_code == 200, persisted.text
        assert persisted.json()['status'] == 'completed'
        assert persisted.json()['history'] == closed.json()['history']
        assert persisted.json()['reminders'] == closed.json()['reminders']
        verified = restarted.get(f'/api/documents/{document_id}/verify')
        assert verified.status_code == 200 and verified.json()['integrity']
    assert source_evidence(document_id) == before
