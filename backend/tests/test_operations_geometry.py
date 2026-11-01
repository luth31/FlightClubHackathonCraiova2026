"""Keep the demo on pavement shared by the model and photorealistic imagery.

The current OSM apron also includes a northern extension that Google's Craiova
mesh shows as vegetation. Testing against that whole polygon missed this bug.
This inset envelope covers the established southern apron, visually checked in
Chrome on 1 November 2026. It is a demo placement constraint, not a stand chart.
"""
from math import cos, radians, sin

from app.operations.scenario import AIRPORTS, AIRCRAFT_DISPLAY_SCALE, FLIGHTS, gates, position


def test_craiova_parks_nose_in_toward_the_terminal():
    airport = AIRPORTS['craiova']
    for gate, flight in zip(gates(airport), FLIGHTS):
        elapsed = 0 if flight['direction'] == 'departure' else flight['scheduled_arrival_seconds'] + 180
        point, _ = position(airport, gate, flight, elapsed)
        assert point['heading'] == 180


def test_craiova_aircraft_clear_the_plane_baked_into_google_tiles():
    # Screen raycasts against Google's mesh pinned this occupied area. Include
    # a margin around its wings/nose/tail; it cannot be removed from the tiles.
    airport = AIRPORTS['craiova']
    west, south, east, north = 23.87860, 44.31328, 23.87906, 44.31364
    for gate, flight in zip(gates(airport), FLIGHTS):
        start = 0 if flight['direction'] == 'departure' else flight['scheduled_arrival_seconds']
        for second in range(start, start+226):
            point, _ = position(airport, gate, flight, second, departed_at=0)
            dx = max(west-point['lon'], 0, point['lon']-east)*111320*cos(radians(airport['lat']))
            dy = max(south-point['lat'], 0, point['lat']-north)*111320
            # 14 m encloses the reduced model at any heading, with extra room
            # for its heading interpolation and local projection approximation.
            assert dx*dx+dy*dy > 14**2, (flight['callsign'], second, point)


def test_craiova_parked_aircraft_fit_the_established_apron():
    airport = AIRPORTS['craiova']
    # Narrow-body footprint in metres, matching the rendered aircraft rather
    # than just its centre: nose, tail, wings and horizontal stabilisers.
    outline = [(0, -18.8), (0, 18.8), (-18.2, 7.8), (18.2, 7.8),
               (-6.5, 17), (6.5, 17)]
    for gate, flight in zip(gates(airport), FLIGHTS):
        elapsed = 0 if flight['direction'] == 'departure' else flight['scheduled_arrival_seconds'] + 180
        point, _ = position(airport, gate, flight, elapsed)
        heading = radians(-point['heading'])
        for x, z in outline:
            x, z = x*AIRCRAFT_DISPLAY_SCALE, z*AIRCRAFT_DISPLAY_SCALE
            east, south = x*cos(heading)+z*sin(heading), -x*sin(heading)+z*cos(heading)
            lon = point['lon'] + east/(111320*cos(radians(airport['lat'])))
            lat = point['lat'] - south/111320
            assert 23.87768 < lon < 23.87910, (flight['callsign'], lon, lat)
            assert 44.31311 < lat < 44.313755, (flight['callsign'], lon, lat)


def test_craiova_pushback_keeps_the_nose_toward_the_terminal():
    airport = AIRPORTS['craiova']
    for gate, flight in zip(gates(airport), FLIGHTS):
        if flight['direction'] != 'departure':
            continue
        parked, _ = position(airport, gate, flight, 0)
        for second in (0, 5, 10, 19):
            point, _ = position(airport, gate, flight, second, departed_at=0)
            assert point['heading'] == 180
            assert point['lat'] >= parked['lat']
            assert point['lon'] == parked['lon']


def test_craiova_ground_routes_stay_on_the_apron_taxiway_and_runway():
    airport = AIRPORTS['craiova']
    def local(point):
        return ((point[0]-airport['lon'])*111320*cos(radians(airport['lat'])),
                (point[1]-airport['lat'])*111320)

    # Independently pinned paved corridor from the bundled OSM geometry. The
    # old apron extension is intentionally not included as a paved surface.
    taxi = list(map(local, [[23.87837,44.31370],[23.8783289,44.3158604],
        [23.8782853,44.3176479],[23.8782182,44.3177918],[23.8781083,44.3178955],
        [23.8779741,44.3179569],[23.877797,44.3179945]]))
    runway = list(map(local, [[23.8729972,44.3179308],[23.904048,44.3183433]]))
    corridors = [(a,b,11.5) for a,b in zip(taxi,taxi[1:])] + [(runway[0],runway[1],22.5)]

    def on_pavement(point):
        lon, lat = point['lon'], point['lat']
        if 23.87744 <= lon <= 23.87912 and 44.31309 <= lat <= 44.31376:
            return True
        x,y = local((lon,lat))
        for (ax,ay),(bx,by),half_width in corridors:
            dx,dy = bx-ax,by-ay
            t = max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
            if (x-ax-t*dx)**2+(y-ay-t*dy)**2 <= half_width**2:
                return True
        return False

    for gate, flight in zip(gates(airport), FLIGHTS):
        start = 0 if flight['direction'] == 'departure' else flight['scheduled_arrival_seconds']
        duration = 225 if flight['direction'] == 'departure' else 180
        for second in range(start, start+duration+1):
            point, _ = position(airport, gate, flight, second, departed_at=0)
            assert on_pavement(point), (flight['callsign'], second, point)


def test_timed_motion_vertices_match_authoritative_positions_for_both_airports():
    from app.operations.scenario import motion_path
    for airport in AIRPORTS.values():
        for flight in FLIGHTS:
            gate=next(g for g in gates(airport) if g['id']==flight['gate_id'])
            departure=flight.get('scheduled_departure_seconds')
            path=motion_path(airport,gate,flight,departure)
            assert len(path)<35
            assert all(a['at_seconds']<b['at_seconds'] for a,b in zip(path,path[1:]))
            for a,b in zip(path,path[1:]):
                for fraction in (0,.1,.5,.9,1):
                    seconds=a['at_seconds']+(b['at_seconds']-a['at_seconds'])*fraction
                    expected,_=position(airport,gate,flight,seconds,departure)
                    for key in ('lat','lon','altitude_m'):
                        actual=a[key]+(b[key]-a[key])*fraction
                        assert abs(actual-expected[key])<1e-7,(airport['id'],flight['id'],seconds,key,actual,expected[key])
