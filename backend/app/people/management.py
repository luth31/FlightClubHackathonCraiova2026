"""HR-owned employee data and independently authorized organizational authority."""
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from types import SimpleNamespace
import secrets
from sqlalchemy import select, text, func
from sqlalchemy.exc import IntegrityError
from app.config import settings
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import has_role, require_role, user_dict, hash_password
from app.people.models import User, Department, HeadAppointment, Session, Delegation
from app.identity import provisioning

DEPARTMENTS = [('dept-conducere', 'Conducere', 'admin'), ('dept-achizitii', 'Achiziții', 'manager'),
    ('dept-tehnic', 'Tehnic', None), ('dept-financiar', 'Financiar', 'finance'),
    ('dept-operatiuni', 'Operațiuni', None), ('dept-hr', 'Resurse umane', 'hr'),
    ('dept-conformitate', 'Conformitate', 'reviewer')]

JOB_TITLES = {
    'dept-conducere': ['Director aeroport', 'Director adjunct', 'Asistent conducere'],
    'dept-achizitii': ['Specialist achiziții', 'Referent achiziții', 'Șef achiziții'],
    'dept-tehnic': ['Inginer', 'Inginer principal', 'Tehnician mentenanță', 'Șef departament tehnic'],
    'dept-financiar': ['Economist', 'Contabil', 'Responsabil financiar', 'Șef departament financiar'],
    'dept-operatiuni': ['Agent operațiuni', 'Coordonator operațiuni', 'Șef operațiuni'],
    'dept-hr': ['Specialist resurse umane', 'Inspector resurse umane', 'Responsabil resurse umane'],
    'dept-conformitate': ['Specialist conformitate', 'Auditor intern', 'Responsabil conformitate'],
}


def seed_departments(db):
    for did, name, head in DEPARTMENTS:
        if not db.get(Department, did):
            db.add(Department(id=did, name=name, airport_id=settings.airport_id, head_user_id=head, revision=1))
    db.flush()
    by_name = {d.name: d.id for d in db.scalars(select(Department))}
    for person in db.scalars(select(User).where(User.airport_id == settings.airport_id)):
        if not person.department_id: person.department_id = by_name.get(person.department)
    if settings.auth_mode == 'oidc':
        from app.identity.service import subject_map
        for subject, uid in subject_map().items():
            person = db.get(User, uid)
            if person and person.airport_id == settings.airport_id and not person.identity_subject:
                person.identity_issuer, person.identity_subject = settings.oidc_issuer, subject


def local_person(db, uid):
    person = db.get(User, uid)
    if not person or person.airport_id != settings.airport_id:
        raise DomainError('Persoana nu a fost găsită.', 404)
    return person


def department(db, did):
    item = db.get(Department, did)
    if not item or item.airport_id != settings.airport_id:
        raise DomainError('Departamentul nu este valid.', 422)
    return item


def department_records(db):
    titles = {}
    for person in db.scalars(select(User).where(User.airport_id == settings.airport_id)):
        if person.job_title: titles.setdefault(person.department_id, set()).add(person.job_title)
    return [{'id': d.id, 'name': d.name, 'head_user_id': d.head_user_id,
        'head_name': db.get(User, d.head_user_id).name if d.head_user_id and db.get(User, d.head_user_id) else None,
        'revision': d.revision, 'job_titles': sorted(set(JOB_TITLES.get(d.id, ['Angajat'])) | titles.get(d.id, set()))} for d in db.scalars(select(Department).where(
            Department.airport_id == settings.airport_id).order_by(Department.name))]


def is_head(db, person, department_name=None):
    if not person.active: return False
    query = select(Department).where(Department.airport_id == person.airport_id,
        Department.head_user_id == person.id, Department.id == person.department_id)
    if department_name is not None: query = query.where(Department.name == department_name)
    return db.scalar(query) is not None


def employee_dict(db, person):
    data = user_dict(person)
    data.update({'department_id': person.department_id, 'job_title': person.job_title,
        'manager_id': person.manager_id, 'is_department_head': is_head(db, person),
        'provisioning_status': person.provisioning_status, 'identity_sync_pending': person.identity_sync_pending,
        'login_username': provisioning.username(person) if person.identity_subject else person.id})
    return data


