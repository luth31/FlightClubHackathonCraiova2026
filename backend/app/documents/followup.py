"""Personal reminders and explicit, version-bound non-renewal decisions."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.orm import object_session

from app.config import settings
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import current_user, has_role, is_department_head
from app.database import get_db
from app.documents.models import DocumentReminder, DocumentRenewalDecision
from app.documents.service import get_document
from app.people.models import User

router = APIRouter(prefix='/api/documents', tags=['Document follow-up'])


def matches_source(row, document):
    return bool(row and row.active and row.source_version == document.version
        and row.expires_at == document.expires_at and document.status != 'archived')


def nonrenewal(db, document):
    row = db.get(DocumentRenewalDecision, document.id)
    return row if matches_source(row, document) and document.category == 'Contract' else None


def renewal_stopped(document):
    db = object_session(document)
    return bool(db and nonrenewal(db, document))


def can_decide(user, document):
    return bool(document.category == 'Contract' and document.validated and document.expires_at
        and document.status in ('approved', 'signed')
        and (has_role(user, 'director') or is_department_head(user, document.department)))


def state(db, document, user, *, include_candidates=False):
    reminder = db.get(DocumentReminder, (document.id, user.id))
    decision = db.get(DocumentRenewalDecision, document.id)
    current_reminder = reminder if matches_source(reminder, document) else None
    current_decision = decision if matches_source(decision, document) and document.category == 'Contract' else None
    paused = bool(current_reminder and current_reminder.remind_on > str(settings.reference_date))
    responsible = db.get(User, current_decision.responsible_id) if current_decision else None
    actor = db.get(User, current_decision.decided_by) if current_decision else None
    result = {
        'reference_date': str(settings.reference_date),
        'reminder_revision': reminder.revision if reminder else 0,
        'decision_revision': decision.revision if decision else 0,
        'remind_on': current_reminder.remind_on if current_reminder else None,
        'snoozed': paused, 'reminder_due': bool(current_reminder and not paused),
        'not_renewing': bool(current_decision),
        'alerts_suppressed': document.status == 'archived' or bool(current_decision) or paused,
        'can_remind': document.status != 'archived',
        'can_decide': can_decide(user, document),
        'decision': {'reason': current_decision.reason,
            'responsible_id': current_decision.responsible_id,
            'responsible': responsible.name if responsible else 'Responsabil indisponibil',
            'responsible_active': bool(responsible and responsible.active),
            'decided_by': actor.name if actor else current_decision.decided_by,
            'decided_at': current_decision.updated_at} if current_decision else None,
    }
    if include_candidates and result['can_decide']:
        from app.renewals.service import candidates
        result['candidates'] = [{'id': u.id, 'name': u.name, 'department': u.department} for u in candidates(db, document)]
    return result


class FollowUpAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['snooze', 'clear_reminder', 'do_not_renew', 'resume_renewal']
    version: int = Field(ge=1)
    revision: int = Field(ge=0)
    remind_on: date | None = None
    reason: str = Field('', max_length=2000)
    responsible_id: str | None = Field(None, max_length=100)


@router.post('/{document_id}/follow-up')
def update(document_id: str, body: FollowUpAction, db=Depends(get_db), user=Depends(current_user)):
    db.execute(text('BEGIN IMMEDIATE'))
    document = get_document(db, document_id, user)
    if body.version != document.version or document.status == 'archived':
        raise DomainError('Documentul s-a schimbat sau este arhivat. Reîncarcă documentul.', 409)
    personal = body.action in ('snooze', 'clear_reminder')
    model = DocumentReminder if personal else DocumentRenewalDecision
    key = (document.id, user.id) if personal else document.id
    row = db.get(model, key)
    if body.revision != (row.revision if row else 0):
        raise DomainError('Urmărirea a fost modificată între timp. Reîncarcă documentul.', 409)
    timestamp = now()
    if personal:
        if body.action == 'snooze' and (not body.remind_on or body.remind_on <= settings.reference_date):
            raise DomainError('Alege o dată viitoare pentru memento.', 422)
        if not row:
            row = DocumentReminder(document_id=document.id, user_id=user.id, revision=0)
            db.add(row)
        row.remind_on = str(body.remind_on) if body.action == 'snooze' else None
        row.active = body.action == 'snooze'
        label = 'Memento personal programat' if row.active else 'Memento personal încheiat'
        comment = f'Data revenirii: {row.remind_on}' if row.active else 'Avertizările obișnuite sunt reluate.'
    else:
        if not can_decide(user, document):
            raise DomainError('Decizia aparține directorului sau șefului departamentului documentului.', 403)
        reason = body.reason.strip()
        if len(reason) < 10:
            raise DomainError('Explică decizia în cel puțin 10 caractere.', 422)
        if body.action == 'do_not_renew':
            from app.renewals.service import eligible
            responsible = db.get(User, body.responsible_id) if body.responsible_id else None
            if not responsible or not eligible(responsible, document):
                raise DomainError('Alege un responsabil activ și autorizat pentru contract.', 422)
        elif not matches_source(row, document):
            raise DomainError('Contractul nu are o decizie activă de nereînnoire.', 409)
        if not row:
            row = DocumentRenewalDecision(document_id=document.id, revision=0)
            db.add(row)
        row.active = body.action == 'do_not_renew'
        row.reason, row.decided_by = reason, user.id
        if row.active:
            row.responsible_id = responsible.id
        label = 'Contractul nu se reînnoiește' if row.active else 'Reînnoirea contractului a fost reluată'
        comment = reason + (f' · Responsabil: {responsible.name}' if row.active else '')
        row.source_version, row.expires_at, row.updated_at = document.version, document.expires_at, timestamp
        # Invalidate an already-open renewal action dialog as well.
        from app.renewals.models import ContractRenewal
        from sqlalchemy import select
        with db.no_autoflush:
            for renewal in db.scalars(select(ContractRenewal).where(ContractRenewal.contract_id == document.id)):
                renewal.revision += 1
    row.source_version, row.expires_at = document.version, document.expires_at
    row.revision += 1
    row.updated_at = timestamp
    record(db, user, label, document, f'Versiunea {document.version} · {comment}')
    db.commit()
    return state(db, document, user, include_candidates=True)
