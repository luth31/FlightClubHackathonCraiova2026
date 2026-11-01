from datetime import date
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, desc, text
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.core.security import current_user, has_role, can_read, is_department_head
from app.core.exceptions import DomainError
from app.core.audit import now
from app.people.models import User
from app.documents.models import Document
from app.documents.service import get_document
from app.equipment.models import Equipment, EquipmentIncident, EquipmentJob, EquipmentEvent
from app.equipment.models import EquipmentTeam
from app.equipment import teams

router = APIRouter(prefix='/api/equipment', tags=['Equipment'])
ACTIVE = ('assigned', 'acknowledged', 'in_progress', 'blocked', 'awaiting_verification')


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')


class AssetInput(Input):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=3, max_length=160)
    category: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=160)
    supplier: str = Field(default='', max_length=160)
    document_id: str | None = None
    next_inspection: date | None = None
    support_team_id: str | None = None


class IncidentInput(Input):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=5, max_length=3000)
    severity: Literal['low', 'medium', 'high'] = 'medium'
    assigned_to: str | None = None
    due_date: date | None = None


class TeamAssignment(Input):
    support_team_id: str | None = None
    revision: int = Field(ge=1)


class JobInput(Input):
    title: str = Field(min_length=3, max_length=160)
    kind: Literal['corrective', 'preventive'] = 'corrective'
    incident_id: str | None = None
    assigned_to: str
    due_date: date


class JobAction(Input):
    action: Literal['acknowledge', 'start', 'block', 'submit', 'verify', 'reject', 'assign', 'cancel', 'comment']
    revision: int = Field(ge=1)
    comment: str = Field(default='', max_length=3000)
    assigned_to: str | None = None
    due_date: date | None = None
    evidence_document_id: str | None = None


class Availability(Input):
    status: Literal['unknown', 'available', 'degraded', 'out_of_service', 'maintenance']
    revision: int = Field(ge=1)
    comment: str = Field(min_length=5, max_length=1000)
    next_inspection: date | None = None


def manager(user):
    return has_role(user, 'director') or is_department_head(user, 'Tehnic')


def require_manager(user):
    if not manager(user):
        raise DomainError('Acțiunea necesită un coordonator tehnic sau director.', 403)


def lock(db):
    if db.bind.dialect.name == 'sqlite':
        db.execute(text('BEGIN IMMEDIATE'))


def asset(db, user, equipment_id):
    item = db.get(Equipment, equipment_id)
    if not item or item.airport_id != user.airport_id:
        raise DomainError('Echipamentul nu există sau nu ai acces.', 404)
    return item


def staff_member(db, user, user_id):
    person = db.get(User, user_id) if user_id else None
    if not person or not person.active or person.airport_id != user.airport_id:
        raise DomainError('Alege un angajat activ din aeroportul curent.', 422)
    return person


def current_assignee(person, job, airport_id):
    return bool(person and person.active and person.airport_id == airport_id
        and person.department == job.assignment_department)


def event(db, user, item, action, comment='', job=None):
    db.add(EquipmentEvent(equipment_id=item.id, job_id=job.id if job else None,
        actor_id=user.id, actor=user.name, action=action, comment=comment, created_at=now()))
    item.updated_at = now()
    item.revision += 1


def job_dict(db, user, item):
    owner = db.get(User, item.assigned_to)
    evidence_doc = db.get(Document, item.evidence_document_id) if item.evidence_document_id else None
    mine = item.assigned_to == user.id and current_assignee(user, item, user.airport_id)
    incident = db.get(EquipmentIncident, item.incident_id) if item.incident_id else None
    result = {key: getattr(item, key) for key in ('id', 'equipment_id', 'incident_id', 'title', 'kind', 'assigned_to', 'due_date', 'status', 'evidence', 'revision', 'created_at', 'updated_at')}
    result.update(assignee=owner.name if owner else 'Responsabil indisponibil',
        needs_reassignment=not current_assignee(owner, item, user.airport_id),
        incident_description=incident.description if incident else '',
        severity=incident.severity if incident else None,
        can_work=mine, can_manage=manager(user), can_verify=manager(user) and item.assigned_to != user.id,
        overdue=item.status in ACTIVE and item.due_date < str(settings.reference_date),
        evidence_document_id=evidence_doc.id if evidence_doc and can_read(user, evidence_doc) else None)
    return result


