from copy import deepcopy
from app.operations.models import OperationLedgerGroup, OperationSimulation


def test_historical_citation_resolves_exact_group_and_event_without_current_filters(admin):
    data=admin.get('/api/operations/ledger').json()
    day=next(day for day in data['days'] if day['date']=='2026-10-27')
    group=next(group for group in day['flights'] if group['category']=='flight')
    event=next(e for e in group['events'] if e['kind']=='gate_open')
    response=admin.get(f"/api/operations/ledger/entries/{event['id']}",params={'group_id':group['id']})
    assert response.status_code==200,response.text
    result=response.json()
    assert result['days'][0]['date']=='2026-10-27'
    assert result['days'][0]['flights']==[group]
    assert result['focus_event_id']==event['id']
    assert result['total_groups']==1


def test_citation_from_previous_run_survives_reset_and_does_not_advance_current_clock(admin,db):
    admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'delayed'})
    old=admin.post('/api/operations/control',json={'action':'advance_to','target_seconds':3600}).json()
    event=next(e for e in old['events'] if e['flight_id']=='flight-101' and e['kind']=='gate_open')
    current=admin.post('/api/operations/control',json={'action':'reset','scenario_mode':'normal'}).json()
    response=admin.get(f"/api/operations/ledger/entries/{event['id']}",params={'group_id':'flight-101'})
    assert response.status_code==200,response.text
    result=response.json()
    group=result['days'][0]['flights'][0]
    assert group['delay_minutes']==18
    assert any(e['id']==event['id'] for e in group['events'])
    assert result['evidence_run_id']==old['simulation']['run_id']
    state=db.get(OperationSimulation,'craiova')
    assert state.run_id==current['simulation']['run_id']
    assert state.elapsed_seconds==0 and state.running is False
    assert state.revision==current['simulation']['revision']
    assert admin.get(f"/api/operations/ledger/entries/{event['id']}",params={'group_id':'flight-202'}).status_code==404


def test_evidence_resolution_rejects_missing_and_other_airport_entries(admin,db):
    data=admin.get('/api/operations/ledger').json()
    group=deepcopy(data['days'][-1]['flights'][0]);group['id']='foreign-group'
    group['events'][0]['id']='foreign-event'
    db.add(OperationLedgerGroup(id='foreign-group',airport_id='sibiu',operational_date='2026-10-27',data=group));db.commit()
    assert admin.get('/api/operations/ledger/entries/foreign-event',params={'group_id':'foreign-group'}).status_code==404
    assert admin.get('/api/operations/ledger/entries/missing',params={'group_id':'missing'}).status_code==404
