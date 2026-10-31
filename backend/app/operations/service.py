"""Persisted, replayable scenario events with a server-owned simulation clock."""
from datetime import datetime, timedelta, timezone
from math import ceil, floor
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from app.config import settings
from app.core.audit import record
from app.core.exceptions import DomainError
from app.core.security import has_role, require_role
from app.operations.models import OperationEvent, OperationSimulation
from app.operations.scenario import AIRPORTS, DURATION_SECONDS, FLIGHTS, STAFF, TIMELINE, MINOR_DELAY_MINUTES, MAJOR_DELAY_MINUTES, gates, position


KINDS = {
    'nfc_check_in': 'Card NFC · intrare', 'nfc_check_out': 'Card NFC · ieșire',
    'gate_open': 'Poartă deschisă', 'gate_close': 'Poartă închisă',
    'emergency_declared': 'Urgență simulată declarată', 'emergency_cleared': 'Urgență simulată închisă',
}


def utc_now():
    return datetime.now(timezone.utc)


def airport_for(user):
    if user.airport_id != settings.airport_id or user.airport_id not in AIRPORTS:
        raise DomainError('Aeroportul nu are un scenariu configurat.', 403)
    return AIRPORTS[user.airport_id]


def clock_time(seconds):
    # Scenario clock is deliberately local display time, not actual audit time.
    baseline = datetime.combine(settings.reference_date, datetime.min.time()).replace(hour=8)
    return (baseline + timedelta(seconds=seconds)).isoformat()


def append_event(db, state, user, kind, elapsed, title, detail='', *, source='scenario', key=None, payload=None):
    payload = payload or {}
    event = OperationEvent(id='op-' + uuid4().hex, airport_id=state.airport_id, run_id=state.run_id,
        sequence=state.next_sequence, elapsed_seconds=elapsed, recorded_at=utc_now().isoformat(),
        kind=kind, source=source, event_key=key or uuid4().hex, title=title, detail=detail,
        actor_id=user.id if source != 'scenario' else 'simulation',
        actor=user.name if source != 'scenario' else 'Motorul simulării',
        flight_id=payload.get('flight_id'), gate_id=payload.get('gate_id'), staff_id=payload.get('staff_id'), payload=payload)
    state.next_sequence += 1
    db.add(event)
    audit = record(db, user, 'Simulare · ' + title, detail=f'Run {state.run_id}; eveniment {event.sequence}; {clock_time(elapsed)}; {detail}')
    if source == 'scenario':
        audit.actor_id, audit.actor = 'simulation', 'Motorul simulării'
    return event


def event_rows(db, state):
    return list(db.scalars(select(OperationEvent).where(OperationEvent.airport_id==state.airport_id,
        OperationEvent.run_id==state.run_id).order_by(OperationEvent.sequence)))


def initial_state(db, user):
    airport_for(user)
    state = db.get(OperationSimulation, user.airport_id)
    if state is None:
        now = utc_now().isoformat()
        state = OperationSimulation(airport_id=user.airport_id, run_id=str(uuid4()), elapsed_seconds=0,
            running=False, speed=30, updated_at=now, created_at=now, next_sequence=1)
        db.add(state)
        db.flush()
        append_event(db, state, user, 'simulation_initialized', 0, 'Tura este pregătită',
            'Scenariu demonstrativ. Porțile, zborurile și cardurile NFC sunt simulate.', source='control', key='initialized')
        db.flush()
    return state


def first_openings(events):
    openings = {}
    for event in events:
        if event.kind == 'gate_open' and event.flight_id and event.flight_id not in openings:
            openings[event.flight_id] = event
    return openings


def pending_events(events):
    keys = {e.event_key for e in events}
    result = [(seconds, f'scenario-{index}', kind, payload, title, detail)
        for index, (seconds, kind, payload, title, detail) in enumerate(TIMELINE)
        if f'scenario-{index}' not in keys]
    for flight in FLIGHTS:
        if flight['direction'] != 'departure':
            continue
        opened = first_openings(events).get(flight['id'])
        if not opened:
            continue
        departure = max(flight['scheduled_departure_seconds'], opened.elapsed_seconds + flight['turnaround_seconds'])
        payload = {'flight_id': flight['id'], 'gate_id': flight['gate_id'], 'cause_event_id': opened.id}
        for seconds, kind, title in (
            (opened.elapsed_seconds, 'boarding_started', f'{flight["callsign"]} · îmbarcare începută'),
            (departure-180, 'boarding_completed', f'{flight["callsign"]} · îmbarcare încheiată'),
            (departure-180, 'pushback', f'{flight["callsign"]} · rulaj spre pistă'),
            (departure, 'departure', f'{flight["callsign"]} a decolat'),
        ):
            key = flight['id'] + ':' + kind
            if key not in keys:
                result.append((seconds, key, kind, payload, title,
                    f'Poarta {flight["gate_id"]} deschisă la {clock_time(opened.elapsed_seconds)[11:16]}; pregătire {flight["turnaround_seconds"]/60:g} min.'))
    return sorted(result, key=lambda item: (item[0], item[1]))