def asset_dict(db, user, item, details=False):
    result = {key: getattr(item, key) for key in ('id', 'code', 'name', 'category', 'location', 'department', 'status', 'supplier', 'next_inspection', 'revision', 'created_at', 'updated_at')}
    document = db.get(Document, item.document_id) if item.document_id else None
    result['document_id'] = document.id if document and can_read(user, document) else None
    result['can_manage'] = manager(user)
    incidents = db.scalars(select(EquipmentIncident).where(EquipmentIncident.equipment_id == item.id).order_by(desc(EquipmentIncident.created_at))).all()
    jobs = db.scalars(select(EquipmentJob).where(EquipmentJob.equipment_id == item.id).order_by(EquipmentJob.due_date)).all()
    result['open_incidents'] = sum(i.status == 'open' for i in incidents)
    result['open_jobs'] = sum(j.status in ACTIVE for j in jobs)
    result['alert_severity'] = 'high' if any(i.status == 'open' and i.severity == 'high' for i in incidents) else 'medium' if result['open_incidents'] else None
    result['support_team'] = teams.team_dict(db, item)
    if details:
        result['incidents'] = [{key: getattr(i, key) for key in ('id', 'title', 'description', 'severity', 'status', 'reported_by', 'created_at')} for i in incidents]
        result['jobs'] = [job_dict(db, user, j) for j in jobs]
        result['recipients'] = teams.recipients(db, user, item) if manager(user) else []
        history = db.scalars(select(EquipmentEvent).where(EquipmentEvent.equipment_id == item.id).order_by(desc(EquipmentEvent.id))).all()
        result['history'] = [{key: getattr(e, key) for key in ('id', 'job_id', 'actor', 'action', 'comment', 'created_at')} for e in history]
    return result


@router.get('')
def listing(db: Session = Depends(get_db), user=Depends(current_user)):
    items = db.scalars(select(Equipment).where(Equipment.airport_id == user.airport_id).order_by(Equipment.code)).all()
    people = db.scalars(select(User).where(User.airport_id == user.airport_id, User.active == True)).all() if manager(user) else []
    return {'items': [asset_dict(db, user, i) for i in items], 'can_manage': manager(user),
        'technicians': [{'id': p.id, 'name': p.name} for p in people if has_role(p, 'technician') and p.department == 'Tehnic'],
        'teams': [{'id': t.id, 'name': t.name} for t in db.scalars(select(EquipmentTeam).where(EquipmentTeam.airport_id == user.airport_id).order_by(EquipmentTeam.name))],
        'reference_date': str(settings.reference_date)}


@router.post('', status_code=201)
def create(body: AssetInput, db: Session = Depends(get_db), user=Depends(current_user)):
    require_manager(user)
    lock(db)
    code = body.code.upper()
    if db.scalar(select(Equipment).where(Equipment.airport_id == user.airport_id, Equipment.code == code)):
        raise DomainError('Codul echipamentului există deja.', 409)
    if body.document_id:
        get_document(db, body.document_id, user)
    team = teams.local_team(db, user, body.support_team_id)
    item = Equipment(id='asset-' + uuid4().hex[:16], airport_id=user.airport_id, code=code,
        name=body.name, category=body.category, location=body.location, department='Tehnic', support_team_id=team.id if team else None,
        status='unknown', supplier=body.supplier, document_id=body.document_id,
        next_inspection=str(body.next_inspection) if body.next_inspection else None,
        revision=1, created_at=now(), updated_at=now())
    db.add(item); db.flush()
    event(db, user, item, 'Echipament înregistrat', 'Disponibilitatea trebuie verificată.')
    db.commit()
    return asset_dict(db, user, item, True)


