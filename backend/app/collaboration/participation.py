"""Opt-in and the professional directory shared with authenticated airport peers."""
from sqlalchemy import select, text
from sqlalchemy.orm import object_session
from app.config import settings
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.people.models import User
from app.people.management import is_head, refresh_appointments
from app.people.organization import canonical_department
from .models import CollaborationParticipation


def eligible(user):
    if not user.active:
        return False
    if 'director' in user.roles:
        return True
    db = object_session(user) if isinstance(user, User) else None
    return bool(db and is_head(db, user, include_areas=False))


def enabled(db):
    row = db.get(CollaborationParticipation, settings.airport_id, populate_existing=True)
    return bool(row and row.enabled)


def page_access(user):
    if 'director' in user.roles:
        return bool(user.active)
    db = object_session(user) if isinstance(user, User) else None
    return bool(db and eligible(user) and enabled(db))


def contact(user):
    return {'id': user.id, 'name': user.name, 'email': user.email,
        'department': canonical_department(user.department),
        'job_title': user.job_title or ('Director aeroport' if 'director' in user.roles else 'Șef de departament'),
        'role': 'director' if 'director' in user.roles else 'department_head'}


def directory(db):
    if not enabled(db):
        return []
    refresh_appointments(db)
    users = db.scalars(select(User).where(User.airport_id == settings.airport_id, User.active == True).order_by(User.name))
    return [contact(user) for user in users if eligible(user)]


def snapshot(db, user):
    row = db.get(CollaborationParticipation, settings.airport_id)
    return {'enabled': bool(row and row.enabled), 'revision': row.revision if row else 0,
        'can_manage': 'director' in user.roles, 'updated_at': row.updated_at if row else None}


def update(db, user, body):
    if not user.active or user.airport_id != settings.airport_id or 'director' not in user.roles:
        raise DomainError('Doar directorul poate activa sau dezactiva colaborarea aeroportului.', 403)
    db.commit()
    db.execute(text('BEGIN IMMEDIATE'))
    row = db.get(CollaborationParticipation, settings.airport_id, populate_existing=True)
    if (row.revision if row else 0) != body.revision:
        raise DomainError('Setarea a fost modificată între timp. Actualizează pagina.', 409)
    if row is None:
        row = CollaborationParticipation(airport_id=settings.airport_id, revision=0)
        db.add(row)
    row.enabled = body.enabled
    row.revision += 1
    row.updated_at, row.updated_by = now(), user.id
    record(db, user, 'Colaborare activată' if body.enabled else 'Colaborare dezactivată',
        detail='Publicarea contactelor profesionale și schimbul de mesaje între aeroporturi')
    db.commit()
    return snapshot(db, user)
