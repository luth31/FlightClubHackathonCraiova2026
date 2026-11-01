from pathlib import Path
from uuid import uuid4

import fitz
from sqlalchemy import select

from app.config import settings
from app.documents.models import Document, DocumentVersion
from app.operations.models import OperationLedgerGroup
from conftest import login


def command(client, action, **kwargs):
    response=client.post('/api/operations/control',json={'action':action,**kwargs})
    assert response.status_code==200,response.text
    return response.json()


def event(client,kind,**kwargs):
    response=client.post('/api/operations/events',json={'kind':kind,**kwargs})
    assert response.status_code==200,response.text
    return response.json()


def flight(state): return next(f for f in state['flights'] if f['id']=='flight-101')


def test_presentation_has_one_interactive_problem_and_two_automatic_routine_flights(admin):
    command(admin,'reset')
    state=command(admin,'advance_to',target_seconds=1320)
    assert {f['id'] for f in state['flights']} == {'flight-101','flight-202','flight-404'}
    assert flight(state)['actual_departure_seconds'] is None
    regular=next(f for f in state['flights'] if f['id']=='flight-202')
    assert regular['actual_departure_seconds']==1080 and regular['delay_minutes']==0
    assert state['kpis']['on_time_percent']==100
    assert [f['id'] for f in state['flights'] if f['severity']!='neutral']==['flight-101']
    assert not next(s for s in state['staff'] if s['id']=='staff-agent-a')['present']
    assert not any(e['staff_id'] in ('staff-agent-a','staff-relief') and e['kind']=='nfc_check_in' for e in state['events'])
    assert any(e['kind']=='gate_open' and e['flight_id']=='flight-202' and e['source']=='scenario' for e in state['events'])


def test_interactive_flight_never_fabricates_presenter_staff_or_gate_actions(admin):
    initial=command(admin,'reset')
    assert initial['simulation']['scenario_mode']=='interactive'
    assert initial['simulation']['speed']==1
    state=command(admin,'advance_to',target_seconds=1320)
    assert all(not staff['present'] for staff in state['staff'] if staff['id'] in ('staff-agent-a','staff-relief'))
    assert not any(e['kind'].startswith(('nfc_','gate_open')) for e in state['events'] if e['flight_id']=='flight-101' or e['staff_id'] in ('staff-agent-a','staff-relief'))
    assert flight(state)['actual_departure_seconds'] is None
    assert flight(state)['status']=='blocked'
    assert flight(state)['delay_minutes']==18
    assert flight(state)['phase']=='at_gate'
    assert state['kpis']['on_time_percent']==100
    assert state['kpis']['actual_delay_minutes']==0
    assert state['kpis']['projected_delay_minutes']>0
    assert admin.post('/api/operations/control',json={'action':'advance_to','target_seconds':1200}).status_code==422


