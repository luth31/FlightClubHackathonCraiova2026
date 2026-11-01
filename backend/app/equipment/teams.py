from sqlalchemy import select
from app.core.exceptions import DomainError
from app.people.models import User
from app.equipment.models import EquipmentTeam, EquipmentTeamMember


def local_team(db, user, team_id):
    team = db.get(EquipmentTeam, team_id) if team_id else None
    if team_id and (not team or team.airport_id != user.airport_id):
        raise DomainError('Alege o echipă a aeroportului curent.', 422)
    return team


def members(db, item):
    team = db.get(EquipmentTeam, item.support_team_id) if item.support_team_id else None
    if not team or team.airport_id != item.airport_id:
        return []
    return list(db.scalars(select(User).join(EquipmentTeamMember, EquipmentTeamMember.user_id == User.id).where(
        EquipmentTeamMember.team_id == team.id, User.airport_id == item.airport_id, User.active == True)).all())


def person_dict(person):
    return {'id': person.id, 'name': person.name, 'email': person.email,
        'job_title': person.job_title or person.role, 'department': person.department}


def team_dict(db, item):
    team = db.get(EquipmentTeam, item.support_team_id) if item.support_team_id else None
    if not team or team.airport_id != item.airport_id:
        return None
    return {'id': team.id, 'name': team.name, 'members': [person_dict(p) for p in members(db, item)]}


def recipients(db, user, item):
    recommended = {p.id for p in members(db, item)}
    people = db.scalars(select(User).where(User.airport_id == user.airport_id, User.active == True)).all()
    return [{**person_dict(p), 'suggested': p.id in recommended,
        'suggestion_reason': 'Membru în echipa responsabilă' if p.id in recommended else ''}
        for p in sorted(people, key=lambda p: (p.id not in recommended, p.name.casefold(), p.id))]
