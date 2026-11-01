import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,CalendarDays,Check,ChevronRight,Clock3,Filter,Plane,Search,ClipboardList} from 'lucide-react';
import {EntityChip,LedgerInspector,type Inspection} from './LedgerInspector';
import {RunArchive} from './RunArchive';
import {OperationsProcess} from './OperationsProcess';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading} from '@/components/ui';
import {dayLabel,shortTime,statusLabels} from './format';
import type {LedgerData,LedgerEvidenceTarget,LedgerFlight,LedgerMetrics} from './types';

export function LedgerMetricCards({metrics,caption}:{metrics:LedgerMetrics;caption?:string}) {
  useLanguage();
  return <div className="ops-ledger-metrics" aria-label={t("Indicatori operaționali")}><div><span>{t("Plecări la timp")}</span><strong>{metrics.on_time_percent==null?'—':t("{p0}%", {p0:metrics.on_time_percent})}</strong><small>{metrics.completed_departures} {t("plecări încheiate")}{caption&&t(" · {p0}", {p0:caption})}</small></div><div><span>{t("Întârziere totală")}</span><strong className={metrics.delay_minutes>=15?'ops-tone-red':metrics.delay_minutes?'ops-tone-amber':''}>{metrics.delay_minutes}<small> {t("min")}</small></strong><small>{t("La plecarea de la stand")}</small></div><div><span>{t("Porți deschise târziu")}</span><strong>{metrics.late_gate_openings}</strong><small>{metrics.staff_late} {t("pontaje întârziate")}</small></div><div><span>{t("Necesită intervenție")}</span><strong className={metrics.open_risks?'ops-tone-red':''}>{metrics.open_risks}</strong><small>{t("În tura curentă")}</small></div></div>;
}
function ParallelActivities({flight}:{flight:LedgerFlight}) {
  useLanguage();
  const lanes=(flight.activities||[]).filter(lane=>['cleaning','fuel','baggage','boarding'].includes(lane.id)&&lane.from&&lane.to&&lane.from!==lane.to);
  if(lanes.length<2)return null;
  const start=Math.min(...lanes.map(lane=>Date.parse(lane.from!))),end=Math.max(...lanes.map(lane=>Date.parse(lane.to!))),span=Math.max(1,end-start);
  return <details className="ops-parallel"><summary>{t("Activități în paralel")}</summary><div>{lanes.map(lane=><div className="ops-parallel-row" key={lane.id}><span>{t(lane.label)}</span><div><i style={{left:`${100*(Date.parse(lane.from!)-start)/span}%`,width:`${Math.max(1,100*(Date.parse(lane.to!)-Date.parse(lane.from!))/span)}%`}}/></div><time>{shortTime(lane.from)}–{shortTime(lane.to)}</time></div>)}</div></details>;
}
function FlightGroup({flight,focus,focusEvent,onInvestigate,onInspect}:{flight:LedgerFlight;focus:boolean;focusEvent?:string;onInvestigate?:(id:string)=>void;onInspect:(target:Inspection)=>void}) {
  useLanguage();
  const [expanded,setExpanded]=useState(focus);
  const [activity,setActivity]=useState('all');
  const visible=flight.events.filter(event=>activity==='all'||event.operation?.activity===activity||event.id===focusEvent);
  return <details className={`ops-ledger-flight severity-${flight.severity}`} data-flight-id={flight.id} open={focus||undefined} onToggle={event=>{if(event.target===event.currentTarget)setExpanded(event.currentTarget.open)}}>
    <summary><ChevronRight className="ops-expand" size={16}/><span className={`ops-ledger-icon severity-${flight.severity}`}>{flight.category&&flight.category!=='flight'?<ClipboardList size={18}/>:<Plane size={18}/>}</span><span className="ops-ledger-flight-name"><strong>{flight.callsign}</strong><small>{flight.route}</small></span><span className="ops-ledger-flight-time"><strong>{shortTime(flight.scheduled_at)}</strong><small>{t("Planificat")}</small></span><span className="ops-ledger-gate"><strong>{flight.gate_id||'—'}</strong><small>{flight.gate_id?t("Poartă"):t("Aeroport")}</small></span><span className={`ops-severity-badge severity-${flight.severity}`}>{flight.delay_minutes&&flight.delay_minutes>0?<><strong>+{flight.delay_minutes} {t("min")}</strong><small>{flight.actual_at?t("întârziere"):t("estimat")}</small></>:statusLabels[flight.status]||flight.status}</span><span className="ops-ledger-count">{flight.event_count??flight.events.length} {t("acțiuni")}</span></summary>
    <div className="ops-ledger-evidence">
      <div className="ops-ledger-entities">{flight.entities?.map(entity=><EntityChip key={entity.id} entity={entity} onInspect={onInspect}/>)}</div>
      {(expanded||focus)&&flight.process&&<OperationsProcess process={flight.process} onInspect={onInspect}/>}
      {flight.activities&&<div className="ops-activity-filter" aria-label={t("Activități operaționale")}><button aria-pressed={activity==='all'} onClick={()=>setActivity('all')}>{t("Toate operațiunile")}{' '}<span>{flight.events.length}</span></button>{flight.activities.map(lane=><button key={lane.id} aria-pressed={activity===lane.id} onClick={()=>setActivity(lane.id)} title={lane.state}>{t(lane.label)}<span>{lane.event_count}</span></button>)}</div>}
      <ParallelActivities flight={flight}/>
      <div className="ops-ledger-columns"><span>{t("Acțiune / responsabil")}</span><span>{t("Planificat")}</span><span>{t("Realizat")}</span><span>{t("Abatere")}</span></div>
      {visible.map(event=><div className={`ops-ledger-event severity-${event.severity}${event.id===focusEvent?' is-evidence-target':''}`} data-event-id={event.id} aria-current={event.id===focusEvent?'true':undefined} tabIndex={event.id===focusEvent?-1:undefined} key={event.id}>
        <div><span className="ops-event-dot"/><div><button className="ops-event-title" disabled={!event.actual_at||event.projected||event.source==='projection'} onClick={()=>onInspect({type:'event',id:event.id,label:event.title})}>{event.title}</button>
          {event.operation&&<small className="ops-event-transition">{event.operation.activity_label}{!event.actual_at?t(" · planificat"):''} · {event.operation.observation?t("Observație înregistrată"):t("{p0} → {p1}", {p0:event.operation.from_label,p1:event.operation.to_label})}</small>}
          <div className="ops-event-people">{event.entities?.filter(entity=>entity.role==='participant'||entity.role==='recorder').filter((entity,index,all)=>all.findIndex(item=>item.id===entity.id)===index).map(entity=><EntityChip key={entity.id+entity.role} entity={entity} onInspect={onInspect}/>)||<small><PersonReference name={event.actor}/></small>}</div></div></div>
        <time dateTime={event.planned_at||undefined}>{shortTime(event.planned_at)}{event.planned_at&&event.planned_at.slice(0,10)!==flight.scheduled_at.slice(0,10)&&<small>{dayLabel(event.planned_at.slice(0,10))}</small>}</time>
        <time dateTime={event.actual_at||undefined}>{shortTime(event.actual_at)}{event.actual_at&&event.actual_at.slice(0,10)!==flight.scheduled_at.slice(0,10)&&<small>{dayLabel(event.actual_at.slice(0,10))}</small>}</time>
        <span className={`ops-event-delta severity-${event.severity}`}>{event.delay_minutes&&event.delay_minutes>0?t("+{p0} min", {p0:event.delay_minutes}):event.severity!=='neutral'?<><AlertTriangle size={13}/>{t("Abatere")}</>:event.actual_at?<><Check size={13}/>{t("Înregistrat")}</>:<><Clock3 size={13}/>{t("Așteaptă")}</>}</span>
      </div>)}
      {focus&&onInvestigate&&flight.source==='interactive'&&<button className="ops-ledger-back" onClick={()=>onInvestigate(flight.id)}>{t("Deschide zborul în tura curentă")}<ChevronRight size={14}/></button>}
    </div>
  </details>;
}
export function OperationsLedger({revision,focusFlight,onInvestigate,runId,atSeconds,scenarioName,evidence}:{revision:number;evidence?:LedgerEvidenceTarget;focusFlight?:string|null;onInvestigate?:(id:string)=>void;runId?:string;atSeconds?:number;scenarioName?:string}) {
  useLanguage();
  const [inspection,setInspection]=useState<Inspection>();
  const [scope,setScope]=useState<'current'|'all'>(runId?'current':'all');
  const [data,setData]=useState<LedgerData>();const [error,setError]=useState('');
  const [search,setSearch]=useState(''),[date,setDate]=useState(''),[attention,setAttention]=useState(false);
  const [query,setQuery]=useState('');
  const container=useRef<HTMLDivElement>(null),focused=useRef<string|null>(null);
  useEffect(()=>{const key=evidence?.eventId||focusFlight;if(!key){focused.current=null;return}if(!data||focused.current===key)return;
    const group=[...(container.current?.querySelectorAll<HTMLDetailsElement>('[data-flight-id]')||[])].find(node=>node.dataset.flightId===focusFlight);
    const target=evidence?[...(group?.querySelectorAll<HTMLElement>('[data-event-id]')||[])].find(node=>node.dataset.eventId===evidence.eventId):group?.querySelector<HTMLElement>('summary');
    if(!target)return;const frame=window.requestAnimationFrame(()=>{focused.current=key;target.scrollIntoView({behavior:'smooth',block:'center'});target.focus({preventScroll:true})});return()=>window.cancelAnimationFrame(frame);
  },[focusFlight,evidence,data]);
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search),200);return()=>clearTimeout(timer)},[search]);
  useEffect(()=>{const controller=new AbortController();let disposed=false;const params=new URLSearchParams({status:attention?'attention':'all'});if(runId&&scope==='current'){params.set('scope','current');params.set('run_id',runId);if(atSeconds!=null)params.set('at_seconds',String(atSeconds))}if(date)params.set('date',date);if(query)params.set('search',query);
    const path=evidence?`/operations/ledger/entries/${encodeURIComponent(evidence.eventId)}?${new URLSearchParams({group_id:evidence.groupId})}`:`/operations/ledger?${params}`;
    api<LedgerData>(path,{signal:controller.signal}).then(value=>{if(!disposed){setData(value);setError('')}}).catch(e=>{if(!disposed)setError((e as Error).message)});return()=>{disposed=true;controller.abort()};
  },[query,date,attention,revision,runId,atSeconds,evidence,scope]);
  const groups=[...(data?.days||[])].sort((a,b)=>{const ref=data?.reference_date||'';const rank=(value:string)=>value===ref?0:value<ref?1:2;return rank(a.date)-rank(b.date)||(a.date<ref?b.date.localeCompare(a.date):a.date.localeCompare(b.date))});
  return <section className="ops-ledger-section"><div className="ops-section-heading"><div><h2>{t("Ce s-a întâmplat?")}</h2></div><span className="ops-data-label">{evidence?t("Dovadă din registru"):scope==='current'?(scenarioName||'Tura curentă'):t("Istoricul aeroportului")}</span></div>
    {data?.metrics&&<LedgerMetricCards metrics={data.filtered_metrics||data.metrics} caption={evidence?'grupul citat':scope==='current'?'tura curentă':'perioada selectată'}/>}
    {!evidence&&runId&&<div className="ops-ledger-scope" aria-label={t("Perioada registrului")}><button aria-pressed={scope==='current'} onClick={()=>{setScope('current');setDate('')}}>{t("Tura curentă")}</button><button aria-pressed={scope==='all'} onClick={()=>setScope('all')}>{t("Tot registrul")}</button></div>}
    {!evidence&&<div className="ops-ledger-filters"><label className="ops-ledger-search"><Search size={17}/><input aria-label={t("Caută în registrul operațional")} placeholder={t("Zbor, poartă, coleg sau acțiune…")} value={search} onChange={event=>setSearch(event.target.value)}/></label>{scope==='all'&&<label className="ops-ledger-date"><CalendarDays size={16}/><input type="date" aria-label={t("Ziua operațională")} value={date} onChange={event=>setDate(event.target.value)}/></label>}<button className={attention?'active':''} aria-pressed={attention} onClick={()=>setAttention(value=>!value)}><Filter size={15}/>{t("Doar abateri")}</button>{date&&<button onClick={()=>setDate('')}>{t("Toate zilele")}</button>}</div>}
    {error&&<ErrorMessage message={error}/>}{!data&&!error&&<Loading/>}
    {focusFlight&&<div className="ops-investigation-note"><Search size={16}/><span>{evidence?t("Evenimentul citat este evidențiat mai jos, în contextul său din registru."):t("Zbor selectat · planul și realizarea, unul lângă altul.")}</span></div>}
    <div className="ops-ledger-days" ref={container}>{groups.map((day,index)=><details className={`ops-ledger-day severity-${day.severity}`} key={day.date} open={Boolean(day.flights.some(flight=>flight.id===focusFlight))||day.date===data?.reference_date||(!data?.reference_date&&index===0)||undefined}>
      <summary><ChevronRight className="ops-expand" size={18}/><span className="ops-day-title"><strong>{dayLabel(day.date)}</strong><small>{day.flights.length} {t("grupuri ·")}{' '}{day.event_count??day.flights.reduce((n,flight)=>n+flight.events.length,0)} {t("acțiuni")}</small></span><span className={`ops-day-state severity-${day.severity}`}>{day.severity==='red'?<><AlertTriangle size={15}/>{t("Abateri majore")}</>:day.severity==='yellow'?<><Clock3 size={15}/>{t("Abateri")}</>:<><Check size={15}/>{t("Fără abateri")}</>}</span></summary>
      <div className="ops-day-flights">{day.flights.map(flight=><FlightGroup key={flight.id} flight={flight} focus={flight.id===focusFlight} focusEvent={evidence?.eventId} onInvestigate={evidence?undefined:onInvestigate} onInspect={setInspection}/>)}</div>
    </details>)}</div>
    {data&&!groups.length&&<div className="ops-ledger-empty"><Search size={27}/><h3>{t("Nicio acțiune pentru aceste filtre")}</h3><button onClick={()=>{setSearch('');setDate('');setAttention(false)}}>{t("Resetează filtrele")}</button></div>}
    {inspection&&<LedgerInspector key={inspection.id} target={inspection} onClose={()=>setInspection(undefined)}/>}
    {!evidence&&<RunArchive revision={revision}/>}
    <footer className="ops-ledger-foot"><span>{t("Galben: 1–14 min · roșu: ≥15 min / incident")}</span></footer>
  </section>;
}
