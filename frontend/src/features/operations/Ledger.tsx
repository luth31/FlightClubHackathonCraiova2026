import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,CalendarDays,Check,ChevronRight,Clock3,Filter,Plane,Search,ClipboardList} from 'lucide-react';
import {RunArchive} from './RunArchive';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading} from '@/components/ui';
import {dayLabel,shortTime,statusLabels} from './format';
import type {LedgerData,LedgerFlight,LedgerMetrics} from './types';

export function LedgerMetricCards({metrics,caption}:{metrics:LedgerMetrics;caption?:string}) {
  return <div className="ops-ledger-metrics" aria-label="Indicatori operaționali"><div><span>Plecări la timp</span><strong>{metrics.on_time_percent==null?'—':`${metrics.on_time_percent}%`}</strong><small>{metrics.completed_departures} plecări încheiate{caption&&` · ${caption}`}</small></div><div><span>Întârziere totală</span><strong className={metrics.delay_minutes?'ops-tone-amber':''}>{metrics.delay_minutes}<small> min</small></strong><small>La plecarea de la stand</small></div><div><span>Porți deschise târziu</span><strong>{metrics.late_gate_openings}</strong><small>{metrics.staff_late} pontaje întârziate</small></div><div><span>Necesită intervenție</span><strong className={metrics.open_risks?'ops-tone-red':''}>{metrics.open_risks}</strong><small>În tura curentă</small></div></div>;
}
function FlightGroup({flight,focus,onInvestigate}:{flight:LedgerFlight;focus:boolean;onInvestigate?:(id:string)=>void}) {
  return <details className={`ops-ledger-flight severity-${flight.severity}`} data-flight-id={flight.id} open={focus||undefined}>
    <summary><ChevronRight className="ops-expand" size={16}/><span className={`ops-ledger-icon severity-${flight.severity}`}>{flight.category&&flight.category!=='flight'?<ClipboardList size={18}/>:<Plane size={18}/>}</span><span className="ops-ledger-flight-name"><strong>{flight.callsign}</strong><small>{flight.route}</small></span><span className="ops-ledger-flight-time"><strong>{shortTime(flight.scheduled_at)}</strong><small>{flight.gate_id||'Aeroport'}</small></span><span className={`ops-severity-badge severity-${flight.severity}`}>{flight.delay_minutes&&flight.delay_minutes>0?`+${flight.delay_minutes} min${flight.actual_at?'':' estim.'}`:statusLabels[flight.status]||flight.status}</span><span className="ops-ledger-count">{flight.event_count??flight.events.length} acțiuni</span></summary>
    <div className="ops-ledger-evidence"><div className="ops-ledger-columns"><span>Acțiune / responsabil</span><span>Planificat</span><span>Realizat</span><span>Abatere</span></div>
      {flight.events.map(event=><div className={`ops-ledger-event severity-${event.severity}`} key={event.id}>
        <div><span className="ops-event-dot"/><div><strong>{event.title}</strong><small>{event.actor}</small>{event.detail&&<details className="ops-event-context"><summary>Detalii</summary><p>{event.detail}</p></details>}</div></div>
        <time dateTime={event.planned_at||undefined}>{shortTime(event.planned_at)}{event.planned_at&&event.planned_at.slice(0,10)!==flight.scheduled_at.slice(0,10)&&<small>{dayLabel(event.planned_at.slice(0,10))}</small>}</time>
        <time dateTime={event.actual_at||undefined}>{shortTime(event.actual_at)}{event.actual_at&&event.actual_at.slice(0,10)!==flight.scheduled_at.slice(0,10)&&<small>{dayLabel(event.actual_at.slice(0,10))}</small>}</time>
        <span className={`ops-event-delta severity-${event.severity}`}>{event.delay_minutes&&event.delay_minutes>0?`+${event.delay_minutes} min`:event.severity!=='neutral'?<><AlertTriangle size={13}/>Abatere</>:event.actual_at?<><Check size={13}/>Înregistrat</>:<><Clock3 size={13}/>Așteaptă</>}</span>
      </div>)}
      {focus&&onInvestigate&&flight.source==='interactive'&&<button className="ops-ledger-back" onClick={()=>onInvestigate(flight.id)}>Deschide zborul în tura curentă<ChevronRight size={14}/></button>}
    </div>
  </details>;
}
export function OperationsLedger({revision,focusFlight,onInvestigate}:{revision:number;focusFlight?:string|null;onInvestigate?:(id:string)=>void}) {
  const [data,setData]=useState<LedgerData>();const [error,setError]=useState('');
  const [search,setSearch]=useState(''),[date,setDate]=useState(''),[attention,setAttention]=useState(false);
  const [query,setQuery]=useState('');
  const container=useRef<HTMLDivElement>(null),focused=useRef<string|null>(null);
  useEffect(()=>{if(!focusFlight){focused.current=null;return}if(!data||focused.current===focusFlight)return;const target=[...(container.current?.querySelectorAll<HTMLDetailsElement>('[data-flight-id]')||[])].find(node=>node.dataset.flightId===focusFlight);if(!target)return;focused.current=focusFlight;const frame=window.requestAnimationFrame(()=>{target.scrollIntoView({behavior:'smooth',block:'center'});target.querySelector('summary')?.focus({preventScroll:true})});return()=>window.cancelAnimationFrame(frame)},[focusFlight,data]);
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search),200);return()=>clearTimeout(timer)},[search]);
  useEffect(()=>{const controller=new AbortController();let disposed=false;const params=new URLSearchParams({status:attention?'attention':'all'});if(date)params.set('date',date);if(query)params.set('search',query);
    api<LedgerData>(`/operations/ledger?${params}`,{signal:controller.signal}).then(value=>{if(!disposed){setData(value);setError('')}}).catch(e=>{if(!disposed)setError((e as Error).message)});return()=>{disposed=true;controller.abort()};
  },[query,date,attention,revision]);
  const groups=[...(data?.days||[])].sort((a,b)=>{const ref=data?.reference_date||'';const rank=(value:string)=>value===ref?0:value<ref?1:2;return rank(a.date)-rank(b.date)||(a.date<ref?b.date.localeCompare(a.date):a.date.localeCompare(b.date))});
  return <section className="ops-ledger-section"><div className="ops-section-heading"><div><h2>Ce s-a întâmplat?</h2></div><span className="ops-data-label">Istoric + tura curentă</span></div>
    {data?.metrics&&<LedgerMetricCards metrics={data.filtered_metrics||data.metrics} caption="perioada selectată"/>}
    <div className="ops-ledger-filters"><label className="ops-ledger-search"><Search size={17}/><input aria-label="Caută în registrul operațional" placeholder="Zbor, poartă, coleg sau acțiune…" value={search} onChange={event=>setSearch(event.target.value)}/></label><label className="ops-ledger-date"><CalendarDays size={16}/><input type="date" aria-label="Ziua operațională" value={date} onChange={event=>setDate(event.target.value)}/></label><button className={attention?'active':''} aria-pressed={attention} onClick={()=>setAttention(value=>!value)}><Filter size={15}/>Doar abateri</button>{date&&<button onClick={()=>setDate('')}>Toate zilele</button>}</div>
    {error&&<ErrorMessage message={error}/>}{!data&&!error&&<Loading/>}
    {focusFlight&&<div className="ops-investigation-note"><Search size={16}/><span>Zbor selectat · planul și realizarea, unul lângă altul.</span></div>}
    <div className="ops-ledger-days" ref={container}>{groups.map((day,index)=><details className={`ops-ledger-day severity-${day.severity}`} key={day.date} open={Boolean(day.flights.some(flight=>flight.id===focusFlight))||day.date===data?.reference_date||(!data?.reference_date&&index===0)||undefined}>
      <summary><ChevronRight className="ops-expand" size={18}/><span className="ops-day-title"><strong>{dayLabel(day.date)}</strong><small>{day.flights.length} grupuri · {day.event_count??day.flights.reduce((n,flight)=>n+flight.events.length,0)} acțiuni</small></span><span className={`ops-day-state severity-${day.severity}`}>{day.severity==='red'?<><AlertTriangle size={15}/>Abateri majore</>:day.severity==='yellow'?<><Clock3 size={15}/>Abateri</>:<><Check size={15}/>Fără abateri</>}</span></summary>
      <div className="ops-day-flights">{day.flights.map(flight=><FlightGroup key={flight.id} flight={flight} focus={flight.id===focusFlight} onInvestigate={onInvestigate}/>)}</div>
    </details>)}</div>
    {data&&!groups.length&&<div className="ops-ledger-empty"><Search size={27}/><h3>Nicio acțiune pentru aceste filtre</h3><button onClick={()=>{setSearch('');setDate('');setAttention(false)}}>Resetează filtrele</button></div>}
    <RunArchive revision={revision}/>
    <footer className="ops-ledger-foot"><span>Galben: 1–14 min · roșu: ≥15 min / incident</span></footer>
  </section>;
}
