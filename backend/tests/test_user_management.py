"""Employee onboarding and organizational authority, including provider failure boundaries."""
from datetime import timedelta
from uuid import uuid4
import pytest
from sqlalchemy import select, delete
from conftest import login
from app.config import settings
from app.people.models import User


def employee(**changes):
    return {'name': 'Mara Test' + ''.join(chr(97 + int(c, 16)) for c in uuid4().hex),
            'email': f'm.test-{uuid4().hex}@arm.ro',
            'department_id': 'dept-tehnic', 'job_title': 'Inginer',
            'manager_id': None, 'access_profile': 'employee', **changes}


@pytest.fixture
def people_state(client, db):
    # Existing suites share one demo database. Restore authority and account state.
    from app.people.models import Department, HeadAppointment
    from app.tasks.models import WorkflowTask
    users = {u.id: {key: getattr(u, key) for key in (
        'active', 'roles', 'department', 'department_id', 'manager_id', 'job_title',
        'identity_issuer', 'identity_subject', 'provisioning_status', 'identity_sync_pending')}
        for u in db.scalars(select(User))}
    departments = {d.id: (d.head_user_id, d.revision) for d in db.scalars(select(Department))}
    from app.people.models import Delegation
    delegations = {d.id:d.active for d in db.scalars(select(Delegation))}
    tasks = {t.id: t.reassignment_required for t in db.scalars(select(WorkflowTask))}
    yield
    db.rollback()
    db.execute(delete(HeadAppointment))
    for u in db.scalars(select(User)):
        if u.id in users:
            for key, value in users[u.id].items(): setattr(u, key, value)
        else:
            from app.people.models import Session, LeaveRequest
            db.execute(delete(Session).where(Session.user_id == u.id))
            db.execute(delete(LeaveRequest).where(LeaveRequest.user_id == u.id))
            db.delete(u)
    for d in db.scalars(select(Department)):
        d.head_user_id, d.revision = departments[d.id]
    for t in db.scalars(select(WorkflowTask)):
        t.reassignment_required = tasks.get(t.id, False)
    for d in db.scalars(select(Delegation)):
        if d.id in delegations: d.active = delegations[d.id]
    db.commit()


def test_hr_creates_employee_with_account_and_leave_access(client):
    login(client, 'hr')
    response = client.post('/api/people', json=employee())
    assert response.status_code == 201, response.text
    data = response.json()
    assert data['user']['roles'] == ['employee']
    assert data['user']['department'] == 'Tehnic'
    assert data['temporary_password']
    assert 'password_hash' not in str(data)
    assert client.post('/api/auth/login', json={'user_id': data['user']['id'],
        'password': data['temporary_password']}).status_code == 200
    assert client.post('/api/people/leave', json={'starts_at': '2026-12-01',
        'ends_at': '2026-12-02', 'reason': 'Concediu de odihnă'}).status_code == 201


@pytest.mark.parametrize('role', ['technician', 'manager', 'finance'])
def test_ordinary_staff_cannot_create_accounts(client, role):
    login(client, role)
    assert client.post('/api/people', json=employee()).status_code == 403


def test_hr_cannot_grant_privileged_roles_or_duplicate_email(client):
    login(client, 'hr')
    assert client.post('/api/people', json=employee(roles=['signer'])).status_code == 422
    assert client.post('/api/people', json=employee(access_profile='director')).status_code == 422
    assert client.post('/api/people', json=employee(email=' HR@DUNAREA.EXAMPLE ')).status_code == 409
    assert client.post('/api/people', json=employee(department_id='foreign-department')).status_code == 422
    assert client.post('/api/people', json=employee(manager_id='missing')).status_code == 404


