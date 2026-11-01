import asyncio
import logging
from datetime import date, timedelta
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import desc, select, text

from app.config import settings
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import can_read, has_role, is_department_head
from app.database import SessionLocal
from app.documents.models import Document, DocumentVersion
from app.people.models import User
from app.renewals.models import ContractRenewal, RenewalEvent, RenewalReminder
from app.documents.followup import renewal_stopped, state as followup_state


OPEN_STATUSES = ('pending', 'acknowledged', 'in_progress')
THRESHOLDS = (90, 60, 30)
SYSTEM = SimpleNamespace(id='system', name='FlyLeaf')
logger = logging.getLogger(__name__)


def expiry_date(document):
    try:
        return date.fromisoformat(document.expires_at[:10]) if document.expires_at else None
    except (ValueError, TypeError):
        return None


def current_source(renewal, document):
    return bool(document and document.category == 'Contract'
        and document.airport_id == renewal.airport_id
        and document.validated and document.status in ('approved', 'signed')
        and document.version == renewal.source_version
        and expiry_date(document) == date.fromisoformat(renewal.expires_at))


def eligible(user, document):
    # Approval delegation does not grant renewal ownership
    return bool(user and user.active and can_read(user, document) and (
        has_role(user, 'director') or is_department_head(user, document.department) or (
            has_role(user, 'reviewer') and user.department == document.department
        )
    ))


def candidates(db, document):
    users = db.scalars(select(User).where(User.airport_id == document.airport_id, User.active == True)).all()
    return sorted((user for user in users if eligible(user, document)),
        key=lambda user: (has_role(user, 'director'), user.id))


def default_assignee(db, document):
    users = candidates(db, document)
    own_department = [user for user in users if user.department == document.department]
    selected = own_department or users
    return selected[0].id if selected else None


def can_act(db, user, renewal, document):
    assigned = db.get(User, renewal.assigned_to) if renewal.assigned_to else None
    return bool(renewal.status in OPEN_STATUSES and current_source(renewal, document) and not renewal_stopped(document)
        and assigned and eligible(assigned, document)
        and user.id == renewal.assigned_to and eligible(user, document))


def can_reassign(user, renewal, document):
    return bool(user.active and can_read(user, document)
        and renewal.status in OPEN_STATUSES and current_source(renewal, document) and not renewal_stopped(document)
        and (has_role(user, 'admin', 'director') or is_department_head(user, document.department)))


def add_event(db, renewal, actor, action, comment, document=None, timestamp=None):
    actor = actor or SYSTEM
    timestamp = timestamp or now()
    db.add(RenewalEvent(renewal_id=renewal.id, actor_id=actor.id,
        actor=actor.name, action=action, comment=comment, created_at=timestamp))
    if document and document.airport_id == renewal.airport_id:
        record(db, actor, action, document,
            f'Urmărire {renewal.id} · versiunea {renewal.source_version} · {comment}')


def sync_all(actor=None):
    # One write transaction prevents duplicate cases and reminders
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        today = settings.reference_date
        timestamp = now()
        renewals = db.scalars(select(ContractRenewal).where(
            ContractRenewal.airport_id == settings.airport_id)).all()
        by_source = {(item.contract_id, item.source_version, item.expires_at): item for item in renewals}
        for item in renewals:
            document = db.get(Document, item.contract_id)
            if item.status in OPEN_STATUSES and not current_source(item, document):
                item.status = 'cancelled'
                item.revision += 1
                item.updated_at = timestamp
                add_event(db, item, actor, 'Urmărire reînnoire anulată',
                    'Contractul sau data expirării s-a schimbat; istoricul este păstrat', document, timestamp)

        documents = db.scalars(select(Document).where(
            Document.airport_id == settings.airport_id,
            Document.category == 'Contract', Document.validated == True,
            Document.status.in_(('approved', 'signed')))).all()
        created = triggered = 0
        for document in documents:
            if renewal_stopped(document):
                continue
            expiry = expiry_date(document)
            if not expiry or (expiry - today).days > 90:
                continue
            key = (document.id, document.version, expiry.isoformat())
            item = by_source.get(key)
            if not item:
                version = db.scalar(select(DocumentVersion).where(
                    DocumentVersion.document_id == document.id, DocumentVersion.version == document.version))
                if not version:
                    continue
                item = ContractRenewal(id='renewal-' + uuid4().hex[:16],
                    contract_id=document.id, airport_id=document.airport_id,
                    source_version=document.version, expires_at=expiry.isoformat(),
                    assigned_to=default_assignee(db, document),
                    due_date=(expiry - timedelta(days=30)).isoformat(),
                    status='pending', revision=1, created_at=timestamp, updated_at=timestamp)
                db.add(item)
                db.flush()
                add_event(db, item, actor, 'Urmărire reînnoire creată',
                    f'Expirare {item.expires_at} · primul termen de urmărire {item.due_date}', document, timestamp)
                for threshold in THRESHOLDS:
                    db.add(RenewalReminder(renewal_id=item.id, threshold_days=threshold,
                        due_date=(expiry - timedelta(days=threshold)).isoformat()))
                db.flush()
                by_source[key] = item
                created += 1
            if item.status not in OPEN_STATUSES:
                continue
            reminders = db.scalars(select(RenewalReminder).where(RenewalReminder.renewal_id == item.id)).all()
            for reminder in reminders:
                if reminder.triggered_at is None and reminder.due_date <= today.isoformat():
                    reminder.triggered_at = timestamp
                    add_event(db, item, actor, 'Reminder de reînnoire înregistrat',
                        f'Prag de {reminder.threshold_days} zile · data planificată {reminder.due_date}', document, timestamp)
                    triggered += 1
        db.commit()
        return {'created': created, 'triggered': triggered}


