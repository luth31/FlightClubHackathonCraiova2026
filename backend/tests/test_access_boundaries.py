"""Regression cases discovered by the independent access review."""
from uuid import uuid4
import httpx
import pytest
from sqlalchemy import delete, select

from conftest import login
from app.config import settings
from app.people.models import User, Department, HeadAppointment
from app.documents.models import Document, DocumentVersion
from app.tasks.models import WorkflowTask, TaskEvent


def test_legacy_area_head_keeps_original_scope_under_the_merged_head(client, db):
    from app.people.management import seed_departments, is_head, department_records
    from app.core.security import can_read, hash_password
    uid = 'legacy-head-' + uuid4().hex
    person = User(id=uid, name='Legacy Finance Head', email=uid+'@example.test',
        department='Financiar', department_id='dept-financiar', role='Șef financiar',
        roles=['reviewer','department_head'], airport_id=settings.airport_id, active=True,
        password_hash=hash_password('test-only'))
    legacy = Department(id='dept-financiar', name='Financiar', airport_id=settings.airport_id,
        head_user_id=uid, revision=1)
    db.add_all([person, legacy])
    db.commit()
    from types import SimpleNamespace
    financial = SimpleNamespace(id='financial', airport_id=settings.airport_id, department='Financiar',
        category='Factură', status='approved', confidentiality='restricted', created_by='seed', owner_id='finance')
    try:
        seed_departments(db)
        db.commit()
        assert person.department_id == 'dept-achizitii'
        assert db.get(Department, 'dept-achizitii').head_user_id == 'manager'
        assert len(department_records(db)) == 4
        assert is_head(db, person, 'Financiar')
        assert not is_head(db, person, 'Achiziții')
        assert can_read(person, financial)
        assert not can_read(person, db.get(Document, 'test-tech'))
    finally:
        db.delete(person)
        remaining = db.get(Department, 'dept-financiar')
        if remaining: db.delete(remaining)
        db.commit()


def test_unedited_legacy_finance_fixture_becomes_a_specialist(client, db):
    from app.people.management import seed_departments, is_head
    legacy = Department(id='dept-financiar', name='Financiar', airport_id=settings.airport_id,
        head_user_id='finance', revision=1)
    db.add(legacy)
    db.commit()
    try:
        seed_departments(db)
        db.commit()
        assert not is_head(db, db.get(User, 'finance'))
    finally:
        remaining = db.get(Department, 'dept-financiar')
        if remaining: db.delete(remaining)
        db.commit()


def test_delegated_current_version_does_not_expose_historical_pdf_or_snapshot(client, db):
    from app.tasks.service import ensure_task
    source = db.get(Document, 'test-review')
    identifier = 'scope-' + uuid4().hex
    version = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == source.id))
    document = Document(**{column.name: getattr(source, column.name) for column in Document.__table__.columns})
    document.id, document.owner_id, document.created_by, document.version = identifier, 'manager', 'manager', 2
    db.add(document)
    for number in (1, 2):
        db.add(DocumentVersion(id=uuid4().hex, document_id=identifier, version=number,
            file_path=version.file_path, filename=version.filename, sha256=version.sha256,
            created_at=f'2026-10-{number:02d}', created_by='manager',
            snapshot={'status': 'in_review', 'metadata': {'old_secret': 'historical-only'} if number == 1 else {}}))
    db.flush()
    ensure_task(db, document, 'approval')
    db.commit()
    try:
        login(client, 'reviewer')
        detail = client.get('/api/documents/' + identifier)
        assert detail.status_code == 200, detail.text
        assert [v['version'] for v in detail.json()['versions']] == [2]
        assert 'historical-only' not in detail.text
        assert client.get(f'/api/documents/{identifier}/file?version=1').status_code == 404
        assert client.get(f'/api/documents/{identifier}/file?version=2').status_code == 200
        login(client, 'manager')
        assert client.get(f'/api/documents/{identifier}/file?version=1').status_code == 200
    finally:
        tasks = list(db.scalars(select(WorkflowTask.id).where(WorkflowTask.document_id == identifier)))
        db.execute(delete(TaskEvent).where(TaskEvent.task_id.in_(tasks)))
        db.execute(delete(WorkflowTask).where(WorkflowTask.document_id == identifier))
        db.execute(delete(DocumentVersion).where(DocumentVersion.document_id == identifier))
        db.execute(delete(Document).where(Document.id == identifier))
        db.commit()