def test_hr_can_adjust_work_email_and_duplicate_addresses_are_reported(client):
    login(client, 'hr')
    payload = employee(name='Ștefan Mihai Ionescu', email='  STEFAN.IONESCU@ARM.RO  ')
    response = client.post('/api/people', json=payload)
    assert response.status_code == 201, response.text
    assert response.json()['user']['email'] == 'stefan.ionescu@arm.ro'
    assert client.post('/api/people', json=employee(email='stefan.ionescu@arm.ro')).status_code == 409
    replacement = client.post('/api/people', json=employee(name=payload['name'], email='s.ionescu2@arm.ro'))
    assert replacement.status_code == 201, replacement.text
    assert replacement.json()['user']['email'] == 's.ionescu2@arm.ro'


@pytest.mark.parametrize('email', ['', 'invalid', 'ana @arm.ro', 'ana@arm', 'ana@@arm.ro'])
def test_hr_email_override_must_be_valid(client, email):
    login(client, 'hr')
    assert client.post('/api/people', json=employee(email=email)).status_code == 422


def test_employee_creation_requires_hr_to_supply_email(client):
    login(client, 'hr')
    payload = employee()
    del payload['email']
    assert client.post('/api/people', json=payload).status_code == 422


def test_coordinator_must_be_active_in_the_selected_department(client, people_state):
    login(client, 'hr')
    assert client.post('/api/people', json=employee(name='Mara Invalid', email='m.invalid@arm.ro', manager_id='admin')).status_code == 422
    created = client.post('/api/people', json=employee(manager_id='technician'))
    assert created.status_code == 201, created.text
    uid = created.json()['user']['id']
    assert created.json()['user']['manager_id'] == 'technician'
    assert client.patch(f'/api/people/{uid}/profile', json={'manager_id': 'hr'}).status_code == 422
    assert client.patch(f'/api/people/{uid}/profile', json={'manager_id': uid}).status_code == 422
    assert client.patch('/api/people/technician/profile', json={'manager_id': uid}).status_code == 422
    assert client.patch(f'/api/people/{uid}/profile', json={
        'department_id': 'dept-hr', 'manager_id': 'technician'}).status_code == 422
    moved = client.patch(f'/api/people/{uid}/profile', json={'department_id': 'dept-hr'})
    assert moved.status_code == 200, moved.text
    assert moved.json()['manager_id'] is None
    assert client.patch(f'/api/people/{uid}/profile', json={'manager_id': 'hr'}).status_code == 200


def test_transferring_coordinator_clears_reporting_links_in_old_department(client, people_state):
    login(client, 'hr')
    created = client.post('/api/people', json=employee(manager_id='technician')).json()['user']
    response = client.patch('/api/people/technician/profile', json={'department_id': 'dept-hr'})
    assert response.status_code == 200, response.text
    updated = next(p for p in client.get('/api/people').json()['items'] if p['id'] == created['id'])
    assert updated['manager_id'] is None


def test_keycloak_failure_is_retryable_and_never_activates_local_account(client, monkeypatch):
    from app.identity import provisioning
    from app.core.exceptions import DomainError
    login(client, 'hr')
    monkeypatch.setattr(settings, 'auth_mode', 'oidc')
    # Current demo session would no longer authenticate: keep test focused on service.
    from app.people import management
    from app.people.schemas import EmployeeCreate
    from app.database import SessionLocal
    monkeypatch.setattr(provisioning, 'provision', lambda person: (_ for _ in ()).throw(DomainError('Indisponibil', 502)))
    with SessionLocal() as db:
        result = management.create_employee(db, db.get(User, 'hr'), EmployeeCreate(**employee()))
        uid = result['user']['id']
        assert result['user']['provisioning_status'] == 'failed'
        assert not result['user']['active']
    monkeypatch.setattr(provisioning, 'provision', lambda person: {
        'subject': 'provider-' + person.id, 'temporary_password': 'one-time', 'invitation_status': 'temporary_password'})
    with SessionLocal() as db:
        result = management.retry_provision(db, db.get(User, 'hr'), uid)
        assert result['user']['active']
        assert db.get(User, uid).identity_subject == 'provider-' + uid
        assert management.retry_provision(db, db.get(User, 'hr'), uid)['user']['active']