def test_card_to_substitution_to_late_offblock_and_real_kpi_change(admin):
    command(admin,'reset')
    # The good flight proves actual punctuality; the delayed flight changes it.
    state=command(admin,'advance_to',target_seconds=1320)
    assert state['kpis']['on_time_percent']==100
    request={'card_id':'DEMO-NFC-104','request_id':str(uuid4())}
    scan=admin.post('/api/operations/nfc',json=request)
    assert scan.status_code==200,scan.text
    duplicate=admin.post('/api/operations/nfc',json=request)
    assert duplicate.json()['event_count']==scan.json()['event_count']
    assert scan.json()['events'][-1]['recorded_at']
    opened=event(admin,'gate_open',staff_id='staff-relief',gate_id='G1')
    assert flight(opened)['estimated_departure_seconds']==2280
    assert flight(opened)['actual_departure_seconds'] is None
    assert flight(opened)['delay_minutes']==18
    assert any(e['payload'].get('substitute') for e in opened['events'] if e['kind']=='gate_open')
    before=command(admin,'advance_to',target_seconds=2279)
    assert flight(before)['phase']=='boarding'
    assert flight(before)['actual_departure_seconds'] is None
    outcome=command(admin,'advance_to',target_seconds=2280)
    assert flight(outcome)['actual_departure_seconds']==2280
    assert flight(outcome)['phase']=='taxiing'
    assert outcome['kpis']['on_time_percent']==50
    assert outcome['kpis']['actual_delay_minutes']==18
    closed=event(admin,'gate_close',staff_id='staff-relief',gate_id='G1')
    assert not next(g for g in closed['gates'] if g['id']=='G1')['open']
    assert admin.post('/api/operations/events',json={'kind':'gate_open','staff_id':'staff-relief','gate_id':'G1'}).status_code==409
    takeoff=command(admin,'advance_to',target_seconds=2460)
    assert flight(takeoff)['phase']=='takeoff'
    assert any(e['kind']=='takeoff' and e['flight_id']=='flight-101' for e in takeoff['events'])
    tree=admin.get('/api/operations/ledger').json()
    group=next(g for day in tree['days'] for g in day['flights'] if g['id']=='flight-101')
    for kind in ('gate_open','boarding_started','boarding_completed','departure','takeoff'):
        milestone=next(e for e in group['events'] if e['kind']==kind)
        assert milestone['delay_minutes']==18,(kind,milestone)
        assert milestone['severity']=='red'
    missing=next(e for e in group['events'] if e['kind']=='staff_absent')
    assert missing['actor']!='Mara Stoica' and 'Mara Stoica' in missing['detail']


def test_early_card_and_gate_prevent_delay_and_closure_pauses_boarding(admin):
    command(admin,'reset')
    event(admin,'nfc_check_in',staff_id='staff-agent-a')
    event(admin,'gate_open',staff_id='staff-agent-a',gate_id='G1')
    command(admin,'advance_to',target_seconds=300)
    event(admin,'gate_close',staff_id='staff-agent-a',gate_id='G1')
    paused=command(admin,'advance_to',target_seconds=900)
    assert flight(paused)['boarding_remaining_seconds']==660
    assert flight(paused)['actual_departure_seconds'] is None
    resumed=event(admin,'gate_open',staff_id='staff-agent-a',gate_id='G1')
    assert flight(resumed)['estimated_departure_seconds']==1560
    finished=command(admin,'advance_to',target_seconds=1560)
    assert flight(finished)['delay_minutes']==6
    command(admin,'reset')
    event(admin,'nfc_check_in',staff_id='staff-agent-a')
    event(admin,'gate_open',staff_id='staff-agent-a',gate_id='G1')
    early=command(admin,'advance_to',target_seconds=1200)
    assert flight(early)['delay_minutes']==0
    assert early['kpis']['on_time_percent']==100


def test_ledger_seed_stable_realistic_grouped_and_filterable(admin,db):
    command(admin,'reset')
    first=admin.get('/api/operations/ledger')
    assert first.status_code==200,first.text
    data=first.json()
    assert data['seeded_events']>800
    summary=admin.get('/api/operations/summary').json()
    assert summary['metrics']==data['metrics']
    assert summary['reference_date']==data['reference_date']
    assert len(data['days'])==11
    identifiers=[row.id for row in db.scalars(select(OperationLedgerGroup))]
    second=admin.get('/api/operations/ledger').json()
    assert data['seeded_events']==second['seeded_events']
    assert identifiers==[row.id for row in db.scalars(select(OperationLedgerGroup))]
    past=next(day for day in data['days'] if day['date']<data['reference_date'])
    assert {'flight','airport'}=={g['category'] for g in past['flights']}
    for group in past['flights']:
        if group['category']!='flight': continue
        scheduled=next(e for e in group['events'] if e['kind']=='flight_scheduled')
        from datetime import datetime
        assert (datetime.fromisoformat(group['scheduled_at'])-datetime.fromisoformat(scheduled['actual_at'])).days==3
        gate=next(e for e in group['events'] if e['kind']=='gate_open')
        departure=next(e for e in group['events'] if e['kind']=='departure')
        assert gate['actual_at']<departure['actual_at']
        if group['cause']=='late_staff':
            attendance=next(e for e in group['events'] if e['kind']=='nfc_check_in' and e['title']=='Pontaj agent poartă')
            assert attendance['actual_at']>gate['actual_at']
    filtered=admin.get('/api/operations/ledger',params={'date':past['date'],'status':'attention'}).json()
    assert all(day['date']==past['date'] for day in filtered['days'])
    assert all(g['severity']!='neutral' for day in filtered['days'] for g in day['flights'])
    assert admin.get('/api/operations/ledger?date=not-a-date').status_code==422


