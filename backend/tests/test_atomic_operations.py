from datetime import timedelta
from uuid import uuid4
import pytest
from sqlalchemy import select, func, text
from sqlalchemy.exc import IntegrityError
from app.config import settings
from app.core.exceptions import DomainError
from app.operations import ledger
from app.operations.atomic_ledger import decorate_group
from app.operations.event_rules import transition, RULES
from app.operations.models import OperationEntity, OperationFact, OperationEvent


def test_all_history_has_valid_atomic_transitions_and_earlier_dependencies():
    for airport in ('craiova','sibiu'):
        for offset in range(-7,0):
            day=settings.reference_date+timedelta(days=offset)
            groups=[ledger.fixture_flight(airport,day,i) for i in range(8)]
            groups += [ledger.fixture_airport_group(airport,day,i) for i in range(4)]
            for raw in groups:
                group=decorate_group(airport,raw)
                seen=set()
                for event in group['events']:
                    assert event['operation']['validation']=='validated'
                    assert set(event['operation']['dependencies'])<=seen
                    assert event['kind'] in RULES or event['operation']['observation']
                    assert event['entities']
                    seen.add(event['id'])


def test_parallel_work_streams_converge_without_artificial_serial_dependency():
    group=decorate_group('craiova',ledger.fixture_flight('craiova',settings.reference_date-timedelta(days=1),0))
    events={e['kind']:e for e in group['events']}
    assert events['cleaning_started']['actual_at']<events['fuel_started']['actual_at']<events['cleaning_complete']['actual_at']
    assert events['fuel_started']['operation']['dependencies']==[events['aircraft_onblock']['id']]
    assert events['cleaning_complete']['id'] not in events['fuel_ready']['operation']['dependencies']
    expected={'boarding_completed','cleaning_complete','fuel_ready','baggage_loaded','loadsheet_confirmed'}
    assert {events[k]['id'] for k in expected}<=set(events['aircraft_ready']['operation']['dependencies'])
    assert events['aircraft_ready']['id'] in events['departure']['operation']['dependencies']


def test_illegal_transition_and_unknown_action_are_rejected_before_writing():
    with pytest.raises(DomainError): transition('cleaning_complete',None,{})
    with pytest.raises(DomainError): transition('random_operation',None,{})
    with pytest.raises(DomainError): transition('departure','onblock',{'boarding_completed':'boarding'})
    with pytest.raises(DomainError): transition('emergency_cleared',None,{})
    assert transition('fuel_started',None,{'aircraft_onblock':'onblock'})['to_state']=='active'


def test_entity_identity_shared_across_flights_but_tenant_and_flight_legs_are_distinct():
    day=settings.reference_date-timedelta(days=1)
    a=decorate_group('craiova',ledger.fixture_flight('craiova',day,0))
    b=decorate_group('craiova',ledger.fixture_flight('craiova',day-timedelta(days=1),0))
    c=decorate_group('sibiu',ledger.fixture_flight('sibiu',day,0))
    assert a['entities'][1]['id']==b['entities'][1]['id']
    assert a['entities'][0]['id']!=b['entities'][0]['id']
    assert a['entities'][1]['id']!=c['entities'][1]['id']
    person=lambda g: next(e for e in g['events'] if e['kind']=='staff_assigned')['entities'][-1]['id']
    assert person(a)==person(b)


def test_index_idempotency_integrity_forecast_exclusion_and_entity_history(admin,db):
    state=admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'normal'}).json()
    tree=admin.get('/api/operations/ledger').json()
    group=next(g for day in tree['days'] for g in day['flights'] if g['id']=='flight-101')
    gate=next(e for e in group['entities'] if e['kind']=='gate')
    response=admin.get('/api/operations/entities/'+gate['id'])
    assert response.status_code==200,response.text
    assert response.json()['total']>50
    assert len(response.json()['events'])==50
    event=next(e for e in group['events'] if e['kind']=='cleaning_complete')
    detail=admin.get('/api/operations/facts/'+event['id']).json()
    assert detail['integrity_verified'] and detail['audit']['recorded_at']
    assert any(e['title']=='Curățenie începută' for e in detail['dependencies'])
    count=db.scalar(select(func.count()).select_from(OperationFact))
    admin.get('/api/operations/ledger')
    assert db.scalar(select(func.count()).select_from(OperationFact))==count
    preview=admin.get('/api/operations/ledger',params={'scope':'current','run_id':state['simulation']['run_id'],'at_seconds':3600})
    assert preview.status_code==200,preview.text
    assert db.scalar(select(func.count()).select_from(OperationFact))==count
    assert db.scalar(select(func.count()).select_from(OperationFact).where(OperationFact.id.like('preview-%')))==0
    assert all(db.get(OperationFact,e['id']) is None for day in tree['days'] for g in day['flights'] for e in g['events'] if not e['actual_at'])


def test_facts_and_links_cannot_be_overwritten_or_deleted(admin,db):
    admin.get('/api/operations/ledger')
    row=db.scalar(select(OperationFact))
    with pytest.raises(IntegrityError):
        db.execute(text('UPDATE operation_facts SET digest=:digest WHERE id=:id'),{'digest':'changed','id':row.id})
    db.rollback()
    with pytest.raises(IntegrityError):
        db.execute(text('DELETE FROM operation_facts WHERE id=:id'),{'id':row.id})
    db.rollback()
    with pytest.raises(IntegrityError):
        db.execute(text('DELETE FROM operation_fact_entities WHERE fact_id=:id'),{'id':row.id})
    db.rollback()


