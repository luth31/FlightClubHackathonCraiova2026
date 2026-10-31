from uuid import uuid4
from sqlalchemy import select, text
from app.config import settings
from app.core.audit import record
from app.core.exceptions import DomainError
from app.core.security import has_role, require_role, user_dict
from app.people.models import User, Delegation, LeaveRequest, Session, HeadAppointment


def local_user(db, user_id, active=False):
    user = db.get(User, user_id)
    if not user or user.airport_id != settings.airport_id:
        raise DomainError('Persoana nu a fost găsită.', 404)
    if active and not user.active:
        raise DomainError('Contul persoanei este dezactivat.', 409)
    return user


def can_review_department(db, user, department):
    """Delegation conveys only approval scope, never the source's signing identity."""
    if not user.active or user.airport_id != settings.airport_id:
        return False
    from app.people.management import is_head
    if is_head(db, user, department) or has_role(user, 'director') or (has_role(user, 'reviewer', 'hr') and user.department == department):
        return True
    if not has_role(user, 'reviewer', 'department_head'):
        return False
    today = settings.reference_date.isoformat()
    for delegation in db.scalars(select(Delegation).where(Delegation.to_user == user.id, Delegation.active == True,
            Delegation.starts_at <= today, Delegation.ends_at >= today)):
        source = db.get(User, delegation.from_user)
        if source and source.active and source.airport_id == user.airport_id and source.department == department and (has_role(source, 'reviewer', 'director') or is_head(db, source, department)):
            return True
    return False


def delegation_dict(db, item):
    source, target = db.get(User, item.from_user), db.get(User, item.to_user)
    today = settings.reference_date.isoformat()
    state = 'active' if item.active and item.starts_at <= today <= item.ends_at else 'scheduled' if item.active and today < item.starts_at else 'expired' if item.active else 'revoked'
    return {'id': item.id, 'from_user': item.from_user, 'to_user': item.to_user,
            'from_name': source.name if source else '', 'to_name': target.name if target else '',
            'starts_at': item.starts_at, 'ends_at': item.ends_at, 'reason': item.reason,
            'active': item.active, 'status': state, 'scope': 'Aprobări în departamentul delegantului'}


def can_review_leave(db, user, leave):
    if leave.user_id == user.id:
        return False
    subject = local_user(db, leave.user_id)
    return has_role(user, 'hr') or (has_role(user, 'reviewer', 'director', 'department_head') and
        (getattr(subject, 'manager_id', None) == user.id or subject.department == user.department or has_role(user, 'director')))


def directory(db, user):
    from app.people.management import employee_dict, department_records
    users = list(db.scalars(select(User).where(User.airport_id == user.airport_id).order_by(User.name)))
    user_ids = {person.id for person in users}
    all_leaves = list(db.scalars(select(LeaveRequest).where(LeaveRequest.user_id.in_(user_ids))))
    today = settings.reference_date.isoformat()
    open_appointments = {appointment.department_id: appointment for appointment in db.scalars(
        select(HeadAppointment).where(HeadAppointment.airport_id == user.airport_id,
            HeadAppointment.status.in_(['pending', 'approved'])))}
    can_propose_heads = has_role(user, 'admin', 'hr')
    can_view_appointments = has_role(user, 'admin', 'hr', 'director')
    items = []
    for person in users:
        item = employee_dict(db, person)
        appointment = open_appointments.get(person.department_id)
        item['can_propose_head'] = can_propose_heads and person.active and not item['is_department_head'] and appointment is None
        item['head_appointment'] = {'status': appointment.status, 'effective_date': appointment.effective_date} if can_view_appointments and appointment and appointment.user_id == person.id else None
        item['manager_id'] = getattr(person, 'manager_id', None)
        manager = db.get(User, item['manager_id']) if item['manager_id'] else None
        item['manager_name'] = manager.name if manager else None
        item['job_title'] = getattr(person, 'job_title', '') or person.role
        item['availability'] = 'inactive' if not person.active else 'away' if any(
            leave.user_id == person.id and leave.status == 'approved' and leave.starts_at <= today <= leave.ends_at
            for leave in all_leaves) else 'available'
        items.append(item)
    delegations = [delegation_dict(db, d) for d in db.scalars(select(Delegation).where(Delegation.from_user.in_(user_ids)))]
    leaves = []
    for leave in all_leaves:
        if leave.user_id != user.id and not can_review_leave(db, user, leave):
            continue
        person = local_user(db, leave.user_id)
        leaves.append({'id': leave.id, 'user_id': leave.user_id, 'name': person.name, 'department': person.department,
            'starts_at': leave.starts_at, 'ends_at': leave.ends_at, 'reason': leave.reason, 'status': leave.status,
            'approver_id': leave.approver_id, 'can_decide': leave.status == 'pending' and can_review_leave(db, user, leave)})
    return {'items': items, 'total': len(items), 'departments': sorted({p.department for p in users}),
        'delegations': delegations, 'leaves': leaves, 'current_user_id': user.id,
        'can_manage_accounts': has_role(user, 'admin', 'hr'),
        'can_admin_delegations': has_role(user, 'admin'),
        'can_create_users': has_role(user, 'admin', 'hr'),
        'can_propose_heads': can_propose_heads,
        'can_manage_signing': has_role(user, 'director'),
        'can_view_appointments': can_view_appointments,
        'department_records': department_records(db),
        'auth_mode': settings.auth_mode,
        'can_manage_delegations': has_role(user, 'admin', 'director', 'reviewer', 'department_head'),
        'reference_date': today}


