import {Vector3} from 'three';

export const LIVE_BUFFER_MS=15_000;
type Reading={at:number;position:Vector3;heading:number};

/** Delayed playback of observations, never prediction past the newest reading. */
export class LiveMotionBuffer {
  private readings:Reading[]=[];
  push(at:number,position:Vector3,heading:number){
    const last=this.readings.at(-1);
    // Cached replies, duplicate timestamps and out-of-order packets must not
    // restart playback or gradually drag an old position into the present.
    if(!Number.isFinite(at)||(last&&at<=last.at+1))return;
    this.readings.push({at,position:position.clone(),heading});
    if(this.readings.length>32)this.readings.shift();
  }
  sample(now:number,position:Vector3){
    if(!this.readings.length)return null;
    const time=now-LIVE_BUFFER_MS;
    while(this.readings.length>2&&this.readings[1].at<=time)this.readings.shift();
    const first=this.readings[0],last=this.readings.at(-1)!;
    if(time<=first.at){position.copy(first.position);return {heading:first.heading,pending:time<last.at};}
    if(time>=last.at){position.copy(last.position);return {heading:last.heading,pending:false};}
    const i=this.readings.findIndex(point=>point.at>time),a=this.readings[i-1],b=this.readings[i];
    // A long outage is not evidence of a straight flight across the gap.
    if(b.at-a.at>45_000){position.copy(a.position);return {heading:a.heading,pending:true};}
    const t=(time-a.at)/(b.at-a.at);
    position.copy(a.position).lerp(b.position,t);
    const turn=Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading));
    return {heading:a.heading+turn*t,pending:true};
  }
}