def test_fact_and_entity_endpoints_enforce_airport_scope(admin,db):
    foreign=OperationEntity(id='sibiu-test-entity',airport_id='sibiu',kind='gate',code='G1',label='G1',attributes={})
    db.add(foreign)
    db.add(OperationFact(id='sibiu-test-fact',airport_id='sibiu',group_id='foreign',occurred_at='2026-10-29T08:00:00',recorded_at='2026-11-01T08:00:00Z',data={},digest=''))
    db.commit()
    assert admin.get('/api/operations/entities/sibiu-test-entity').status_code==404
    assert admin.get('/api/operations/facts/sibiu-test-fact').status_code==404
    assert admin.get('/api/operations/entities/missing').status_code==404


def test_live_evidence_is_indexed_at_write_time_without_opening_ledger(admin,db):
    admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'interactive'})
    response=admin.post('/api/operations/nfc',json={'card_id':'DEMO-NFC-104','request_id':str(uuid4())})
    assert response.status_code==200,response.text
    event=next(e for e in reversed(response.json()['events']) if e['kind']=='nfc_check_in' and e['staff_id']=='staff-relief')
    fact=db.get(OperationFact,event['id'])
    assert fact is not None
    assert fact.data['actor']=='Alexandru Marin'
    assert fact.data['audit']['recorded_by']!=fact.data['actor']
    assert fact.data['audit']['sequence']==event['sequence']
    assert admin.get('/api/operations/facts/'+event['id']).status_code==200


def test_history_person_presence_and_gate_usage_are_consistent_across_flights():
    for offset in range(-7,0):
        day=settings.reference_date+timedelta(days=offset)
        groups=[ledger.fixture_flight('craiova',day,i) for i in range(8)]
        stream=sorted([(e,g) for g in groups for e in g['events']],key=lambda pair:pair[0]['actual_at'])
        present=set();open_gates=set()
        for event,group in stream:
            person=event.get('person_key')
            if event['kind']=='nfc_check_in':
                assert person not in present,(day,event)
                present.add(person)
            if event['kind']=='nfc_check_out':
                assert person in present,(day,event)
                present.remove(person)
            if event['kind']=='gate_open':
                assert person in present and group['gate_id'] not in open_gates,(day,event)
                open_gates.add(group['gate_id'])
            if event['kind']=='gate_close':
                assert group['gate_id'] in open_gates
                open_gates.remove(group['gate_id'])
        assert not present and not open_gates


def test_rejected_live_transition_leaves_no_partial_event_or_fact(admin,db):
    admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'interactive'})
    before=db.scalar(select(func.count()).select_from(OperationEvent))
    facts=db.scalar(select(func.count()).select_from(OperationFact))
    response=admin.post('/api/operations/events',json={'kind':'emergency_cleared','flight_id':'flight-101'})
    assert response.status_code==409
    assert db.scalar(select(func.count()).select_from(OperationEvent))==before
    assert db.scalar(select(func.count()).select_from(OperationFact))==facts
    assert admin.post('/api/operations/events',json={'kind':'anything_random'}).status_code==422


def test_replacement_assignment_is_separate_and_depends_on_presence(admin):
    admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'interactive'})
    scanned=admin.post('/api/operations/nfc',json={'card_id':'DEMO-NFC-104'}).json()
    scan=next(e for e in scanned['events'] if e['kind']=='nfc_check_in' and e['staff_id']=='staff-relief')
    opened=admin.post('/api/operations/events',json={'kind':'gate_open','staff_id':'staff-relief','gate_id':'G1'}).json()
    assignment=next(e for e in opened['events'] if e['kind']=='staff_substitution')
    gate=next(e for e in opened['events'] if e['kind']=='gate_open' and e['gate_id']=='G1')
    assert assignment['id']!=gate['id'] and assignment['sequence']<gate['sequence']
    audit=admin.get('/api/operations/facts/'+assignment['id']).json()
    assert scan['id'] in [item['id'] for item in audit['dependencies']]
    assert any(item['role']=='previous_assignee' and item['label']=='Mara Stoica' for item in audit['entities'])


def test_early_manual_arrival_supersedes_scheduled_scan_without_duplicate_transition(admin):
    admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'delayed'})
    assert admin.post('/api/operations/nfc',json={'card_id':'DEMO-NFC-101'}).status_code==200
    advanced=admin.post('/api/operations/control',json={'action':'advance_to','target_seconds':3600})
    assert advanced.status_code==200,advanced.text
    scans=[e for e in advanced.json()['events'] if e['kind']=='nfc_check_in' and e['staff_id']=='staff-agent-a']
    assert len(scans)==1 and scans[0]['source']=='operator'


def test_staffing_observation_does_not_change_emergency_state(admin):
    admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'interactive'})
    admin.post('/api/operations/control',json={'action':'advance_to','target_seconds':300})
    response=admin.post('/api/operations/events',json={'kind':'emergency_declared','flight_id':'flight-101'})
    assert response.status_code==200,response.text
    response=admin.post('/api/operations/events',json={'kind':'emergency_cleared','flight_id':'flight-101'})
    assert response.status_code==200,response.text