def validate_manager(db, mid, department_id, person_id=None):
    if not mid: return None
    target = local_person(db, mid)
    if not target.active or target.id == person_id:
        raise DomainError('Alege un coordonator activ, diferit de persoana administrată.', 422)
    if target.department_id != department_id:
        raise DomainError('Coordonatorul trebuie să facă parte din departamentul selectat.', 422)
    seen = {person_id} if person_id else set()
    current = target
    while current:
        if current.id in seen: raise DomainError('Relația de coordonare ar crea un ciclu.', 422)
        seen.add(current.id)
        current = db.get(User, current.manager_id) if current.manager_id else None
    return mid


def create_employee(db, actor, body):
    require_role(actor, 'hr', 'admin')
    db.execute(text('BEGIN IMMEDIATE'))
    dept = department(db, body.department_id)
    manager = validate_manager(db, body.manager_id, dept.id)
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.airport_id == actor.airport_id, func.lower(func.trim(User.email)) == email)):
        raise DomainError('Există deja un angajat cu această adresă de email.', 409)
    uid = 'emp-' + uuid4().hex
    person = User(id=uid, name=body.name, email=email, department=dept.name, department_id=dept.id,
        job_title=body.job_title, role=body.job_title, roles=['employee'] + (['technician'] if body.access_profile == 'technician' else []),
        airport_id=actor.airport_id, manager_id=manager, active=False,
        password_hash=hash_password(secrets.token_urlsafe(32)), avatar='', provisioning_status='pending')
    db.add(person)
    record(db, actor, 'employee_created', detail=f'{person.name} ({uid}); {dept.name}')
    try: db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainError('Contul există deja. Reîncarcă lista angajaților.', 409) from exc
    return retry_provision(db, actor, uid)


def retry_provision(db, actor, uid):
    require_role(actor, 'hr', 'admin')
    db.execute(text('BEGIN IMMEDIATE'))
    person = local_person(db, uid)
    if person.provisioning_status == 'ready':
        db.commit()
        return {'user': employee_dict(db, person), 'invitation_status': 'already_provisioned'}
    if person.provisioning_status == 'cancelled':
        raise DomainError('Contul a fost dezactivat. Reactivarea necesită o decizie explicită.', 409)
    if (person.provisioning_status == 'processing' and person.provisioning_started_at
        and datetime.fromisoformat(person.provisioning_started_at) > datetime.now(timezone.utc) - timedelta(minutes=2)):
        raise DomainError('Provisionarea este deja în curs. Reîncearcă după două minute.', 409)
    started = datetime.now(timezone.utc).isoformat()
    person.provisioning_status = 'processing'
    person.provisioning_started_at = started
    db.commit()
    result = {}
    failure = None
    try:
        if settings.auth_mode == 'oidc':
            result = provisioning.provision(person)
        else:
            result = {'temporary_password': secrets.token_urlsafe(18), 'invitation_status': 'local_password'}
    except DomainError as exc:
        failure = exc.message
        if getattr(exc, 'identity_subject', None): result['subject'] = exc.identity_subject
    db.execute(text('BEGIN IMMEDIATE'))
    db.refresh(person)
    if person.provisioning_started_at != started:
        raise DomainError('O altă operațiune de provisionare a preluat contul.', 409)
    if person.provisioning_status == 'cancelled':
        if result.get('subject'):
            person.identity_issuer, person.identity_subject = settings.oidc_issuer, result['subject']
        person.identity_sync_pending = settings.auth_mode == 'oidc'
        db.commit()
        return {'user': employee_dict(db, person), 'invitation_status': 'cancelled'}
    if failure:
        if result.get('subject'):
            person.identity_issuer, person.identity_subject = settings.oidc_issuer, result['subject']
        person.provisioning_status = 'failed'
        record(db, actor, 'employee_provisioning_failed', detail=f'Cont {person.id}; serviciul de identitate nu a finalizat operațiunea.')
    else:
        if result.get('subject'):
            person.identity_issuer, person.identity_subject = settings.oidc_issuer, result['subject']
        elif result.get('temporary_password'):
            person.password_hash = hash_password(result['temporary_password'])
        person.provisioning_status = 'ready'
        person.active = True
        record(db, actor, 'employee_provisioned', detail=f'Cont {person.id}; identitate {settings.auth_mode}')
    try: db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainError('Identitatea este deja asociată unui alt cont.', 409) from exc
    return {'user': employee_dict(db, person), **result, **({'provisioning_error': failure} if failure else {})}