def synchronize(db, state, user, *, target=None):
    current_time = utc_now()
    elapsed = state.elapsed_seconds
    if target is None:
        if state.running:
            wall_seconds = max(0, (current_time - datetime.fromisoformat(state.updated_at)).total_seconds())
            elapsed += wall_seconds * state.speed
    else:
        elapsed = max(elapsed, target)
    elapsed = min(DURATION_SECONDS, elapsed)
    events = event_rows(db, state)
    while True:
        pending = pending_events(events)
        if not pending or pending[0][0] > elapsed:
            break
        seconds, key, kind, payload, title, detail = pending[0]
        # An operator's earlier intervention supersedes the planned delayed opening.
        if kind == 'gate_open' and payload.get('flight_id') in first_openings(events):
            kind, title, detail = 'scenario_superseded', 'Acțiune deja realizată', 'Deschiderea automată nu a fost repetată; intervenția anterioară este păstrată.'
        if kind == 'staff_absent' and staff_state(events)[payload['staff_id']]['present']:
            kind, title, detail = 'staff_available', 'Agentul este disponibil', 'Intervenția din scenariu a prevenit absența la poartă.'
        if kind == 'staff_substitution' and payload.get('flight_id') in first_openings(events):
            kind, title, detail = 'scenario_superseded', 'Poarta funcționează deja', 'Înlocuirea planificată nu mai este necesară după intervenția operatorului.'
        if kind == 'scenario_summary':
            opened = first_openings(events).get('flight-101')
            delayed = max(0, opened.elapsed_seconds + 960 - 1200) / 60 if opened else None
            detail = (f'FL101: {delayed:g} minute întârziere. Cauza și intervențiile sunt urmărite în jurnal; lecția poate informa o procedură.'
                      if delayed is not None else 'Poarta G1 nu a fost deschisă. Jurnalul păstrează evenimentele și intervențiile operatorului.')
        event = append_event(db, state, user, kind, seconds, title, detail, key=key, payload=payload)
        events.append(event)
    if elapsed != state.elapsed_seconds or state.running:
        state.elapsed_seconds = elapsed
        state.updated_at = current_time.isoformat()
    if elapsed >= DURATION_SECONDS:
        state.running = False
    db.flush()
    return events


def staff_state(events):
    result = {item['id']: {**item, 'present': False, 'actual_arrival_seconds': None, 'last_event_id': None} for item in STAFF}
    for event in events:
        if event.staff_id not in result or event.kind not in ('nfc_check_in', 'nfc_check_out'):
            continue
        staff = result[event.staff_id]
        staff['present'] = event.kind == 'nfc_check_in'
        staff['last_event_id'] = event.id
        if event.kind == 'nfc_check_in' and staff['actual_arrival_seconds'] is None:
            staff['actual_arrival_seconds'] = event.elapsed_seconds
    for staff in result.values():
        arrival = staff['actual_arrival_seconds']
        staff['late_minutes'] = ceil(max(0, arrival-staff['expected_seconds'])/60) if arrival is not None else None
    return result


def severity(delay_minutes, emergency=False):
    if emergency or (delay_minutes is not None and delay_minutes >= MAJOR_DELAY_MINUTES):
        return 'red'
    if delay_minutes is not None and delay_minutes >= MINOR_DELAY_MINUTES:
        return 'yellow'
    return 'neutral'


def serialize_event(event):
    return {key: getattr(event, key) for key in ('id','run_id','sequence','elapsed_seconds','recorded_at','kind','source','title','detail','actor_id','actor','flight_id','gate_id','staff_id','payload')} | {
        'simulated_at': clock_time(event.elapsed_seconds), 'simulated': True}