def test_profile_edits_preserve_roles_and_head_cannot_transfer(client, people_state):
    login(client, 'hr')
    assert client.patch('/api/people/technician/profile', json={'job_title': 'Inginer principal'}).status_code == 200
    assert client.patch('/api/people/technician/profile', json={'roles': ['signer']}).status_code == 422
    assert client.patch('/api/people/manager/profile', json={'department_id': 'dept-tehnic'}).status_code == 409
    assert client.patch('/api/people/hr/profile', json={'department_id': 'dept-tehnic'}).status_code == 403


def proposal(client, target='technician', department='dept-tehnic', **changes):
    return client.post('/api/people/appointments', json={'user_id': target,
        'department_id': department, 'effective_date': str(settings.reference_date),
        'reason': 'Numire responsabil departament', **changes})


def test_hr_proposes_director_approves_without_signing_grant(client, people_state):
    login(client, 'hr')
    p = proposal(client)
    assert p.status_code == 201, p.text
    assert client.post(f"/api/people/appointments/{p.json()['id']}/decision",
        json={'action': 'approve'}).status_code == 403
    login(client, 'admin')
    assert client.post(f"/api/people/appointments/{p.json()['id']}/decision",
        json={'action': 'approve'}).status_code == 200
    directory = client.get('/api/people').json()
    tech = next(u for u in directory['items'] if u['id'] == 'technician')
    assert tech['is_department_head']
    assert 'signer' not in tech['roles']
    assert next(d for d in directory['department_records'] if d['id'] == 'dept-tehnic')['head_user_id'] == 'technician'


def test_appointment_duplicate_decision_rejection_and_candidate_change(client, people_state):
    login(client, 'hr')
    p = proposal(client).json()
    assert proposal(client).status_code == 409
    login(client, 'admin')
    path = f"/api/people/appointments/{p['id']}/decision"
    assert client.post(path, json={'action': 'reject'}).status_code == 422
    assert client.post(path, json={'action': 'reject', 'comment': 'Necesită experiență'}).status_code == 200
    assert client.post(path, json={'action': 'approve'}).status_code == 409
    login(client, 'hr')
    p = proposal(client).json()
    assert client.patch('/api/people/technician', json={'active': False}).status_code == 200
    login(client, 'admin')
    assert client.post(f"/api/people/appointments/{p['id']}/decision", json={'action': 'approve'}).status_code == 409


def test_appointment_scheduled_activation_and_independent_director(client, people_state, db, monkeypatch):
    login(client, 'hr')
    tomorrow = settings.reference_date + timedelta(days=1)
    p = proposal(client, effective_date=str(tomorrow)).json()
    login(client, 'admin')
    assert client.post(f"/api/people/appointments/{p['id']}/decision", json={'action': 'approve'}).status_code == 200
    assert not next(u for u in client.get('/api/people').json()['items'] if u['id'] == 'technician')['is_department_head']
    monkeypatch.setattr(settings, 'reference_date', tomorrow)
    assert next(u for u in client.get('/api/people').json()['items'] if u['id'] == 'technician')['is_department_head']
    login(client, 'hr')
    p = proposal(client, 'admin', 'dept-conducere').json()
    login(client, 'admin')
    assert client.post(f"/api/people/appointments/{p['id']}/decision", json={'action': 'approve'}).status_code == 403


def test_replacement_routes_new_work_and_flags_old_tasks(client, people_state, db):
    from app.people.models import Department
    from app.documents.models import Document
    from app.tasks.models import WorkflowTask
    from app.tasks.service import default_assignee, can_act
    login(client, 'hr')
    assert client.patch('/api/people/technician/profile', json={'department_id': 'dept-achizitii'}).status_code == 200
    p = proposal(client, department='dept-achizitii').json()
    login(client, 'admin')
    assert client.post(f"/api/people/appointments/{p['id']}/decision", json={'action': 'approve'}).status_code == 200
    db.expire_all()
    doc = db.get(Document, 'test-review')
    assert default_assignee(db, doc, 'approval') == 'technician'
    old = db.scalar(select(WorkflowTask).where(WorkflowTask.document_id == doc.id, WorkflowTask.status == 'pending'))
    assert old.reassignment_required
    assert not can_act(db, db.get(User, 'manager'), old, doc)


