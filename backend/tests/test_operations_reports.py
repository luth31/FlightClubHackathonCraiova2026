from copy import deepcopy
from datetime import date, timedelta
from sqlalchemy import func, select
from app.operations import ledger, service
from app.operations.models import OperationEvent, OperationLedgerGroup, OperationSimulation
from app.reports.operations import summarize
from app.config import settings


def test_measured_departures_exclude_arrivals_forecasts_and_airport_actions():
    day = date(2026, 10, 27)
    a = ledger.fixture_flight('craiova', day, 0)
    b = ledger.fixture_flight('craiova', day, 1)
    # Test inputs only, deliberately contradictory summary metadata: evidence wins.
    a['delay_minutes'] = 999
    a['events'] = [e for e in a['events'] if e['kind'] != 'departure']
    b['delay_minutes'] = 999
    arrival = deepcopy(b)
    arrival.update(id='arrival', direction='arrival')
    arrival['events'] = [{**e, 'id':'arrival-'+e['id'], 'kind':'arrival' if e['kind']=='departure' else e['kind']} for e in arrival['events']]
    result = summarize([a, b, arrival, ledger.fixture_airport_group('craiova', day, 0)])
    s = result['summary']
    actual = next(e for e in b['events'] if e['kind']=='departure')['delay_minutes']
    assert s['completed'] == 1 and s['pending'] == 1 and s['arrivals'] == 1
    assert s['delay_minutes'] == actual and s['average_delay'] == actual
    assert s['on_time_percent'] == (100 if actual == 0 else 0)
    assert sum(d['on_time']+d['minor']+d['major'] for d in result['daily']) == s['completed']
    assert sum(c['minutes'] for c in result['causes']) == actual
    assert result['flights'][0]['event_id']
    assert summarize([])['summary']['on_time_percent'] is None
    assert summarize([])['summary']['average_delay'] is None


def test_reports_read_existing_ledger_without_seeding_or_advancing(admin, db, monkeypatch):
    def forbid(*args, **kwargs):
        raise AssertionError('Reports must not create history or advance the clock')
    monkeypatch.setattr(ledger, 'seed_history', forbid)
    monkeypatch.setattr(service, 'get_snapshot', forbid)
    def state():
        db.expire_all()
        return ([tuple(getattr(s, c.name) for c in OperationSimulation.__table__.columns) for s in db.scalars(select(OperationSimulation))],
                db.scalar(select(func.count()).select_from(OperationLedgerGroup)), db.scalar(select(func.count()).select_from(OperationEvent)))
    before = state()
    for suffix in ('', '?days=7&scope=all', '?days=30', '?days=0', '?scope=current'):
        response = admin.get('/api/reports/operations'+suffix)
        assert response.status_code == 200, response.text
        assert response.json()['summary']['completed'] == len([f for f in response.json()['flights'] if f['direction']=='departure' and f['actual_at']])
    assert state() == before
    assert admin.get('/api/reports/operations?days=999').status_code == 422
    assert admin.get('/api/reports/operations?scope=another-airport').status_code == 422


def test_report_evidence_tenant_isolation_and_period(admin, db):
    inserted = []
    try:
        for airport, day in [('craiova', settings.reference_date-timedelta(days=2)), ('sibiu', settings.reference_date-timedelta(days=1)), ('craiova', settings.reference_date+timedelta(days=3))]:
            group = ledger.fixture_flight(airport, day, 5, upcoming=day>settings.reference_date)
            group['id'] = 'report-test-'+group['id']
            row = OperationLedgerGroup(id=group['id'],airport_id=airport,operational_date=day.isoformat(),data=group)
            db.add(row);inserted.append(row)
        db.commit()
        response = admin.get('/api/reports/operations?days=0')
        assert response.status_code == 200, response.text
        result = response.json()
        ids = {f['id'] for f in result['flights']}
        assert inserted[0].id in ids and inserted[1].id not in ids and inserted[2].id not in ids
        flight = next(f for f in result['flights'] if f['id']==inserted[0].id)
        evidence = admin.get('/api/operations/ledger/entries/'+flight['event_id'], params={'group_id':flight['id']})
        assert evidence.status_code == 200, evidence.text
        assert evidence.json()['focus_event_id'] == flight['event_id']
    finally:
        for row in inserted: db.delete(row)
        db.commit()


def test_current_shift_uses_recorded_events_and_does_not_double_count_previous_runs(admin):
    reset = admin.post('/api/operations/control', json={'action':'reset', 'scenario_mode':'delayed'})
    assert reset.status_code == 200, reset.text
    advanced = admin.post('/api/operations/control', json={'action':'advance_to', 'target_seconds':3600})
    assert advanced.status_code == 200, advanced.text
    report = admin.get('/api/reports/operations?scope=current').json()
    assert report['summary']['completed'] == 2
    assert report['summary']['arrivals'] == 1
    assert report['summary']['on_time_percent'] == 50
    assert report['summary']['delay_minutes'] == 18
    assert report['summary']['major_delays'] == 1
    delayed = next(f for f in report['flights'] if f['delay_minutes']==18)
    assert admin.post('/api/operations/control', json={'action':'reset', 'scenario_mode':'normal'}).status_code == 200
    next_report = admin.get('/api/reports/operations?scope=current').json()
    assert next_report['summary']['completed'] == 0
    assert next_report['summary']['on_time_percent'] is None
    evidence = admin.get('/api/operations/ledger/entries/'+delayed['event_id'], params={'group_id':delayed['id']})
    assert evidence.status_code == 200, evidence.text
    assert evidence.json()['evidence_run_id'] == report['current_run_id']