def snapshot(db, state, user, events):
    airport = airport_for(user)
    staff = staff_state(events)
    gate_rows = {gate['id']: {**gate, 'open': False, 'opened_by': None, 'opened_at_seconds': None} for gate in gates(airport)}
    for event in events:
        if event.gate_id in gate_rows and event.kind in ('gate_open','gate_close'):
            gate = gate_rows[event.gate_id]
            gate['open'] = event.kind == 'gate_open'
            if gate['open']:
                gate['opened_by'] = event.staff_id
                gate['opened_at_seconds'] = event.elapsed_seconds
    openings = first_openings(events)
    flights = []
    for definition in FLIGHTS:
        identifier = definition['id']
        selected_events = [e for e in events if e.flight_id == identifier]
        emergency = False
        for event in selected_events:
            if event.kind == 'emergency_declared': emergency = True
            if event.kind == 'emergency_cleared': emergency = False
        actual = next((e.elapsed_seconds for e in selected_events if e.kind == 'departure'), None)
        opened = openings.get(identifier)
        planned = definition.get('scheduled_departure_seconds')
        estimated = max(planned, opened.elapsed_seconds+definition['turnaround_seconds']) if planned is not None and opened else None
        if planned is None:
            delay = 0
        else:
            end = actual if actual is not None else (estimated if estimated is not None else state.elapsed_seconds)
            delay = floor(max(0, end-planned)/60)
        point, phase = position(airport, gate_rows[definition['gate_id']], definition, state.elapsed_seconds, actual if actual is not None else estimated)
        if definition['direction'] == 'departure' and not opened:
            phase = 'at_gate'
        flights.append({**definition, 'origin': definition.get('origin', airport['name']),
            'destination': definition.get('destination', airport['name']), 'position': point, 'phase': phase,
            'actual_departure_seconds': actual, 'estimated_departure_seconds': estimated,
            'delay_minutes': delay, 'delay_basis': 'actual' if actual is not None else 'scenario_projection',
            'severity': severity(delay, emergency), 'emergency': emergency, 'simulated': True,
            'cause_event_id': opened.id if opened else None,
            'status_label': 'Urgență simulată' if emergency else (f'+{delay} min' if delay else 'La timp')})
    departed = [f for f in flights if f['actual_departure_seconds'] is not None]
    ontime = sum(f['delay_minutes'] == 0 for f in departed)
    return {
        'airport': {key: airport[key] for key in ('id','name','icao','lat','lon','elevation_m')},
        'mode': 'simulation', 'simulated': True,
        'model': {'departure_basis': 'first_gate_opening_plus_turnaround', 'gate_reclosures_affect_departure': False,
            'notice': 'Orarul folosește prima deschidere a porții. Închiderile ulterioare sunt jurnalizate, fără recalcularea pregătirii.'},
        'simulation': {'run_id': state.run_id, 'revision': state.revision, 'running': state.running, 'speed': state.speed,
            'elapsed_seconds': round(state.elapsed_seconds, 2), 'duration_seconds': DURATION_SECONDS,
            'clock_time': clock_time(state.elapsed_seconds), 'created_at': state.created_at, 'updated_at': state.updated_at},
        'flights': flights, 'gates': list(gate_rows.values()), 'staff': list(staff.values()),
        'events': [serialize_event(event) for event in events],
        'event_count': len(events),
        'kpis': {'on_time_percent': round(100*ontime/len(departed)) if departed else None,
            'departed_flights': len(departed), 'on_time_departures': ontime,
            'delayed_flights': sum(f['delay_minutes'] > 0 for f in flights),
            'critical_flights': sum(f['severity'] == 'red' for f in flights),
            'delay_minutes': sum(f['delay_minutes'] for f in flights),
            'staff_present': sum(person['present'] for person in staff.values()),
            'gates_open': sum(gate['open'] for gate in gate_rows.values())},
        'thresholds': {'minor_delay_minutes': MINOR_DELAY_MINUTES, 'major_delay_minutes': MAJOR_DELAY_MINUTES},
        'permissions': {'can_control': has_role(user, 'director','reviewer','technician')},
        'notice': 'Scenariu demonstrativ. Cardurile NFC și zborurile sunt simulate; nu reprezintă operațiuni reale.',
    }


def get_snapshot(db, user):
    for attempt in range(3):
        try:
            state = initial_state(db, user)
            events = synchronize(db, state, user)
            db.commit()
            return snapshot(db, state, user, events)
        except (StaleDataError, IntegrityError):
            db.rollback()
            if attempt == 2:
                raise DomainError('Simularea s-a actualizat simultan. Reîncarcă starea.', 409)


def authorize_control(user):
    airport_for(user)
    require_role(user, 'director','reviewer','technician')


def verify_revision(state, expected):
    if expected is not None and expected != state.revision:
        raise DomainError('Simularea s-a modificat. Reîncarcă înainte de următoarea acțiune.', 409)


