"""Additive fixtures for the explicitly launched local airport demo."""
from datetime import timedelta
from sqlalchemy import select
from app.config import settings
from app.core.audit import now
from app.core.security import hash_password
from app.people.models import User
from app.people.names import split_name
from app.equipment.models import Equipment, EquipmentIncident, EquipmentEvent, EquipmentTeam, EquipmentTeamMember

PEOPLE = [
    ('tech-baggage', 'Irina Dobre', 'Tehnician sisteme bagaje'),
    ('tech-electric', 'Vlad Dumitru', 'Tehnician instalații electrice'),
    ('tech-vehicles', 'Cristian Ilie', 'Mecanic utilaje aeroportuare'),
    ('tech-climate', 'Daria Stoica', 'Tehnician climatizare'),
]
TEAMS = [
    ('baggage', 'Mentenanță bagaje', ['technician', 'tech-baggage']),
    ('electric', 'Instalații electrice', ['tech-electric']),
    ('vehicles', 'Utilaje aeroportuare', ['tech-vehicles', 'technician']),
    ('climate', 'Climatizare terminal', ['tech-climate', 'tech-electric']),
]
ASSETS = [
    ('BB-01', 'Bandă bagaje · Plecări', 'Sistem bagaje', 'Terminal plecări · Zona check-in', 'baggage', 'available'),
    ('BB-02', 'Bandă bagaje · Sosiri', 'Sistem bagaje', 'Terminal sosiri · Recuperare bagaje', 'baggage', 'available'),
    ('SP-02', 'Scară mobilă pentru pasageri', 'Utilaj de handling', 'Platformă · Stand 2', 'vehicles', 'available'),
    ('GPU-01', 'Unitate de alimentare la sol', 'Alimentare electrică', 'Platformă · Stand 3', 'electric', 'maintenance'),
    ('AS-04', 'Autospecială de intervenție', 'Vehicul tehnic', 'Garaj tehnic · Poarta de serviciu', 'vehicles', 'available'),
    ('GE-02', 'Grup electrogen terminal', 'Alimentare electrică', 'Clădire tehnică · Camera generatoare', 'electric', 'available'),
    ('HVAC-01', 'Climatizare terminal', 'Instalație climatizare', 'Terminal · Sala de așteptare', 'climate', 'degraded'),
    ('TD-01', 'Tractor pentru remorcarea bagajelor', 'Utilaj de handling', 'Platformă · Zona bagaje', 'vehicles', 'available'),
]


def install_demo_equipment(db, airport_id):
    if settings.auth_mode != 'demo':
        raise RuntimeError('Equipment fixtures are only available in the local demo.')
    timestamp = now()
    head = db.get(User, 'technical-head')
    if airport_id == 'craiova':
        for uid, name, title in PEOPLE:
            if db.get(User, uid):
                continue
            db.add(User(id=uid, name=name, **split_name(name), email=f'{uid}@{airport_id}.example',
                department='Tehnic', department_id=head.department_id, role=title, job_title=title,
                roles=['technician'], airport_id=airport_id, active=True, manager_id=head.id,
                password_hash=hash_password('FlyLeaf2026!'), avatar=''.join(part[0] for part in name.split())))
    db.flush()
    new_teams = set()
    for key, name, users in TEAMS:
        tid = f'equipment-team-{airport_id}-{key}'
        if db.get(EquipmentTeam, tid):
            continue
        db.add(EquipmentTeam(id=tid, airport_id=airport_id, name=name)); db.flush()
        new_teams.add(tid)
        for uid in users if airport_id == 'craiova' else ['technician']:
            person = db.get(User, uid)
            if person and person.airport_id == airport_id:
                db.add(EquipmentTeamMember(team_id=tid, user_id=uid))
    for code, name, category, location, team, status in ASSETS:
        tid = f'equipment-team-{airport_id}-{team}'
        item = db.scalar(select(Equipment).where(Equipment.airport_id == airport_id, Equipment.code == code))
        if item:
            # Attach the pre-existing BB-02 once; preserve later deliberate team changes.
            if item.support_team_id is None and tid in new_teams:
                item.support_team_id = tid
            continue
        item = Equipment(id=f'equipment-{airport_id}-{code.lower()}', airport_id=airport_id,
            code=code, name=name, category=category, location=location, department='Tehnic', support_team_id=tid,
            status=status, supplier='Serviciul tehnic', next_inspection=str(settings.reference_date + timedelta(days=21)),
            revision=1, created_at=timestamp, updated_at=timestamp)
        db.add(item); db.flush()
        db.add(EquipmentEvent(equipment_id=item.id, actor_id=head.id, actor=head.name,
            action='Echipament înregistrat', comment='Fișă tehnică și echipă responsabilă înregistrate.', created_at=timestamp))
        if code in ('GPU-01', 'HVAC-01'):
            title, description, severity = ('Conector de alimentare deteriorat', 'Învelișul conectorului este deteriorat. Unitatea este retrasă pentru verificare.', 'high') if code == 'GPU-01' else (
                'Debit de aer redus în sala de așteptare', 'Debitul este neuniform la grilele din zona centrală. Este necesară verificarea filtrelor.', 'medium')
            db.add(EquipmentIncident(id=f'incident-{airport_id}-{code.lower()}-initial', equipment_id=item.id,
                title=title, description=description, severity=severity, status='open', reported_by=head.id, created_at=timestamp))
            db.add(EquipmentEvent(equipment_id=item.id, actor_id=head.id, actor=head.name,
                action='Incident raportat', comment=description, created_at=timestamp))
    db.flush()