def test_ineligible_principal_cannot_convey_delegated_approval(client, db):
    from app.tasks.service import eligible, active_delegates, can_act
    document = db.get(Document, 'test-procedure')
    task = WorkflowTask(id='scope-task-' + uuid4().hex, document_id=document.id,
        document_version=document.version, type='approval', status='pending', assigned_to='manager',
        due_date='2026-11-01', created_at='2026-10-30', updated_at='2026-10-30', reassignment_required=False)
    db.add(task)
    db.commit()
    try:
        manager, reviewer = db.get(User, 'manager'), db.get(User, 'reviewer')
        assert not eligible(db, manager, document, 'approval')
        assert active_delegates(db, task, document) == []
        assert not can_act(db, reviewer, task, document)
    finally:
        db.delete(task)
        db.commit()


def test_retired_leadership_appointments_remain_readable(admin, db):
    from app.people.management import seed_departments, list_appointments
    legacy = Department(id='dept-conducere', airport_id=settings.airport_id, name='Conducere', head_user_id='admin', revision=1)
    appointment = HeadAppointment(id='history-' + uuid4().hex, airport_id=settings.airport_id,
        department_id=legacy.id, user_id='admin', proposed_by='hr', effective_date='2026-01-01',
        reason='Historical leadership appointment', department_revision=1, status='active',
        created_at='2026-01-01', decided_by='admin', decided_at='2026-01-01', decision_comment='Approved')
    db.add_all([legacy, appointment])
    db.commit()
    try:
        seed_departments(db)
        db.commit()
        history = list_appointments(db, db.get(User, 'admin'))['items']
        assert next(item for item in history if item['id'] == appointment.id)['department'] == 'Conducere'
        assert admin.get('/api/people/appointments').status_code == 200
    finally:
        db.delete(appointment)
        remaining = db.get(Department, 'dept-conducere')
        if remaining: db.delete(remaining)
        db.commit()


def test_incomplete_keycloak_credentials_are_retried_without_resetting_ready_account(client, db, monkeypatch):
    from app.identity import provisioning
    from app.people.sync_demo_organization import sync_technical_head
    from app.core.exceptions import DomainError
    head = db.get(User, 'technical-head')
    original = (head.identity_subject, head.identity_issuer, head.provisioning_status)
    monkeypatch.setattr(settings, 'auth_mode', 'oidc')
    monkeypatch.setattr(provisioning, 'connection', lambda: ('https://identity/users', {}))
    remote, attempts = {}, []
    monkeypatch.setattr(provisioning, 'owned_user', lambda base, headers, person: remote.get('account'))
    monkeypatch.setattr(provisioning, 'request', lambda *args, **kwargs: httpx.Response(200, json=remote.get('account', {})))
    def provision(person):
        remote['account'] = {'id': 'created-subject', 'username': 'technical-head'}
        attempts.append('reset')
        if len(attempts) == 1:
            raise provisioning.ProvisioningFailure('Credential setup failed', 502, 'created-subject')
        return {'subject': 'created-subject', 'temporary_password': 'recovered-password'}
    monkeypatch.setattr(provisioning, 'provision', provision)
    try:
        head.identity_subject, head.identity_issuer, head.provisioning_status = None, None, 'ready'
        db.commit()
        with pytest.raises(DomainError): sync_technical_head(db)
        db.rollback()
        result = sync_technical_head(db)
        assert result['temporary_password'] == 'recovered-password'
        assert head.provisioning_status == 'ready'
        assert sync_technical_head(db)['status'] == 'existing'
        assert attempts == ['reset', 'reset']
    finally:
        head.identity_subject, head.identity_issuer, head.provisioning_status = original
        db.commit()
