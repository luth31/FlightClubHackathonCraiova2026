export type Severity = 'neutral' | 'yellow' | 'red';
export interface Position {lat:number;lon:number;altitude_m:number|null;heading:number|null}
export interface Flight {
  id:string;callsign:string;aircraft_type:string;origin:string;destination:string;
  gate_id:string|null;scheduled_departure_seconds:number|null;actual_departure_seconds:number|null;
  delay_minutes:number|null;severity:Severity;emergency:boolean;phase:string;position:Position;
  direction?:'arrival'|'departure';delay_basis?:string;estimated_departure_seconds?:number|null;scheduled_arrival_seconds?:number;registration?:string;position_age_seconds?:number;stale?:boolean;
}
export interface Staff {
  id:string;name:string;title:string;present:boolean;expected_seconds:number;
  actual_arrival_seconds:number|null;late_minutes:number|null;gate_id:string|null;card_label:string;
}
export interface Gate {
  id:string;name?:string;open:boolean;is_open?:boolean;assigned_staff_id:string;
  opened_by?:string|null;opened_at_seconds?:number|null;planned_open_seconds?:number;
}
export interface OperationEvent {
  id:string;sequence:number;simulated_at:string;kind:string;title:string;detail:string;
  actor:string;staff_id:string|null;flight_id:string|null;gate_id:string|null;source:string;
  elapsed_seconds?:number;
}
export interface OperationsData {
  airport:{id:'craiova'|'sibiu';name:string;icao:string;lat:number;lon:number;elevation_m:number};
  simulation:{run_id:string;revision:number;running:boolean;speed:number;elapsed_seconds:number;
    duration_seconds:number;clock_time:string};
  flights:Flight[];gates:Gate[];staff:Staff[];events:OperationEvent[];
  kpis:Record<string,number|null>;
  thresholds:{minor_delay_minutes:number;major_delay_minutes:number};
  permissions:{can_control:boolean};
  model?:{notice:string;departure_basis:string;gate_reclosures_affect_departure:boolean};
}
export interface LiveTraffic {
  source:string;mode:'live';status:'fresh'|'stale'|'unavailable';fetched_at:string|null;
  age_seconds:number|null;poll_after_seconds:number;aircraft:Flight[];notice:string;attribution:{name:string;url:string;license:string;license_url:string};
}
export interface MapConfig {
  google_api_key:string|null;photorealistic_available:boolean;default_mode:'model'|'photorealistic';
}
