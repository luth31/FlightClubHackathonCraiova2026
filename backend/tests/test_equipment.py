from uuid import uuid4
from datetime import timedelta
from conftest import login
from app.config import settings
from app.equipment.models import Equipment
from app.people.models import User


def create(client, **fields):
    login(client)
    response = client.post('/api/equipment', json={'code': 'QA-' + uuid4().hex[:8], 'name': 'Bandă bagaje test',
        'category': 'Bandă bagaje', 'location': 'Terminal', **fields})
    assert response.status_code == 201, response.text
    return response.json()


def work(client, asset, incident_id=None):
    response = client.post(f'/api/equipment/{asset["id"]}/jobs', json={'title': 'Verifică și repară banda',
        'assigned_to': 'technician', 'due_date': str(settings.reference_date - timedelta(days=1)), 'incident_id': incident_id})
    assert response.status_code == 201, response.text
    return response.json()['jobs'][0]


def act(client, asset, job, action, expected=200, **extra):
    response = client.post(f'/api/equipment/{asset["id"]}/jobs/{job["id"]}/actions',
        json={'action': action, 'revision': job['revision'], **extra})
    assert response.status_code == expected, response.text
    return next((j for j in response.json().get('jobs', []) if j['id'] == job['id']), None)


def test_fault_to_verified_repair_keeps_availability_separate(client):
    asset = create(client)
    endpoint = '/api/equipment/' + asset['id']
    incident = client.post(endpoint + '/incidents', json={'title': 'Banda este oprită', 'description': 'Motorul nu pornește.', 'severity': 'high'}).json()['incidents'][0]
    job = work(client, asset, incident['id'])
    act(client, asset, job, 'acknowledge', 403)
    login(client, 'technician')
    assert any(a['id'] == job['id'] for a in client.get('/api/workspace/home').json()['actions'])
    act(client, asset, job, 'submit', 409, comment='Lucrare efectuată')
    first = job
    job = act(client, asset, job, 'acknowledge')
    act(client, asset, first, 'start', 409)
    job = act(client, asset, job, 'start')
    act(client, asset, job, 'submit', 422)
    job = act(client, asset, job, 'block', comment='Piesă lipsă. Următoarea actualizare mâine.')
    job = act(client, asset, job, 'start')
    job = act(client, asset, job, 'submit', comment='Motor reparat. Proba de funcționare înregistrată.')
    act(client, asset, job, 'verify', 403, comment='Verificarea mea')
    login(client)
    current = client.get(endpoint).json()
    assert client.post(endpoint + '/availability', json={'status': 'available', 'revision': current['revision'], 'comment': 'Verificare tehnică'}).status_code == 409
    job = act(client, asset, job, 'reject', comment='Repetă testul sub sarcină.')
    login(client, 'technician')
    job = act(client, asset, job, 'submit', comment='Testul sub sarcină a fost repetat și documentat.')
    login(client)
    job = act(client, asset, job, 'verify', comment='Verificare independentă efectuată.')
    current = client.get(endpoint).json()
    assert job['status'] == 'closed'
    assert current['status'] == 'unknown'
    assert current['incidents'][0]['status'] == 'resolved'
    assert len(current['history']) >= 9
    available = client.post(endpoint + '/availability', json={'status': 'available', 'revision': current['revision'], 'comment': 'Disponibilitate verificată după proba finală.'})
    assert available.status_code == 200, available.text
    assert available.json()['status'] == 'available'
    login(client, 'technician')
    assert any(e.get('equipment_id') == asset['id'] for e in client.get('/api/workspace/home').json()['activity'])
    login(client)
    # A subsequent report invalidates the previous confirmation without pretending to diagnose it.
    report = client.post(endpoint + '/incidents', json={'title': 'Zgomot nou', 'description': 'Zgomot observat la pornire.'})
    assert report.json()['status'] == 'unknown'


def test_equipment_access_assignment_and_linked_document_boundaries(client, db):
    asset = create(client, document_id='test-contract')
    login(client, 'technician')
    assert client.get('/api/equipment/' + asset['id']).json()['document_id'] is None
    assert client.post('/api/equipment', json={'code': 'DENIED', 'name': 'Alt echipament', 'category': 'Bandă', 'location': 'Terminal'}).status_code == 403
    assert client.post('/api/equipment/' + asset['id'] + '/availability', json={'revision': asset['revision'], 'status': 'available', 'comment': 'Fără autoritate'}).status_code == 403
    login(client)
    # A coordinator can explicitly assign follow-up to any active local employee.
    assigned = client.post('/api/equipment/' + asset['id'] + '/jobs', json={'title': 'Verifică documentele intervenției', 'assigned_to': 'finance', 'due_date': str(settings.reference_date)})
    assert assigned.status_code == 201
    other = Equipment(id='other-' + uuid4().hex, airport_id='carpati', code='PRIVATE', name='Alt aeroport', category='Bandă', location='Terminal', department='Tehnic', status='unknown', supplier='', revision=1, created_at='2026-01-01', updated_at='2026-01-01')
    db.add(other); db.commit()
    assert other.id not in [a['id'] for a in client.get('/api/equipment').json()['items']]
    assert client.get('/api/equipment/' + other.id).status_code == 404
    assert client.post('/api/equipment/' + other.id + '/incidents', json={'title': 'Acces interzis', 'description': 'Incident în alt aeroport'}).status_code == 404