def test_current_run_enters_ledger_and_changes_measured_metrics(admin):
    command(admin,'reset')
    before=admin.get('/api/operations/ledger').json()
    command(admin,'advance_to',target_seconds=1320)
    event(admin,'nfc_check_in',staff_id='staff-relief')
    event(admin,'gate_open',staff_id='staff-relief',gate_id='G1')
    projected=admin.get('/api/operations/ledger').json()
    assert projected['metrics']['delay_minutes']==before['metrics']['delay_minutes']
    assert projected['metrics']['projected_delay_minutes']>before['metrics']['projected_delay_minutes']
    command(admin,'advance_to',target_seconds=2280)
    after=admin.get('/api/operations/ledger').json()
    assert after['metrics']['delay_minutes']==before['metrics']['delay_minutes']+18
    assert after['metrics']['completed_departures']==before['metrics']['completed_departures']+2
    current=next(g for day in after['days'] for g in day['flights'] if g['id']=='flight-101')
    assert current['severity']=='red'
    assert current['cause']=='late_staff'
    assert any(e['kind']=='nfc_check_in' and e['actor']=='Alexandru Marin' for e in current['events'])


def test_sop_evidence_creates_reviewable_pdf_once_and_keeps_access_rules(admin,db):
    proposals=admin.get('/api/operations/strategies')
    assert proposals.status_code==200,proposals.text
    proposal=next(p for p in proposals.json()['items'] if p['id']=='gate-reserve')
    assert proposal['evidence_count']>0
    assert proposal['estimate']['minutes_saved']>0
    response=admin.post('/api/operations/strategies/gate-reserve/draft')
    assert response.status_code==200,response.text
    result=response.json()
    document=db.get(Document,result['document_id'])
    assert document.status=='draft' and not document.validated
    assert document.extra['metadata']['proposal_only']
    version=db.scalar(select(DocumentVersion).where(DocumentVersion.document_id==document.id))
    pdf=fitz.open(version.file_path)
    text=''.join(page.get_text() for page in pdf)
    assert 'NECESITĂ AVIZARE' in text and 'Ipoteze' in text
    assert admin.get(result['file_url']).status_code==200
    repeat=admin.post('/api/operations/strategies/gate-reserve/draft').json()
    assert repeat['document_id']==result['document_id']
    assert len(list(db.scalars(select(DocumentVersion).where(DocumentVersion.document_id==document.id))))==1
    login(admin,'technician')
    assert admin.post('/api/operations/strategies/gate-reserve/draft').status_code==403
    assert admin.post('/api/operations/nfc',json={'card_id':'UNKNOWN'}).status_code==422
    login(admin,'hr')
    assert admin.post('/api/operations/nfc',json={'card_id':'DEMO-NFC-101'}).status_code==403


