from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.core.exceptions import DomainError
from app.core.models import AuditEvent
from app.operations import service
from app.operations.models import OperationEvent, OperationSimulation
from app.operations.schemas import ControlInput, EventInput


@pytest.fixture
def ops(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'airport_id', 'craiova')
    engine = create_engine(f'sqlite:///{tmp_path}/operations.db', connect_args={'check_same_thread': False, 'timeout': 10})
    for table in (OperationSimulation.__table__, OperationEvent.__table__, AuditEvent.__table__):
        table.create(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    user = SimpleNamespace(id='test-operator', name='Operator', airport_id='craiova', roles=['director'])
    yield factory, user
    engine.dispose()


def flight(snapshot, identifier='flight-101'):
    return next(item for item in snapshot['flights'] if item['id'] == identifier)


def test_replay_explains_delay_and_event_order(ops):
    factory, user = ops
    with factory() as db:
        initial = service.control(db, user, ControlInput(action='reset', scenario_mode='replay'))
        assert initial['kpis']['on_time_percent'] is None
        assert initial['thresholds'] == {'minor_delay_minutes': 1, 'major_delay_minutes': 15}
        emergency = service.control(db, user, ControlInput(action='advance', seconds=900))
        assert flight(emergency, 'flight-404')['severity'] == 'neutral'
        assert not flight(emergency, 'flight-404')['emergency']
        result = service.control(db, user, ControlInput(action='advance', seconds=2220))
        assert flight(result)['delay_minutes'] == 18
        assert flight(result)['actual_departure_seconds'] == 2280
        assert flight(result)['severity'] == 'red'
        assert flight(result, 'flight-202')['severity'] == 'neutral'
        assert not flight(result, 'flight-404')['emergency']
        assert result['kpis']['on_time_percent'] == 50
        times = [event['elapsed_seconds'] for event in result['events']]
        assert times == sorted(times)
        assert [event['sequence'] for event in result['events']] == list(range(1, len(times)+1))
        opening = next(event for event in result['events'] if event['id']==flight(result)['cause_event_id'])
        assert opening['kind']=='gate_open' and opening['staff_id']=='staff-relief'
        assert any(event['kind']=='staff_absent' for event in result['events'])
        assert len(list(db.scalars(select(AuditEvent)))) == len(list(db.scalars(select(OperationEvent))))
        assert all(event.document_id is None for event in db.scalars(select(AuditEvent)))
        repeated = service.get_snapshot(db, user)
        assert repeated['events'] == result['events']
    with factory() as db:
        assert service.get_snapshot(db, user)['simulation']['elapsed_seconds'] == 3120


def test_next_event_and_clock_persist_across_sessions(ops, monkeypatch):
    factory, user = ops
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(service, 'utc_now', lambda: now)
    with factory() as db:
        step = service.control(db, user, ControlInput(action='step'))
        assert step['simulation']['elapsed_seconds'] == 60
        service.control(db, user, ControlInput(action='start', speed=30))
    now += timedelta(seconds=2)
    with factory() as db:
        advanced = service.get_snapshot(db, user)
        assert advanced['simulation']['elapsed_seconds'] == 120
        stopped = service.control(db, user, ControlInput(action='pause'))
        assert not stopped['simulation']['running']
    now += timedelta(seconds=100)
    with factory() as db:
        assert service.get_snapshot(db, user)['simulation']['elapsed_seconds'] == 120


def test_reset_keeps_previous_run_and_stale_revision_is_rejected(ops):
    factory, user = ops
    with factory() as db:
        initial = service.get_snapshot(db, user)
        service.control(db, user, ControlInput(action='advance', seconds=300))
        with pytest.raises(DomainError) as error:
            service.control(db, user, ControlInput(action='pause', expected_revision=initial['simulation']['revision']))
        assert error.value.status == 409
        db.rollback()
        reset = service.control(db, user, ControlInput(action='reset'))
        assert reset['simulation']['run_id'] != initial['simulation']['run_id']
        assert len(reset['events']) == 1
        historical = service.history(db, user, initial['simulation']['run_id'])
        assert historical['items'][-1]['kind']=='simulation_reset'
        assert historical['total'] > len(reset['events'])


def test_nfc_gate_intervention_changes_actual_outcome_and_is_idempotent(ops):
    factory, user = ops
    with factory() as db:
        with pytest.raises(DomainError) as error:
            service.input_event(db, user, EventInput(kind='gate_open', gate_id='G1', staff_id='staff-agent-a'))
        assert error.value.status == 409
        db.rollback()
        request = EventInput(kind='nfc_check_in', staff_id='staff-agent-a', request_id=uuid4())
        first = service.input_event(db, user, request)
        duplicate = service.input_event(db, user, request)
        assert duplicate['event_count'] == first['event_count']
        opened = service.input_event(db, user, EventInput(kind='gate_open', gate_id='G1', staff_id='staff-agent-a'))
        cause = flight(opened)['cause_event_id']
        result = service.control(db, user, ControlInput(action='advance', seconds=3000))
        assert flight(result)['delay_minutes'] == 0
        assert flight(result)['actual_departure_seconds'] == 1200
        assert flight(result)['cause_event_id'] == cause
        assert len([event for event in result['events'] if event['kind']=='gate_open' and event['gate_id']=='G1']) == 1


def test_readers_cannot_mutate_and_tenants_are_isolated(ops, monkeypatch):
    factory, user = ops
    with factory() as db:
        service.control(db, user, ControlInput(action='advance', seconds=240))
        user.roles = ['hr']
        assert service.get_snapshot(db, user)['permissions']['can_control'] is False
        for action in (lambda: service.control(db, user, ControlInput(action='reset')),
                       lambda: service.input_event(db, user, EventInput(kind='nfc_check_in', staff_id='staff-agent-a'))):
            with pytest.raises(DomainError) as error: action()
            assert error.value.status == 403
        foreign = SimpleNamespace(id='other', name='Other', airport_id='sibiu', roles=['director'])
        with pytest.raises(DomainError) as error: service.history(db, foreign)
        assert error.value.status == 403
        monkeypatch.setattr(settings, 'airport_id', 'sibiu')
        sibling = service.get_snapshot(db, foreign)
        assert sibling['airport']['id']=='sibiu' and sibling['simulation']['elapsed_seconds']==0
        assert all(event['run_id']==sibling['simulation']['run_id'] for event in service.history(db, foreign)['items'])


def test_simultaneous_reads_advance_clock_once_without_duplicate_events(ops, monkeypatch):
    factory, user = ops
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(service, 'utc_now', lambda: now)
    with factory() as db:
        service.control(db, user, ControlInput(action='start', speed=30))
    now += timedelta(seconds=10)
    def read():
        with factory() as db:
            return service.get_snapshot(db, user)
    with ThreadPoolExecutor(max_workers=4) as pool:
        snapshots = list(pool.map(lambda _: read(), range(4)))
    assert {snapshot['simulation']['elapsed_seconds'] for snapshot in snapshots} == {300}
    with factory() as db:
        events = list(db.scalars(select(OperationEvent)))
        assert len({(event.run_id,event.event_key) for event in events}) == len(events)
        assert len([event for event in events if event.kind=='staff_absent' and event.gate_id=='G1']) == 1


def test_airport_geometry_on_apron_and_threshold_boundaries(ops):
    factory, user = ops
    assert [service.severity(delay) for delay in (0,1,14,15)] == ['neutral','yellow','yellow','red']
    assert service.severity(0, True) == 'red'
    with factory() as db:
        state=service.get_snapshot(db,user)
        assert all(44.313 < gate['position']['lat'] < 44.316 for gate in state['gates'])
        assert all(gate['position']['altitude_m'] == 191.4144 for gate in state['gates'])
        service.control(db,user,ControlInput(action='advance',seconds=1139))
        service.input_event(db,user,EventInput(kind='nfc_check_in',staff_id='staff-agent-a'))
        below = service.input_event(db,user,EventInput(kind='gate_open',gate_id='G1',staff_id='staff-agent-a'))
        assert flight(below)['delay_minutes']==14 and flight(below)['severity']=='yellow'
        service.control(db,user,ControlInput(action='reset'))
        service.control(db,user,ControlInput(action='advance',seconds=1140))
        service.input_event(db,user,EventInput(kind='nfc_check_in',staff_id='staff-agent-a'))
        at = service.input_event(db,user,EventInput(kind='gate_open',gate_id='G1',staff_id='staff-agent-a'))
        assert flight(at)['delay_minutes']==15 and flight(at)['severity']=='red'


def test_endpoints_auth_roles_schema_and_persistence(client):
    assert client.get('/api/operations').status_code == 401
    assert client.get('/api/operations/traffic').status_code == 401
    assert client.post('/api/auth/login', json={'user_id':'admin','password':'FlyLeaf2026!'}).status_code == 200
    initial=client.post('/api/operations/control', json={'action':'reset'})
    assert initial.status_code==200,initial.text
    assert initial.json()['permissions']['can_control']
    step=client.post('/api/operations/control',json={'action':'step'})
    assert step.status_code==200 and step.json()['simulation']['elapsed_seconds']==60
    assert client.get('/api/operations').json()['simulation']['run_id']==step.json()['simulation']['run_id']
    assert client.post('/api/operations/control',json={'action':'advance','seconds':-1}).status_code==422
    assert client.post('/api/operations/events',json={'kind':'gate_open','gate_id':'unknown'}).status_code==422
    assert client.get('/api/operations/events?limit=2').json()['limit']==2


@pytest.mark.parametrize('kind',['control','event'])
@pytest.mark.parametrize('explicit_revision',[False,True])
def test_poll_racing_semantic_mutation_retries_without_weakening_explicit_revision(ops,monkeypatch,kind,explicit_revision):
    factory,user=ops
    now=datetime(2026,11,1,tzinfo=timezone.utc)
    monkeypatch.setattr(service,'utc_now',lambda:now)
    with factory() as db:
        initial=service.control(db,user,ControlInput(action='start',speed=30))
    now+=timedelta(seconds=10)
    original_synchronize=service.synchronize
    races=[]
    request_id=uuid4()
    with factory() as mutation_db:
        def interleaved_poll(db,state,actor,**kwargs):
            if db is mutation_db and not races:
                races.append(state.revision)
                # Reproduce a second client's polling commit after this command
                # has loaded its state but before it can commit its own changes.
                with factory() as polling_db:
                    polled=service.get_snapshot(polling_db,user)
                    assert polled['simulation']['elapsed_seconds']==300
            return original_synchronize(db,state,actor,**kwargs)
        monkeypatch.setattr(service,'synchronize',interleaved_poll)
        revision=initial['simulation']['revision'] if explicit_revision else None
        def mutate():
            if kind=='control':
                return service.control(mutation_db,user,ControlInput(action='start',speed=60,expected_revision=revision))
            return service.input_event(mutation_db,user,EventInput(kind='nfc_check_in',staff_id='staff-agent-a',request_id=request_id,expected_revision=revision))
        if explicit_revision:
            with pytest.raises(DomainError) as error: mutate()
            assert error.value.status==409
            current=service.get_snapshot(mutation_db,user)
            assert current['simulation']['speed']==30
            assert not any(event['source']=='operator' for event in current['events'])
        else:
            result=mutate()
            assert result['simulation']['elapsed_seconds']==300
            if kind=='control':
                assert result['simulation']['speed']==60
                assert len([event for event in result['events'] if event['kind']=='simulation_start'])==2
            else:
                assert len([event for event in result['events'] if event['source']=='operator'])==1
                assert mutate()['event_count']==result['event_count']
        assert len(races)==1
        events=list(mutation_db.scalars(select(OperationEvent)))
        assert len({(event.run_id,event.sequence) for event in events})==len(events)
        assert len(list(mutation_db.scalars(select(AuditEvent))))==len(events)


def test_semantic_mutation_retry_is_bounded_and_domain_errors_are_not_retried(ops,monkeypatch):
    from sqlalchemy.orm.exc import StaleDataError
    factory,user=ops
    with factory() as db:
        service.get_snapshot(db,user)
        attempts=[]
        def conflict(*args,**kwargs):
            attempts.append(1)
            raise StaleDataError('Simulated competing clock update')
        monkeypatch.setattr(service,'synchronize',conflict)
        with pytest.raises(DomainError) as error:
            service.control(db,user,ControlInput(action='pause'))
        assert error.value.status==409 and len(attempts)==3
        attempts.clear()
        def invalid(*args,**kwargs):
            attempts.append(1)
            raise DomainError('Invalid semantic action',422)
        monkeypatch.setattr(service,'synchronize',invalid)
        with pytest.raises(DomainError) as error:
            service.input_event(db,user,EventInput(kind='nfc_check_in',staff_id='unknown'))
        assert error.value.status==422 and len(attempts)==1


def test_timeline_projection_matches_replay_without_persisting_clock_or_events(ops):
    factory, user = ops
    with factory() as db:
        initial = service.control(db, user, ControlInput(action='reset', scenario_mode='replay'))
        before_audit = list(db.scalars(select(AuditEvent.id)))
        preview = service.timeline_preview(db, user, 2400, initial['simulation']['run_id'])
        assert preview['timeline']['projected']
        assert preview['permissions']['can_control'] is False
        assert flight(preview)['actual_departure_seconds'] == 2280
        assert flight(preview)['phase'] == 'taxiing'
        assert flight(preview)['delay_minutes'] == 18
        assert all(event['projected'] for event in preview['timeline']['events'])
        assert service.get_snapshot(db, user) == initial
        assert list(db.scalars(select(AuditEvent.id))) == before_audit
        advanced = service.control(db, user, ControlInput(action='advance_to', target_seconds=2400))
        assert preview['kpis'] == advanced['kpis']
        assert flight(preview)['position'] == flight(advanced)['position']
        assert [{key:value for key,value in person.items() if key!='last_event_id'} for person in preview['staff']] == [{key:value for key,value in person.items() if key!='last_event_id'} for person in advanced['staff']]


def test_timeline_rewinds_nfc_gates_and_departures_without_erasing_history(ops):
    factory, user = ops
    with factory() as db:
        service.control(db, user, ControlInput(action='advance_to', target_seconds=1320))
        service.input_event(db, user, EventInput(kind='nfc_check_in', staff_id='staff-relief'))
        service.input_event(db, user, EventInput(kind='gate_open', staff_id='staff-relief', gate_id='G1'))
        current = service.control(db, user, ControlInput(action='advance_to', target_seconds=2500))
        run = current['simulation']['run_id']
        before = service.timeline_preview(db, user, 1319, run)
        assert not next(person for person in before['staff'] if person['id']=='staff-relief')['present']
        assert not before['gates'][0]['open']
        assert flight(before)['actual_departure_seconds'] is None
        assert before['kpis']['departed_flights'] == 1
        after = service.timeline_preview(db, user, 1320, run)
        assert after['gates'][0]['open']
        assert flight(after)['phase']=='boarding'
        assert flight(after)['actual_departure_seconds'] is None
        assert not after['timeline']['projected']
        assert any(event['kind']=='gate_open' and not event['projected'] for event in after['timeline']['events'])
        assert service.get_snapshot(db, user) == current


def test_timeline_interactive_projection_never_fabricates_attendance_or_departures(ops):
    factory, user = ops
    with factory() as db:
        current = service.get_snapshot(db, user)
        preview = service.timeline_preview(db, user, 3600, current['simulation']['run_id'])
        assert not any(person['present'] for person in preview['staff'] if person['id'] in ('staff-agent-a','staff-relief'))
        assert not preview['gates'][0]['open']
        assert preview['kpis']['departed_flights'] == 1
        assert all(event['kind'] not in ('nfc_check_in','gate_open','departure') for event in preview['events'] if event['flight_id']=='flight-101' or event['staff_id'] in ('staff-agent-a','staff-relief'))
        assert flight(preview,'flight-404')['phase']=='at_gate'


def test_timeline_readers_stale_runs_and_running_clock(ops, monkeypatch):
    factory, user = ops
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(service,'utc_now',lambda:now)
    with factory() as db:
        current = service.control(db, user, ControlInput(action='start',speed=30))
        user.roles=['hr']
        now += timedelta(seconds=30)
        preview = service.timeline_preview(db,user,600,current['simulation']['run_id'])
        assert preview['permissions']['can_control'] is False
        db.expire_all()
        assert db.get(OperationSimulation,'craiova').elapsed_seconds == 0
        assert db.get(OperationSimulation,'craiova').running is True
        with pytest.raises(DomainError) as error:
            service.timeline_preview(db,user,600,'previous-run')
        assert error.value.status==409
        foreign=SimpleNamespace(airport_id='sibiu',roles=['director'])
        with pytest.raises(DomainError) as error:
            service.timeline_preview(db,foreign,600,current['simulation']['run_id'])
        assert error.value.status==403


def test_timeline_http_authentication_and_bounds(client):
    assert client.get('/api/operations/timeline?at_seconds=10&run_id=unknown').status_code==401
    client.post('/api/auth/login',json={'user_id':'admin','password':'FlyLeaf2026!'})
    current=client.get('/api/operations').json()
    run=current['simulation']['run_id']
    response=client.get(f'/api/operations/timeline?at_seconds=900&run_id={run}')
    assert response.status_code==200,response.text
    assert response.json()['simulation']['elapsed_seconds']==900
    assert client.get(f'/api/operations/timeline?at_seconds=-1&run_id={run}').status_code==422
    assert client.get(f'/api/operations/timeline?at_seconds=3601&run_id={run}').status_code==422
    assert client.get('/api/operations/timeline?at_seconds=10&run_id=old').status_code==409