def test_incident_requires_all_jobs_verified_and_reassignment_is_audited(client):
    asset = create(client)
    endpoint = '/api/equipment/' + asset['id']
    incident = client.post(endpoint + '/incidents', json={'title': 'Două reparații', 'description': 'Sunt necesare două intervenții.'}).json()['incidents'][0]
    first = work(client, asset, incident['id'])
    response = client.post(endpoint + '/jobs', json={'title': 'A doua verificare', 'incident_id': incident['id'], 'assigned_to': 'technician', 'due_date': str(settings.reference_date)})
    second = next(j for j in response.json()['jobs'] if j['id'] != first['id'])
    first = act(client, asset, first, 'assign', assigned_to='technician', comment='Responsabil confirmat.')
    login(client, 'technician')
    first = act(client, asset, first, 'acknowledge')
    first = act(client, asset, first, 'start')
    first = act(client, asset, first, 'submit', comment='Prima intervenție încheiată.')
    login(client)
    act(client, asset, first, 'verify', comment='Prima verificare efectuată.')
    current = client.get(endpoint).json()
    assert current['incidents'][0]['status'] == 'open'
    assert any(j['id'] == second['id'] and j['status'] == 'assigned' for j in current['jobs'])


def test_independent_verifier_required_even_with_combined_roles(client, db):
    asset = create(client)
    job = work(client, asset)
    person = db.get(User, 'technician')
    roles = list(person.roles)
    person.roles = roles + ['director']; db.commit()
    try:
        login(client, 'technician')
        job = act(client, asset, job, 'acknowledge')
        job = act(client, asset, job, 'start')
        job = act(client, asset, job, 'submit', comment='Lucrare efectuată de tehnician.')
        act(client, asset, job, 'verify', 403, comment='Nu poate verifica propria lucrare.')
    finally:
        person.roles = roles; db.commit()


def test_transferred_technician_cannot_continue_old_work(client, db):
    asset = create(client)
    job = work(client, asset)
    person = db.get(User, 'technician')
    old_department = person.department
    person.department = 'Financiar'; db.commit()
    try:
        login(client, 'technician')
        detail = client.get('/api/equipment/' + asset['id']).json()['jobs'][0]
        assert detail['needs_reassignment'] and not detail['can_work']
        act(client, asset, job, 'acknowledge', 403)
    finally:
        person.department = old_department; db.commit()


def test_equipment_authority_requires_current_technical_head_appointment(client, db):
    from app.people.models import Department
    login(client, 'technical-head')
    assert client.get('/api/equipment').json()['can_manage']
    department = db.get(Department, 'dept-tehnic')
    original = department.head_user_id
    department.head_user_id = None
    db.commit()
    try:
        # The reviewer role and department label alone do not confer management authority.
        assert not client.get('/api/equipment').json()['can_manage']
        assert client.post('/api/equipment', json={'code':'DENIED-HEAD','name':'Bandă test','category':'Bandă','location':'Terminal'}).status_code == 403
    finally:
        department.head_user_id = original
        db.commit()


def team(db, airport_id=None, members=('technician',)):
    from app.equipment.models import EquipmentTeam, EquipmentTeamMember
    record = EquipmentTeam(id='team-' + uuid4().hex, airport_id=airport_id or settings.airport_id, name='Mentenanță bagaje ' + uuid4().hex[:8])
    db.add(record); db.flush()
    for uid in members:
        db.add(EquipmentTeamMember(team_id=record.id, user_id=uid))
    db.commit()
    return record


def test_team_suggestions_include_all_local_staff_and_prioritize_exact_team(client, db):
    group = team(db)
    item = create(client, support_team_id=group.id)
    assert item['support_team']['name'] == group.name
    people = item['recipients']
    assert people[0]['id'] == 'technician' and people[0]['suggested']
    assert any(p['id'] == 'finance' and not p['suggested'] for p in people)
    assert all(p['email'] and p['job_title'] for p in people)
    foreign = team(db, airport_id='other-airport')
    response = client.post('/api/equipment/' + item['id'] + '/team', json={'support_team_id':foreign.id,'revision':item['revision']})
    assert response.status_code == 422
    login(client, 'technician')
    assert client.get('/api/equipment/' + item['id']).json()['recipients'] == []


