"""Fictional operations on geographically anchored Romanian airport layouts.

Flight numbers, workers, assignments and operational timings are demonstration
fixtures, not current airline schedules or real staff data.
"""
from math import atan2, cos, degrees, hypot, radians

DURATION_SECONDS = 3600
MINOR_DELAY_MINUTES = 1
MAJOR_DELAY_MINUTES = 15
AIRCRAFT_DISPLAY_SCALE = 0.62

AIRPORTS = {
    'craiova': {'id': 'craiova', 'name': 'Aeroportul Craiova', 'icao': 'LRCV',
        'lat': 44.318055556, 'lon': 23.888611111, 'elevation_m': 191.4144,
        'runway_west': [23.8729972, 44.3179308], 'runway_east': [23.904048, 44.3183433],
        # Use the established southern apron: the northern OSM extension is
        # still vegetation in Google's photorealistic mesh. These staggered
        # demo positions are illustrative, not surveyed operational stands.
        # Reserve the eastern apron for the aircraft baked into Google's mesh
        # (23.87860–23.87906 E, 44.31328–44.31364 N, including a margin).
        # All demo stands and apron routes remain west of that occupied area.
        'stand_positions': [[23.87784,44.31325],[23.87813,44.31325],[23.87842,44.31325],[23.87784,44.31359],[23.87813,44.31359]],
        'stand_heading': 180,
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
    {'id': 'staff-agent-b', 'name': 'Vlad Popescu', 'title': 'Agent poartă G2', 'gate_id': 'G2', 'expected_seconds': 60, 'card_label': 'DEMO-NFC-102', 'automatic': True},
    {'id': 'staff-supervisor', 'name': 'Ioana Radu', 'title': 'Coordonator operațiuni', 'gate_id': None, 'expected_seconds': 0, 'card_label': 'DEMO-NFC-103'},
    {'id': 'staff-relief', 'name': 'Alexandru Marin', 'title': 'Agent de rezervă', 'gate_id': None, 'expected_seconds': 1200, 'card_label': 'DEMO-NFC-104'},
]

FLIGHTS = [
    {'id': 'flight-101', 'callsign': 'FL101', 'aircraft_type': 'A320', 'destination': 'Londra', 'gate_id': 'G1', 'scheduled_departure_seconds': 1200, 'turnaround_seconds': 960, 'direction': 'departure', 'automatic': False},
    {'id': 'flight-202', 'callsign': 'FL202', 'aircraft_type': 'B738', 'destination': 'Milano', 'gate_id': 'G2', 'scheduled_departure_seconds': 1080, 'turnaround_seconds': 960, 'direction': 'departure', 'automatic': True},
    {'id': 'flight-404', 'callsign': 'FL404', 'aircraft_type': 'A320', 'origin': 'București', 'gate_id': 'G4', 'scheduled_arrival_seconds': 720, 'direction': 'arrival', 'automatic': True},
]

# Time in simulated seconds since 08:00. The missing G1 agent is the causal
# thread: scheduled 08:04 opening, substitute at 08:22, departure 18 min late.
TIMELINE = [
    (30, 'nfc_check_in', {'staff_id': 'staff-supervisor'}, 'Card NFC · Ioana Radu', 'Coordonatorul a sosit. Citire demonstrativă de pontaj.'),
    (60, 'nfc_check_in', {'staff_id': 'staff-agent-b'}, 'Card NFC · Vlad Popescu', 'Agentul porții G2 a sosit.'),
    (120, 'gate_open', {'gate_id': 'G2', 'staff_id': 'staff-agent-b', 'flight_id': 'flight-202'}, 'Poarta G2 deschisă', 'Agentul alocat începe îmbarcarea.'),
    (240, 'staff_absent', {'gate_id': 'G1', 'staff_id': 'staff-agent-a', 'flight_id': 'flight-101'}, 'G1 · agentul alocat lipsește', 'Ora planificată de deschidere a sosit, dar cardul agentului nu a fost citit.'),
    (720, 'arrival', {'flight_id': 'flight-404', 'gate_id': 'G4'}, 'FL404 a aterizat', 'Sosire normală, gestionată automat în fundal.'),
    (1200, 'nfc_check_in', {'staff_id': 'staff-relief'}, 'Card NFC · Alexandru Marin', 'Agentul de rezervă este disponibil.'),
    (1260, 'staff_substitution', {'gate_id': 'G1', 'staff_id': 'staff-relief', 'flight_id': 'flight-101'}, 'Înlocuitor trimis la G1', 'Alexandru Marin preia poarta alocată inițial Marei Stoica.'),
    (1320, 'gate_open', {'gate_id': 'G1', 'staff_id': 'staff-relief', 'flight_id': 'flight-101'}, 'Poarta G1 deschisă de înlocuitor', 'Deschidere cu 18 minute după ora planificată. Îmbarcarea poate începe.'),
    (1500, 'nfc_check_in', {'staff_id': 'staff-agent-a'}, 'Card NFC · Mara Stoica', 'Agentul alocat inițial ajunge cu 25 minute după începutul turei.'),
    (3000, 'scenario_summary', {}, 'Lecția turei', 'Absență → înlocuire → poartă deschisă târziu → FL101 pleacă cu 18 minute întârziere. Orele sunt demonstrative.'),
]


# Routine traffic is automatic in both modes; only G1 needs the presenter.
ROUTINE_TIMELINE = [event for event in TIMELINE if event[2].get('staff_id') == 'staff-agent-b' or event[2].get('flight_id') == 'flight-404']

# Small automatic presentation scenarios, all using the same aircraft and routes.
SCENARIOS = [
    {'id':'normal','name':'Tură normală','description':'Echipa este pregătită. Ambele plecări sunt la timp.'},
    {'id':'delayed','name':'Poartă deschisă târziu','description':'Agentul lipsește; înlocuirea târzie întârzie FL101 cu 18 minute.'},
    {'id':'recovery','name':'Înlocuire rapidă','description':'Rezerva intervine devreme. Întârzierea FL101 se reduce la 3 minute.'},
]
NORMAL_TIMELINE = ROUTINE_TIMELINE + [
    (0,'nfc_check_in',{'staff_id':'staff-agent-a'},'Mara Stoica · prezentă','Agentul G1 este pregătit la începutul turei.'),
    (0,'nfc_check_in',{'staff_id':'staff-supervisor'},'Coordonator prezent','Echipa este confirmată.'),
    (240,'gate_open',{'gate_id':'G1','staff_id':'staff-agent-a','flight_id':'flight-101'},'Poarta G1 deschisă la timp','Agentul alocat începe îmbarcarea la 08:04.'),
]
RECOVERY_TIMELINE = ROUTINE_TIMELINE + [
    (0,'nfc_check_in',{'staff_id':'staff-supervisor'},'Coordonator prezent','Echipa este verificată.'),
    (240,'staff_absent',{'gate_id':'G1','staff_id':'staff-agent-a','flight_id':'flight-101'},'Agentul G1 lipsește','Coordonatorul activează imediat rezerva.'),
    (240,'nfc_check_in',{'staff_id':'staff-relief'},'Rezervă disponibilă','Alexandru Marin este pregătit pentru intervenție.'),
    (300,'staff_substitution',{'gate_id':'G1','staff_id':'staff-relief','flight_id':'flight-101'},'Înlocuitor repartizat la G1','Rezerva este trimisă la poartă în primul minut.'),
    (420,'gate_open',{'gate_id':'G1','staff_id':'staff-relief','flight_id':'flight-101'},'Poarta G1 deschisă de rezervă','Îmbarcarea începe la 08:07, cu trei minute întârziere.'),
]

def scenario_timeline(mode):
    events = {'normal': NORMAL_TIMELINE, 'delayed': TIMELINE, 'recovery': RECOVERY_TIMELINE, 'replay': TIMELINE}.get(mode, ROUTINE_TIMELINE)
    if mode in {'normal','delayed','recovery'}:
        return [(at,kind,payload,title.replace('Card NFC ·','Prezență ·'),detail.replace('cardul agentului nu a fost citit','prezența agentului nu este confirmată').replace('Citire demonstrativă de pontaj.','Prezență înregistrată în scenariu.')) for at,kind,payload,title,detail in events]
    return events


def gates(airport):
    assigned = {'G1': 'staff-agent-a', 'G2': 'staff-agent-b', 'G3': 'staff-supervisor'}
    return [{'id': f'G{i+1}', 'name': f'Poarta demo {i+1}', 'assigned_staff_id': assigned.get(f'G{i+1}'),
             'position': {'lat': point[1], 'lon': point[0], 'altitude_m': airport['elevation_m'], 'heading': airport['stand_heading']},
             'planned_open_seconds': 240 if i == 0 else (120 if i == 1 else 0)} for i, point in enumerate(airport['stand_positions']) if f'G{i+1}' in {flight['gate_id'] for flight in FLIGHTS}]


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
    # Demonstration stand connectors join the public taxiway geometry.
    if airport['id'] == 'craiova':
        # Reach the established apron exit before heading north. Connecting
        # diagonally to the old northern stand area would cross vegetation.
        # South-facing departures push back north; arrivals approach their
        # northern row from the north, ending nose-in toward the terminal.
        lane_lat = 44.31343 if start[1] < 44.31343 else 44.31373
        connectors = [[start[0], lane_lat, start[2]], [23.87837, lane_lat, start[2]],
                      [23.87837, 44.31376, start[2]]]
    else:
        connectors = [[start[0], 45.7880826-(start[0]-24.0915425)*0.0219, start[2]]]
    return [start, *connectors] + [[*point, start[2]] for point in airport['taxi_path']]


def position(airport, gate, flight, elapsed, departed_at=None):
    elevation = airport['elevation_m']
    start = [gate['position']['lon'], gate['position']['lat'], elevation]
    route = taxi_path(airport, start)
    join = route[-1]
    west = [*airport['runway_west'], elevation]
    east = [*airport['runway_east'], elevation]
    if flight['direction'] == 'departure':
        if departed_at is None or elapsed < departed_at:
            return dict(gate['position']), 'boarding' if elapsed > 0 else 'at_gate'
        if elapsed < departed_at + 180:
            if airport['id'] == 'craiova':
                # Keep the nose toward the terminal during the first 20 s of
                # pushback; ground travel direction is not aircraft heading.
                if elapsed < departed_at + 20:
                    point = interpolate(route[:2], (elapsed-departed_at)/20)
                    return {**point, 'heading': airport['stand_heading']}, 'taxiing'
                return interpolate([*route[1:], west], (elapsed-departed_at-20)/160), 'taxiing'
            return interpolate([*route, west], (elapsed-departed_at)/180), 'taxiing'
        if elapsed < departed_at + 225:
            return interpolate([west, east], (elapsed-departed_at-180)/45), 'takeoff'
        return interpolate([east, [east[0]+0.07, east[1], elevation+1400]], (elapsed-departed_at-225)/150), 'airborne'
    arrival = flight['scheduled_arrival_seconds']
    if elapsed < arrival:
        approach = [[east[0]+0.07, east[1], elevation+1200], east]
        return interpolate(approach, max(0, elapsed-(arrival-300))/300), 'approach'
    if elapsed < arrival + 50:
        return interpolate([east, join], (elapsed-arrival)/50), 'landing'
    if elapsed < arrival + 180:
        return interpolate(list(reversed(route)), (elapsed-arrival-50)/130), 'taxiing'
    return dict(gate['position']), 'at_gate'


def motion_path(airport, gate, flight, departed_at=None):
    """Timed route vertices, so fast playback never shortcuts a taxiway turn.

    This is rendering geometry only; departure events and KPIs remain server-owned.
    Times match position(), including pushback, runway roll and climb boundaries.
    """
    elevation = airport['elevation_m']
    start = [gate['position']['lon'], gate['position']['lat'], elevation]
    route = taxi_path(airport, start)
    west, east = [*airport['runway_west'], elevation], [*airport['runway_east'], elevation]
    frames = {}

    def leg(points, begin, end, heading=None):
        lengths = [max(.001, hypot((b[0]-a[0])*cos(radians(a[1]))*111320, (b[1]-a[1])*111320))
                   for a, b in zip(points, points[1:])]
        distance = 0
        for i, point in enumerate(points):
            at = begin + (end-begin)*distance/sum(lengths)
            direction = heading if heading is not None else interpolate(points[max(0, min(i, len(points)-2)):max(0, min(i, len(points)-2))+2], 0)['heading']
            frames[at] = {'at_seconds': at, 'lon': point[0], 'lat': point[1], 'altitude_m': point[2], 'heading': direction}
            if i < len(lengths):
                distance += lengths[i]

    if flight['direction'] == 'departure':
        if departed_at is None:
            return []
        if airport['id'] == 'craiova':
            leg(route[:2], departed_at, departed_at+20, airport['stand_heading'])
            leg([*route[1:], west], departed_at+20, departed_at+180)
        else:
            leg([*route, west], departed_at, departed_at+180)
        leg([west, east], departed_at+180, departed_at+225)
        leg([east, [east[0]+.07, east[1], elevation+1400]], departed_at+225, departed_at+375)
        if departed_at > 0:
            frames[0] = {'at_seconds':0, **gate['position']}
    else:
        arrival = flight['scheduled_arrival_seconds']
        leg([[east[0]+.07, east[1], elevation+1200], east], arrival-300, arrival)
        leg([east, route[-1]], arrival, arrival+50)
        leg(list(reversed(route)), arrival+50, arrival+180)
        frames[arrival+180]['heading'] = airport['stand_heading']
    return [frames[time] for time in sorted(frames)]
