export type SceneStatus = 'neutral' | 'caution' | 'critical';
export type AirportMapMode = 'model' | 'photorealistic';
export interface SceneFlight {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude_m?: number;
  heading?: number;
  status: SceneStatus;
  source?: 'simulation' | 'live';
}
export interface AirportSceneProps {
  airportId: 'craiova' | 'sibiu';
  flights: SceneFlight[];
  selectedFlightId?: string | null;
  onSelectFlight: (id: string | null) => void;
  active?: boolean;
  focusRequest?: number;
  overviewRequest?: number;
  googleApiKey?: string;
  mapMode?: AirportMapMode;
  onMapStatus?: (status: 'loading' | 'ready' | 'error', message?: string) => void;
  onMapModeChange?: (mode: AirportMapMode) => void;
}
export interface AirportReference {
  lat: number; lon: number; elevation: number; label: string; icao: string;
}
export const AIRPORT_REFERENCE: Record<AirportSceneProps['airportId'], AirportReference> = {
  craiova: {lat: 44.318055556, lon: 23.888611111, elevation: 191.4144, label: 'Craiova', icao: 'LRCV'},
  sibiu: {lat: 45.785833333, lon: 24.085555556, elevation: 463.296, label: 'Sibiu', icao: 'LRSB'},
};
export function projectPoint(lon: number, lat: number, reference: AirportReference): [number, number] {
  return [(lon-reference.lon)*111_320*Math.cos(reference.lat*Math.PI/180), -(lat-reference.lat)*111_320];
}
