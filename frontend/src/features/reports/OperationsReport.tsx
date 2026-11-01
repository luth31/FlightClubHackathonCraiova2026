import {useContext, useEffect, useRef, useState} from 'react';
import {ArrowUpRight, CheckCheck, Clock3, Download, Plane, RefreshCw, Search, X} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage, ViewActiveContext} from '@/components/ui';
import {DashboardPanel} from './DashboardCharts';
import {number, shortDate} from './labels';
import {csvCell} from './export';

interface Flight {id:string;callsign:string;route:string;gate_id:string;scheduled_at:string;actual_at:string|null;direction:string;delay_minutes:number|null;gate_delay_minutes:number|null;event_id:string|null;event_count:number;cause:string}
interface OperationsReportData {
  airport:string; scope:string; period:{from:string|null;to:string|null};generated_at:string;
  summary:{departures:number;completed:number;pending:number;arrivals:number;on_time:number;on_time_percent:number|null;delay_minutes:number;average_delay:number|null;major_delays:number;gate_openings:number;late_gates:number;recorded_events:number};
  daily:{date:string;on_time:number;minor:number;major:number;delay_minutes:number}[];
  gates:{name:string;total:number;late:number;max_delay:number}[];
  causes:{name:string;flights:number;minutes:number}[];flights:Flight[];
}
type FlightFilter='all'|'on_time'|'delayed'|'major'|'late_gate'|'pending';
const FILTERS:{id:FlightFilter;name:string}[]=[{id:'all',name:'Toate zborurile'},{id:'delayed',name:'Plecări întârziate'},{id:'major',name:'Întârzieri ≥15 min'},{id:'late_gate',name:'Poartă deschisă târziu'},{id:'on_time',name:'Plecări la timp'},{id:'pending',name:'Plecări neîncheiate'}];
const query=()=>new URLSearchParams(location.hash.split('?')[1]||'');
const time=(value:string|null)=>value&&!/(Z|[+-]\d{2}:\d{2})$/.test(value)?value.slice(11,16):value?new Intl.DateTimeFormat('ro-RO',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(value)):'—';
const tone=(minutes:number|null)=>minutes===null?'pending':minutes>=15?'major':minutes>0?'minor':'on-time';
const dayLabel=(value:string)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'short'}).format(new Date(value+'T12:00:00'));

