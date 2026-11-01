import type {MotionPoint,SimulationClockState} from './flight-motion';
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
  reported_altitude_m?: number;
  altitude_reference?: string;
  ground?: boolean;
  display_scale?: number;
  trajectory?: MotionPoint[];
}
export interface AirportSceneProps {
  airportId: 'craiova' | 'sibiu';
  flights: SceneFlight[];
  selectedFlightId?: string | null;
  followFlightId?: string | null;
  onFollowChange?: (id:string|null) => void;
  onSelectFlight: (id: string | null) => void;
  active?: boolean;
  focusRequest?: number;
  overviewRequest?: number;
  trafficMode?: boolean;
  animateFlights?: boolean;
  simulationClock?: SimulationClockState;
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


// Local east / up / south coordinates, matching Google's ECEF tiles after
// ReorientationPlugin and the 180° Y rotation. Airport elevations are MSL;
// the existing 40 m geoid approximation is used only for the local origin.
export const REFERENCE_GEOID_OFFSET_M=40;
export function geodeticToLocal(lon:number,lat:number,height:number,reference:AirportReference):[number,number,number] {
  const radians=Math.PI/180,a=6378137,e2=6.69437999014e-3;
  const ecef=(longitude:number,latitude:number,h:number)=>{
    const phi=latitude*radians,lambda=longitude*radians,n=a/Math.sqrt(1-e2*Math.sin(phi)**2);
    return [(n+h)*Math.cos(phi)*Math.cos(lambda),(n+h)*Math.cos(phi)*Math.sin(lambda),(n*(1-e2)+h)*Math.sin(phi)];
  };
  const origin=ecef(reference.lon,reference.lat,reference.elevation+REFERENCE_GEOID_OFFSET_M);
  const position=ecef(lon,lat,height),[x,y,z]=position.map((v,i)=>v-origin[i]);
  const phi=reference.lat*radians,lambda=reference.lon*radians;
  return [-Math.sin(lambda)*x+Math.cos(lambda)*y,
    Math.cos(phi)*Math.cos(lambda)*x+Math.cos(phi)*Math.sin(lambda)*y+Math.sin(phi)*z,
    Math.sin(phi)*Math.cos(lambda)*x+Math.sin(phi)*Math.sin(lambda)*y-Math.cos(phi)*z];
}

export function flightCoordinates(flight:SceneFlight,reference:AirportReference,mapMode:AirportMapMode):[number,number,number] {
  if(flight.source==='live'&&mapMode==='photorealistic'){
    const altitude=flight.reported_altitude_m??(reference.elevation+(flight.altitude_m||0));
    const ellipsoid=flight.altitude_reference==='geometric_ellipsoid'?altitude:altitude+REFERENCE_GEOID_OFFSET_M;
    return geodeticToLocal(flight.lon,flight.lat,ellipsoid,reference);
  }
  const [x,z]=projectPoint(flight.lon,flight.lat,reference);
  const height=flight.source==='live'&&flight.altitude_reference==='geometric_ellipsoid'&&flight.reported_altitude_m!=null
    ?flight.reported_altitude_m-reference.elevation-REFERENCE_GEOID_OFFSET_M:flight.altitude_m||0;
  return [x,Math.max(0,height),z];
}

/** Fit the full spatial extent, including altitude, for either portrait or landscape. */
export function fitTrafficFrame(points:number[][],fov:number,aspect:number):{position:[number,number,number];target:[number,number,number]} {
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const point of points)for(let i=0;i<3;i++){low[i]=Math.min(low[i],point[i]);high[i]=Math.max(high[i],point[i]);}
  const target=low.map((v,i)=>(v+high[i])/2) as [number,number,number];
  const radius=Math.max(1600,...points.map(point=>Math.hypot(...point.map((v,i)=>v-target[i]))));
  const vertical=fov*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*Math.max(.2,aspect));
  const distance=radius/Math.sin(Math.min(vertical,horizontal))*1.15;
  return {target,position:[target[0],target[1]+distance*.8,target[2]+distance*.6]};
}
