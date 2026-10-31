"""Fictional operations on geographically anchored Romanian airport layouts.

Flight numbers, workers, assignments and operational timings are demonstration
fixtures, not current airline schedules or real staff data.
"""
from math import atan2, cos, degrees, hypot, radians

DURATION_SECONDS = 3600
MINOR_DELAY_MINUTES = 1
MAJOR_DELAY_MINUTES = 15

AIRPORTS = {
    'craiova': {'id': 'craiova', 'name': 'Aeroportul Craiova', 'icao': 'LRCV',
        'lat': 44.318055556, 'lon': 23.888611111, 'elevation_m': 191.4144,
        'runway_west': [23.8729972, 44.3179308], 'runway_east': [23.904048, 44.3183433],
        'stand_positions': [[23.8776442,44.3141609],[23.8776362,44.3144123],[23.8776469,44.3147232],[23.8776872,44.315084],[23.8777086,44.3154563]],
        'stand_heading': 270,
        'taxi_path': [[23.8783289,44.3158604],[23.8782853,44.3176479],[23.8782182,44.3177918],[23.8781083,44.3178955],[23.8779741,44.3179569],[23.877797,44.3179945]]},
    'sibiu': {'id': 'sibiu', 'name': 'Aeroportul Sibiu', 'icao': 'LRSB',
        'lat': 45.785833333, 'lon': 24.085555556, 'elevation_m': 463.296,
        'runway_west': [24.0686554,45.7861604], 'runway_east': [24.1024856,45.7856089],
        'stand_positions': [[24.0918069,45.7886258],[24.0934152,45.7886181],[24.0940898,45.7885181],[24.0946987,45.7886389],[24.095274,45.788628]],
        'stand_heading': 0,
        'taxi_path': [[24.0915425,45.7880826],[24.086646,45.7881482],[24.0846166,45.788183],[24.0844152,45.788126],[24.0843006,45.7880747],[24.0842133,45.7880119],[24.0841539,45.7879491],[24.084115,45.7878915],[24.0840985,45.787834],[24.0840648,45.7876778],[24.084066,45.7876201],[24.0840375,45.786305],[24.0840107,45.7862339],[24.0839195,45.7861161],[24.0838015,45.78603],[24.0835841,45.785917]]},
}

STAFF = [
    {'id': 'staff-agent-a', 'name': 'Mara Stoica', 'title': 'Agent poartă G1', 'gate_id': 'G1', 'expected_seconds': 0, 'card_label': 'DEMO-NFC-101'},
    {'id': 'staff-agent-b', 'name': 'Vlad Popescu', 'title': 'Agent poartă G2', 'gate_id': 'G2', 'expected_seconds': 0, 'card_label': 'DEMO-NFC-102'},
    {'id': 'staff-supervisor', 'name': 'Ioana Radu', 'title': 'Coordonator operațiuni', 'gate_id': 'G3', 'expected_seconds': 0, 'card_label': 'DEMO-NFC-103'},
    {'id': 'staff-relief', 'name': 'Alexandru Marin', 'title': 'Agent de rezervă', 'gate_id': None, 'expected_seconds': 1200, 'card_label': 'DEMO-NFC-104'},
]

FLIGHTS = [
    {'id': 'flight-101', 'callsign': 'FL101', 'aircraft_type': 'A320', 'destination': 'Londra', 'gate_id': 'G1', 'scheduled_departure_seconds': 1200, 'turnaround_seconds': 960, 'direction': 'departure'},
    {'id': 'flight-202', 'callsign': 'FL202', 'aircraft_type': 'B738', 'destination': 'Milano', 'gate_id': 'G2', 'scheduled_departure_seconds': 1080, 'turnaround_seconds': 960, 'direction': 'departure'},
    {'id': 'flight-303', 'callsign': 'FL303', 'aircraft_type': 'A319', 'destination': 'München', 'gate_id': 'G3', 'scheduled_departure_seconds': 900, 'turnaround_seconds': 960, 'direction': 'departure'},
    {'id': 'flight-404', 'callsign': 'FL404', 'aircraft_type': 'A320', 'origin': 'București', 'gate_id': 'G4', 'scheduled_arrival_seconds': 960, 'direction': 'arrival'},
    {'id': 'flight-505', 'callsign': 'FL505', 'aircraft_type': 'E190', 'origin': 'Viena', 'gate_id': 'G5', 'scheduled_arrival_seconds': 2100, 'direction': 'arrival'},
]

