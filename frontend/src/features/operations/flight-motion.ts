import {Vector3} from 'three';
import {flightCoordinates,type AirportReference,type AirportMapMode} from './scene-types';

export interface MotionPoint {at_seconds:number;lat:number;lon:number;altitude_m:number;heading:number}
export interface SimulationClockState {runId:string;seconds:number;speed:number;playing:boolean}
export type MotionRoute=Array<{seconds:number;position:Vector3;heading:number}>;

export function prepareRoute(points:MotionPoint[],reference:AirportReference,mode:AirportMapMode):MotionRoute {
  return points.map(point=>({seconds:point.at_seconds,heading:point.heading,
    position:new Vector3(...flightCoordinates({...point,id:'',callsign:'',status:'neutral',source:'simulation',altitude_m:point.altitude_m-reference.elevation},reference,mode))}));
}

/** Sample the actual route, not a chord between two polled aircraft positions. */
export function sampleRoute(route:MotionRoute,seconds:number,position:Vector3):number {
  if(seconds<=route[0].seconds){position.copy(route[0].position);return route[0].heading;}
  const last=route[route.length-1];
  if(seconds>=last.seconds){position.copy(last.position);return last.heading;}
  const i=route.findIndex(point=>point.seconds>seconds),a=route[i-1],b=route[i];
  const span=b.seconds-a.seconds,progress=(seconds-a.seconds)/span;
  position.copy(a.position).lerp(b.position,progress);
  // Turn at the route vertex, with a short blend measured in scenario seconds.
  // It must not lag further behind the path when the user selects 120×.
  const turn=Math.max(0,1-(b.seconds-seconds)/Math.min(.4,span*.15));
  const angle=((b.heading-a.heading+540)%360)-180;
  return a.heading+angle*turn;
}

/** Monotonic between network samples; scrubbing/pausing is an explicit reset. */
export class SimulationMotionClock {
  private state:SimulationClockState|undefined;
  private anchor=0;
  private at=0;
  sync(state:SimulationClockState,now:number){
    const old=this.state;
    if(old&&old.runId===state.runId&&old.seconds===state.seconds&&old.speed===state.speed&&old.playing===state.playing)return;
    const continuing=old?.runId===state.runId&&old.playing&&state.playing&&state.seconds>=old.seconds;
    this.anchor=continuing?Math.max(state.seconds,this.read(now)):state.seconds;
    this.at=now;this.state={...state};
  }
  read(now:number){
    if(!this.state?.playing)return this.anchor;
    return Math.min(3600,Math.max(this.anchor,this.state.seconds+1.5*this.state.speed),this.anchor+Math.max(0,now-this.at)*this.state.speed/1000);
  }
}

export function aircraftCloseUp(position:Vector3){
  return {target:position.clone(),position:position.clone().add(new Vector3(115,100,140))};
}

// Every update uses one ground reference and one clearance. Never alternate
// between elevation and elevation + clearance on poll versus terrain frames.
export const SURFACE_CLEARANCE=.35;
export function smoothGroundHeight(current:number,target:number,delta:number){
  return current+(target-current)*(1-Math.exp(-Math.max(0,delta)*3));
}