def update_profile(db, actor, uid, body):
    require_role(actor, 'hr', 'admin')
    db.execute(text('BEGIN IMMEDIATE'))
    person = local_person(db, uid)
    changes = body.model_dump(exclude_unset=True)
    if uid == actor.id and ('department_id' in changes or 'manager_id' in changes):
        raise DomainError('Propria structură de acces trebuie modificată de altă persoană autorizată.', 403)
    if 'department_id' in changes:
        dept = department(db, changes['department_id'])
        if dept.id != person.department_id and db.scalar(select(Department.id).where(
            Department.airport_id == person.airport_id, Department.head_user_id == person.id)):
            raise DomainError('Numește un înlocuitor înainte de transferul șefului de departament.', 409)
        if dept.id != person.department_id:
            from app.tasks.service import flag_offboarding
            flag_offboarding(db, person, actor, 'Departament schimbat')
            for grant in db.scalars(select(Delegation).where((Delegation.from_user == uid) | (Delegation.to_user == uid))): grant.active = False
            person.manager_id = None
            for report in db.scalars(select(User).where(User.airport_id == person.airport_id,
                    User.manager_id == uid, User.department_id != dept.id)):
                report.manager_id = None
                record(db, actor, 'employee_coordinator_cleared', detail=f'{report.id}; coordonator transferat: {uid}')
        person.department_id, person.department = dept.id, dept.name
    if 'manager_id' in changes: person.manager_id = validate_manager(db, changes['manager_id'], person.department_id, uid)
    if changes.get('name') is not None: person.name = changes['name']
    if changes.get('job_title') is not None: person.job_title = person.role = changes['job_title']
    record(db, actor, 'employee_updated', detail=f'{person.id}; câmpuri: {", ".join(changes)}')
    db.commit()
    return employee_dict(db, person)


def update_account(db, actor, uid, body):
    require_role(actor, 'hr', 'admin')
    db.execute(text('BEGIN IMMEDIATE'))
    person = local_person(db, uid)
    if person.id == actor.id: raise DomainError('Nu poți modifica starea propriului cont.', 409)
    if not body.active:
        for role in ('admin', 'director'):
            if has_role(person, role) and not any(u.id != uid and has_role(u, role) for u in db.scalars(
                select(User).where(User.airport_id == actor.airport_id, User.active == True))):
                raise DomainError('Ultimul administrator sau director activ trebuie păstrat.', 409)
        from app.tasks.service import flag_offboarding
        flag_offboarding(db, person, actor)
        for session in db.scalars(select(Session).where(Session.user_id == uid)): db.delete(session)
        for grant in db.scalars(select(Delegation).where((Delegation.from_user == uid) | (Delegation.to_user == uid))): grant.active = False
        if person.provisioning_status != 'ready': person.provisioning_status = 'cancelled'
    elif person.provisioning_status != 'ready':
        person.provisioning_status = 'pending'
        person.provisioning_started_at = None
        db.commit()
        return retry_provision(db, actor, uid)['user']
    person.active = body.active
    person.identity_sync_revision += 1
    person.identity_sync_pending = bool(person.identity_subject)
    record(db, actor, 'account_activated' if body.active else 'account_deactivated', detail=f'{person.name} ({uid})')
    db.commit()
    if person.identity_sync_pending: return sync_identity(db, actor, uid)
    return employee_dict(db, person)


def sync_identity(db, actor, uid):
    require_role(actor, 'hr', 'admin')
    db.execute(text('BEGIN IMMEDIATE'))
    person = local_person(db, uid)
    if not person.identity_subject and not person.identity_sync_pending:
        db.commit()
        return employee_dict(db, person)
    # Never hold a SQLite write lock across provider calls. Read the current state again afterwards.
    desired = person.active
    revision = person.identity_sync_revision + 1
    person.identity_sync_revision = revision
    snapshot = SimpleNamespace(**{key:getattr(person,key) for key in (
        'id','name','email','airport_id','active','identity_subject','identity_issuer')})
    db.commit()
    failed = False
    missing = False
    try:
        if not snapshot.identity_subject:
            snapshot.identity_subject = provisioning.find_subject(snapshot)
            snapshot.identity_issuer = settings.oidc_issuer
        if snapshot.identity_subject: provisioning.set_enabled(snapshot)
        else: missing = True
    except DomainError:
        failed = True
    db.execute(text('BEGIN IMMEDIATE'))
    db.refresh(person)
    changed = person.identity_sync_revision != revision or person.active != desired
    if snapshot.identity_subject and not person.identity_subject:
        person.identity_subject, person.identity_issuer = snapshot.identity_subject, snapshot.identity_issuer
    # Serialize completion with a generation change. A stale completion invalidates
    # a newer in-flight completion too; neither can falsely clear reconciliation.
    person.identity_sync_revision += 1
    uncertain_creation = missing and person.provisioning_started_at and (
        datetime.fromisoformat(person.provisioning_started_at) > datetime.now(timezone.utc) - timedelta(minutes=2))
    person.identity_sync_pending = bool(failed or changed or uncertain_creation)
    db.commit()
    return employee_dict(db, person)