@router.get('/{equipment_id}')
def detail(equipment_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    return asset_dict(db, user, asset(db, user, equipment_id), True)


@router.post('/{equipment_id}/team')
def assign_team(equipment_id: str, body: TeamAssignment, db: Session = Depends(get_db), user=Depends(current_user)):
    require_manager(user); lock(db)
    item = asset(db, user, equipment_id)
    if body.revision != item.revision:
        raise DomainError('Fișa echipamentului s-a schimbat. Reîncarcă.', 409)
    team = teams.local_team(db, user, body.support_team_id)
    item.support_team_id = team.id if team else None
    event(db, user, item, 'Echipă responsabilă actualizată', team.name if team else 'Echipă nedesemnată')
    db.commit()
    return asset_dict(db, user, item, True)


@router.post('/{equipment_id}/incidents', status_code=201)
def report(equipment_id: str, body: IncidentInput, db: Session = Depends(get_db), user=Depends(current_user)):
    lock(db)
    item = asset(db, user, equipment_id)
    person = None
    if body.assigned_to:
        require_manager(user)
        person = staff_member(db, user, body.assigned_to)
        if not body.due_date:
            raise DomainError('Alege termenul lucrării atribuite.', 422)
    incident = EquipmentIncident(id='incident-' + uuid4().hex[:16], equipment_id=item.id,
        title=body.title, description=body.description, severity=body.severity,
        status='open', reported_by=user.id, created_at=now())
    db.add(incident)
    db.flush()
    # An untriaged fault invalidates a previous availability confirmation.
    # A reported severity alone does not certify an operational decision.
    if item.status in ('available', 'degraded'):
        item.status = 'unknown'
    event(db, user, item, 'Incident raportat', body.title + ': ' + body.description)
    if person:
        new_job(db, user, item, person, body.title, 'corrective', incident.id, body.due_date)
    db.commit()
    return asset_dict(db, user, item, True)


def new_job(db, user, item, person, title, kind, incident_id, due_date):
    job = EquipmentJob(id='job-' + uuid4().hex[:16], equipment_id=item.id, incident_id=incident_id,
        title=title, kind=kind, assigned_to=person.id, assignment_department=person.department, due_date=str(due_date),
        status='assigned', evidence='', revision=1, created_at=now(), updated_at=now())
    db.add(job); db.flush()
    event(db, user, item, 'Lucrare atribuită', f'{title} · {person.name} · {due_date}', job)
    return job


@router.post('/{equipment_id}/jobs', status_code=201)
def assign(equipment_id: str, body: JobInput, db: Session = Depends(get_db), user=Depends(current_user)):
    require_manager(user)
    lock(db)
    item = asset(db, user, equipment_id)
    person = staff_member(db, user, body.assigned_to)
    if body.incident_id:
        incident = db.get(EquipmentIncident, body.incident_id)
        if not incident or incident.equipment_id != item.id or incident.status != 'open':
            raise DomainError('Alege un incident deschis al acestui echipament.', 422)
    new_job(db, user, item, person, body.title, body.kind, body.incident_id, body.due_date)
    db.commit()
    return asset_dict(db, user, item, True)


@router.post('/{equipment_id}/jobs/{job_id}/actions')
def action(equipment_id: str, job_id: str, body: JobAction, db: Session = Depends(get_db), user=Depends(current_user)):
    lock(db)
    item = asset(db, user, equipment_id)
    job = db.get(EquipmentJob, job_id)
    if not job or job.equipment_id != item.id:
        raise DomainError('Lucrarea nu a fost găsită.', 404)
    if body.revision != job.revision or job.status not in ACTIVE:
        raise DomainError('Lucrarea s-a schimbat sau este închisă. Reîncarcă.', 409)
    management = body.action in ('verify', 'reject', 'assign', 'cancel')
    if management:
        require_manager(user)
    elif not (job.assigned_to == user.id and current_assignee(user, job, user.airport_id)) and not (body.action == 'comment' and manager(user)):
        raise DomainError('Acțiunea aparține responsabilului desemnat.', 403)
    transitions = {'acknowledge': ('assigned', 'acknowledged'), 'start': (('acknowledged', 'blocked'), 'in_progress'),
        'block': (('acknowledged', 'in_progress'), 'blocked'), 'submit': ('in_progress', 'awaiting_verification'),
        'verify': ('awaiting_verification', 'closed'), 'reject': ('awaiting_verification', 'in_progress')}
    if body.action in transitions:
        previous, target = transitions[body.action]
        allowed = (previous,) if isinstance(previous, str) else previous
        if job.status not in allowed:
            raise DomainError('Tranziția nu este permisă din starea curentă.', 409)
        if body.action in ('block', 'submit', 'verify', 'reject') and len(body.comment) < 5:
            raise DomainError('Descrie lucrarea, blocajul sau rezultatul verificării (minimum 5 caractere).', 422)
        if body.action in ('verify', 'reject') and job.assigned_to == user.id:
            raise DomainError('Verificarea trebuie făcută de un alt responsabil autorizat.', 403)
        job.status = target
    if body.action == 'submit':
        if body.evidence_document_id:
            get_document(db, body.evidence_document_id, user)
        job.evidence = body.comment
        job.evidence_document_id = body.evidence_document_id
    if body.action == 'assign':
        person = staff_member(db, user, body.assigned_to)
        job.assigned_to = person.id
        job.assignment_department = person.department
        job.status = 'assigned'
        if body.due_date: job.due_date = str(body.due_date)
        body.comment = f'{person.name} · {job.due_date}. {body.comment}'
    if body.action in ('comment', 'cancel') and len(body.comment) < 5:
        raise DomainError('Adaugă un comentariu de minimum 5 caractere.', 422)
    if body.action == 'cancel': job.status = 'cancelled'
    job.revision += 1
    job.updated_at = now()
    db.flush()
    if body.action == 'verify' and job.incident_id:
        remaining = db.scalar(select(EquipmentJob).where(EquipmentJob.incident_id == job.incident_id, EquipmentJob.status.in_(ACTIVE)))
        if not remaining:
            db.get(EquipmentIncident, job.incident_id).status = 'resolved'
    labels = {'acknowledge': 'Lucrare preluată', 'start': 'Lucrare începută', 'block': 'Lucrare blocată',
        'submit': 'Dovezi trimise spre verificare', 'verify': 'Lucrare verificată', 'reject': 'Verificare respinsă',
        'assign': 'Lucrare reatribuită', 'cancel': 'Lucrare anulată', 'comment': 'Actualizare lucrare'}
    event(db, user, item, labels[body.action], body.comment, job)
    db.commit()
    return asset_dict(db, user, item, True)


@router.post('/{equipment_id}/availability')
def availability(equipment_id: str, body: Availability, db: Session = Depends(get_db), user=Depends(current_user)):
    require_manager(user)
    lock(db)
    item = asset(db, user, equipment_id)
    if item.revision != body.revision:
        raise DomainError('Echipamentul s-a schimbat. Reîncarcă.', 409)
    if body.status == 'available':
        unresolved = db.scalar(select(EquipmentIncident).where(EquipmentIncident.equipment_id == item.id, EquipmentIncident.status == 'open'))
        active_work = db.scalar(select(EquipmentJob).where(EquipmentJob.equipment_id == item.id, EquipmentJob.status.in_(ACTIVE)))
        if unresolved or active_work:
            raise DomainError('Rezolvă incidentele și verifică lucrările înainte de confirmarea disponibilității.', 409)
    item.status = body.status
    if body.next_inspection: item.next_inspection = str(body.next_inspection)
    event(db, user, item, 'Disponibilitate verificată', body.status + ': ' + body.comment)
    db.commit()
    return asset_dict(db, user, item, True)
