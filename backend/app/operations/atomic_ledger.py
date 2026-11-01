"""Typed ledger projection and append-only audit index.

OperationEvent remains the source for live actions. Generated historical groups
are imported with explicit provenance; forecasts are never persisted as facts.
"""
from datetime import datetime, timezone
from hashlib import sha256
import json
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.core.exceptions import DomainError
from app.operations.models import OperationEntity, OperationFact, OperationFactEntity
from app.operations.event_rules import RULES, LANES, STATES, OBSERVATIONS, CONTROL_KINDS, transition
from app.operations.scenario import STAFF

PEOPLE = {p['name']:p['id'] for p in STAFF} | {'Diana Ilie':'staff-diana','Radu Ene':'staff-radu','Sorin Pavel':'staff-sorin','Elena Popa':'staff-elena'}
PERSON_NAMES = {value:key for key,value in PEOPLE.items()}
KIND_LABELS = {'flight':'Zbor','gate':'Poartă','person':'Persoană','team':'Echipă / sursă','work_order':'Activitate aeroportuară','airport':'Aeroport'}


def identity(airport, kind, key, label, role, **attributes):
    # Codes are stable within their authoritative namespace, not inferred from prose.
    identifier=airport+':'+kind+':'+sha256(str(key).encode()).hexdigest()[:24]
    return {'id':identifier,'kind':kind,'code':str(key),'label':label,'role':role,'attributes':attributes}


def person_ref(airport,key,role):
    code=PEOPLE.get(key,key)
    definition=next((p for p in STAFF if p['id']==code),{})
    return identity(airport,'person',code,PERSON_NAMES.get(code,key),role,registry='Personal operațional',title=definition.get('title','Personal operațional'))


def group_entities(airport,group):
    leg=group.get('run_id',group['scheduled_at'][:10])+':'+group['id']
    main=identity(airport,'flight' if group['category']=='flight' else 'work_order',leg,group['callsign'],'subject',
        route=group['route'],scheduled_at=group['scheduled_at'],direction=group.get('direction','departure'))
    refs=[main]
    if group.get('gate_id'): refs.append(identity(airport,'gate',group['gate_id'],group['gate_id'],'location',airport_code=airport))
    return refs


def event_entities(airport,group,event):
    refs=[]
    # Attendance belongs to the person; display in a flight does not turn it into
    # a second flight-specific scan or assert a location never captured by NFC.
    if not event['kind'].startswith('nfc_'):
        refs += [ref for ref in group_entities(airport,group) if event['kind']!='flight_scheduled' or ref['role']!='location']
    person=event.get('person_key') or event.get('staff_id')
    if person: refs.append(person_ref(airport,person,'participant'))
    previous=(event.get('payload') or {}).get('previous_staff_id') or event.get('previous_person_key')
    if previous: refs.append(person_ref(airport,previous,'previous_assignee'))
    if not event['actual_at']:
        return refs
    actor_id=event.get('actor_id')
    actor=event.get('recorded_by',event['actor'])
    if actor_id and actor_id != 'simulation':
        refs.append(identity(airport,'person','account:'+actor_id,actor,'recorder',registry='Cont FlyLeaf'))
    elif actor in PEOPLE:
        refs.append(person_ref(airport,actor,'recorder'))
    else:
        refs.append(identity(airport,'team',event.get('actor_key') or actor_id or actor,actor,'recorder'))
    return refs


def decorate_group(airport,group):
    states,seen,previous,attendance={}, {}, {}, {}
    decorated=[]
    priority={kind:n for n,kind in enumerate(RULES)}
    # Occurrence time, not database insertion order, drives reconstruction.
    rows=sorted(group['events'],key=lambda e:(e['actual_at'] or e['planned_at'] or '',e.get('sequence') or priority.get(e['kind'],999),e['id']))
    for raw in rows:
        event={**raw}
        rule=RULES.get(event['kind'])
        person=event.get('person_key') or event.get('staff_id') or event['actor']
        stream=(rule.lane if rule else 'observation')+(':'+person if rule and rule.subject=='person' else '')
        completed=seen.copy()
        legacy_unknown=not group.get('schema_version') and event['kind'] not in RULES and event['kind'] not in OBSERVATIONS | CONTROL_KINDS
        op=transition('scenario_superseded' if legacy_unknown else event['kind'],states.get(stream),completed,strict=bool(group.get('schema_version') and event['actual_at'] and event['source'] not in ('pending','projection')))
        if legacy_unknown: op['validation']='legacy_unverified'
        if previous.get(stream) and previous[stream] not in op['dependencies']:
            op['dependencies'].append(previous[stream])
        if event['kind'] in ('gate_open','gate_close','staff_substitution') and person in attendance:
            op['dependencies'].append(attendance[person])
        if not event['actual_at']:
            op['validation']='planned'
            if rule: op['from_state']=rule.before[0]
        if event.get('projected'):
            op['validation']='projected'
        op['dependencies']=list(dict.fromkeys(op['dependencies']))
        op.update(code=event['kind'],stream_id=stream,
            from_label=STATES.get(op['from_state'],op['from_state'].replace('_',' ')),
            to_label=STATES.get(op['to_state'],op['to_state'].replace('_',' ')))
        event['operation']=op
        event['entities']=event_entities(airport,group,event)
        event['audit']={'event_id':event['id'],'recorded_at':event.get('recorded_at'),
            'recorded_by':event.get('recorded_by',event['actor']),'source':event['source'],
            'run_id':event.get('run_id',group.get('run_id')),'sequence':event.get('sequence'),
            'provenance':'generated_history' if event['source']=='seed' else 'recorded_event' if event.get('recorded_at') else 'legacy_projection',
            'timezone':'Europe/Bucharest','schema_version':1}
        if event['actual_at'] and not event.get('projected') and not op['observation']:
            states[stream]=op['to_state'];seen[event['kind']]=event['id'];previous[stream]=event['id']
            if event['kind']=='nfc_check_in': attendance[person]=event['id']
            elif event['kind']=='nfc_check_out': attendance.pop(person,None)
        decorated.append(event)
    lanes=[]
    for lane in dict.fromkeys(e['operation']['activity'] for e in decorated):
        items=[e for e in decorated if e['operation']['activity']==lane]
        actual=[e for e in items if e['actual_at']]
        lanes.append({'id':lane,'label':LANES.get(lane,'Observații'),'event_count':len(items),
            'state':actual[-1]['operation']['to_label'] if actual else 'Planificat',
            'from':actual[0]['actual_at'] if actual else None,'to':actual[-1]['actual_at'] if actual else None})
    return {**{key:value for key,value in group.items() if key!='previous_versions'},'entities':group_entities(airport,group),'events':decorated,'activities':lanes}