async def monitor():
    while True:
        await asyncio.sleep(60)
        job = asyncio.create_task(asyncio.to_thread(sync_all))
        try:
            await asyncio.shield(job)
        except asyncio.CancelledError:
            # Finish an active database transaction before stopping the monitor
            try:
                await job
            except Exception:
                logger.exception('Contract renewal synchronization failed during shutdown')
            raise
        except Exception:
            logger.exception('Contract renewal synchronization failed')


def serialize(db, user, renewal, document):
    followup = followup_state(db, document, user)
    stopped = followup['not_renewing'] and current_source(renewal, document)
    principal = db.get(User, renewal.assigned_to) if renewal.assigned_to else None
    assigned = bool(principal and eligible(principal, document))
    actionable = can_act(db, user, renewal, document)
    manage = can_reassign(user, renewal, document)
    today = settings.reference_date
    reminders = db.scalars(select(RenewalReminder).where(
        RenewalReminder.renewal_id == renewal.id).order_by(desc(RenewalReminder.threshold_days))).all()
    history = db.scalars(select(RenewalEvent).where(
        RenewalEvent.renewal_id == renewal.id).order_by(desc(RenewalEvent.id))).all()
    return {
        'id': renewal.id, 'contract_id': document.id,
        'source_version': renewal.source_version, 'expires_at': renewal.expires_at,
        'title': document.title, 'number': document.number,
        'supplier': document.supplier, 'department': document.department,
        'status': 'not_renewing' if stopped else renewal.status, 'revision': renewal.revision,
        'follow_up': followup,
        'assigned_to': renewal.assigned_to,
        'assignee': principal.name if assigned else 'Reatribuire necesară',
        'principal_name': principal.name if principal else None,
        'assignment_state': 'assigned' if assigned else 'needs_reassignment',
        'due_date': renewal.due_date,
        'days_remaining': (date.fromisoformat(renewal.expires_at) - today).days,
        'overdue': renewal.status in OPEN_STATUSES and current_source(renewal, document) and not followup['alerts_suppressed']
            and renewal.due_date < today.isoformat(),
        'source_current': current_source(renewal, document),
        'acknowledged_by': renewal.acknowledged_by, 'acknowledged_at': renewal.acknowledged_at,
        'closed_by': renewal.closed_by, 'closed_at': renewal.closed_at,
        'created_at': renewal.created_at, 'updated_at': renewal.updated_at,
        'can_acknowledge': actionable and renewal.status == 'pending',
        'can_progress': actionable and renewal.status in ('acknowledged', 'in_progress'),
        'can_close': actionable and renewal.status in ('acknowledged', 'in_progress'),
        'can_reassign': manage,
        'eligible_assignees': [{'id': person.id, 'name': person.name, 'department': person.department}
            for person in candidates(db, document)] if manage else [],
        'reminders': [{'threshold_days': reminder.threshold_days,
            'due_date': reminder.due_date, 'triggered_at': reminder.triggered_at} for reminder in reminders],
        'history': [{'id': event.id, 'actor_id': event.actor_id, 'actor': event.actor,
            'action': event.action, 'comment': event.comment, 'created_at': event.created_at} for event in history],
    }


def list_renewals(db, user, status='open'):
    query = select(ContractRenewal).where(ContractRenewal.airport_id == user.airport_id).order_by(
        ContractRenewal.due_date, desc(ContractRenewal.created_at))
    items = []
    for renewal in db.scalars(query).all():
        document = db.get(Document, renewal.contract_id)
        if document and can_read(user, document):
            items.append(serialize(db, user, renewal, document))
    open_items = [item for item in items if item['status'] in OPEN_STATUSES]
    selected = items if status == 'all' else [item for item in items if (
        item['status'] in OPEN_STATUSES if status == 'open' else item['status'] not in OPEN_STATUSES)]
    return {'items': selected, 'total': len(selected), 'reference_date': str(settings.reference_date),
        'can_sync': has_role(user, 'admin', 'director'),
        'counters': {'open': len(open_items), 'overdue': sum(item['overdue'] for item in open_items),
            'needs_reassignment': sum(item['assignment_state'] == 'needs_reassignment' for item in open_items)}}


def get_renewal(db, user, renewal_id):
    renewal = db.get(ContractRenewal, renewal_id)
    document = db.get(Document, renewal.contract_id) if renewal else None
    if not renewal or renewal.airport_id != user.airport_id or not document or not can_read(user, document):
        raise DomainError('Urmărirea nu a fost găsită sau nu ai acces', 404)
    return renewal, document


