from sqlalchemy import select
from app.config import settings
from app.people.models import User
from app.equipment.models import EquipmentIncident
from app.equipment.router import manager, current_assignee
from app.equipment.teams import members


def personal_actions(db, user, assets, jobs):
    incidents = {i.id: i for i in db.scalars(select(EquipmentIncident).where(
        EquipmentIncident.equipment_id.in_(assets), EquipmentIncident.status == 'open')).all()}
    actions = []
    assigned_incidents = set()
    my_incidents = set()
    for job in jobs:
        if job.incident_id:
            assigned_incidents.add(job.incident_id)
        owner = db.get(User, job.assigned_to)
        eligible = current_assignee(owner, job, user.airport_id)
        mine = job.assigned_to == user.id and eligible
        verify = manager(user) and job.status == 'awaiting_verification' and job.assigned_to != user.id
        reassign = manager(user) and not eligible
        if not (mine or verify or reassign):
            continue
        if mine:
            my_incidents.add(job.incident_id)
        incident = incidents.get(job.incident_id)
        item = assets[job.equipment_id]
        label = 'Reatribuire necesară' if reassign else 'De verificat' if verify else {
            'assigned': 'Acțiune atribuită · Confirmă primirea', 'acknowledged': 'Preluată', 'in_progress': 'În lucru',
            'blocked': 'Blocată', 'awaiting_verification': 'Trimisă spre verificare'}[job.status]
        attention = 'critical' if incident and incident.severity == 'high' else 'danger' if (
            reassign or incident or job.status in ('assigned', 'blocked')) else 'warning' if verify else 'normal'
        actions.append({'id':job.id, 'equipment_id':item.id, 'job_id':job.id, 'incident_id':job.incident_id,
            'title':job.title, 'type':'reassignment' if reassign else 'verification' if verify else 'maintenance',
            'due_date':job.due_date, 'description':item.code + ' · ' + item.location + ' · ' + label,
            'attention':attention, 'details':incident.description if incident else '',
            'overdue':job.due_date < str(settings.reference_date), 'target':'equipment'})
    team_assets = {item.id for item in assets.values() if any(p.id == user.id for p in members(db, item))}
    for incident in incidents.values():
        if incident.id in my_incidents:
            continue
        triage = manager(user) and incident.id not in assigned_incidents
        if not triage and incident.equipment_id not in team_assets:
            continue
        item = assets[incident.equipment_id]
        actions.append({'id':incident.id, 'equipment_id':item.id, 'incident_id':incident.id, 'title':incident.title,
            'type':'triage' if triage else 'team_alert', 'due_date':'',
            'description':item.code + ' · ' + item.location + (' · De atribuit' if triage else ' · Avertizare pentru echipa ta'),
            'attention':'critical' if incident.severity == 'high' else 'danger', 'details':incident.description,
            'overdue':False, 'target':'equipment'})
    if manager(user):
        for item in assets.values():
            if item.next_inspection and item.next_inspection <= str(settings.reference_date):
                actions.append({'id':'inspection-' + item.id, 'equipment_id':item.id, 'title':'Inspecție: ' + item.name,
                    'type':'inspection', 'due_date':item.next_inspection, 'description':item.code + ' · Planifică verificarea',
                    'attention':'warning', 'overdue':item.next_inspection < str(settings.reference_date), 'target':'equipment'})
    return actions
