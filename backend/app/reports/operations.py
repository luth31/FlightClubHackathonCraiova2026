"""Read-only analytics over the airport ledger; never seed or advance operations."""
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select
from app.operations import ledger, service
from app.operations.models import OperationLedgerGroup, OperationSimulation

CAUSES = {'late_staff': 'Disponibilitatea echipei', 'equipment': 'Echipamente',
          'boarding': 'Îmbarcare', 'gate_unavailable': 'Poartă indisponibilă'}


def summarize(groups):
    flights, events, gates, causes, daily = [], {}, {}, {}, {}
    for group in groups:
        actual_events = [e for e in group['events'] if e.get('actual_at') and e.get('source') != 'pending']
        events.update({e['id']: e for e in actual_events})
        if group['category'] != 'flight':
            continue
        direction = group.get('direction', 'departure')
        terminal = next((e for e in actual_events if e['kind'] == ('departure' if direction == 'departure' else 'arrival')), None)
        # The evidence, not a forecast or group color, determines the measured delay.
        delay = max(0, int((datetime.fromisoformat(terminal['actual_at']) - datetime.fromisoformat(group['scheduled_at'])).total_seconds() // 60)) if terminal else None
        opening = next((e for e in actual_events if e['kind'] == 'gate_open'), None)
        evidence = terminal or (actual_events[-1] if actual_events else None)
        row = {key: group.get(key) for key in ('id', 'callsign', 'route', 'gate_id', 'scheduled_at')}
        row.update(direction=direction, actual_at=terminal['actual_at'] if terminal else None,
                   delay_minutes=delay, gate_delay_minutes=opening['delay_minutes'] if opening else None,
                   event_id=evidence['id'] if evidence else None, event_count=len(actual_events),
                   cause=CAUSES.get(group.get('cause'), 'Nespecificat în registru'))
        flights.append(row)
        if direction != 'departure':
            continue
        if opening:
            gate = gates.setdefault(group['gate_id'], {'name': group['gate_id'], 'total': 0, 'late': 0, 'max_delay': 0})
            gate['total'] += 1
            gate['late'] += opening['delay_minutes'] > 0
            gate['max_delay'] = max(gate['max_delay'], opening['delay_minutes'])
        if delay is None:
            continue
        day = daily.setdefault(group['scheduled_at'][:10], {'date': group['scheduled_at'][:10], 'on_time': 0, 'minor': 0, 'major': 0, 'delay_minutes': 0})
        day['on_time' if delay == 0 else 'minor' if delay < 15 else 'major'] += 1
        day['delay_minutes'] += delay
        if delay:
            cause = causes.setdefault(row['cause'], {'name': row['cause'], 'flights': 0, 'minutes': 0})
            cause['flights'] += 1
            cause['minutes'] += delay
    departures = [r for r in flights if r['direction'] == 'departure']
    completed = [r for r in departures if r['delay_minutes'] is not None]
    timely = sum(r['delay_minutes'] == 0 for r in completed)
    minutes = sum(r['delay_minutes'] for r in completed)
    return {'summary': {'departures': len(departures), 'completed': len(completed),
                       'pending': len(departures) - len(completed),
                       'arrivals': sum(r['direction'] == 'arrival' and r['actual_at'] is not None for r in flights),
                       'on_time': timely, 'on_time_percent': round(100 * timely / len(completed), 1) if completed else None,
                       'delay_minutes': minutes, 'average_delay': round(minutes / len(completed), 1) if completed else None,
                       'major_delays': sum(r['delay_minutes'] >= 15 for r in completed),
                       'gate_openings': sum(g['total'] for g in gates.values()),
                       'late_gates': sum(g['late'] for g in gates.values()), 'recorded_events': len(events)},
            'daily': sorted(daily.values(), key=lambda d: d['date']),
            'gates': sorted(gates.values(), key=lambda g: (-g['late'], g['name'])),
            'causes': sorted(causes.values(), key=lambda c: -c['minutes']),
            'flights': sorted(flights, key=lambda f: (-(f['delay_minutes'] or 0), f['scheduled_at'], f['id']))}


def build(db, user, days=7, scope='all'):
    airport = service.airport_for(user)
    stored = list(db.scalars(select(OperationLedgerGroup).where(OperationLedgerGroup.airport_id == user.airport_id))) if scope == 'all' else []
    groups = [row.data for row in stored]
    state = db.get(OperationSimulation, user.airport_id)
    current_day = None
    if state:
        recorded = service.event_rows(db, state)
        current = ledger.active_groups(service.snapshot(db, state, user, recorded))
        ids = {event.id for event in recorded}
        # active_groups includes planned milestones; count only persisted actions here.
        for group in current:
            group['events'] = [event for event in group['events'] if event['id'] in ids]
        groups += current
        current_day = service.clock_time(state.elapsed_seconds)[:10]
    observed_days = [g['scheduled_at'][:10] for g in groups if g.get('actual_at')]
    end = max(observed_days + ([current_day] if current_day else []), default=None)
    start = (date.fromisoformat(end) - timedelta(days=days - 1)).isoformat() if end and days else None
    selected = [g for g in groups if end and g['scheduled_at'][:10] <= end and (not start or g['scheduled_at'][:10] >= start)]
    result = summarize(selected)
    selected_days = [g['scheduled_at'][:10] for g in selected]
    return {**result, 'airport': airport['name'], 'scope': scope,
            'period': {'from': start or min(selected_days, default=None), 'to': end},
            'available_period': {'from': min((g['scheduled_at'][:10] for g in groups), default=None), 'to': end},
            'current_run_id': state.run_id if state else None,
            'generated_at': datetime.now(timezone.utc).isoformat()}
