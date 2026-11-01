from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.core.security import current_user
from app.core.audit import record, serialize as serialize_event
from app.core.models import AuditEvent
from app.documents.service import visible_documents, serialize, matching_document_ids, get_document
from app.tasks.service import list_tasks
from app.renewals.service import list_renewals
from app.equipment.models import Equipment, EquipmentJob, EquipmentIncident, EquipmentEvent
from app.equipment.router import manager, ACTIVE
from app.core.exceptions import DomainError
from app.documents.followup import state as followup_state

router = APIRouter(prefix='/api/workspace', tags=['Personal workspace'])


def validity(doc):
    if not doc.validated or not doc.expires_at:
        return 'unknown'
    try:
        days = (date.fromisoformat(doc.expires_at[:10]) - settings.reference_date).days
    except (ValueError, TypeError):
        return 'unknown'
    return 'expired' if days < 0 else 'expiring' if days <= 30 else 'valid'


@router.get('/documents')
def documents(q: str = Query('', max_length=200), category: str = '', status: str = '', department: str = '',
        supplier: str = '', owner: str = '', validity_filter: str = Query('', pattern='^(|expiring|expired|valid|unknown)$'),
        contract_status: str = Query('', pattern='^(|active|pending|scheduled|expired|archived)$'),
        created_from: date | None = None, created_to: date | None = None,
        expires_from: date | None = None, expires_to: date | None = None,
        metadata_key: str = Query('', max_length=100), metadata_value: str = Query('', max_length=200),
        validated: str = Query('', pattern='^(|yes|no)$'),
        follow_up: str = Query('', pattern='^(|active|snoozed|due|not_renewing)$'),
        sort_by: str = Query('updated_at', pattern='^(updated_at|created_at|expires_at|title|number|owner|supplier|value)$'),
        sort_order: str = Query('desc', pattern='^(asc|desc)$'),
        mine: bool = False, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
        db: Session = Depends(get_db), user=Depends(current_user)):
    for start, end in ((created_from, created_to), (expires_from, expires_to)):
        if start and end and start > end:
            raise DomainError('Data de început trebuie să fie înaintea datei de sfârșit.', 422)
    if metadata_value and not metadata_key:
        raise DomainError('Alege câmpul de metadate înaintea valorii.', 422)
    visible = visible_documents(db, user)
    serialized = {d.id: serialize(d, user=user) for d in visible}
    followups = {d.id: followup_state(db, d, user) for d in visible}
    mine_tasks = list_tasks(db, user, mine=True)['items']
    action_ids = {t['document_id'] for t in mine_tasks}
    docs = visible
    if q:
        matching = matching_document_ids(db, q)
        docs = [d for d in docs if d.id in matching]
    if category: docs = [d for d in docs if d.category == category]
    if department: docs = [d for d in docs if d.department == department]
    if supplier: docs = [d for d in docs if d.supplier == supplier]
    if owner: docs = [d for d in docs if d.owner == owner]
    if status: docs = [d for d in docs if d.status == status or (status == 'approved' and d.status == 'signed')]
    if contract_status: docs = [d for d in docs if d.category == 'Contract' and serialize(d, user=user)['contract_status'] == contract_status]
    if mine: docs = [d for d in docs if d.id in action_ids]
    if validated: docs = [d for d in docs if d.validated == (validated == 'yes')]
    for field, start, end in (('created_at', created_from, created_to), ('expires_at', expires_from, expires_to)):
        if start or end:
            docs = [d for d in docs if getattr(d, field) and
                (not start or getattr(d, field)[:10] >= str(start)) and
                (not end or getattr(d, field)[:10] <= str(end))]
    if metadata_key:
        docs = [d for d in docs if (value := serialized[d.id].get('metadata', {}).get(metadata_key)) is not None
            and isinstance(value, (str, int, float, bool))
            and (not metadata_value or metadata_value.casefold() in str(value).casefold())]
    if follow_up:
        docs = [d for d in docs if (
            not followups[d.id]['alerts_suppressed'] if follow_up == 'active' else
            followups[d.id]['reminder_due'] and not followups[d.id]['not_renewing'] if follow_up == 'due' else
            followups[d.id][follow_up])]
    counters = {'total': len(docs), **{key: sum(d.status != 'archived' and validity(d) == key for d in docs) for key in ('expiring', 'expired', 'unknown')}}
    if validity_filter: docs = [d for d in docs if d.status != 'archived' and validity(d) == validity_filter]
    # Stable ordering before pagination; missing dates/values stay last in either direction.
    docs.sort(key=lambda d: d.id)
    present = [d for d in docs if getattr(d, sort_by) is not None and getattr(d, sort_by) != '']
    absent = [d for d in docs if getattr(d, sort_by) is None or getattr(d, sort_by) == '']
    present.sort(key=lambda d: getattr(d, sort_by).casefold() if isinstance(getattr(d, sort_by), str)
        else getattr(d, sort_by), reverse=sort_order == 'desc')
    docs = present + absent
    return {'items': [{**serialized[d.id], 'validity': validity(d), 'follow_up': followups[d.id]} for d in docs[offset:offset + limit]],
        'total': len(docs), 'counters': counters, 'my_approvals': sum(t['type'] == 'approval' for t in mine_tasks), 'my_actions': len(mine_tasks),
        'reference_date': str(settings.reference_date),
        'facets': {**{key: sorted({getattr(d, field) for d in visible if getattr(d, field)})
            for key, field in [('categories', 'category'), ('departments', 'department'), ('suppliers', 'supplier'), ('owners', 'owner')]},
            'metadata_keys': sorted({key for d in serialized.values() for key, value in d.get('metadata', {}).items()
                if isinstance(value, (str, int, float, bool)) and not key.startswith(('_', 'demo_'))
                and key not in ('managed_by', 'leave_request_id', 'decision_by', 'decided_at', 'decision_comment')})}}


