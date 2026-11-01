"""Read-only diagrams of the same rules that validate atomic operations.

Recorded edges come only from the immutable evidence. Required, unrecorded
operations are visibly separate plan nodes, never inserted as facts.
"""
from app.operations.event_rules import RULES, LANES, STATES

TITLES = {
    'flight_scheduled':'Programare zbor', 'gate_assigned':'Alocare poartă',
    'staff_assigned':'Alocare agent', 'reserve_assigned':'Alocare rezervă',
    'staff_substitution':'Înlocuire agent', 'nfc_check_in':'Pontaj intrare', 'nfc_check_out':'Pontaj ieșire',
    'arrival':'Aterizare', 'aircraft_onblock':'Sosire la stand',
    'cleaning_started':'Începere curățenie', 'cleaning_complete':'Curățenie încheiată',
    'fuel_started':'Începere alimentare', 'fuel_ready':'Alimentare încheiată',
    'baggage_loading_started':'Începere încărcare bagaje', 'baggage_loaded':'Bagaje încărcate',
    'gate_open':'Deschidere poartă', 'gate_close':'Închidere poartă',
    'boarding_started':'Începere îmbarcare', 'boarding_completed':'Îmbarcare încheiată',
    'loadsheet_confirmed':'Documente de încărcare confirmate', 'aircraft_ready':'Pregătire plecare confirmată',
    'departure':'Plecare de la stand', 'takeoff':'Decolare', 'handover':'Închidere rotație',
    'emergency_declared':'Declarare incident', 'emergency_cleared':'Închidere incident',
}


def is_fact(event):
    return bool(event.get('actual_at') and not event.get('projected')
                and event.get('source') not in ('pending', 'projection'))


def process_graph(group):
    events = group['events']
    operations = [e for e in events if e['kind'] in RULES and not e.get('operation', {}).get('observation')]
    nodes, edges = {}, {}
    by_kind = {}
    for event in operations:
        by_kind.setdefault(event['kind'], []).append(event)
        op = event['operation']
        actual = is_fact(event)
        projected = event.get('projected') or event['source'] == 'projection'
        tone = 'danger' if event['severity'] == 'red' else 'warning' if event['severity'] == 'yellow' else (
            'warning' if actual and op['validation'] != 'validated' else 'success' if actual else 'info' if projected else 'neutral')
        status = 'Înregistrat' if actual else 'Estimare' if projected else 'Neînregistrat'
        if event.get('delay_minutes'):
            status += f" · +{event['delay_minutes']} min"
        elif actual and event.get('planned_at') and event['severity'] == 'neutral':
            status += ' · la timp'
        nodes[event['id']] = {
            'id':event['id'], 'title':event['title'], 'kind':event['kind'], 'activity':op['activity'],
            'from_label':op['from_label'], 'to_label':op['to_label'], 'tone':tone, 'status':status,
            'recorded':actual, 'planned_at':event.get('planned_at'), 'actual_at':event.get('actual_at'),
            'actor':event['actor'], 'detail':event.get('detail',''), 'missing':[],
        }

    def connect(source, target, recorded=False):
        if source != target:
            edges[(source,target)] = {'source':source, 'target':target, 'kind':'recorded' if recorded else 'required'}

    def required_node(kind):
        # No observed instance: expand the actual validator's prerequisites.
        key = 'required:' + kind
        if key in nodes:
            return key
        rule = RULES[kind]
        nodes[key] = {'id':key, 'kind':kind, 'title':TITLES.get(kind,kind.replace('_',' ')),
            'activity':rule.lane, 'from_label':STATES.get(rule.before[0],rule.before[0]),
            'to_label':STATES.get(rule.after,rule.after), 'tone':'neutral', 'status':'Necesită confirmare',
            'recorded':False, 'planned_at':None, 'actual_at':None, 'actor':'',
            'detail':'Condiție din regula operațională; încă nu există o confirmare în registru.', 'missing':[]}
        for prerequisite in rule.requires:
            choices = by_kind.get(prerequisite, [])
            source = choices[-1]['id'] if choices else required_node(prerequisite)
            connect(source, key)
        return key

    for event in operations:
        target = event['id']
        op = event['operation']
        for dependency in op['dependencies']:
            if dependency in nodes:
                connect(dependency,target,is_fact(event))
        # Never repair or reinterpret old recorded evidence with today's rules.
        if is_fact(event):
            nodes[target]['missing'] = [TITLES.get(k,k) for k in op.get('missing_dependencies',[])]
            continue
        for prerequisite in RULES[event['kind']].requires:
            choices = by_kind.get(prerequisite, [])
            source = choices[-1]['id'] if choices else required_node(prerequisite)
            connect(source,target)
            if not nodes[source]['recorded']:
                nodes[target]['missing'].append(nodes[source]['title'])

    machines = []
    for stream in dict.fromkeys(e['operation']['stream_id'] for e in operations):
        stream_events = [e for e in operations if e['operation']['stream_id'] == stream]
        lane = stream_events[0]['operation']['activity']
        actual = [e for e in stream_events if is_fact(e)]
        current = actual[-1]['operation']['to_state'] if actual else stream_events[0]['operation']['from_state']
        labels = {e['kind']:e['title'] for e in stream_events}
        transitions = []
        for kind, rule in RULES.items():
            if rule.lane != lane:
                continue
            for before in rule.before:
                transitions.append({'source':before, 'target':rule.after, 'label':TITLES.get(kind,labels.get(kind,kind.replace('_',' '))),
                    'code':kind, 'requires':[TITLES.get(k,k.replace('_',' ')) for k in rule.requires]})
        state_ids = list(dict.fromkeys([t[key] for t in transitions for key in ('source','target')]))
        label = LANES[lane]
        if RULES[stream_events[0]['kind']].subject == 'person':
            label += ' · ' + stream_events[0]['actor']
        machines.append({'id':stream, 'label':label, 'current':current, 'states':[
            {'id':key,'label':STATES.get(key,key)} for key in state_ids], 'transitions':transitions})
    return {'nodes':list(nodes.values()), 'edges':list(edges.values()), 'machines':machines,
        'guards': ['Deschiderea și închiderea porții cer un agent prezent; înlocuirea se înregistrează separat.']
            if any(e['kind'] in ('gate_open','gate_close') for e in operations) else [],
        'observations':[e['id'] for e in events if e.get('operation',{}).get('observation')]}