def create_delegation(db, user, payload):
    # Serialize overlap checks with insertion: two requests must not create
    # competing delegations from the same authority for the same interval.
    db.execute(text('BEGIN IMMEDIATE'))
    require_role(user, 'admin', 'director', 'reviewer', 'department_head')
    source = local_user(db, payload.from_user, active=True)
    target = local_user(db, payload.to_user, active=True)
    if source.id != user.id and not has_role(user, 'admin'):
        raise DomainError('Poți delega numai propria autoritate.', 403)
    if source.id == target.id:
        raise DomainError('Alege o altă persoană pentru delegare.', 422)
    if not has_role(source, 'reviewer', 'director', 'department_head') or not has_role(target, 'reviewer', 'director', 'department_head'):
        raise DomainError('Delegarea necesită două persoane cu autoritate de aprobare.', 422)
    start, end = payload.starts_at.isoformat(), payload.ends_at.isoformat()
    if end < settings.reference_date.isoformat():
        raise DomainError('Delegarea nu poate începe cu o perioadă deja încheiată.', 422)
    existing = db.scalars(select(Delegation).where(Delegation.from_user == source.id, Delegation.active == True)).all()
    if any(d.starts_at <= end and d.ends_at >= start for d in existing):
        raise DomainError('Există deja o delegare pentru acest interval. Revoc-o înainte de a o înlocui.', 409)
    item = Delegation(id=f'del-{uuid4().hex[:12]}', from_user=source.id, to_user=target.id,
        starts_at=start, ends_at=end, reason=payload.reason.strip(), active=True)
    db.add(item)
    record(db, user, 'delegation_created', detail=f'{source.name} → {target.name}; {start}–{end}; numai aprobări, fără drept de semnare.')
    db.commit()
    return delegation_dict(db, item)


def revoke_delegation(db, user, delegation_id):
    item = db.get(Delegation, delegation_id)
    if not item:
        raise DomainError('Delegarea nu a fost găsită.', 404)
    local_user(db, item.from_user)
    if item.from_user != user.id and not has_role(user, 'admin'):
        raise DomainError('Nu poți revoca delegarea altei persoane.', 403)
    if item.active:
        item.active = False
        record(db, user, 'delegation_revoked', detail=f'Delegarea {item.id} a fost revocată.')
        db.commit()
    return delegation_dict(db, item)


def create_leave(db, user, payload):
    db.execute(text('BEGIN IMMEDIATE'))
    start, end = payload.starts_at.isoformat(), payload.ends_at.isoformat()
    if end < settings.reference_date.isoformat():
        raise DomainError('Alege o perioadă care nu s-a încheiat.', 422)
    existing = db.scalars(select(LeaveRequest).where(LeaveRequest.user_id == user.id, LeaveRequest.status.in_(['pending', 'approved']))).all()
    if any(item.starts_at <= end and item.ends_at >= start for item in existing):
        raise DomainError('Există deja o cerere de concediu pentru acest interval.', 409)
    leave = LeaveRequest(id=f'leave-{uuid4().hex[:12]}', user_id=user.id, starts_at=start,
        ends_at=end, reason=payload.reason.strip(), status='pending')
    db.add(leave)
    record(db, user, 'leave_requested', detail=f'Cerere {leave.id}; perioada {start}–{end}.')
    db.commit()
    return {'id': leave.id, 'status': leave.status}


def decide_leave(db, user, leave_id, payload):
    # The pending-state read and its decision are one write transaction.
    # Without this lock, two reviewers can both accept a stale pending state.
    db.execute(text('BEGIN IMMEDIATE'))
    item = db.get(LeaveRequest, leave_id)
    if not item:
        raise DomainError('Cererea nu a fost găsită.', 404)
    if not can_review_leave(db, user, item):
        raise DomainError('Cererea necesită aprobarea unei alte persoane autorizate.', 403)
    if item.status != 'pending':
        raise DomainError('Cererea are deja o decizie.', 409)
    if payload.action == 'reject' and not payload.comment.strip():
        raise DomainError('Explică motivul respingerii.', 422)
    item.status = 'approved' if payload.action == 'approve' else 'rejected'
    item.approver_id = user.id
    record(db, user, 'leave_' + item.status, detail=f'Cerere {item.id}; {payload.comment.strip()}')
    db.commit()
    return {'id': item.id, 'status': item.status}


def update_account(db, user, user_id, payload):
    require_role(user, 'admin')
    target = local_user(db, user_id)
    if target.id == user.id:
        raise DomainError('Nu poți dezactiva propriul cont în sesiunea curentă.', 409)
    target.active = payload.active
    if not target.active:
        from app.tasks.service import flag_offboarding
        flag_offboarding(db,target,user)
        for session in db.scalars(select(Session).where(Session.user_id == target.id)):
            db.delete(session)
        for delegation in db.scalars(select(Delegation).where((Delegation.from_user == target.id) | (Delegation.to_user == target.id))):
            delegation.active = False
    record(db, user, 'account_activated' if payload.active else 'account_deactivated', detail=f'{target.name} ({target.id})')
    db.commit()
    return user_dict(target)