export function OperationsReport({refreshKey}:{refreshKey:string}) {
  const active=useContext(ViewActiveContext);
  const [scope,setScope]=useState(query().get('opsScope')==='current'?'current':'all');
  const [days,setDays]=useState([0,7,30].includes(Number(query().get('opsDays')))&&query().has('opsDays')?Number(query().get('opsDays')):7);
  const [filter,setFilter]=useState<FlightFilter>(FILTERS.find(f=>f.id===query().get('opsFilter'))?.id||'all');
  const [day,setDay]=useState(query().get('opsDate')||''),[gate,setGate]=useState(query().get('opsGate')||'');
  const [search,setSearch]=useState(query().get('opsSearch')||''),[limit,setLimit]=useState(Math.max(12,Math.min(500,Number(query().get('opsLimit'))||12))),[data,setData]=useState<OperationsReportData>(),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const restoredFocus=useRef(false);
  useEffect(()=>{
    if(!data||restoredFocus.current)return;const id=query().get('opsFocus');if(!id)return;
    const target=[...document.querySelectorAll<HTMLElement>('[data-report-flight]')].find(el=>el.dataset.reportFlight===id)?.querySelector<HTMLButtonElement>('button');
    if(target){restoredFocus.current=true;target.scrollIntoView({block:'center'});target.focus({preventScroll:true})}
  },[data]);
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();setLoading(true);setError('');
    api<OperationsReportData>(`/reports/operations?days=${days}&scope=${scope}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(e=>{if(!controller.signal.aborted){setData(undefined);setError((e as Error).message)}}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[scope,days,refreshKey,revision,active]);
  useEffect(()=>{
    if(!active||!location.hash.startsWith('#reports'))return;
    const params=query();params.set('view','operations');params.set('opsScope',scope);params.set('opsDays',String(days));params.set('opsFilter',filter);
    for(const [key,value] of [['opsDate',day],['opsGate',gate],['opsSearch',search],['opsLimit',String(limit)]]){if(value)params.set(key,value);else params.delete(key)}
    history.replaceState(history.state,'',`#reports?${params}`);
  },[scope,days,filter,day,gate,search,limit,active]);
  const pick=(next:FlightFilter)=>{setFilter(next);setDay('');setGate('');setSearch('');setLimit(12);document.getElementById('ops-report-source')?.scrollIntoView({behavior:'smooth',block:'start'})};
  const reset=()=>{setFilter('all');setDay('');setGate('');setSearch('');setLimit(12)};
  function openSource(flight:Flight){
    if(!flight.event_id)return;
    const returnParams=query();returnParams.set('opsFocus',flight.id);
    const params=new URLSearchParams({view:'ledger',event:flight.event_id,group:flight.id,returnTo:`#reports?${returnParams}`});
    location.hash=`operations?${params}`;
  }
  const flights=(data?.flights||[]).filter(f=>(!day||f.scheduled_at.startsWith(day))&&(!gate||f.gate_id===gate)&&(!search||`${f.callsign} ${f.route} ${f.gate_id}`.toLocaleLowerCase('ro').includes(search.toLocaleLowerCase('ro')))&&
    (filter==='all'||filter==='late_gate'&&(f.gate_delay_minutes||0)>0||f.direction==='departure'&&(filter==='pending'?f.actual_at===null:filter==='on_time'?f.delay_minutes===0:filter==='major'?(f.delay_minutes||0)>=15:(f.delay_minutes||0)>0)));
  function download(){
    const rows=[['Zbor','Rută','Direcție','Poartă','Planificat','Realizat','Întârziere (min)','Întârziere poartă (min)','Grup registru','Eveniment'],...flights.map(f=>[f.callsign,f.route,f.direction,f.gate_id,f.scheduled_at,f.actual_at,f.delay_minutes,f.gate_delay_minutes,f.id,f.event_id])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='flyleaf-operatiuni.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const s=data?.summary;
  return <div className="or-report" aria-busy={loading}>
    <div className="or-toolbar"><div><h2>Din registru, în perspectivă.</h2><p>{data?.period.to?`${shortDate(data.period.from)} — ${shortDate(data.period.to)} · zile operaționale`:'Registrul operațional al aeroportului'}</p></div><div className="or-controls"><label>Domeniu<select value={scope} onChange={e=>{setScope(e.target.value);setData(undefined);reset()}}><option value="all">Istoric + tura curentă</option><option value="current">Tura curentă</option></select></label>{scope==='all'&&<label>Perioadă<select value={days} onChange={e=>{setDays(Number(e.target.value));setData(undefined);reset()}}><option value="7">Ultimele 7 zile</option><option value="30">Ultimele 30 de zile</option><option value="0">Tot istoricul</option></select></label>}<button aria-label="Actualizează operațiunile" disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={17} className={loading?'rp-spin':''}/></button></div></div>
    {error&&<ErrorMessage message={error} retry={()=>setRevision(v=>v+1)}/>}
    {!data&&!error&&<div className="or-loading" role="status">Se citește registrul operațional…</div>}
    {data&&s&&<>
      <div className="px-kpis or-kpis">
        <button className="px-kpi px-kpi-teal" onClick={()=>pick('on_time')}><span className="px-kpi-icon"><CheckCheck size={21}/></span><div><span>Plecări la timp</span><strong>{s.on_time_percent===null?'—':`${number(s.on_time_percent)}%`}</strong><p>{s.on_time} din {s.completed} plecări încheiate</p><small>Fără întârziere la plecarea de la stand</small></div><ArrowUpRight size={14}/></button>
        <button className={`px-kpi px-kpi-${s.major_delays?'red':'blue'}`} onClick={()=>pick('major')}><span className="px-kpi-icon"><Plane size={21}/></span><div><span>Întârzieri de cel puțin 15 min</span><strong>{number(s.major_delays)}</strong><p>Din {s.completed} plecări încheiate</p><small>{s.pending} plecări încă neîncheiate</small></div><ArrowUpRight size={14}/></button>
        <button className="px-kpi px-kpi-gold" onClick={()=>pick('delayed')}><span className="px-kpi-icon"><Clock3 size={21}/></span><div><span>Întârziere cumulată</span><strong>{number(s.delay_minutes)}<em> min</em></strong><p>{s.average_delay===null?'—':number(s.average_delay)} min / plecare încheiată</p><small>Timpi înregistrați la plecarea de la stand</small></div><ArrowUpRight size={14}/></button>
        <button className="px-kpi px-kpi-gold" onClick={()=>pick('late_gate')}><span className="px-kpi-icon"><Clock3 size={21}/></span><div><span>Porți deschise târziu</span><strong>{number(s.late_gates)}</strong><p>Din {s.gate_openings} deschideri inițiale</p><small>Planificat comparat cu realizat</small></div><ArrowUpRight size={14}/></button>
      </div>
      <div className="or-charts">
        <DashboardPanel title="Punctualitatea plecărilor" subtitle="Plecări încheiate pe zi · selectează o zi pentru zboruri" className="or-punctuality">
          <div className="or-legend"><span><i className="on-time"/>La timp</span><span><i className="minor"/>1–14 min</span><span><i className="major"/>≥15 min</span><span className="or-legend-unit">Număr de plecări</span></div>
          {data.daily.length?<div className="or-day-chart">{data.daily.map(d=>{const total=d.on_time+d.minor+d.major,max=Math.max(...data.daily.map(v=>v.on_time+v.minor+v.major));return <button key={d.date} aria-pressed={day===d.date} onClick={()=>{setDay(day===d.date?'':d.date);setGate('');setFilter('all');setLimit(12)}} aria-label={`${dayLabel(d.date)}: ${d.on_time} la timp, ${d.minor} cu 1–14 minute, ${d.major} cu cel puțin 15 minute întârziere`}><b>{total}</b><div className="or-day-track"><div className="or-day-stack" style={{height:`${total/max*100}%`}}>{(['major','minor','on_time'] as const).map(key=>d[key]>0&&<span key={key} className={key.replace('_','-')} style={{flex:d[key]}}>{d[key]}</span>)}</div></div><strong>{dayLabel(d.date)}</strong><small>{number(d.delay_minutes)} min</small></button>})}</div>:<div className="or-empty">Nicio plecare încheiată în această perioadă.</div>}
        </DashboardPanel>
        <DashboardPanel title="Unde se acumulează întârzierea" subtitle="Context consemnat în registru · minute la plecarea de la stand">
          {data.causes.length?<div className="or-causes">{data.causes.map(c=><div key={c.name}><div><strong>{c.name}</strong><b>{c.minutes}<small> min</small></b></div><div className="or-cause-track"><i style={{width:`${c.minutes/Math.max(...data.causes.map(v=>v.minutes))*100}%`}}/></div><small>{c.flights} plecări · {Math.round(c.minutes/s.delay_minutes*100)}% din întârzierea cumulată</small></div>)}</div>:<div className="or-empty">Nicio întârziere înregistrată la plecare.</div>}
        </DashboardPanel>
      </div>
      <DashboardPanel title="Pregătirea porților" subtitle="Prima deschidere a porții pentru fiecare plecare · selectează o poartă">
        <div className="or-gates">{data.gates.length?data.gates.map(g=><button key={g.name} aria-pressed={gate===g.name} onClick={()=>{setGate(gate===g.name?'':g.name);setDay('');setFilter('all');setLimit(12)}}><div><strong>{g.name}</strong><span className={g.late?'or-warning':''}>{g.total-g.late}/{g.total} la timp</span></div><div className="or-gate-track"><i style={{width:`${(g.total-g.late)/g.total*100}%`}}/></div><small>{g.late?`${g.late} deschideri târzii · maxim +${g.max_delay} min`:'Toate deschiderile la timp'}</small></button>):<p className="or-empty">Nicio deschidere de poartă înregistrată.</p>}</div>
      </DashboardPanel>
      <section id="ops-report-source" className="px-panel or-source"><header><div><h2>Zborurile din spatele cifrelor <span>{flights.length}</span></h2><p>Ore locale · ordonate după întârzierea înregistrată</p></div><button onClick={download} aria-label="Exportă zborurile selectate CSV"><Download size={18}/></button></header>
        <div className="or-source-filters"><label className="or-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setLimit(12)}} placeholder="Zbor, rută, poartă…" aria-label="Caută zbor în raport"/></label><select aria-label="Filtrează zborurile din raport" value={filter} onChange={e=>{setFilter(e.target.value as FlightFilter);setLimit(12)}}>{FILTERS.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>{day&&<button onClick={()=>setDay('')}>{dayLabel(day)}<X size={14}/></button>}{gate&&<button onClick={()=>setGate('')}>{gate}<X size={14}/></button>}{(filter!=='all'||day||gate||search)&&<button onClick={reset}>Resetează</button>}</div>
        <div className="or-table-scroll"><table><thead><tr><th>Zbor / rută</th><th>Zi / poartă</th><th>Planificat</th><th>Realizat</th><th>Abatere</th><th>Registru</th></tr></thead><tbody>{flights.slice(0,limit).map(f=><tr key={f.id} data-report-flight={f.id}><td><strong>{f.callsign}</strong><small>{f.route}</small><small>{f.direction==='arrival'?'Sosire':'Plecare'}</small></td><td>{dayLabel(f.scheduled_at.slice(0,10))}<small>{f.gate_id}</small></td><td>{time(f.scheduled_at)}</td><td>{time(f.actual_at)}</td><td><span className={`or-badge ${tone(f.delay_minutes)}`}>{f.delay_minutes===null?'Neîncheiat':f.delay_minutes?`+${f.delay_minutes} min`:'La timp'}</span></td><td><button disabled={!f.event_id} onClick={()=>openSource(f)} aria-label={`Vezi ${f.callsign} din ${dayLabel(f.scheduled_at.slice(0,10))} în registru`}>Registru<ArrowUpRight size={15}/></button></td></tr>)}</tbody></table></div>
        {!flights.length&&<p className="or-empty">Niciun zbor pentru această selecție.</p>}
        {flights.length>limit&&<button className="or-load-more" onClick={()=>setLimit(n=>n+24)}>Arată mai multe · {limit} din {flights.length}</button>}
      </section>
      <footer className="or-foot"><span>{number(s.recorded_events)} acțiuni înregistrate · {s.completed} plecări încheiate · {s.arrivals} sosiri încheiate</span><span>Actualizat la {time(data.generated_at)}</span></footer>
    </>}
  </div>;
}
