import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,LoaderCircle,RotateCcw} from 'lucide-react';
import {api} from '@/services/api-client';
import {clock,eventTime} from './format';
import type {OperationEvent,OperationsData} from './types';
import './timeline.css';

export interface TimelineEvent extends OperationEvent {elapsed_seconds:number;projected:boolean}
export interface TimelinePreview extends OperationsData {
  timeline:{current_seconds:number;at_seconds:number;projected:boolean;events:TimelineEvent[]};
}

export function useSimulationTimeline(live:OperationsData|undefined,active:boolean) {
  const [cursor,setCursor]=useState<{runId:string;seconds:number}|null>(null);
  const [result,setResult]=useState<{key:string;value?:TimelinePreview;error?:string}>();
  const runId=live?.simulation.run_id;
  const previewing=!!cursor&&cursor.runId===runId;
  const seconds=previewing?cursor.seconds:Math.floor(live?.simulation.elapsed_seconds||0);
  const key=`${runId}:${live?.simulation.revision}:${seconds}`;
  const desired=useRef({seconds,key});
  useEffect(()=>{desired.current={seconds,key}},[seconds,key]);
  useEffect(()=>{
    if(!active||!runId)return;
    const controller=new AbortController();let disposed=false,lastKey='';
    let timer:ReturnType<typeof setTimeout>;
    async function update(){
      const request=desired.current;
      if(request.key!==lastKey){
        lastKey=request.key;
        try{
          const value=await api<TimelinePreview>(`/operations/timeline?run_id=${encodeURIComponent(runId!)}&at_seconds=${request.seconds}`,{signal:controller.signal});
          if(!disposed)setResult({key:request.key,value});
        }catch(error){if(!disposed)setResult({key:request.key,error:(error as Error).message})}
      }
      if(!disposed)timer=setTimeout(update,90);
    }
    void update();
    return()=>{disposed=true;clearTimeout(timer);controller.abort()};
  },[active,runId]);
  const frame=result?.value?.simulation.run_id===runId?result?.value:undefined;
  return {previewing,seconds,frame,loading:active&&result?.key!==key,error:result?.key===key?result.error:undefined,
    seek:(value:number)=>{if(live)setCursor({runId:live.simulation.run_id,seconds:Math.max(0,Math.min(live.simulation.duration_seconds,Math.round(value)))})},
    reset:()=>setCursor(null)};
}

const important=(event:TimelineEvent)=>!['boarding_started','scenario_superseded','scenario_summary','departure_due'].includes(event.kind);
const warning=(event:TimelineEvent)=>['staff_absent','gate_waiting','departure_blocked','emergency_declared'].includes(event.kind);
const preciseClock=(seconds:number)=>`${clock(seconds)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

export function SimulationTimeline({live,frame,seconds,previewing,loading,error,selected,onSeek,onReturn,onApply,busy}: {
  live:OperationsData;frame?:TimelinePreview;seconds:number;previewing:boolean;loading:boolean;error?:string;
  selected:string|null;onSeek:(seconds:number)=>void;onReturn:()=>void;onApply:()=>void;busy:boolean;
}) {
  const duration=live.simulation.duration_seconds;
  const gate=live.gates.find(item=>item.id===live.flights.find(flight=>flight.id===selected)?.gate_id);
  const allEvents=frame?.timeline?.events||live.events.map(event=>({...event,elapsed_seconds:event.elapsed_seconds||0,projected:false}));
  const relatedStaff=new Set([gate?.assigned_staff_id,...allEvents.filter(event=>event.flight_id===selected).map(event=>event.staff_id)].filter(Boolean));
  const events=allEvents
    .filter(event=>important(event)&&(!selected||event.flight_id===selected||event.gate_id===gate?.id||(event.staff_id&&relatedStaff.has(event.staff_id))))
    .sort((a,b)=>a.elapsed_seconds-b.elapsed_seconds||a.sequence-b.sequence);
  const groups=events.reduce<{seconds:number;events:TimelineEvent[]}[]>((rows,event)=>{
    const last=rows.at(-1);if(last?.seconds===event.elapsed_seconds)last.events.push(event);else rows.push({seconds:event.elapsed_seconds,events:[event]});return rows;
  },[]);
  const previous=groups.filter(group=>group.seconds<seconds).at(-1);
  const next=groups.find(group=>group.seconds>seconds);
  const nearest=groups.reduce<typeof groups[number]|undefined>((best,group)=>!best||Math.abs(group.seconds-seconds)<Math.abs(best.seconds-seconds)?group:best,undefined);
  const projected=seconds>live.simulation.elapsed_seconds;
  return <section className={`ops-timeline ${previewing?'is-preview':''}`} aria-label="Axa temporală a simulării">
    <div className="ops-timeline-heading"><div><strong>{preciseClock(seconds)}</strong><span>{live.flights.find(flight=>flight.id===selected)?.callsign} · {previewing?(projected?'Proiecție':'Istoric'):'Tura curentă'}</span>{loading&&<LoaderCircle size={14} className="spin" aria-label="Se actualizează momentul"/>}</div>
      <div className="ops-timeline-actions">{previewing&&<><button onClick={onReturn}><RotateCcw size={13}/>Revino la tură <span>· {eventTime(live.simulation.clock_time)}</span></button>{projected&&live.permissions.can_control&&<button disabled={busy||loading||!!error} onClick={onApply}>Avansează tura aici</button>}</>}</div>
    </div>
    <div className="ops-timeline-track">
      <div className="ops-timeline-markers" aria-label="Evenimente pe axa temporală">{groups.map(group=><button key={group.seconds} style={{left:`${100*group.seconds/duration}%`}} className={`${group.events.some(warning)?'warning':''} ${group.events.every(event=>event.projected)?'projected':''} ${nearest===group?'nearest':''}`} onClick={()=>onSeek(group.seconds)} aria-label={`${preciseClock(group.seconds)} · ${group.events.map(event=>event.title).join(', ')}`} title={`${preciseClock(group.seconds)} · ${group.events.map(event=>event.title).join(', ')}`}><i/></button>)}</div>
      <input type="range" min={0} max={duration} step={1} value={seconds} aria-label="Momentul simulării" aria-valuetext={`${preciseClock(seconds)} · ${previewing?(projected?'proiecție':'istoric'):'tura curentă'}`} onChange={event=>onSeek(Number(event.target.value))} style={{background:`linear-gradient(to right,#0f6e68 0%,#0f6e68 ${100*seconds/duration}%,#d6e0e6 ${100*seconds/duration}%,#d6e0e6 100%)`}}/>
      <div className="ops-timeline-ticks" aria-hidden="true">{[0,600,1200,1800,2400,3000,3600].map(at=><span key={at}>{clock(at)}</span>)}</div>
    </div>
    <div className="ops-timeline-context"><button disabled={!previous} aria-label="Eveniment anterior pe axă" onClick={()=>previous&&onSeek(previous.seconds)}><ChevronLeft size={16}/></button><div aria-live="polite">{error?<span className="ops-timeline-error">{error}</span>:nearest?<><time>{preciseClock(nearest.seconds)}</time><span>{nearest.events.map(event=>event.title).join(' · ')}</span>{nearest.events.some(event=>event.projected)&&<small>proiectat</small>}</>:<span>Niciun eveniment pentru zborul selectat</span>}</div><button disabled={!next} aria-label="Eveniment următor pe axă" onClick={()=>next&&onSeek(next.seconds)}><ChevronRight size={16}/></button></div>
  </section>;
}