# Time in simulated seconds since 08:00. The missing G1 agent is the causal
# thread: scheduled 08:04 opening, substitute at 08:22, departure 18 min late.
TIMELINE = [
    (30, 'nfc_check_in', {'staff_id': 'staff-supervisor'}, 'Card NFC · Ioana Radu', 'Coordonatorul a sosit. Citire demonstrativă de pontaj.'),
    (60, 'nfc_check_in', {'staff_id': 'staff-agent-b'}, 'Card NFC · Vlad Popescu', 'Agentul porții G2 a sosit.'),
    (120, 'gate_open', {'gate_id': 'G2', 'staff_id': 'staff-agent-b', 'flight_id': 'flight-202'}, 'Poarta G2 deschisă', 'Agentul alocat începe îmbarcarea.'),
    (240, 'staff_absent', {'gate_id': 'G1', 'staff_id': 'staff-agent-a', 'flight_id': 'flight-101'}, 'G1 · agentul alocat lipsește', 'Ora planificată de deschidere a sosit, dar cardul agentului nu a fost citit.'),
    (360, 'gate_open', {'gate_id': 'G3', 'staff_id': 'staff-supervisor', 'flight_id': 'flight-303'}, 'Poarta G3 deschisă', 'Îmbarcare întârziată în scenariul de demonstrație.'),
    (720, 'emergency_declared', {'flight_id': 'flight-404'}, 'FL404 · urgență simulată', 'Exercițiu demonstrativ: echipajul transmite o urgență. Nu este trafic real.'),
    (960, 'arrival', {'flight_id': 'flight-404', 'gate_id': 'G4'}, 'FL404 a aterizat', 'Aeronava a aterizat în scenariul simulat; intervenția rămâne activă.'),
    (1200, 'nfc_check_in', {'staff_id': 'staff-relief'}, 'Card NFC · Alexandru Marin', 'Agentul de rezervă este disponibil.'),
    (1260, 'staff_substitution', {'gate_id': 'G1', 'staff_id': 'staff-relief', 'flight_id': 'flight-101'}, 'Înlocuitor trimis la G1', 'Alexandru Marin preia poarta alocată inițial Marei Stoica.'),
    (1320, 'gate_open', {'gate_id': 'G1', 'staff_id': 'staff-relief', 'flight_id': 'flight-101'}, 'Poarta G1 deschisă de înlocuitor', 'Deschidere cu 18 minute după ora planificată. Îmbarcarea poate începe.'),
    (1440, 'emergency_cleared', {'flight_id': 'flight-404'}, 'FL404 · exercițiu încheiat', 'Starea de urgență simulată a fost închisă explicit.'),
    (1500, 'nfc_check_in', {'staff_id': 'staff-agent-a'}, 'Card NFC · Mara Stoica', 'Agentul alocat inițial ajunge cu 25 minute după începutul turei.'),
    (2100, 'arrival', {'flight_id': 'flight-505', 'gate_id': 'G5'}, 'FL505 a aterizat', 'Sosire normală în scenariul de demonstrație.'),
    (3000, 'scenario_summary', {}, 'Lecția turei', 'Absență → înlocuire → poartă deschisă târziu → FL101 pleacă cu 18 minute întârziere. Orele sunt demonstrative.'),
]


def gates(airport):
    assigned = {'G1': 'staff-agent-a', 'G2': 'staff-agent-b', 'G3': 'staff-supervisor'}
    return [{'id': f'G{i+1}', 'name': f'Poarta demo {i+1}', 'assigned_staff_id': assigned.get(f'G{i+1}'),
             'position': {'lat': point[1], 'lon': point[0], 'altitude_m': airport['elevation_m'], 'heading': airport['stand_heading']},
             'planned_open_seconds': 240 if i == 0 else (120 if i == 1 else 0)} for i, point in enumerate(airport['stand_positions'])]


def interpolate(points, progress):
    """Distance-weighted geographic interpolation; altitude in metres MSL."""
    progress = min(1.0, max(0.0, progress))
    distances = [max(0.001, hypot((b[0]-a[0])*cos(radians(a[1]))*111320, (b[1]-a[1])*111320))
                 for a,b in zip(points, points[1:])]
    remaining = progress * sum(distances)
    index = 0
    while index < len(distances)-1 and remaining > distances[index]:
        remaining -= distances[index]
        index += 1
    amount = min(1.0, remaining/distances[index])
    start, end = points[index], points[index+1]
    lat = start[1] + (end[1]-start[1]) * amount
    lon = start[0] + (end[0]-start[0]) * amount
    altitude = start[2] + (end[2]-start[2]) * amount
    bearing = degrees(atan2((end[0]-start[0]) * cos(radians(lat)), end[1]-start[1])) % 360
    return {'lat': lat, 'lon': lon, 'altitude_m': altitude, 'heading': bearing}


def taxi_path(airport, start):
    # OSM stand lead-ins connect to the public taxiway geometry. These short
    # interpolation connectors and timings are explicitly simulation-only.
    if airport['id'] == 'craiova':
        connector = [23.878385 - (start[1]-44.3141685)*0.03, start[1], start[2]]
    else:
        connector = [start[0], 45.7880826-(start[0]-24.0915425)*0.0219, start[2]]
    return [start, connector] + [[*point, start[2]] for point in airport['taxi_path']]


def position(airport, gate, flight, elapsed, departed_at=None):
    elevation = airport['elevation_m']
    start = [gate['position']['lon'], gate['position']['lat'], elevation]
    route = taxi_path(airport, start)
    join = route[-1]
    west = [*airport['runway_west'], elevation]
    east = [*airport['runway_east'], elevation]
    if flight['direction'] == 'departure':
        if departed_at is None or elapsed < departed_at - 180:
            return dict(gate['position']), 'boarding' if elapsed > 0 else 'at_gate'
        if elapsed < departed_at:
            return interpolate([*route, west], (elapsed-(departed_at-180))/180), 'taxiing'
        if elapsed < departed_at + 45:
            return interpolate([west, east], (elapsed-departed_at)/45), 'takeoff'
        return interpolate([east, [east[0]+0.07, east[1], elevation+1400]], (elapsed-departed_at-45)/150), 'airborne'
    arrival = flight['scheduled_arrival_seconds']
    if elapsed < arrival:
        approach = [[east[0]+0.07, east[1], elevation+1200], east]
        return interpolate(approach, max(0, elapsed-(arrival-300))/300), 'approach'
    if elapsed < arrival + 50:
        return interpolate([east, join], (elapsed-arrival)/50), 'landing'
    if elapsed < arrival + 180:
        return interpolate(list(reversed(route)), (elapsed-arrival-50)/130), 'taxiing'
    return dict(gate['position']), 'at_gate'
