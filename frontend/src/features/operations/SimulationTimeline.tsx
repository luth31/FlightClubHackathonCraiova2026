import {t,useLanguage} from '@/i18n';
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
  const [cursor,setCursor]=useState<{runId:string;seconds:number;mode:'review'|'live';playing:boolean;speed:number}|null>(null);
  const [openedRun,setOpenedRun]=useState<{id:string;completed:boolean}|null>(null);
  const [result,setResult]=useState<{key:string;value?:TimelinePreview;error?:string}>();
  const runId=live?.simulation.run_id;
  const current=cursor?.runId===runId?cursor:null;
  const duration=live?.simulation.duration_seconds||3600;
  const completed=!!live&&live.simulation.elapsed_seconds>=duration;
  if(live&&openedRun?.id!==runId)setOpenedRun({id:live.simulation.run_id,completed});
  const startAtBeginning=openedRun&&openedRun.id===runId?openedRun.completed:completed;
  const previewing=!!live&&(current?current.mode==='review':startAtBeginning);
  const seconds=previewing?(current?.seconds||0):Math.floor(live?.simulation.elapsed_seconds||0);
  const speed=current?.speed||(completed?30:live?.simulation.speed)||1;
  const playing=previewing&&!!current?.playing&&seconds<duration;
  useEffect(()=>{
    if(!active||!playing)return;
    let previous=performance.now();
    const timer=setInterval(()=>{
      const now=performance.now(),delta=(now-previous)*speed/1000;previous=now;
      setCursor(value=>{
        if(!value||value.runId!==runId||!value.playing)return value;
        const next=Math.min(duration,value.seconds+delta);
        return {...value,seconds:next,playing:next<duration};
      });
    },80);
    return()=>clearInterval(timer);
  },[active,playing,runId,speed,duration]);
  const requestSeconds=Math.floor(seconds);
  const key=`${runId}:${live?.simulation.revision}:${requestSeconds}`;
  const desired=useRef({seconds:requestSeconds,key});
  useEffect(()=>{desired.current={seconds:requestSeconds,key}},[requestSeconds,key]);
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
        }catch(error){if(!disposed){setResult({key:request.key,error:(error as Error).message});setCursor(value=>value&&value.runId===runId?{...value,playing:false}:value)}}
      }
      if(!disposed)timer=setTimeout(update,90);
    }
    void update();
    return()=>{disposed=true;clearTimeout(timer);controller.abort()};
  },[active,runId]);
  const frame=result?.value?.simulation.run_id===runId?result?.value:undefined;
  const seek=(value:number)=>{if(live)setCursor({runId:live.simulation.run_id,seconds:Math.max(0,Math.min(duration,Math.round(value))),mode:'review',playing:false,speed})};
  return {previewing,seconds:Math.floor(seconds),frame,playing,speed,loading:active&&result?.key!==key,error:result?.key===key?result.error:undefined,
    seek,
    togglePlayback:()=>{if(live)setCursor({runId:live.simulation.run_id,seconds:seconds>=duration?0:seconds,mode:'review',playing:!playing,speed})},
    setSpeed:(value:number)=>{if(live)setCursor({runId:live.simulation.run_id,seconds,mode:'review',playing,speed:value})},
    step:()=>seek(frame?.timeline?.events.filter(event=>event.elapsed_seconds>seconds).sort((a,b)=>a.elapsed_seconds-b.elapsed_seconds)[0]?.elapsed_seconds??duration),
    reset:()=>{if(live)setCursor({runId:live.simulation.run_id,seconds:live.simulation.elapsed_seconds,mode:'live',playing:false,speed:live.simulation.speed})}};
}

const important=(event:TimelineEvent)=>!['boarding_started','scenario_superseded','scenario_summary','departure_due'].includes(event.kind);
const warning=(event:TimelineEvent)=>['staff_absent','gate_waiting','departure_blocked','emergency_declared'].includes(event.kind);
const preciseClock=(seconds:number)=>`${clock(seconds)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

export function SimulationTimeline({live,frame,seconds,previewing,loading,error,selected,onSeek,onReturn,onApply,busy}: {
  live:OperationsData;frame?:TimelinePreview;seconds:number;previewing:boolean;loading:boolean;error?:string;
  selected:string|null;onSeek:(seconds:number)=>void;onReturn:()=>void;onApply:()=>void;busy:boolean;
}) {
  useLanguage();
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
  return <section className={`ops-timeline ${previewing?'is-preview':''}`} aria-label={t("Axa temporală a turei")}>
    <div className="ops-timeline-heading"><div><strong>{preciseClock(seconds)}</strong><span>{live.flights.find(flight=>flight.id===selected)?.callsign} · {previewing?(projected?'Proiecție':'Istoric'):t("Tura curentă")}</span>{loading&&<LoaderCircle size={14} className="spin" aria-label={t("Se actualizează momentul")}/>}</div>
      <div className="ops-timeline-actions">{previewing&&<><button onClick={onReturn}><RotateCcw size={13}/>{t("Revino la tură")}{' '}<span>· {eventTime(live.simulation.clock_time)}</span></button>{projected&&live.permissions.can_control&&<button disabled={busy||loading||!!error} onClick={onApply}>{t("Avansează tura aici")}</button>}</>}</div>
    </div>
    <div className="ops-timeline-track">
      <div className="ops-timeline-markers" aria-label={t("Evenimente pe axa temporală")}>{groups.map(group=><button key={group.seconds} style={{left:`${100*group.seconds/duration}%`}} className={`${group.events.some(warning)?'warning':''} ${group.events.every(event=>event.projected)?'projected':''} ${nearest===group?'nearest':''}`} onClick={()=>onSeek(group.seconds)} aria-label={t("{p0} · {p1}", {p0:preciseClock(group.seconds),p1:group.events.map(event=>event.title).join(', ')})} title={t("{p0} · {p1}", {p0:preciseClock(group.seconds),p1:group.events.map(event=>event.title).join(', ')})}><i/></button>)}</div>
      <input type="range" min={0} max={duration} step={1} value={seconds} aria-label={t("Momentul turei")} aria-valuetext={`${preciseClock(seconds)} · ${previewing?(projected?'proiecție':'istoric'):'tura curentă'}`} onChange={event=>onSeek(Number(event.target.value))} style={{background:`linear-gradient(to right,#0f6e68 0%,#0f6e68 ${100*seconds/duration}%,#d6e0e6 ${100*seconds/duration}%,#d6e0e6 100%)`}}/>
      <div className="ops-timeline-ticks" aria-hidden="true">{[0,600,1200,1800,2400,3000,3600].map(at=><span key={at}>{clock(at)}</span>)}</div>
    </div>
    <div className="ops-timeline-context"><button disabled={!previous} aria-label={t("Eveniment anterior pe axă")} onClick={()=>previous&&onSeek(previous.seconds)}><ChevronLeft size={16}/></button><div aria-live="polite">{error?<span className="ops-timeline-error">{error}</span>:nearest?<><time>{preciseClock(nearest.seconds)}</time><span>{nearest.events.map(event=>event.title).join(' · ')}</span>{nearest.events.some(event=>event.projected)&&<small>{t("proiectat")}</small>}</>:<span>{t("Niciun eveniment pentru zborul selectat")}</span>}</div><button disabled={!next} aria-label={t("Eveniment următor pe axă")} onClick={()=>next&&onSeek(next.seconds)}><ChevronRight size={16}/></button></div>
  </section>;
}