def require_current(renewal, document, revision):
    if renewal_stopped(document):
        raise DomainError('Contractul are o decizie de nereînnoire. Reia urmărirea din document înainte de această acțiune.', 409)
    if revision != renewal.revision or not current_source(renewal, document):
        raise DomainError('Contractul sau urmărirea s-a schimbat; reîncarcă lista', 409)
    if renewal.status not in OPEN_STATUSES:
        raise DomainError('Această urmărire este închisă și se păstrează pentru consultare', 409)


def require_owner(db, user, renewal, document):
    if not can_act(db, user, renewal, document):
        raise DomainError('Acțiunea aparține responsabilului desemnat; solicită reatribuirea dacă este necesar', 403)


def acknowledge(db, user, renewal_id, body):
    db.execute(text('BEGIN IMMEDIATE'))
    renewal, document = get_renewal(db, user, renewal_id)
    require_current(renewal, document, body.revision)
    require_owner(db, user, renewal, document)
    if renewal.status != 'pending':
        return serialize(db, user, renewal, document)
    timestamp = now()
    renewal.status = 'acknowledged'
    renewal.acknowledged_by = user.id
    renewal.acknowledged_at = timestamp
    renewal.revision += 1
    renewal.updated_at = timestamp
    add_event(db, renewal, user, 'Urmărire reînnoire preluată',
        'Responsabilul a confirmat preluarea urmăririi', document, timestamp)
    db.commit()
    return serialize(db, user, renewal, document)


def progress(db, user, renewal_id, body):
    db.execute(text('BEGIN IMMEDIATE'))
    renewal, document = get_renewal(db, user, renewal_id)
    require_current(renewal, document, body.revision)
    require_owner(db, user, renewal, document)
    if renewal.status not in ('acknowledged', 'in_progress'):
        raise DomainError('Confirmă preluarea urmăririi înainte de a adăuga progres', 409)
    renewal.status = 'in_progress'
    if body.next_due_date:
        renewal.due_date = body.next_due_date.isoformat()
    renewal.revision += 1
    renewal.updated_at = now()
    add_event(db, renewal, user, 'Progres reînnoire înregistrat',
        f'{body.comment} · termen de urmărire {renewal.due_date}', document, renewal.updated_at)
    db.commit()
    return serialize(db, user, renewal, document)


def close(db, user, renewal_id, body):
    db.execute(text('BEGIN IMMEDIATE'))
    renewal, document = get_renewal(db, user, renewal_id)
    require_current(renewal, document, body.revision)
    require_owner(db, user, renewal, document)
    if renewal.status not in ('acknowledged', 'in_progress'):
        raise DomainError('Confirmă preluarea urmăririi înainte de a o închide', 409)
    # Closing follow-up never changes the contract or extends its validity
    renewal.status = 'completed'
    renewal.closed_by = user.id
    renewal.closed_at = now()
    renewal.revision += 1
    renewal.updated_at = renewal.closed_at
    add_event(db, renewal, user, 'Urmărire reînnoire închisă', body.comment, document, renewal.updated_at)
    db.commit()
    return serialize(db, user, renewal, document)


def assign(db, user, renewal_id, body):
    db.execute(text('BEGIN IMMEDIATE'))
    renewal, document = get_renewal(db, user, renewal_id)
    require_current(renewal, document, body.revision)
    if not can_reassign(user, renewal, document):
        raise DomainError('Nu ai autoritate de reatribuire pentru această urmărire', 403)
    target = db.get(User, body.assigned_to)
    if not eligible(target, document):
        raise DomainError('Persoana aleasă nu este activă sau eligibilă pentru acest contract', 422)
    due_date = body.due_date.isoformat() if body.due_date else renewal.due_date
    if target.id == renewal.assigned_to and due_date == renewal.due_date:
        return serialize(db, user, renewal, document)
    previous = db.get(User, renewal.assigned_to) if renewal.assigned_to else None
    renewal.assigned_to = target.id
    renewal.due_date = due_date
    renewal.status = 'pending'
    renewal.acknowledged_by = renewal.acknowledged_at = None
    renewal.revision += 1
    renewal.updated_at = now()
    add_event(db, renewal, user, 'Urmărire reînnoire reatribuită',
        f'{previous.name if previous else "Neatribuit"} → {target.name} · {body.comment}', document, renewal.updated_at)
    db.commit()
    return serialize(db, user, renewal, document)


def flag_offboarding(db, target, user):
    for renewal in db.scalars(select(ContractRenewal).where(
        ContractRenewal.assigned_to == target.id, ContractRenewal.status.in_(OPEN_STATUSES))).all():
        renewal.revision += 1
        renewal.updated_at = now()
        renewal.assigned_to = None
        renewal.status = 'pending'
        renewal.acknowledged_by = renewal.acknowledged_at = None
        document = db.get(Document, renewal.contract_id)
        add_event(db, renewal, user, 'Responsabil reînnoire dezactivat',
            f'Responsabil anterior: {target.name} ({target.id}) · urmărirea necesită reatribuire explicită',
            document, renewal.updated_at)