def test_report_and_assignment_are_atomic_and_appear_as_priority_action(client, db):
    group = team(db, members=('technician','technical-head'))
    item = create(client, support_team_id=group.id)
    endpoint = '/api/equipment/' + item['id']
    payload = {'title':'Motor bandă blocat','description':'Motorul se oprește la pornire.','severity':'high',
        'assigned_to':'technician','due_date':str(settings.reference_date)}
    result = client.post(endpoint+'/incidents', json=payload)
    assert result.status_code == 201, result.text
    data = result.json(); job = data['jobs'][0]; incident = data['incidents'][0]
    assert job['incident_id'] == incident['id'] and job['severity'] == 'high'
    assert job['incident_description'] == payload['description']
    login(client, 'technician')
    actions = client.get('/api/workspace/home').json()['actions']
    mine = [a for a in actions if a.get('equipment_id') == item['id']]
    assert len(mine) == 1 and mine[0]['job_id'] == job['id']
    assert mine[0]['attention'] == 'critical' and mine[0]['details'] == payload['description']
    assert actions.index(mine[0]) < next((i for i,a in enumerate(actions) if a.get('attention') not in ('critical',)),len(actions))
    login(client, 'technical-head')
    team_alert = [a for a in client.get('/api/workspace/home').json()['actions'] if a.get('equipment_id') == item['id']]
    assert len(team_alert) == 1 and team_alert[0]['type'] == 'team_alert'
    login(client, 'finance')
    assert not any(a.get('equipment_id') == item['id'] for a in client.get('/api/workspace/home').json()['actions'])
    # A report from an ordinary employee cannot also assign someone else's work.
    assert client.post(endpoint+'/incidents', json=payload).status_code == 403
    assert len(client.get(endpoint).json()['incidents']) == 1
    login(client)
    assert client.post(endpoint+'/incidents', json={**payload,'assigned_to':'missing-user'}).status_code == 422
    assert client.post(endpoint+'/incidents', json={**payload,'due_date':None}).status_code == 422
    assert len(client.get(endpoint).json()['incidents']) == 1


def test_team_alert_routes_to_current_team_and_stops_after_verified_repair(client, db):
    first_team = team(db)
    second_team = team(db, members=('finance',))
    item = create(client, support_team_id=first_team.id)
    endpoint = '/api/equipment/' + item['id']
    login(client,'technician')
    reported = client.post(endpoint+'/incidents', json={'title':'Zgomot la motor','description':'Vibrații observate la pornire.'}).json()
    incident = reported['incidents'][0]
    assert any(a.get('incident_id') == incident['id'] for a in client.get('/api/workspace/home').json()['actions'])
    login(client)
    switched = client.post(endpoint+'/team', json={'revision':reported['revision'],'support_team_id':second_team.id})
    assert switched.status_code == 200
    assert client.post(endpoint+'/team', json={'revision':reported['revision'],'support_team_id':first_team.id}).status_code == 409
    login(client,'technician')
    assert not any(a.get('incident_id') == incident['id'] for a in client.get('/api/workspace/home').json()['actions'])
    login(client)
    job = client.post(endpoint+'/jobs', json={'title':'Organizează verificarea tehnică','assigned_to':'finance',
        'incident_id':incident['id'],'due_date':str(settings.reference_date)}).json()['jobs'][0]
    login(client,'finance')
    job = act(client,item,job,'acknowledge')
    job = act(client,item,job,'start')
    job = act(client,item,job,'submit',comment='Verificarea și documentele de intervenție sunt complete.')
    act(client,item,job,'verify',403,comment='Nu poate verifica propria lucrare.')
    login(client)
    act(client,item,job,'verify',comment='Rezultatul intervenției a fost verificat independent.')
    login(client,'finance')
    assert not any(a.get('incident_id') == incident['id'] for a in client.get('/api/workspace/home').json()['actions'])


def test_inactive_and_foreign_employees_cannot_receive_work(client, db):
    item = create(client)
    person = db.get(User,'finance')
    old_airport = person.airport_id
    try:
        for field,value in [('active',False),('airport_id','different-airport')]:
            person.active=True;person.airport_id=old_airport;setattr(person,field,value);db.commit()
            response=client.post('/api/equipment/'+item['id']+'/jobs',json={'title':'Lucrare de verificat',
                'assigned_to':person.id,'due_date':str(settings.reference_date)})
            assert response.status_code == 422
    finally:
        person.active=True;person.airport_id=old_airport;db.commit()