def digest(data):
    return sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def persist(db,airport,groups):
    """Bulk idempotent index; never turn pending/projected entries into evidence."""
    entities={ref['id']:ref for ref in (person_ref(airport,p['id'],'participant') for p in STAFF)}
    facts={}
    now=datetime.now(timezone.utc).isoformat()
    for group in groups:
        for entity in group['entities']:
            entities[entity['id']]=entity
        for event in group['events']:
            for entity in event['entities']: entities[entity['id']]=entity
            if not event['actual_at'] or event.get('projected') or event['source']=='pending': continue
            facts.setdefault(event['id'],(group,event))
    existing_entities=set(db.scalars(select(OperationEntity.id).where(OperationEntity.airport_id==airport,OperationEntity.id.in_(entities))))
    existing_facts=set(db.scalars(select(OperationFact.id).where(OperationFact.airport_id==airport,OperationFact.id.in_(facts))))
    for key,item in entities.items():
        if key not in existing_entities:
            db.add(OperationEntity(id=key,airport_id=airport,**{name:item[name] for name in ('kind','code','label','attributes')}))
    db.flush()
    new=[]
    for key,(group,event) in facts.items():
        if key in existing_facts: continue
        data={**event,'audit':{**event['audit'],'indexed_at':now}}
        recorded=event['audit']['recorded_at'] or now
        db.add(OperationFact(id=key,airport_id=airport,group_id=group['id'],occurred_at=event['actual_at'],
            recorded_at=recorded,data=data,digest=digest(data)))
        new.append((key,event['entities']))
    db.flush()
    for key,refs in new:
        for entity_id,role in {(ref['id'],ref['role']) for ref in refs}:
            db.add(OperationFactEntity(fact_id=key,entity_id=entity_id,role=role))
    db.flush()


def prepare(db,user,groups,*,store=True):
    result=[decorate_group(user.airport_id,group) for group in groups]
    if store:
        # A concurrent first reader may build the same index; savepoint preserves
        # the caller's operation transaction. The winning rows remain canonical.
        for attempt in range(3):
            try:
                with db.begin_nested(): persist(db,user.airport_id,result)
                break
            except IntegrityError:
                if attempt == 2:
                    raise DomainError('Registrul s-a actualizat simultan. Reîncearcă operațiunea.',409)
    if store:
        ids={event['id'] for group in result for event in group['events'] if event['actual_at'] and not event.get('projected')}
        saved={row.id:row.data for row in db.scalars(select(OperationFact).where(OperationFact.airport_id==user.airport_id,OperationFact.id.in_(ids)))}
        result=[{**group,'events':[saved.get(event['id'],event) for event in group['events']]} for group in result]
    from app.operations.process_graph import process_graph
    return [{**group, 'process':process_graph(group)} for group in result]


def entity_detail(db,user,entity_id,offset=0,limit=50):
    from app.operations.service import airport_for
    airport_for(user)
    entity=db.scalar(select(OperationEntity).where(OperationEntity.id==entity_id,OperationEntity.airport_id==user.airport_id))
    if not entity: raise DomainError('Entitatea nu există în acest aeroport.',404)
    query=select(OperationFact).where(OperationFact.airport_id==user.airport_id,
        OperationFact.id.in_(select(OperationFactEntity.fact_id).where(OperationFactEntity.entity_id==entity.id)))
    total=db.scalar(select(func.count()).select_from(query.subquery()))
    rows=db.scalars(query.order_by(OperationFact.occurred_at.desc(),OperationFact.id).offset(offset).limit(limit))
    events=[{**row.data,'group_id':row.group_id,'integrity_verified':digest(row.data)==row.digest} for row in rows]
    return {'entity':{key:getattr(entity,key) for key in ('id','kind','code','label','attributes')},
        'kind_label':KIND_LABELS[entity.kind],'events':events,'total':total,'offset':offset,'limit':limit}


def fact_detail(db,user,event_id):
    from app.operations.service import airport_for
    airport_for(user)
    row=db.scalar(select(OperationFact).where(OperationFact.id==event_id,OperationFact.airport_id==user.airport_id))
    if not row: raise DomainError('Evenimentul nu există în acest aeroport.',404)
    dependencies=row.data['operation']['dependencies']
    prior={item.id:item for item in db.scalars(select(OperationFact).where(OperationFact.airport_id==user.airport_id,OperationFact.id.in_(dependencies)))}
    return {**row.data,'group_id':row.group_id,'integrity_verified':digest(row.data)==row.digest,
        'dependencies':[{'id':key,'title':prior[key].data['title'],'actual_at':prior[key].occurred_at} for key in dependencies if key in prior]}