def activation_instructions(db, actor, uid):
    require_role(actor, 'hr', 'admin')
    person = local_person(db, uid)
    if has_role(person, 'admin', 'director', 'hr', 'finance', 'reviewer', 'signer', 'department_head'):
        require_role(actor, 'admin')
    if not person.active or person.provisioning_status != 'ready':
        raise DomainError('Instrucțiunile necesită un cont activ și provisionat.', 409)
    db.commit()
    if person.identity_subject:
        if person.identity_issuer != settings.oidc_issuer:
            raise DomainError('Identitatea contului aparține altei configurații.', 409)
        result = provisioning.provision(person)
    else:
        if settings.auth_mode != 'demo': raise DomainError('Contul nu are o identitate Keycloak asociată.', 409)
        result = {'temporary_password': secrets.token_urlsafe(18), 'invitation_status': 'local_password'}
        person.password_hash = hash_password(result['temporary_password'])
    record(db, actor, 'employee_activation_instructions', detail=f'{person.id}; {result["invitation_status"]}')
    db.commit()
    return {'user': employee_dict(db, person), **result}


def appointment_dict(db, item, actor):
    def name(uid):
        person = db.get(User, uid) if uid else None
        return person.name if person else ''
    dept = department(db, item.department_id)
    return {key: getattr(item, key) for key in ('id', 'department_id', 'user_id', 'effective_date', 'reason',
        'status', 'created_at', 'proposed_by', 'decided_by', 'decided_at', 'decision_comment')} | {
        'department': dept.name, 'name': name(item.user_id), 'proposer_name': name(item.proposed_by),
        'decider_name': name(item.decided_by), 'can_decide': item.status == 'pending'
        and has_role(actor, 'director') and actor.id not in (item.user_id, item.proposed_by)}


def list_appointments(db, actor):
    require_role(actor, 'hr', 'director', 'admin')
    items = db.scalars(select(HeadAppointment).where(HeadAppointment.airport_id == actor.airport_id)
        .order_by(HeadAppointment.created_at.desc())).all()
    return {'items': [appointment_dict(db, a, actor) for a in items]}


def propose_head(db, actor, body):
    require_role(actor, 'hr', 'admin')
    db.execute(text('BEGIN IMMEDIATE'))
    dept, person = department(db, body.department_id), local_person(db, body.user_id)
    if not person.active or person.department_id != dept.id:
        raise DomainError('Candidatul trebuie să fie activ în departamentul ales.', 422)
    if body.effective_date < settings.reference_date:
        raise DomainError('Numirea nu poate avea o dată în trecut.', 422)
    if db.scalar(select(HeadAppointment).where(HeadAppointment.department_id == dept.id,
        HeadAppointment.status.in_(['pending', 'approved']))):
        raise DomainError('Departamentul are deja o propunere în așteptare sau programată.', 409)
    item = HeadAppointment(id='appointment-' + uuid4().hex, airport_id=actor.airport_id, department_id=dept.id,
        user_id=person.id, proposed_by=actor.id, effective_date=str(body.effective_date), reason=body.reason,
        department_revision=dept.revision, status='pending', created_at=now(), decision_comment='')
    db.add(item)
    record(db, actor, 'department_head_proposed', detail=f'{item.id}; {person.name}; {dept.name}; {item.effective_date}; {body.reason}')
    db.commit()
    return appointment_dict(db, item, actor)