def control(db, user, body):
    authorize_control(user)
    # A running clock may race this semantic command. Retry rolled-back writes,
    # but preserve strict preconditions when the caller supplies a revision.
    for attempt in range(3):
        try:
            state = initial_state(db, user)
            verify_revision(state, body.expected_revision)
            events = synchronize(db, state, user)
            if body.action == 'reset':
                append_event(db, state, user, 'simulation_reset', state.elapsed_seconds, 'Scenariu reluat',
                    'Istoricul acestei rulări rămâne în jurnal.', source='control')
                state.run_id, state.elapsed_seconds, state.running, state.next_sequence = str(uuid4()), 0, False, 1
                state.created_at = utc_now().isoformat()
                append_event(db, state, user, 'simulation_initialized', 0, 'Tura este pregătită',
                    'Rulare nouă; evenimentele anterioare au fost păstrate.', source='control', key='initialized')
            elif body.action in ('step','advance'):
                state.running = False
                pending = pending_events(events)
                target = min(DURATION_SECONDS, state.elapsed_seconds + body.seconds)
                if body.action == 'step' and pending:
                    target = max(state.elapsed_seconds, pending[0][0])
                synchronize(db, state, user, target=target)
                append_event(db, state, user, 'simulation_advanced', state.elapsed_seconds, 'Timp simulat avansat', source='control')
            else:
                state.running = body.action == 'start' and state.elapsed_seconds < DURATION_SECONDS
                append_event(db, state, user, 'simulation_' + body.action, state.elapsed_seconds,
                    'Simulare pornită' if state.running else 'Simulare oprită', source='control')
            if body.speed is not None:
                state.speed = body.speed
            state.updated_at = utc_now().isoformat()
            db.flush()
            events = event_rows(db, state)
            db.commit()
            return snapshot(db, state, user, events)
        except (StaleDataError, IntegrityError):
            db.rollback()
            if body.expected_revision is not None or attempt == 2:
                raise DomainError('Altă sesiune a actualizat simularea. Reîncarcă și încearcă din nou.', 409)


def input_event(db, user, body):
    authorize_control(user)
    for attempt in range(3):
        try:
            state = initial_state(db, user)
            verify_revision(state, body.expected_revision)
            events = synchronize(db, state, user)
            key = 'request-' + str(body.request_id) if body.request_id else 'manual-' + uuid4().hex
            if any(event.event_key == key for event in events):
                db.commit()
                return snapshot(db, state, user, events)
            staff = staff_state(events)
            gate_ids = {item['id'] for item in gates(airport_for(user))}
            flight_ids = {item['id'] for item in FLIGHTS}
            if body.staff_id is not None and body.staff_id not in staff:
                raise DomainError('Cardul demonstrativ nu este cunoscut în acest aeroport.', 422)
            if body.gate_id is not None and body.gate_id not in gate_ids:
                raise DomainError('Poarta nu există în acest scenariu.', 422)
            if body.flight_id is not None and body.flight_id not in flight_ids:
                raise DomainError('Zborul nu există în acest scenariu.', 422)
            if body.kind.startswith('nfc_') and not body.staff_id:
                raise DomainError('Selectează cardul demonstrativ al angajatului.', 422)
            payload = {'staff_id': body.staff_id, 'gate_id': body.gate_id, 'flight_id': body.flight_id}
            if body.kind.startswith('gate_'):
                if not body.gate_id or not body.staff_id:
                    raise DomainError('Poarta și agentul sunt obligatorii.', 422)
                if not staff[body.staff_id]['present']:
                    raise DomainError('Agentul trebuie să fie pontat înainte de acțiunea la poartă.', 409)
                assigned = next(f for f in FLIGHTS if f['gate_id']==body.gate_id)
                if body.flight_id and body.flight_id != assigned['id']:
                    raise DomainError('Zborul nu este alocat acestei porți.', 422)
                payload['flight_id'] = assigned['id']
            if body.kind.startswith('emergency_') and not body.flight_id:
                raise DomainError('Selectează zborul din exercițiu.', 422)
            detail = body.note.strip() or 'Acțiune demonstrativă înregistrată de operator.'
            append_event(db, state, user, body.kind, state.elapsed_seconds, KINDS[body.kind], detail,
                source='operator', key=key, payload=payload)
            db.flush()
            events = synchronize(db, state, user, target=state.elapsed_seconds)
            state.updated_at = utc_now().isoformat()
            db.commit()
            return snapshot(db, state, user, events)
        except (StaleDataError, IntegrityError):
            db.rollback()
            if body.expected_revision is not None or attempt == 2:
                raise DomainError('Evenimentul concurează cu o altă actualizare. Reîncarcă starea.', 409)


def history(db, user, run_id=None, offset=0, limit=200):
    airport_for(user)
    query = select(OperationEvent).where(OperationEvent.airport_id==user.airport_id)
    if run_id:
        query = query.where(OperationEvent.run_id==run_id)
    count = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(OperationEvent.recorded_at, OperationEvent.run_id, OperationEvent.sequence).offset(offset).limit(limit))
    return {'items': [serialize_event(item) for item in rows], 'total': count, 'offset': offset, 'limit': limit}