def test_signing_grant_independent_and_revocation(client, people_state):
    path = '/api/people/technician/signing-authority'
    login(client, 'hr')
    assert client.post(path, json={'enabled': True, 'reason': 'Decizie conducere'}).status_code == 403
    login(client, 'admin')
    assert client.post('/api/people/admin/signing-authority', json={'enabled': True, 'reason': 'Decizie conducere'}).status_code == 403
    assert client.post(path, json={'enabled': True, 'reason': 'Decizie conducere'}).status_code == 200
    assert 'signer' in next(u for u in client.get('/api/people').json()['items'] if u['id'] == 'technician')['roles']
    assert client.post(path, json={'enabled': False, 'reason': 'Mandat încheiat'}).status_code == 200
    assert 'signer' not in next(u for u in client.get('/api/people').json()['items'] if u['id'] == 'technician')['roles']


def test_approved_hr_department_head_can_review_department_documents(client, people_state, db):
    from app.documents.models import Document
    from app.tasks.service import default_assignee
    login(client,'hr')
    assert client.patch('/api/people/technician/profile',json={'department_id':'dept-hr'}).status_code==200
    p=proposal(client,department='dept-hr').json()
    login(client,'admin')
    assert client.post(f"/api/people/appointments/{p['id']}/decision",json={'action':'approve'}).status_code==200
    db.expire_all()
    assert default_assignee(db,db.get(Document,'test-hr'),'approval')=='technician'


def test_inactive_head_cannot_transfer_and_gain_authority_without_appointment(client, people_state):
    login(client,'hr')
    p=proposal(client).json()
    login(client,'admin')
    assert client.post(f"/api/people/appointments/{p['id']}/decision",json={'action':'approve'}).status_code==200
    login(client,'hr')
    assert client.patch('/api/people/technician',json={'active':False}).status_code==200
    assert client.patch('/api/people/technician/profile',json={'department_id':'dept-financiar'}).status_code==409


def test_hr_cannot_reset_privileged_account_credentials(client, people_state):
    login(client,'hr')
    assert client.post('/api/people/admin/activation-instructions').status_code==403


def test_duplicate_display_name_never_grants_hr_document_access(client, people_state):
    login(client,'hr')
    created=client.post('/api/people',json=employee(name='Ioana Stancu')).json()
    assert client.post('/api/auth/login',json={'user_id':created['user']['id'],'password':created['temporary_password']}).status_code==200
    assert client.get('/api/documents/test-hr').status_code==404


@pytest.mark.parametrize('action',['approve','reject'])
def test_appointed_ordinary_head_can_execute_assigned_document_decision(client, people_state, pdf_bytes, action):
    from test_tasks import submitted, pending_task
    from test_workflows import act
    login(client,'admin')
    document_id=submitted(client,pdf_bytes)
    login(client,'hr')
    assert client.patch('/api/people/technician/profile',json={'department_id':'dept-achizitii'}).status_code==200
    p=proposal(client,department='dept-achizitii').json()
    login(client,'admin')
    assert client.post(f"/api/people/appointments/{p['id']}/decision",json={'action':'approve'}).status_code==200
    task=pending_task(client,document_id)
    assert client.post(f"/api/tasks/{task['id']}/assign",json={'assigned_to':'technician','version':1,'comment':'Preluare aprobată'}).status_code==200
    login(client,'technician')
    response=act(client,document_id,action,comment='Decizie șef departament')
    assert response.status_code==200,response.text