@router.post('/recent/{document_id}')
def recent(document_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    document = get_document(db, document_id, user)
    record(db, user, 'Document deschis', document, f'Versiunea {document.version}')
    db.commit()
    return {'ok': True}


@router.get('/home')
def home(db: Session = Depends(get_db), user=Depends(current_user)):
    visible = {d.id: d for d in visible_documents(db, user)}
    followups = {d.id: followup_state(db, d, user) for d in visible.values()}
    owned = {d.id for d in visible.values() if d.created_by == user.id or d.owner_id == user.id}
    tasks = list_tasks(db, user, mine=True)['items']
    renewals = [r for r in list_renewals(db, user)['items'] if r['assigned_to'] == user.id and r['source_current']
        and not followups[r['contract_id']]['alerts_suppressed'] and not followups[r['contract_id']]['reminder_due']]
    related = owned | {t['document_id'] for t in tasks} | {r['contract_id'] for r in renewals}
    actions = [{'id': t['id'], 'document_id': t['document_id'], 'title': t['title'], 'type': t['type'],
        'due_date': t['due_date'], 'description': 'Delegare activă' if t['delegated_from'] else 'În responsabilitatea ta',
        'overdue': t['overdue'], 'target': 'document'} for t in tasks]
    actions += [{'id': r['id'], 'document_id': r['contract_id'], 'title': r['title'], 'type': 'renewal',
        'due_date': r['due_date'], 'description': 'Reînnoire de preluat' if r['can_acknowledge'] else 'Continuă pregătirea reînnoirii',
        'overdue': r['overdue'], 'target': 'renewal'} for r in renewals]
    for d in visible.values():
        if followups[d.id]['alerts_suppressed']:
            continue
        if followups[d.id]['reminder_due']:
            actions.append({'id': 'reminder-' + d.id, 'document_id': d.id, 'title': d.title, 'type': 'reminder',
                'due_date': followups[d.id]['remind_on'], 'description': 'Memento programat de tine',
                'overdue': followups[d.id]['remind_on'] < str(settings.reference_date), 'target': 'document'})
        elif d.id in owned and d.status != 'archived' and validity(d) in ('expiring', 'expired') and not any(r['contract_id'] == d.id for r in renewals):
            actions.append({'id': 'expiry-' + d.id, 'document_id': d.id, 'title': d.title, 'type': 'expiry',
                'due_date': d.expires_at, 'description': 'Valabilitate de urmărit',
                'overdue': validity(d) == 'expired', 'target': 'document'})
    assets = {a.id: a for a in db.scalars(select(Equipment).where(Equipment.airport_id == user.airport_id)).all()}
    if assets:
        jobs = db.scalars(select(EquipmentJob).where(EquipmentJob.equipment_id.in_(assets), EquipmentJob.status.in_(ACTIVE))).all()
        from app.equipment.actions import personal_actions
        actions += personal_actions(db, user, assets, jobs)
    actions.sort(key=lambda a: ({'critical':0, 'danger':1, 'warning':2}.get(a.get('attention'), 3),
        not a['overdue'], a['due_date'] or '9999', a['id']))
    events = db.scalars(select(AuditEvent).where(AuditEvent.airport_id == user.airport_id).order_by(desc(AuditEvent.created_at), desc(AuditEvent.id))).all()
    activity = [serialize_event(e) for e in events
        if (e.document_id in visible or e.document_id is None)
        and e.action not in ('Conectare', 'Document deschis', 'Document consultat')
        and (e.actor_id == user.id or e.document_id in related)]
    if assets:
        assigned_jobs = set(db.scalars(select(EquipmentJob.id).where(EquipmentJob.equipment_id.in_(assets), EquipmentJob.assigned_to == user.id)).all())
        equipment_events = db.scalars(select(EquipmentEvent).where(EquipmentEvent.equipment_id.in_(assets)).order_by(desc(EquipmentEvent.created_at), desc(EquipmentEvent.id))).all()
        activity += [{'id': 'equipment-event-' + str(e.id), 'actor': e.actor, 'action': e.action,
            'created_at': e.created_at, 'equipment_id': e.equipment_id,
            'equipment_name': assets[e.equipment_id].code + ' · ' + assets[e.equipment_id].name}
            for e in equipment_events if e.actor_id == user.id or e.job_id in assigned_jobs]
    activity.sort(key=lambda e: e['created_at'], reverse=True)
    activity = activity[:12]
    recent_ids = []
    for e in events:
        if e.actor_id == user.id and e.action in ('Document deschis', 'Document consultat') and e.document_id in visible and e.document_id not in recent_ids:
            recent_ids.append(e.document_id)
        if len(recent_ids) == 6: break
    return {'actions': actions, 'activity': activity, 'recent_documents': [serialize(visible[i], user=user) for i in recent_ids],
        'reference_date': str(settings.reference_date), 'stats': {'tasks': len(actions),
        'due_today': sum(a['due_date'] == str(settings.reference_date) for a in actions),
        'overdue': sum(a['overdue'] for a in actions), 'approvals': sum(t['type'] == 'approval' for t in tasks),
        'renewals': len(renewals)}}
