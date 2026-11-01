import pytest
from app.operations.models import OperationEvent
from sqlalchemy import select, func


def control(client, action, **extra):
    response=client.post('/api/operations/control',json={'action':action,**extra})
    assert response.status_code==200,response.text
    return response.json()


@pytest.mark.parametrize('preset,delay,percent',[('normal',0,100),('delayed',18,50),('recovery',3,50)])
def test_preset_outcome_and_isolated_ledger(admin,preset,delay,percent):
    initial=control(admin,'reset',scenario_mode=preset)
    assert initial['simulation']['elapsed_seconds']==0
    assert initial['simulation']['running'] is False
    result=control(admin,'advance_to',target_seconds=3600)
    flights={f['id']:f for f in result['flights']}
    assert flights['flight-101']['delay_minutes']==delay
    assert flights['flight-202']['delay_minutes']==0
    assert result['kpis']['on_time_percent']==percent
    ledger=admin.get('/api/operations/ledger',params={'scope':'current','run_id':initial['simulation']['run_id']}).json()
    assert ledger['total_groups']==3 and ledger['seeded_events']==0
    assert ledger['metrics']['delay_minutes']==delay
    assert ledger['scenario_mode']==preset
    assert all(f['source']=='interactive' for d in ledger['days'] for f in d['flights'])


def test_switching_scenarios_keeps_history_and_rejects_stale_ledger(admin,db):
    old=control(admin,'reset',scenario_mode='delayed')['simulation']['run_id']
    control(admin,'advance_to',target_seconds=3600)
    count=db.scalar(select(func.count()).select_from(OperationEvent).where(OperationEvent.run_id==old))
    new=control(admin,'reset',scenario_mode='normal')['simulation']['run_id']
    assert old!=new
    assert db.scalar(select(func.count()).select_from(OperationEvent).where(OperationEvent.run_id==old))>=count
    assert admin.get('/api/operations/ledger',params={'scope':'current','run_id':old}).status_code==409
    preview=admin.get('/api/operations/ledger',params={'scope':'current','run_id':new,'at_seconds':3600}).json()
    assert preview['metrics']['delay_minutes']==0
    assert preview['metrics']['on_time_percent']==100
    assert admin.get('/api/operations').json()['simulation']['elapsed_seconds']==0