def decide_head(db, actor, appointment_id, body):
    require_role(actor, 'director')
    db.execute(text('BEGIN IMMEDIATE'))
    item = db.get(HeadAppointment, appointment_id)
    if not item or item.airport_id != actor.airport_id: raise DomainError('Propunerea nu a fost găsită.', 404)
    if actor.id in (item.user_id, item.proposed_by):
        raise DomainError('Numirea necesită aprobarea unui director independent.', 403)
    if item.status != 'pending': raise DomainError('Propunerea are deja o decizie.', 409)
    dept, person = department(db, item.department_id), local_person(db, item.user_id)
    if body.action == 'approve' and (not person.active or person.department_id != dept.id or dept.revision != item.department_revision):
        raise DomainError('Candidatul sau structura departamentului s-a schimbat. Creează o propunere nouă.', 409)
    if body.action == 'reject' and not body.comment.strip(): raise DomainError('Explică motivul respingerii.', 422)
    item.status = 'approved' if body.action == 'approve' else 'rejected'
    item.decided_by, item.decided_at, item.decision_comment = actor.id, now(), body.comment.strip()
    record(db, actor, 'department_head_' + item.status, detail=f'{item.id}; {person.name}; {dept.name}; {item.decision_comment}')
    db.commit()
    refresh_appointments(db)
    return appointment_dict(db, item, actor)


def refresh_appointments(db):
    if not db.scalar(select(HeadAppointment.id).where(HeadAppointment.airport_id == settings.airport_id,
        HeadAppointment.status == 'approved', HeadAppointment.effective_date <= str(settings.reference_date))): return
    db.commit()
    db.execute(text('BEGIN IMMEDIATE'))
    for item in db.scalars(select(HeadAppointment).where(HeadAppointment.airport_id == settings.airport_id,
        HeadAppointment.status == 'approved', HeadAppointment.effective_date <= str(settings.reference_date))):
        dept, person = department(db, item.department_id), local_person(db, item.user_id)
        actor = local_person(db, item.decided_by)
        if not person.active or person.department_id != dept.id or dept.revision != item.department_revision:
            item.status = 'cancelled'
            record(db, actor, 'department_head_cancelled', detail=f'{item.id}; candidatul sau departamentul s-a schimbat înainte de activare.')
            continue
        previous = dept.head_user_id
        dept.head_user_id, dept.revision = person.id, dept.revision + 1
        person.roles = sorted(set(person.roles) | {'department_head'})
        if previous and previous != person.id:
            old_head = local_person(db, previous)
            old_head.roles = [r for r in old_head.roles if r != 'department_head']
        item.status = 'active'
        for old in db.scalars(select(HeadAppointment).where(HeadAppointment.department_id == dept.id,
            HeadAppointment.id != item.id, HeadAppointment.status == 'active')): old.status = 'superseded'
        if previous and previous != person.id:
            from app.tasks.models import WorkflowTask
            from app.documents.models import Document
            from app.tasks.service import task_event
            for task in db.scalars(select(WorkflowTask).join(Document, Document.id == WorkflowTask.document_id).where(
                WorkflowTask.assigned_to == previous, WorkflowTask.status == 'pending', WorkflowTask.type == 'approval',
                Document.department == dept.name, Document.airport_id == settings.airport_id)):
                task.reassignment_required = True
                task_event(db, task, actor, 'Șef de departament înlocuit', 'Reatribuirea responsabilității necesită o decizie explicită.')
            for grant in db.scalars(select(Delegation).where(Delegation.from_user == previous)): grant.active = False
        record(db, actor, 'department_head_activated', detail=f'{item.id}; {dept.name}; {previous or "vacant"} → {person.id}')
    db.commit()


def signing_authority(db, actor, uid, body):
    require_role(actor, 'director')
    db.execute(text('BEGIN IMMEDIATE'))
    person = local_person(db, uid)
    if actor.id == person.id: raise DomainError('Nu poți modifica propria autoritate de semnare.', 403)
    if not person.active: raise DomainError('Persoana trebuie să aibă un cont activ.', 409)
    person.roles = sorted(set(person.roles) | {'signer'}) if body.enabled else [r for r in person.roles if r != 'signer']
    if not body.enabled:
        from app.tasks.models import WorkflowTask
        from app.tasks.service import task_event
        for task in db.scalars(select(WorkflowTask).where(WorkflowTask.assigned_to == uid,
            WorkflowTask.type == 'signature', WorkflowTask.status == 'pending')):
            task.reassignment_required = True
            task_event(db, task, actor, 'Autoritate de semnare revocată', body.reason)
    record(db, actor, 'signing_authority_granted' if body.enabled else 'signing_authority_revoked', detail=f'{person.id}; {body.reason}')
    db.commit()
    return employee_dict(db, person)
