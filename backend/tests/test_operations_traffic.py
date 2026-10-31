from types import SimpleNamespace

import httpx
import pytest

from app.config import settings
from app.operations import traffic
from app.operations.scenario import AIRPORTS


@pytest.fixture
def feed(monkeypatch):
    monkeypatch.setattr(settings,'airport_id','craiova')
    monkeypatch.setattr(traffic,'_cache',{key:traffic.CacheEntry() for key in AIRPORTS})
    return SimpleNamespace(airport_id='craiova')


def aircraft(**kwargs):
    return {'hex':'abcd01','lat':44.32,'lon':23.89,'alt_baro':10000,'flight':' TEST1 ','seen_pos':1,**kwargs}


def test_normalization_separates_live_positions_from_schedule_and_recognizes_emergencies():
    result=traffic.normalize_aircraft({'ac':[aircraft(),aircraft(hex='abc002',squawk='7700'),
        aircraft(hex='abc003',emergency='lifeguard'),aircraft(hex='abc004',alt_baro='ground'),
        aircraft(hex='abc005',alt_geom=12000,track=370)]},AIRPORTS['craiova'])
    assert len(result)==5
    assert result[0]['position']['altitude_m']==3048
    assert result[0]['delay_minutes'] is None and result[0]['severity']=='neutral'
    assert result[0]['simulated'] is False
    assert result[1]['emergency'] and result[2]['emergency']
    assert result[3]['position']['altitude_m']==AIRPORTS['craiova']['elevation_m']
    assert result[4]['position']['heading']==10
    assert result[4]['altitude_reference']=='geometric_ellipsoid'


def test_bad_or_old_positions_are_omitted_and_count_bounded():
    result=traffic.normalize_aircraft({'ac':[aircraft(lat=None),aircraft(lon=float('nan')),
        aircraft(lat=90.1),aircraft(seen_pos=121),aircraft(seen_pos=None),aircraft(lat=40),
        aircraft(hex=None),{'hex':'noposition'}]},AIRPORTS['craiova'])
    assert result==[]
    assert len(traffic.normalize_aircraft({'ac':[aircraft(hex=f'{i:06x}') for i in range(300)]},AIRPORTS['craiova']))==traffic.MAX_AIRCRAFT
    with pytest.raises(ValueError): traffic.normalize_aircraft({'aircraft':[]},AIRPORTS['craiova'])


def test_success_cache_failure_backoff_stale_expiry_and_recovery(feed,monkeypatch):
    now=[100.0]
    monkeypatch.setattr(traffic.time,'monotonic',lambda:now[0])
    calls=[]
    def fetch(_):
        calls.append(1)
        return {'ac':[aircraft()]}
    monkeypatch.setattr(traffic,'fetch_payload',fetch)
    first=traffic.get_traffic(feed)
    assert first['status']=='fresh' and len(first['aircraft'])==1
    now[0]+=10
    assert traffic.get_traffic(feed)['status']=='fresh' and len(calls)==1
    def fail(_):
        calls.append(1)
        raise httpx.TimeoutException('provider timeout')
    monkeypatch.setattr(traffic,'fetch_payload',fail)
    now[0]=131
    stale=traffic.get_traffic(feed)
    assert stale['status']=='stale' and stale['aircraft'][0]['stale']
    assert stale['poll_after_seconds']==30
    now[0]=132
    assert traffic.get_traffic(feed)['status']=='stale' and len(calls)==2
    now[0]=162
    assert traffic.get_traffic(feed)['poll_after_seconds']==60
    now[0]=450
    expired=traffic.get_traffic(feed)
    assert expired['status']=='unavailable' and expired['aircraft']==[]
    now[0]=1000
    monkeypatch.setattr(traffic,'fetch_payload',fetch)
    recovered=traffic.get_traffic(feed)
    assert recovered['status']=='fresh' and recovered['error'] is None
    assert recovered['schedule_data_available'] is False


def test_initial_provider_failure_is_not_reported_as_empty_success(feed,monkeypatch):
    def fail(_): raise ValueError('malformed provider payload')
    monkeypatch.setattr(traffic,'fetch_payload',fail)
    result=traffic.get_traffic(feed)
    assert result['status']=='unavailable'
    assert result['fetched_at'] is None and result['age_seconds'] is None
    assert 'absența' in result['notice']


def test_emergency_codes_do_not_treat_alert_as_emergency():
    result=traffic.normalize_aircraft({'ac':[aircraft(alert=1, emergency='none'),
        aircraft(hex='abc002',squawk='7600'),aircraft(hex='abc003',squawk='7500'),
        aircraft(hex='abc004',emergency='reserved')]},AIRPORTS['craiova'])
    assert [item['emergency'] for item in result]==[False,True,True,False]


def test_surface_beacons_and_vehicles_are_not_rendered_as_aircraft():
    from app.operations.scenario import AIRPORTS
    from app.operations.traffic import normalize_aircraft
    airport = AIRPORTS['craiova']
    base = {'lat': airport['lat'], 'lon': airport['lon'], 'seen_pos': 0, 'alt_baro': 'ground', 'gs': 0}
    data = {'ac': [
        {**base, 'hex': 'tower', 't': ' twr '},
        {**base, 'hex': 'vehicle', 'category': 'c2'},
        {**base, 'hex': 'obstacle', 'category': 'C3'},
        {**base, 'hex': 'parked', 't': 'A320', 'category': 'A3'},
        {**base, 'hex': 'unknown', 'category': 'C0'},
    ]}
    assert [item['hex'] for item in normalize_aircraft(data, airport)] == ['parked', 'unknown']
