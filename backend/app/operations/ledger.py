"""Grouped operational evidence: persisted fixtures plus the current interactive run.

Synthetic history is never mixed with the public ADS-B feed. KPI arithmetic uses
completed off-block events; open risks and projections are separate counters.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from math import floor

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.operations.models import OperationLedgerGroup
from app.operations import service
from app.operations.scenario import STAFF

ROUTES = ['Londra Luton', 'Milano Bergamo', 'Dortmund', 'Roma', 'Bologna', 'Bruxelles', 'Madrid', 'Paris Beauvais']
PEOPLE = ['Mara Stoica', 'Vlad Popescu', 'Ioana Radu', 'Alexandru Marin', 'Diana Ilie', 'Radu Ene']
RANK = {'neutral':0, 'yellow':1, 'red':2}
FIXTURE_VERSION = 2


def worst(items):
    return max((item.get('severity','neutral') for item in items), key=lambda value:RANK[value], default='neutral')


def stamp(day, hour, minute=0):
    return datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)


def entry(identifier, kind, title, planned, actual, actor, detail='', *, source='seed', severity=None):
    delay = max(0, floor((actual-planned).total_seconds()/60)) if actual and planned else 0
    return {'id':identifier,'kind':kind,'title':title,'planned_at':planned.isoformat() if planned else None,
            'actual_at':actual.isoformat() if actual else None,'actor':actor,'detail':detail,
            'severity':severity or service.severity(delay),'delay_minutes':delay,'source':source}


def fixture_flight(airport, day, index, upcoming=False):
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


def fixture_airport_group(airport,day,index):
    identifier=f'ledger-{airport}-{day}-airport-{index}'
    titles=['Inspecția pistei și balizajului','Predarea turei și resursele','Mentenanță preventivă echipamente','Revizuire SOP și siguranță']
    owners=['Echipă inspecție airside','Ioana Radu','Sorin Pavel','Elena Popa']
    labels=[['Inspecție planificată','Echipă intrată în perimetru','Control pistă și FOD','Balizaj verificat','Inspecție închisă'],
            ['Tură planificată','Efectiv verificat','Echipament radio predat','Responsabilități confirmate','Predare încheiată'],
            ['Lucrare programată','Echipament retras temporar','Verificări funcționale','Echipament repus în serviciu','Raport de mentenanță înregistrat'],
            ['Revizuire programată','Abateri operaționale analizate','Acțiuni preventive propuse','Responsabil și termen desemnați','Revizuire documentată']]
    start=stamp(day,5+index*3,30)
    delay=5 if index==2 and day.weekday()==2 else 0
    events=[entry(identifier+f'-{n}', 'airport_'+str(index)+'_'+str(n),title,start+timedelta(minutes=n*5),start+timedelta(minutes=n*5+(delay if n>=2 else 0)),owners[index],source='seed') for n,title in enumerate(labels[index])]
    return {'id':identifier,'category':'airport','callsign':titles[index],'route':'Operațiuni aeroportuare',
            'gate_id':None,'scheduled_at':start.isoformat(),'actual_at':events[-1]['actual_at'],
            'status':'completed','severity':worst(events),'delay_minutes':delay,'cause':'equipment' if delay else None,
            'events':events,'event_count':len(events),'source':'seed','synthetic':True,'fixture_version':FIXTURE_VERSION}


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
        events=[entry(identifier+'-scheduled','flight_scheduled','Zbor programat',schedule-timedelta(days=3),schedule-timedelta(days=3),'Planificare demo',f'Programat pentru {schedule:%d.%m %H:%M}; scenariu de prezentare.',source='scenario')]
        assigned=staff.get(gate.get('assigned_staff_id'))
        events.append(entry(identifier+'-assigned','gate_assigned','Poartă și agent alocate',schedule-timedelta(days=1),schedule-timedelta(days=1),'Coordonator demo',f"{gate['id']} · {assigned['name'] if assigned else 'echipă sosiri'}",source='scenario'))
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
            events.append(entry(item['id'],item['kind'],item['title'],expected,actual,actor,detail,source=item['source'],severity=forced))
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
            'delay_basis':flight['delay_basis'],'emergency':flight['emergency']})
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


def get_ledger(db,user,day=None,status='all',search=''):
    seed_history(db,user)
    snapshot=service.get_snapshot(db,user)
    stored=list(db.scalars(select(OperationLedgerGroup).where(OperationLedgerGroup.airport_id==user.airport_id,
        OperationLedgerGroup.operational_date >= (settings.reference_date-timedelta(days=7)).isoformat(),
        OperationLedgerGroup.operational_date <= (settings.reference_date+timedelta(days=3)).isoformat())))
    groups=[row.data for row in stored]+active_groups(snapshot)
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
    return {'days':[{'date':key,'severity':worst(items),'flights':sorted(items,key=lambda g:g['scheduled_at']),
                     'event_count':sum(g['event_count'] for g in items),'metrics':metrics(items)} for key,items in sorted(days.items(),reverse=True)],
            'metrics':all_metrics,'filtered_metrics':metrics(selected),
            'period':{'from':(settings.reference_date-timedelta(days=7)).isoformat(),'to':(settings.reference_date+timedelta(days=3)).isoformat()},
            'reference_date':settings.reference_date.isoformat(),'seeded_events':sum(row.data['event_count'] for row in stored),
            'total_groups':len(groups),'filtered_groups':len(selected),'current_run_id':snapshot['simulation']['run_id'],
            'event_count':sum(g['event_count'] for g in selected),
            'notice':'Istoric demonstrativ persistent + acțiunile sesiunii curente. Jurnalul documentelor și al personalului păstrează separat drepturile de acces. ADS-B nu produce pontaje sau timpi de poartă.'}