def test_cancelled_provisioning_preserves_owned_identity_for_offboarding(client, people_state, db, monkeypatch):
    from app.people import management
    from app.people.schemas import EmployeeCreate, AccountUpdate
    from app.identity import provisioning
    from app.database import SessionLocal
    from app.core.exceptions import DomainError
    monkeypatch.setattr(settings,'auth_mode','oidc')
    def partial(person):
        with SessionLocal() as other:
            management.update_account(other,other.get(User,'hr'),person.id,AccountUpdate(active=False))
        exc=DomainError('Configurarea parolei nu a fost finalizată',502)
        exc.identity_subject='created-before-credential-failure'
        raise exc
    monkeypatch.setattr(provisioning,'provision',partial)
    result=management.create_employee(db,db.get(User,'hr'),EmployeeCreate(**employee()))
    person=db.get(User,result['user']['id'])
    assert not person.active and person.provisioning_status=='cancelled'
    assert person.identity_subject=='created-before-credential-failure'
    assert person.identity_sync_pending


def test_stale_provider_completion_cannot_hide_required_reconciliation(client, people_state, db, monkeypatch):
    from threading import Thread, Event, current_thread
    from sqlalchemy.orm import Session as DbSession
    from app.database import SessionLocal
    from app.people import management
    from app.identity import provisioning
    person=db.get(User,'technician')
    person.active=False;person.identity_subject='owned-tech';person.identity_issuer='test-issuer'
    person.identity_sync_pending=True;db.commit()
    paused=Event();old_done=Event();old_started=Event();new_provider_done=Event()
    remote={'enabled':False};errors=[]
    original_commit=DbSession.commit
    def commit(session):
        if current_thread().name=='new-sync' and new_provider_done.is_set() and not paused.is_set():
            paused.set();old_done.wait(timeout=1)
        return original_commit(session)
    monkeypatch.setattr(DbSession,'commit',commit)
    def provider(snapshot):
        if not snapshot.active:
            old_started.set();assert paused.wait(timeout=5)
            remote['enabled']=False
        else:
            remote['enabled']=True;new_provider_done.set()
    monkeypatch.setattr(provisioning,'set_enabled',provider)
    def old():
        try:
            with SessionLocal() as session: management.sync_identity(session,session.get(User,'hr'),'technician')
        except Exception as exc: errors.append(exc)
        finally: old_done.set()
    def new():
        try:
            assert old_started.wait(timeout=5)
            with SessionLocal() as session:
                target=session.get(User,'technician');target.active=True;target.identity_sync_pending=True
                session.commit()
                management.sync_identity(session,session.get(User,'hr'),'technician')
        except Exception as exc: errors.append(exc)
    threads=[Thread(target=old,name='old-sync'),Thread(target=new,name='new-sync')]
    for thread in threads: thread.start()
    for thread in threads: thread.join(timeout=8)
    assert not errors and not any(thread.is_alive() for thread in threads),errors
    db.expire_all();target=db.get(User,'technician')
    assert target.active and not remote['enabled']
    assert target.identity_sync_pending


def test_hr_offboards_locally_even_if_keycloak_is_down(client, people_state, db, monkeypatch):
    from app.identity import provisioning
    from app.core.exceptions import DomainError
    person = db.get(User, 'technician')
    person.identity_subject = 'owned-tech'
    person.identity_issuer = 'https://identity.example/realms/dunarea'
    db.commit()
    login(client, 'hr')
    monkeypatch.setattr(provisioning, 'set_enabled', lambda person: (_ for _ in ()).throw(DomainError('Indisponibil', 502)))
    response = client.patch('/api/people/technician', json={'active': False})
    assert response.status_code == 200, response.text
    assert not response.json()['active']
    assert response.json()['identity_sync_pending']
    assert client.post('/api/auth/login', json={'user_id': 'technician', 'password': 'AeroDesk2026!'}).status_code == 401
