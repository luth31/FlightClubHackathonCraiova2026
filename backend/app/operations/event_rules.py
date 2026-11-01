"""Local operational vocabulary, inspired by A-CDM milestones (not an A-CDM certification).

Each event changes one activity stream. Dependencies form a DAG across streams;
cleaning, fueling and baggage are deliberately not ordered against one another.
"""
from dataclasses import dataclass
from app.core.exceptions import DomainError


@dataclass(frozen=True)
class Rule:
    lane: str
    initial: str
    before: tuple[str, ...]
    after: str
    requires: tuple[str, ...] = ()
    subject: str = 'flight'


LANES = {
    'planning':'Programare', 'allocation':'Alocare poartă', 'assignment':'Responsabilitate',
    'reserve':'Rezervă', 'attendance':'Prezență', 'aircraft':'Aeronavă', 'gate':'Poartă',
    'boarding':'Îmbarcare', 'cleaning':'Curățenie', 'fuel':'Alimentare', 'baggage':'Bagaje',
    'loadsheet':'Documente de încărcare', 'readiness':'Pregătire plecare', 'alert':'Alertă', 'observation':'Observații',
    'briefing':'Briefing', 'closure':'Închidere rotație', 'inspection':'Inspecție pistă',
    'lighting':'Balizaj', 'handover':'Predare tură', 'radio':'Echipament radio',
    'maintenance':'Mentenanță', 'review':'Revizuire SOP', 'equipment':'Echipament îmbarcare',
}
STATES = {'unscheduled':'Neprogramat','scheduled':'Programat','unassigned':'Nealocat','assigned':'Alocat',
    'absent':'Nepontat','present':'Prezent','closed':'Închis','open':'Deschis','pending':'În așteptare',
    'active':'În desfășurare','completed':'Încheiat','airborne':'În zbor','landed':'Aterizat',
    'onblock':'La stand','offblock':'Plecat de la stand','not_ready':'Nepregătit','ready':'Pregătit',
    'clear':'Fără alertă','raised':'Alertă activă','in_service':'În serviciu','withdrawn':'Retras',
    'checked':'Verificat','recorded':'Înregistrat'}


STATES.update({
    'inspection_scheduled':'Inspecție programată','inspection_started':'Inspecție în desfășurare',
    'fod_check_completed':'Control FOD încheiat','lighting_check_scheduled':'Verificare programată',
    'lighting_check_started':'Verificare în desfășurare','shift_scheduled':'Tură programată',
    'staffing_checked':'Efectiv verificat','responsibilities_confirmed':'Responsabilități confirmate',
    'radio_handover_started':'Predare în desfășurare','maintenance_scheduled':'Lucrare programată',
    'equipment_withdrawn':'Echipament retras','functional_check_completed':'Verificare încheiată',
    'equipment_returned':'Echipament în serviciu','sop_review_scheduled':'Revizuire programată',
    'deviations_reviewed':'Abateri analizate','preventive_action_proposed':'Acțiune propusă',
    'action_owner_assigned':'Responsabil desemnat','action_deadline_set':'Termen stabilit',
})

