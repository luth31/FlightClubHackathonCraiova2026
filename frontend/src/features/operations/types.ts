import type {MotionPoint} from './flight-motion';
export type Severity = 'neutral' | 'yellow' | 'red';
export interface Position {lat:number;lon:number;altitude_m:number|null;heading:number|null}
export interface Flight {
  automatic?:boolean;trajectory?:MotionPoint[];
  id:string;callsign:string;aircraft_type:string;origin:string;destination:string;
  gate_id:string|null;scheduled_departure_seconds:number|null;actual_departure_seconds:number|null;
  delay_minutes:number|null;severity:Severity;emergency:boolean;phase:string;position:Position;
  direction?:'arrival'|'departure';delay_basis?:string;estimated_departure_seconds?:number|null;scheduled_arrival_seconds?:number;registration?:string;position_age_seconds?:number;observed_at?:string;stale?:boolean;
  status?:string;boarding_remaining_seconds?:number;altitude_reference?:string;ground?:boolean;distance_nm?:number;
}
export interface Staff {
  automatic?:boolean;
  id:string;name:string;title:string;present:boolean;expected_seconds:number;
  actual_arrival_seconds:number|null;late_minutes:number|null;gate_id:string|null;card_label:string;
}
export interface Gate {
  id:string;name?:string;open:boolean;is_open?:boolean;assigned_staff_id:string;
  opened_by?:string|null;opened_at_seconds?:number|null;planned_open_seconds?:number;
}
export interface OperationEvent {
  id:string;sequence:number;simulated_at:string;kind:string;title:string;detail:string;
  actor:string;actor_id?:string|null;staff_id:string|null;flight_id:string|null;gate_id:string|null;source:string;
  elapsed_seconds?:number;
}
export interface OperationsData {
  scenarios?:{id:string;name:string;description:string}[];
  airport:{id:'craiova'|'sibiu';name:string;icao:string;lat:number;lon:number;elevation_m:number};
  simulation:{run_id:string;revision:number;running:boolean;speed:number;elapsed_seconds:number;
    duration_seconds:number;clock_time:string;scenario_mode?:'interactive'|'replay'|'normal'|'delayed'|'recovery'};
  flights:Flight[];gates:Gate[];staff:Staff[];events:OperationEvent[];
  kpis:Record<string,number|null>;
  thresholds:{minor_delay_minutes:number;major_delay_minutes:number};
  permissions:{can_control:boolean};
  model?:{notice:string;departure_basis:string;gate_reclosures_affect_departure:boolean;aircraft_display_scale?:number};
}
export interface LiveTraffic {
  source:string;mode:'live';status:'fresh'|'stale'|'unavailable';fetched_at:string|null;
  age_seconds:number|null;poll_after_seconds:number;aircraft:Flight[];notice:string;attribution:{name:string;url:string;license:string;license_url:string};
}
export interface MapConfig {
  google_api_key:string|null;photorealistic_available:boolean;default_mode:'model'|'photorealistic';
}

export interface LedgerEvent {
  id:string;kind:string;title:string;planned_at:string|null;actual_at:string|null;
  actor:string;detail:string;severity:Severity;delay_minutes:number|null;source:string;
  operation?:LedgerOperation;entities?:LedgerEntity[];audit?:LedgerAudit;projected?:boolean;
}
export interface LedgerEvidenceTarget {eventId:string;groupId:string}
export interface LedgerFlight {
  process?:OperationProcess;
  id:string;callsign:string;route:string;gate_id:string|null;scheduled_at:string;
  actual_at:string|null;status:string;severity:Severity;delay_minutes:number|null;
  events:LedgerEvent[];event_count?:number;category?:string;current?:boolean;source?:string;
  entities?:LedgerEntity[];activities?:{id:string;label:string;state:string;event_count:number;from:string|null;to:string|null}[];
}
export interface LedgerDay {date:string;severity:Severity;flights:LedgerFlight[];event_count?:number}
export interface LedgerMetrics {
  completed_departures:number;on_time_percent:number|null;delay_minutes:number;
  late_gate_openings:number;staff_late:number;open_risks:number;
}
export interface LedgerData {
  days:LedgerDay[];metrics:LedgerMetrics;filtered_metrics?:LedgerMetrics;period:{from:string;to:string};
  seeded_events:number;current_run_id:string;reference_date?:string;event_count?:number;
}

export interface LedgerEntity {id:string;kind:string;code:string;label:string;role:string;attributes:Record<string,string>}
export interface LedgerOperation {code:string;activity:string;activity_label:string;stream_id:string;from_state:string;to_state:string;from_label:string;to_label:string;dependencies:string[];validation:string;observation:boolean}
export interface LedgerAudit {event_id:string;recorded_at:string|null;recorded_by:string;source:string;run_id:string|null;sequence:number|null;provenance:string;schema_version:number;indexed_at?:string}
export interface LedgerFact extends Omit<LedgerEvent,'operation'|'entities'|'audit'> {operation:LedgerOperation;entities:LedgerEntity[];audit:LedgerAudit;group_id:string;integrity_verified:boolean;dependencies:{id:string;title:string;actual_at:string}[]}
export interface LedgerEntityDetail {entity:LedgerEntity;kind_label:string;events:(LedgerEvent & {operation:LedgerOperation})[];total:number;offset:number;limit:number}

export interface OperationProcess {
  nodes:Array<{id:string;title:string;kind:string;activity:string;from_label:string;to_label:string;tone:string;status:string;recorded:boolean;planned_at:string|null;actual_at:string|null;actor:string;detail:string;missing:string[]}>;
  edges:Array<{source:string;target:string;kind:string}>;
  machines:Array<{id:string;label:string;current:string;states:Array<{id:string;label:string}>;transitions:Array<{source:string;target:string;label:string;code:string;requires:string[]}>}>;
  guards:string[];observations:string[];
}
