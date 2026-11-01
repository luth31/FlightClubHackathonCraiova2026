"""Grouped operational evidence: persisted fixtures plus the current interactive run.

Synthetic history is never mixed with the public ADS-B feed. KPI arithmetic uses
completed off-block events; open risks and projections are separate counters.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from math import floor
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.operations.models import OperationEvent, OperationLedgerGroup
from app.core.exceptions import DomainError
from app.core.presentation import operational_text
from app.operations import service
from app.operations.scenario import STAFF

ROUTES = ['Londra Luton', 'Milano Bergamo', 'Dortmund', 'Roma', 'Bologna', 'Bruxelles', 'Madrid', 'Paris Beauvais']
PEOPLE = ['Mara Stoica', 'Vlad Popescu', 'Ioana Radu', 'Alexandru Marin', 'Diana Ilie', 'Radu Ene']
RANK = {'neutral':0, 'yellow':1, 'red':2}
FIXTURE_VERSION = 4


def worst(items):
    return max((item.get('severity','neutral') for item in items), key=lambda value:RANK[value], default='neutral')


def stamp(day, hour, minute=0):
    return datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)


def entry(identifier, kind, title, planned, actual, actor, detail='', *, source='seed', severity=None):
    delay = max(0, floor((actual-planned).total_seconds()/60)) if actual and planned else 0
    return {'id':identifier,'kind':kind,'title':title,'planned_at':planned.isoformat() if planned else None,
            'actual_at':actual.isoformat() if actual else None,'actor':actor,'detail':detail,
            'severity':severity or service.severity(delay),'delay_minutes':delay,'source':source}


def _flight_template(airport, day, index, upcoming=False):
    identifier = f'ledger-{airport}-{day}-{index}'
    planned = stamp(day,6+index*2,20 if index%2==0 else 45)
    gate = 'G'+str(index%3+1)
    assigned = PEOPLE[index%len(PEOPLE)]
    reserve = PEOPLE[(index+3)%len(PEOPLE)]
    coordinator = 'Dispecer operațiuni'
    # Deterministic mix of ordinary turns, brief delays and staffing exceptions.
    code=(day.toordinal()+index*3)%17
    delay = 18 if code==0 else 7 if code in (4,9) else 2 if code==13 else 0
    if upcoming:
        delay = 0
    reason = 'late_staff' if delay==18 else 'equipment' if delay==7 else 'boarding' if delay else None
    opening = planned-timedelta(minutes=25)
    actual_open = opening+timedelta(minutes=delay)
    actual_offblock = planned+timedelta(minutes=delay)
    events=[]
    def add(kind,title,expected,actual,actor,detail=''):
        events.append(entry(identifier+'-'+kind+'-'+str(len(events)),kind,title,expected,actual,actor,detail,
                            severity='yellow' if kind=='staff_absent' and actual is not None else None))
    add('flight_scheduled','Zbor introdus în program',planned-timedelta(days=3),planned-timedelta(days=3),'Planificare operațională',
        f'Plecare de la stand {planned:%d.%m %H:%M}; destinație {ROUTES[index%len(ROUTES)]}.')
    add('gate_assigned','Poartă și echipă alocate',planned-timedelta(days=1),None if upcoming and (planned-timedelta(days=1)).date()>settings.reference_date else planned-timedelta(days=1),coordinator,f'{gate} · agent alocat {assigned}; agent de rezervă {reserve}.')
    milestones=[
        ('briefing','Briefing de tură',planned-timedelta(minutes=75),planned-timedelta(minutes=75),coordinator,'Predare tură, restricții și confirmarea resurselor.'),
        ('nfc_check_in','Pontaj agent poartă',planned-timedelta(minutes=45),(actual_open+timedelta(minutes=3)) if reason=='late_staff' else planned-timedelta(minutes=47),assigned,'Prezență confirmată prin cardul de serviciu.'),
        ('aircraft_onblock','Aeronavă la stand',planned-timedelta(minutes=40),planned-timedelta(minutes=40),'Dispecer rampă','Blocuri de roată și începutul rotației.'),
        ('cleaning_complete','Curățenie încheiată',planned-timedelta(minutes=30),planned-timedelta(minutes=31),'Echipă cabină','Cabină predată echipei de îmbarcare.'),
        ('fuel_ready','Alimentare confirmată',planned-timedelta(minutes=28),planned-timedelta(minutes=28),'Responsabil handling','Confirmarea pregătirii, fără date comerciale de combustibil.'),
    ]
    if reason=='equipment':
        milestones += [('equipment_check','Verificare echipament îmbarcare',opening-timedelta(minutes=5),opening+timedelta(minutes=2),'Tehnic','Echipament înlocuit după o neconformitate la verificare.')]
    if reason=='late_staff':
        milestones += [('nfc_check_in','Pontaj agent de rezervă',opening-timedelta(minutes=5),actual_open-timedelta(minutes=3),reserve,'Cardul înlocuitorului confirmă disponibilitatea înainte de preluare.'),
                       ('staff_absent','Agent indisponibil la deschiderea porții',opening,opening,coordinator,'Agentul alocat nu era la post; coordonatorul solicită înlocuitor.'),
                       ('staff_substitution','Agent de rezervă repartizat',opening+timedelta(minutes=2),actual_open-timedelta(minutes=2),reserve,'Preluare întârziată, fără rezervă preconfirmată.')]
    opener=reserve if reason=='late_staff' else assigned
    milestones += [('gate_open','Poartă deschisă',opening,actual_open,opener,f'{gate}; '+('agent înlocuitor' if reason=='late_staff' else 'agentul alocat')+'.'),
                   ('boarding_completed','Îmbarcare încheiată',planned-timedelta(minutes=4),actual_offblock-timedelta(minutes=4),opener,'Pasageri reconciliați; verificări finale.'),
                   ('loadsheet_confirmed','Documente de încărcare confirmate',planned-timedelta(minutes=3),actual_offblock-timedelta(minutes=3),'Coordonator handling','Documentație de rotație verificată.'),
                   ('departure','Plecare de la stand · off-block',planned,actual_offblock,'Dispecer rampă','Reperul folosit pentru punctualitatea plecării.'),
                   ('takeoff','Decolare',planned+timedelta(minutes=7),actual_offblock+timedelta(minutes=7),'Flux operațional','Decolarea este distinctă de plecarea de la stand.'),
                   ('handover','Rotație închisă în jurnal',planned+timedelta(minutes=12),actual_offblock+timedelta(minutes=12),coordinator,'Datele rotației rămân disponibile pentru analiză.')]
    for kind,title,expected,actual,actor,detail in sorted(milestones,key=lambda item:item[3]):
        add(kind,title,expected,None if upcoming else actual,actor,detail)
    return {'id':identifier,'category':'flight','callsign':f'FL{600+index*11+day.weekday()}',
            'route':f'{airport.title()} → {ROUTES[index%len(ROUTES)]}','gate_id':gate,
            'scheduled_at':planned.isoformat(),'actual_at':None if upcoming else actual_offblock.isoformat(),
            'status':'scheduled' if upcoming else 'completed','severity':'neutral' if upcoming else worst(events),
            'delay_minutes':None if upcoming else delay,'cause':reason,'events':events,'event_count':len(events),
            'source':'seed','synthetic':True,'fixture_version':FIXTURE_VERSION,
            'assigned_staff':assigned,'reserve_staff':reserve}


def fixture_flight(airport, day, index, upcoming=False):
    """Build explicit work streams, keeping old milestone IDs/citations stable."""
    group = _flight_template(airport,day,index,upcoming)
    events = group['events']
    by_kind = {e['kind']:e for e in events}
    assigned, reserve = group['assigned_staff'],group['reserve_staff']
    group['schema_version'] = 1
    gate = by_kind['gate_assigned']
    gate.update(title='Poartă alocată',detail=group['gate_id'])
    for event in events:
        event['actor_key'] = event['actor']
        if event['kind'].startswith('nfc_') or event['kind'] in ('gate_open','boarding_completed','staff_substitution'):
            event['person_key'] = event['actor']
        if event['kind']=='staff_absent': event['person_key']=assigned
        if event['kind']=='staff_substitution':
            event['previous_person_key']=assigned
            event['actor']=event['actor_key']='Dispecer operațiuni'
        if event['kind']=='aircraft_onblock': event['detail']='Sosire la poziția de staționare.'
        if event['kind']=='boarding_completed': event['detail']='Îmbarcarea pasagerilor s-a încheiat.'
        if event['kind']=='briefing': event['detail']='Briefingul operațional a fost confirmat.'
        if event['kind']=='equipment_check': event['detail']='Verificarea funcțională a echipamentului a fost încheiată.'
    def add(kind,title,planned,actual,actor,person=None):
        item=entry(group['id']+'-atomic-'+kind,kind,title,
            datetime.fromisoformat(planned) if isinstance(planned,str) else planned,
            datetime.fromisoformat(actual) if isinstance(actual,str) else actual,actor)
        item.update(actor_key=actor,person_key=person)
        events.append(item)
    add('staff_assigned','Agent alocat',gate['planned_at'],gate['actual_at'],'Dispecer operațiuni',assigned)
    add('reserve_assigned','Agent de rezervă alocat',gate['planned_at'],gate['actual_at'],'Dispecer operațiuni',reserve)
    base=datetime.fromisoformat(by_kind['aircraft_onblock']['planned_at'])
    for minutes,kind,title,actor in [(1,'cleaning_started','Curățenie începută','Echipă cabină'),
            (2,'fuel_started','Alimentare începută','Responsabil handling'),
            (3,'baggage_loading_started','Încărcare bagaje începută','Echipă bagaje'),
            (20,'baggage_loaded','Bagaje încărcate','Echipă bagaje')]:
        at=base+timedelta(minutes=minutes)
        add(kind,title,at,None if upcoming else at,actor)
    opening=by_kind['gate_open']
    add('boarding_started','Îmbarcare începută',opening['planned_at'],opening['actual_at'],opening['actor'],opening['actor'])
    off=datetime.fromisoformat(group['scheduled_at'])
    actual=datetime.fromisoformat(group['actual_at']) if group['actual_at'] else None
    add('aircraft_ready','Pregătire plecare confirmată',off-timedelta(minutes=1),actual-timedelta(minutes=1) if actual else None,'Coordonator handling')
    add('gate_close','Poartă închisă',off-timedelta(minutes=3),actual-timedelta(minutes=3) if actual else None,opening['actor'],opening['actor'])
    if 'equipment_check' in by_kind:
        check=by_kind['equipment_check']; at=datetime.fromisoformat(check['planned_at'])-timedelta(minutes=1)
        add('equipment_check_started','Verificare echipament începută',at,None if upcoming else at,'Tehnic')
    # A duty block has an explicit end; later flight assignments must not
    # imply repeated check-ins while a person is still present.
    for number,scan in enumerate([e for e in events if e['kind']=='nfc_check_in']):
        item=entry(group['id']+'-atomic-checkout-'+str(number),'nfc_check_out','Pontaj · încheiere serviciu',
            off+timedelta(minutes=12),actual+timedelta(minutes=12) if actual else None,scan['actor'])
        item.update(actor_key=scan['actor'],person_key=scan.get('person_key',scan['actor']))
        events.append(item)
    from app.operations.event_rules import RULES
    priority={kind:n for n,kind in enumerate(RULES)}
    events.sort(key=lambda e:(e['actual_at'] or e['planned_at'],priority.get(e['kind'],999),e['id']))
    group['event_count']=len(events)
    return group


def fixture_airport_group(airport,day,index):
    identifier=f'ledger-{airport}-{day}-airport-{index}'
    titles=['Inspecția pistei și balizajului','Predarea turei și resursele','Mentenanță preventivă echipamente','Revizuire SOP și siguranță']
    owners=['Echipă inspecție airside','Ioana Radu','Sorin Pavel','Elena Popa']
    operations=[
        [(0,'inspection_scheduled','Inspecție pistă programată'),(5,'inspection_started','Inspecție pistă începută'),
         (5,'lighting_check_scheduled','Verificare balizaj programată'),(6,'lighting_check_started','Verificare balizaj începută'),
         (10,'fod_check_completed','Control FOD încheiat'),(15,'lighting_check_completed','Verificare balizaj încheiată'),(20,'inspection_completed','Inspecție pistă încheiată')],
        [(0,'shift_scheduled','Tură programată'),(5,'staffing_checked','Efectiv verificat'),(6,'radio_handover_started','Predare radio începută'),
         (10,'radio_handover_completed','Radio predat'),(15,'responsibilities_confirmed','Responsabilități confirmate'),(20,'shift_handover_completed','Predare tură încheiată')],
        [(0,'maintenance_scheduled','Lucrare programată'),(5,'equipment_withdrawn','Echipament retras din serviciu'),
         (10,'functional_check_completed','Verificare funcțională încheiată'),(15,'equipment_returned','Echipament repus în serviciu'),(20,'maintenance_report_filed','Raport de mentenanță înregistrat')],
        [(0,'sop_review_scheduled','Revizuire SOP programată'),(5,'deviations_reviewed','Analiză abateri încheiată'),
         (10,'preventive_action_proposed','Acțiune preventivă propusă'),(15,'action_owner_assigned','Responsabil desemnat'),
         (16,'action_deadline_set','Termen stabilit'),(20,'sop_review_completed','Revizuire SOP încheiată')]]
    start=stamp(day,5+index*3,30)
    delay=5 if index==2 and day.weekday()==2 else 0
    events=[]
    for n,(minutes,kind,title) in enumerate(operations[index]):
        item=entry(identifier+'-'+kind,kind,title,start+timedelta(minutes=minutes),
            start+timedelta(minutes=minutes+(delay if n>=2 else 0)),owners[index])
        item['actor_key']=owners[index]
        events.append(item)
    return {'id':identifier,'category':'airport','callsign':titles[index],'route':'Operațiuni aeroportuare',
            'gate_id':None,'scheduled_at':start.isoformat(),'actual_at':events[-1]['actual_at'],
            'status':'completed','severity':worst(events),'delay_minutes':delay,'cause':'equipment' if delay else None,
            'events':events,'event_count':len(events),'source':'seed','synthetic':True,'fixture_version':FIXTURE_VERSION,'schema_version':1}


def seed_history(db,user):
    service.airport_for(user)
    # Stable IDs and one transaction prevent duplication across reloads/restarts.
    existing={row.id:row for row in db.scalars(select(OperationLedgerGroup).where(OperationLedgerGroup.airport_id==user.airport_id))}
    for offset in [*range(-7,0),1,2,3]:
        day=settings.reference_date+timedelta(days=offset)
        groups=[fixture_flight(user.airport_id,day,index,offset>0) for index in range(8 if offset<0 else 3)]
        if offset<0: groups += [fixture_airport_group(user.airport_id,day,index) for index in range(4)]
        for group in groups:
            if group['id'] not in existing:
                db.add(OperationLedgerGroup(id=group['id'],airport_id=user.airport_id,operational_date=day.isoformat(),data=group))
            else:
                row=existing[group['id']]
                # Only generated fixtures upgrade. User actions live in the separate
                # immutable operation_events table and are never rewritten here.
                if row.data.get('source')=='seed' and row.data.get('synthetic') is True and row.data.get('fixture_version',1)<FIXTURE_VERSION:
                    group['previous_versions']=[*row.data.get('previous_versions',[]),{k:v for k,v in row.data.items() if k!='previous_versions'}]
                    row.data=group
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # Concurrent first reader inserted the same deterministic fixtures.


def active_groups(snapshot):
    staff={p['id']:p for p in snapshot['staff']}
    gates={g['id']:g for g in snapshot['gates']}
    result=[]
    elapsed=snapshot['simulation']['elapsed_seconds']
    for flight in snapshot['flights']:
        gate=gates[flight['gate_id']]
        planned=flight.get('scheduled_departure_seconds',flight.get('scheduled_arrival_seconds'))
        if planned is None: planned=flight.get('scheduled_arrival_seconds',0)
        schedule=datetime.fromisoformat(service.clock_time(planned))
        identifier=snapshot['simulation']['run_id']+':'+flight['id']
        events=[entry(identifier+'-scheduled','flight_scheduled','Zbor programat',schedule-timedelta(days=3),schedule-timedelta(days=3),'Planificare zboruri',f'Programat pentru {schedule:%d.%m %H:%M}.',source='scenario')]
        assigned=staff.get(gate.get('assigned_staff_id'))
        events.append(entry(identifier+'-assigned','gate_assigned','Poartă alocată',schedule-timedelta(days=1),schedule-timedelta(days=1),'Coordonare operațională',gate['id'],source='scenario'))
        if assigned:
            allocation=entry(identifier+'-staff-assigned','staff_assigned','Agent alocat',schedule-timedelta(days=1),schedule-timedelta(days=1),'Coordonare operațională',source='scenario')
            allocation['person_key']=assigned['id']
            events.append(allocation)
        if any(e['kind']=='flight_scheduled' and e['flight_id']==flight['id'] for e in snapshot['events']):
            events=[]
        for item in snapshot['events']:
            linked=item['flight_id']==flight['id'] or (item['staff_id'] and item['staff_id'] in (gate.get('assigned_staff_id'),gate.get('opened_by')) and item['kind'].startswith('nfc_'))
            if not linked: continue
            planned_seconds=item.get('payload',{}).get('planned_seconds')
            if item['kind'] in ('departure','boarding_completed'): planned_seconds=flight.get('scheduled_departure_seconds')
            if item['kind'] in ('gate_open','boarding_started'): planned_seconds=gate.get('planned_open_seconds')
            if item['kind']=='takeoff': planned_seconds=flight.get('scheduled_departure_seconds',0)+180
            if item['kind']=='arrival': planned_seconds=flight.get('scheduled_arrival_seconds')
            actual=datetime.fromisoformat(item['simulated_at'])
            expected=datetime.fromisoformat(service.clock_time(planned_seconds)) if planned_seconds is not None else actual
            forced='red' if item['kind']=='emergency_declared' else 'yellow' if item['kind'] in ('staff_absent','gate_waiting','departure_blocked') else None
            person=staff.get(item['staff_id'],{}).get('name')
            worker_action=item['kind'].startswith('nfc_') or item['kind'] in ('gate_open','gate_close','staff_substitution')
            actor=person if person and worker_action else item['actor']
            detail=(person+' · '+item['detail']) if person and item['kind']=='staff_absent' else item['detail']
            value=entry(item['id'],item['kind'],item['title'],expected,actual,actor,detail,source=item['source'],severity=forced)
            value.update({key:item.get(key) for key in ('actor_id','actor','recorded_at','sequence','run_id','flight_id','gate_id','staff_id','payload')})
            value['actor']=actor
            value['recorded_by']=item['actor']
            value['person_key']=item['staff_id']
            value['projected']=item.get('projected',False) or item['id'].startswith('preview-')
            events.append(value)
        if flight['direction']=='departure':
            milestone_kinds={'gate_open','boarding_completed','departure','takeoff'}
            seen={e['kind'] for e in events}
            for kind,title,seconds in [('gate_open','Deschidere poartă',gate['planned_open_seconds']),('boarding_completed','Îmbarcare încheiată',planned),('departure','Plecare de la stand · off-block',planned),('takeoff','Decolare',planned+180)]:
                if kind in seen: continue
                late=max(0,floor((elapsed-seconds)/60))
                item=entry(identifier+'-pending-'+kind,kind,title,datetime.fromisoformat(service.clock_time(seconds)),None,'În așteptare',
                    'Acțiunea nu a fost înregistrată.' if seconds<=elapsed else 'Reper planificat.',source='pending',severity=service.severity(late))
                item['delay_minutes']=late
                events.append(item)
        assigned_late = assigned and (assigned['actual_arrival_seconds'] is None or assigned['actual_arrival_seconds'] > gate['planned_open_seconds'])
        actual_seconds=flight.get('actual_departure_seconds') if flight['direction']=='departure' else (flight.get('scheduled_arrival_seconds') if elapsed>=flight.get('scheduled_arrival_seconds',999999) else None)
        result.append({'id':flight['id'],'category':'flight','callsign':flight['callsign'],'route':flight['origin']+' → '+flight['destination'],
            'gate_id':flight['gate_id'],'scheduled_at':schedule.isoformat(),'actual_at':service.clock_time(actual_seconds) if actual_seconds is not None else None,
            'status':'completed' if actual_seconds is not None else flight['status'],'severity':worst(events+[flight]),
            'delay_minutes':flight['delay_minutes'],'cause':'late_staff' if gate.get('opened_by') and assigned_late else 'gate_unavailable' if flight['status']=='blocked' else None,
            'events':events,'event_count':len(events),'source':'interactive','synthetic':True,'direction':flight['direction'],
            'delay_basis':flight['delay_basis'],'emergency':flight['emergency'],
            'run_id':snapshot['simulation']['run_id'], 'schema_version':1 if any(e['kind']=='flight_scheduled' and e['flight_id']==flight['id'] for e in snapshot['events']) else 0})
    linked_ids={e['id'] for g in result for e in g['events']}
    other=[]
    for item in snapshot['events']:
        if item['id'] in linked_ids or item['kind'].startswith('simulation_') or item['kind']=='scenario_summary': continue
        value=entry(item['id'],item['kind'],item['title'],None,datetime.fromisoformat(item['simulated_at']),item['actor'],item['detail'],source=item['source'])
        value.update({key:item.get(key) for key in ('actor_id','recorded_at','sequence','run_id','flight_id','gate_id','staff_id','payload')})
        value['person_key']=item['staff_id'];value['recorded_by']=item['actor']
        if item['kind'].startswith('nfc_') and item['staff_id'] in staff:
            value['actor']=staff[item['staff_id']]['name']
        other.append(value)
    if other:
        result.append({'id':snapshot['simulation']['run_id']+':shift','category':'airport','callsign':'Activitatea turei','route':'Personal și coordonare',
            'gate_id':None,'scheduled_at':service.clock_time(0),'actual_at':None,'status':'active','severity':worst(other),
            'delay_minutes':None,'events':other,'event_count':len(other),'source':'interactive','run_id':snapshot['simulation']['run_id'],'schema_version':1})
    return result


def metrics(groups):
    flights=[g for g in groups if g['category']=='flight' and g.get('direction','departure')=='departure']
    completed=[g for g in flights if g['actual_at'] is not None]
    timely=sum((g['delay_minutes'] or 0)==0 for g in completed)
    return {'completed_departures':len(completed),'on_time_percent':round(100*timely/len(completed),1) if completed else None,
            'delay_minutes':sum(g['delay_minutes'] or 0 for g in completed),
            'late_gate_openings':sum(e['kind']=='gate_open' and e['delay_minutes']>0 and e['actual_at'] is not None for g in groups for e in g['events']),
            'staff_late':len({e['id'] for g in groups for e in g['events'] if e['kind']=='nfc_check_in' and e['delay_minutes']>0}),
            'open_risks':sum(g.get('emergency',False) or (g['severity']!='neutral' and g['actual_at'] is None and g['status']!='scheduled') for g in groups),
            'projected_delay_minutes':sum(g['delay_minutes'] or 0 for g in flights if g['actual_at'] is None and g['status']!='scheduled')}


def get_ledger(db,user,day=None,status='all',search='',scope='all',run_id=None,at_seconds=None):
    if scope == 'all':
        seed_history(db,user)
    snapshot=service.get_snapshot(db,user)
    if run_id and snapshot['simulation']['run_id'] != run_id:
        raise DomainError('Scenariul s-a schimbat. Reîncarcă registrul.',409)
    if at_seconds is not None and run_id:
        snapshot=service.timeline_preview(db,user,at_seconds,run_id)
    stored=list(db.scalars(select(OperationLedgerGroup).where(OperationLedgerGroup.airport_id==user.airport_id,
        OperationLedgerGroup.operational_date >= (settings.reference_date-timedelta(days=7)).isoformat(),
        OperationLedgerGroup.operational_date <= (settings.reference_date+timedelta(days=3)).isoformat())))
    if scope == 'current':
        stored=[]
    groups=[present_group(row.data) for row in stored]+active_groups(snapshot)
    from app.operations.atomic_ledger import prepare
    groups=prepare(db,user,groups,store=at_seconds is None)
    db.commit()
    all_metrics=metrics(groups)
    selected=[]
    query=search.strip().casefold()
    for group in groups:
        if day and group['scheduled_at'][:10]!=day.isoformat(): continue
        if status=='attention' and group['severity']=='neutral': continue
        if query and query not in ' '.join([group['callsign'],group['route'],group['gate_id'] or '',*[e['title']+' '+e['actor']+' '+e['detail'] for e in group['events']]]).casefold(): continue
        selected.append(group)
    days=defaultdict(list)
    for group in selected: days[group['scheduled_at'][:10]].append(group)
    return {'scope':scope,'scenario_mode':snapshot['simulation']['scenario_mode'],'days':[{'date':key,'severity':worst(items),'flights':sorted(items,key=lambda g:g['scheduled_at']),
                     'event_count':sum(g['event_count'] for g in items),'metrics':metrics(items)} for key,items in sorted(days.items(),reverse=True)],
            'metrics':all_metrics,'filtered_metrics':metrics(selected),
            'period':{'from':(settings.reference_date-timedelta(days=7)).isoformat(),'to':(settings.reference_date+timedelta(days=3)).isoformat()},
            'reference_date':settings.reference_date.isoformat(),'seeded_events':sum(row.data['event_count'] for row in stored),
            'total_groups':len(groups),'filtered_groups':len(selected),'current_run_id':snapshot['simulation']['run_id'],
            'event_count':sum(g['event_count'] for g in selected),
            'notice':'Istoricul operațiunilor și activitatea turei curente. Jurnalul documentelor și al personalului păstrează separat drepturile de acces. ADS-B nu produce pontaje sau timpi de poartă.'}


def evidence_entry(db, user, event_id, group_id):
    """Resolve a citation by identity, independently of current-run/date filters.

    Historical groups remain addressable outside the dashboard's rolling period.
    For rehearsal events, reconstruct their recorded run without advancing it or
    substituting a newer run that happens to contain the same flight ID.
    """
    service.airport_for(user)
    row = db.scalar(select(OperationLedgerGroup).where(
        OperationLedgerGroup.id == group_id, OperationLedgerGroup.airport_id == user.airport_id))
    group = present_group(row.data) if row else None
    run_id = None
    if group is None:
        event = db.scalar(select(OperationEvent).where(
            OperationEvent.id == event_id, OperationEvent.airport_id == user.airport_id))
        if event:
            run_id = event.run_id
            events = list(db.scalars(select(OperationEvent).where(
                OperationEvent.airport_id == user.airport_id, OperationEvent.run_id == run_id)
                .order_by(OperationEvent.sequence)))
            initial = next((item for item in events if item.kind == 'simulation_initialized'), events[0])
            state = SimpleNamespace(airport_id=user.airport_id, run_id=run_id,
                elapsed_seconds=max(item.elapsed_seconds for item in events), running=False,
                speed=30, revision=0, scenario_mode=initial.payload.get('scenario_mode', 'interactive'),
                created_at=initial.recorded_at, updated_at=events[-1].recorded_at)
            groups = active_groups(service.snapshot(db, state, user, events))
            group = next((item for item in groups if item['id'] == group_id), None)
    if group and not any(item['id']==event_id for item in group['events']):
        group=next((present_group(version) for version in group.get('previous_versions',[]) if any(item['id']==event_id for item in version['events'])),None)
    if not group or not any(item['id'] == event_id for item in group['events']):
        raise DomainError('Dovada citată nu mai este disponibilă în registrul acestui aeroport.', 404)
    from app.operations.atomic_ledger import prepare
    group=prepare(db,user,[group])[0]
    db.commit()
    day = group['scheduled_at'][:10]
    values = metrics([group])
    return {'scope':'evidence', 'focus_event_id':event_id, 'evidence_run_id':run_id,
        'days':[{'date':day, 'severity':group['severity'], 'flights':[group],
                 'event_count':group['event_count'], 'metrics':values}],
        'metrics':values, 'filtered_metrics':values, 'period':{'from':day, 'to':day},
        'reference_date':day, 'seeded_events':group['event_count'] if row else 0,
        'total_groups':1, 'filtered_groups':1, 'event_count':group['event_count'],
        'current_run_id':None}


def present_group(group):
    return {**group, 'events':[{**event, **{key:operational_text(event[key]) for key in ('title','actor','detail')}} for event in group['events']]}