RULES = {
    'flight_scheduled':Rule('planning','unscheduled',('unscheduled',),'scheduled'),
    'gate_assigned':Rule('allocation','unassigned',('unassigned',),'assigned',('flight_scheduled',)),
    'staff_assigned':Rule('assignment','unassigned',('unassigned',),'assigned',('gate_assigned',)),
    'reserve_assigned':Rule('reserve','unassigned',('unassigned',),'assigned',('gate_assigned',)),
    'staff_substitution':Rule('assignment','unassigned',('assigned',),'assigned',('staff_assigned',)),
    'nfc_check_in':Rule('attendance','absent',('absent',),'present',subject='person'),
    'nfc_check_out':Rule('attendance','absent',('present',),'absent',subject='person'),
    'arrival':Rule('aircraft','airborne',('airborne',),'landed',('flight_scheduled',)),
    'aircraft_onblock':Rule('aircraft','landed',('landed',),'onblock',('flight_scheduled',)),
    'cleaning_started':Rule('cleaning','pending',('pending',),'active',('aircraft_onblock',)),
    'cleaning_complete':Rule('cleaning','pending',('active',),'completed',('cleaning_started',)),
    'fuel_started':Rule('fuel','pending',('pending',),'active',('aircraft_onblock',)),
    'fuel_ready':Rule('fuel','pending',('active',),'completed',('fuel_started',)),
    'baggage_loading_started':Rule('baggage','pending',('pending',),'active',('aircraft_onblock',)),
    'baggage_loaded':Rule('baggage','pending',('active',),'completed',('baggage_loading_started',)),
    'gate_open':Rule('gate','closed',('closed',),'open',('gate_assigned',)),
    'gate_close':Rule('gate','closed',('open',),'closed',('gate_open',)),
    'boarding_started':Rule('boarding','pending',('pending',),'active',('gate_open','cleaning_complete')),
    'boarding_completed':Rule('boarding','pending',('active',),'completed',('boarding_started',)),
    'loadsheet_confirmed':Rule('loadsheet','pending',('pending',),'completed',('baggage_loaded',)),
    'aircraft_ready':Rule('readiness','not_ready',('not_ready',),'ready',('boarding_completed','cleaning_complete','fuel_ready','baggage_loaded','loadsheet_confirmed')),
    'departure':Rule('aircraft','landed',('onblock',),'offblock',('aircraft_ready',)),
    'takeoff':Rule('aircraft','landed',('offblock',),'airborne',('departure',)),
    'briefing':Rule('briefing','pending',('pending',),'completed'),
    'handover':Rule('closure','pending',('pending',),'completed',('takeoff',)),
    'equipment_check_started':Rule('equipment','pending',('pending',),'active'),
    'equipment_check':Rule('equipment','pending',('active',),'completed',('equipment_check_started',)),
    'emergency_declared':Rule('alert','clear',('clear',),'raised'),
    'emergency_cleared':Rule('alert','clear',('raised',),'clear',('emergency_declared',)),
}
# Airport work orders also have a controlled vocabulary, not airport_2_3 free-form codes.
for lane, kinds in {
    'inspection':('inspection_scheduled','inspection_started','fod_check_completed','inspection_completed'),
    'lighting':('lighting_check_scheduled','lighting_check_started','lighting_check_completed'),
    'handover':('shift_scheduled','staffing_checked','responsibilities_confirmed','shift_handover_completed'),
    'radio':('radio_handover_started','radio_handover_completed'),
    'maintenance':('maintenance_scheduled','equipment_withdrawn','functional_check_completed','equipment_returned','maintenance_report_filed'),
    'review':('sop_review_scheduled','deviations_reviewed','preventive_action_proposed','action_owner_assigned','action_deadline_set','sop_review_completed'),
}.items():
    previous = 'pending'
    for index, kind in enumerate(kinds):
        following = 'completed' if index == len(kinds)-1 else kind
        RULES[kind] = Rule(lane,'pending',(previous,),following,(kinds[index-1],) if index else (),subject='work_order')
        previous = following

OBSERVATIONS = {'staff_absent','staff_available','gate_waiting','gate_ready','departure_blocked','departure_due','scenario_superseded','scenario_summary'}
CONTROL_KINDS = {'simulation_initialized','simulation_reset','simulation_advanced','simulation_start','simulation_pause'}


def transition(kind, previous, completed, *, strict=True):
    """Validate a single stream transition and cross-stream dependencies."""
    rule = RULES.get(kind)
    if not rule:
        if kind not in OBSERVATIONS | CONTROL_KINDS:
            raise DomainError(f'Tip de operațiune necunoscut: {kind}.',422)
        return {'activity':'observation','activity_label':'Observație','from_state':previous or 'recorded',
                'to_state':previous or 'recorded','dependencies':[], 'validation':'validated','observation':True}
    before = previous or rule.initial
    missing = [required for required in rule.requires if required not in completed]
    valid = before in rule.before and not missing
    if strict and not valid:
        raise DomainError(f'Tranziție invalidă pentru {kind}: {before}. Lipsesc: {", ".join(missing) or "starea anterioară necesară"}.',409)
    return {'activity':rule.lane,'activity_label':LANES[rule.lane], 'from_state':before,'to_state':rule.after,
            'dependencies':[completed[k] for k in rule.requires if k in completed],
            'missing_dependencies':missing,'validation':'validated' if valid else 'legacy_unverified',
            'observation':False}


def validate_live(kind, payload, events):
    """Validate before persistence; the enclosing versioned transaction resolves races."""
    if kind in CONTROL_KINDS | OBSERVATIONS:
        return
    rule = RULES.get(kind)
    if not rule:
        raise DomainError('Tip de operațiune necunoscut.',422)
    subject = payload.get('staff_id') if rule.subject == 'person' else payload.get('flight_id')
    if not subject:
        raise DomainError('Operațiunea necesită o entitate identificată.',422)
    related = [e for e in events if (e.staff_id if rule.subject == 'person' else e.flight_id) == subject]
    completed = {e.kind:e.id for e in related}
    prior = [e for e in related if e.kind in RULES and RULES[e.kind].lane == rule.lane]
    before = RULES[prior[-1].kind].after if prior else None
    # Existing runs predate explicit planning/preparation events. They remain
    # readable; they must be reset before new physical milestones can be appended.
    transition(kind,before,completed)
    if kind in ('gate_open','gate_close','staff_substitution'):
        person_events=[e for e in events if e.staff_id==payload.get('staff_id') and e.kind in ('nfc_check_in','nfc_check_out')]
        if not person_events or person_events[-1].kind!='nfc_check_in':
            raise DomainError('Agentul trebuie să fie prezent înainte de această operațiune.',409)
