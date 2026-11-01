from datetime import timedelta
from app.config import settings
from app.operations.ledger import fixture_flight
from app.operations.atomic_ledger import decorate_group
from app.operations.process_graph import process_graph


def test_evidence_graph_retains_parallel_branches_and_exact_atomic_edges():
    group=decorate_group('craiova',fixture_flight('craiova',settings.reference_date-timedelta(days=1),0))
    graph=process_graph(group)
    events={e['kind']:e for e in group['events']}
    edges={(e['source'],e['target']) for e in graph['edges']}
    for kind in ('cleaning_started','fuel_started','baggage_loading_started'):
        assert (events['aircraft_onblock']['id'],events[kind]['id']) in edges
    assert (events['cleaning_complete']['id'],events['fuel_started']['id']) not in edges
    assert (events['fuel_ready']['id'],events['baggage_loaded']['id']) not in edges
    ready=events['aircraft_ready']
    assert {source for source,target in edges if target==ready['id']} == set(ready['operation']['dependencies'])
    assert all(e['kind']=='recorded' for e in graph['edges'])
    assert not any(n['id'].startswith('required:') for n in graph['nodes'])


def test_missing_confirmations_remain_unrecorded_and_do_not_change_evidence():
    group=decorate_group('craiova',fixture_flight('craiova',settings.reference_date+timedelta(days=2),0,upcoming=True))
    group['events']=[e for e in group['events'] if e['kind'] in ('flight_scheduled','departure','takeoff')]
    original=[dict(e) for e in group['events']]
    graph=process_graph(group)
    nodes={n['id']:n for n in graph['nodes']}
    assert 'required:aircraft_ready' in nodes
    assert 'required:fuel_ready' in nodes and 'required:baggage_loaded' in nodes
    assert not nodes['required:aircraft_ready']['recorded']
    assert nodes['required:aircraft_ready']['tone']=='neutral'
    assert not nodes['required:aircraft_ready']['actual_at']
    assert group['events']==original
    assert all(e['kind']=='required' for e in graph['edges'])


def test_delay_is_not_a_lifecycle_state_and_forecasts_never_turn_green():
    group=decorate_group('craiova',fixture_flight('craiova',settings.reference_date-timedelta(days=1),0))
    fuel=next(e for e in group['events'] if e['kind']=='fuel_ready')
    fuel.update(severity='red',delay_minutes=22)
    graph=process_graph(group)
    node=next(n for n in graph['nodes'] if n['id']==fuel['id'])
    assert node['tone']=='danger' and node['to_label']=='Încheiat'
    machine=next(m for m in graph['machines'] if m['id']=='fuel')
    assert machine['current']=='completed'
    assert {s['id'] for s in machine['states']}=={'pending','active','completed'}
    fuel.update(projected=True,severity='neutral',delay_minutes=0)
    graph=process_graph(group)
    node=next(n for n in graph['nodes'] if n['id']==fuel['id'])
    assert node['tone']=='info' and not node['recorded']
    assert next(m for m in graph['machines'] if m['id']=='fuel')['current']=='active'


def test_api_diagram_never_creates_facts_for_required_operations(admin,db):
    from sqlalchemy import select
    from app.operations.models import OperationFact
    response=admin.get('/api/operations/ledger')
    assert response.status_code==200,response.text
    groups=[g for day in response.json()['days'] for g in day['flights']]
    assert any(g['process']['nodes'] for g in groups)
    assert not db.scalars(select(OperationFact).where(OperationFact.id.like('required:%'))).all()