def test_all_seeded_flights_have_distinct_reserve_and_present_gate_operator():
    from datetime import timedelta
    from app.operations.ledger import fixture_flight
    for airport in ('craiova','sibiu'):
        for offset in range(-7,4):
            if offset==0: continue
            day=settings.reference_date+timedelta(days=offset)
            for index in range(8 if offset<0 else 3):
                group=fixture_flight(airport,day,index,upcoming=offset>0)
                assert group['assigned_staff']!=group['reserve_staff']
                events=group['events']
                ids=[event['id'] for event in events]
                assert len(ids)==len(set(ids))
                if offset>0:
                    assert not any(e['kind'] in ('staff_absent','staff_substitution') for e in events)
                    assert group['severity']=='neutral'
                    continue
                gate=next(e for e in events if e['kind']=='gate_open')
                scans=[e for e in events if e['kind']=='nfc_check_in' and e['actor']==gate['actor']]
                assert scans and min(e['actual_at'] for e in scans)<gate['actual_at']
                actual_times=[e['actual_at'] for e in events if e['actual_at']]
                assert actual_times==sorted(actual_times)
                departure=next(e for e in events if e['kind']=='departure')
                boarded=next(e for e in events if e['kind']=='boarding_completed')
                takeoff=next(e for e in events if e['kind']=='takeoff')
                assert gate['actual_at']<boarded['actual_at']<departure['actual_at']<takeoff['actual_at']
                if group['cause']=='late_staff':
                    assert gate['actor']==group['reserve_staff']
                    absent=next(e for e in events if e['kind']=='staff_absent')
                    assert absent['severity']=='yellow'
                    assigned_scan=next(e for e in events if e['kind']=='nfc_check_in' and e['actor']==group['assigned_staff'])
                    assert assigned_scan['actual_at']>gate['actual_at']
                else:
                    assert gate['actor']==group['assigned_staff']


def test_fixture_upgrade_repairs_only_generated_history_and_preserves_manual_events(admin,db):
    from app.operations.models import OperationEvent
    from app.operations.ledger import FIXTURE_VERSION
    command(admin,'reset')
    event(admin,'nfc_check_in',staff_id='staff-agent-a')
    admin.get('/api/operations/ledger')
    original_events=[(e.id,e.kind,e.payload) for e in db.scalars(select(OperationEvent))]
    row=db.scalar(select(OperationLedgerGroup).where(OperationLedgerGroup.airport_id=='craiova'))
    original=row.data.copy()
    row.data={**row.data,'fixture_version':1,'reserve_staff':'stale fixture'}
    db.commit()
    admin.get('/api/operations/ledger')
    db.expire_all()
    assert row.data['fixture_version']==FIXTURE_VERSION
    assert row.data.get('reserve_staff')==original.get('reserve_staff')
    assert [(e.id,e.kind,e.payload) for e in db.scalars(select(OperationEvent))]==original_events
    # A non-fixture record under a familiar ID is not silently overwritten.
    row.data={**row.data,'fixture_version':1,'source':'operator','reserve_staff':'custom record'}
    db.commit()
    try:
        admin.get('/api/operations/ledger')
        db.expire_all()
        assert row.data['reserve_staff']=='custom record'
    finally:
        row.data=original
        db.commit()


def test_run_archive_keeps_prior_clock_events_and_paginates(admin):
    replay=command(admin,'reset',scenario_mode='replay')
    assert replay['simulation']['speed']==30
    old_id=replay['simulation']['run_id']
    command(admin,'advance_to',target_seconds=120)
    current=command(admin,'reset')
    assert current['simulation']['speed']==1
    archived=admin.get('/api/operations/runs?limit=2').json()
    assert len(archived['items'])==2
    assert archived['items'][0]['is_current']
    assert archived['items'][0]['scenario_mode']=='interactive'
    previous=next(run for run in archived['items'] if run['run_id']==old_id)
    assert previous['scenario_mode']=='replay' and previous['ended_at']
    events=admin.get('/api/operations/events',params={'run_id':old_id,'limit':2}).json()
    assert events['total']==previous['event_count']
    assert all(event['run_id']==old_id and event['recorded_at'] and event['simulated_at'] for event in events['items'])
    assert admin.get('/api/operations/runs?limit=0').status_code==422
