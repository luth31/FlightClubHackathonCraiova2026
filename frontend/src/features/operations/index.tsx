import {useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,ArrowUpRight,Check,ChevronRight,Clock3,CreditCard,DoorOpen,Expand,
  Focus,Layers3,LoaderCircle,Pause,Plane,Play,Radio,RotateCcw,SkipForward,Users,X} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading,ViewActiveContext} from '@/components/ui';
import {AirportScene} from './AirportScene';
import type {SceneFlight} from './scene-types';
import type {Flight,LiveTraffic,MapConfig,OperationEvent,OperationsData} from './types';
import './operations.css';

const phases:Record<string,string>={at_gate:'La stand',takeoff:'Decolare',parked:'La stand',boarding:'Îmbarcare',waiting:'În așteptare',
  waiting_gate:'Așteaptă deschiderea porții',taxiing:'Rulare',taxi:'Rulare',departed:'Plecat',
  airborne:'În aer',approach:'Apropiere',landing:'Aterizare',arrived:'Sosit',scheduled:'Programat',
  ready:'Pregătit',holding:'În așteptare'};
const clock=(seconds:number|null|undefined)=>seconds==null?'—':`${String(8+Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}`;
const eventTime=(value:string)=>value.split('T')[1]?.slice(0,8)||'—';
const statusLabel=(flight:Flight,live=false)=>flight.emergency?'Urgență':flight.delay_minutes==null?(live?'Fără orar asociat':'Fără abatere'):
  flight.delay_minutes>0?`+${Math.round(flight.delay_minutes)} min`:'La timp';

export function OperationsPage({notify}:{notify:(message:string)=>void}) {
  const viewActive=useContext(ViewActiveContext);
  const [visible,setVisible]=useState(!document.hidden);
  const [data,setData]=useState<OperationsData>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState<'simulation'|'live'>('simulation');
  const [mapMode,setMapMode]=useState<'model'|'photorealistic'>('model');
  const [mapConfig,setMapConfig]=useState<MapConfig>();
  const [traffic,setTraffic]=useState<LiveTraffic>();
  const [trafficError,setTrafficError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [focusRequest,setFocusRequest]=useState(0);
  const [staffId,setStaffId]=useState('');
  const [showNfc,setShowNfc]=useState(false),[confirmReset,setConfirmReset]=useState(false);
  const [filterEvents,setFilterEvents]=useState(false);
  const dataRef=useRef<OperationsData|undefined>(undefined);
  const sceneRef=useRef<HTMLDivElement>(null);
  const active=viewActive&&visible;
  const accept=useCallback((value:OperationsData)=>{
    if(dataRef.current&&value.simulation.revision<dataRef.current.simulation.revision)return;
    dataRef.current=value;setData(value);setError('');
    setStaffId(current=>current||value.staff.find(person=>person.present)?.id||value.staff[0]?.id||'');
  },[]);
  useEffect(()=>{const change=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change)},[]);
  useEffect(()=>{
    let disposed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try {const value=await api<OperationsData>('/operations',{signal:controller.signal});if(!disposed)accept(value)}
      catch(e){if(!disposed)setError((e as Error).message)}
      if(!disposed)timer=setTimeout(poll,dataRef.current?.simulation.running?1000:4000);
    }
    if(active)void poll();
    return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[active,accept]);
  useEffect(()=>{
    const controller=new AbortController();let disposed=false;
    api<MapConfig>('/operations/map-config',{signal:controller.signal}).then(config=>{
      if(!disposed){setMapConfig(config);setMapMode(config.default_mode)}
    }).catch(()=>{/* The bundled model remains available without map credentials. */});
    return()=>{disposed=true;controller.abort()};
  },[]);
  useEffect(()=>{
    if(mode!=='live'||!active)return;
    let disposed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      let interval=30;
      try {const result=await api<LiveTraffic>('/operations/traffic',{signal:controller.signal});
        if(!disposed){setTraffic(result);setTrafficError('');interval=Math.max(15,result.poll_after_seconds)}}
      catch(e){if(!disposed)setTrafficError((e as Error).message)}
      if(!disposed)timer=setTimeout(poll,interval*1000);
    }
    void poll();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[mode,active]);
  const flights=useMemo(()=>mode==='live'?(traffic?.aircraft||[]):(data?.flights||[]),[mode,traffic,data]);
  const chosen=flights.find(flight=>flight.id===selected)||flights[0];
  const selectedId=chosen?.id||null;
  const sceneFlights:SceneFlight[]=useMemo(()=>flights.filter(flight=>flight.position.altitude_m!=null).map(flight=>({id:flight.id,callsign:flight.callsign,
    ...flight.position,altitude_m:Math.max(0,(flight.position.altitude_m??data?.airport.elevation_m??0)-(data?.airport.elevation_m??0)),heading:flight.position.heading??0,status:flight.severity==='red'?'critical':flight.severity==='yellow'?'caution':'neutral',
    source:mode==='live'?'live':'simulation'})),[flights,mode,data?.airport.elevation_m]);
  async function control(action:string,extra:Record<string,unknown>={}) {
    if(busy)return;setBusy(true);
    try {accept(await api<OperationsData>('/operations/control',{method:'POST',body:JSON.stringify({action,...extra})}));setConfirmReset(false)}
    catch(e){notify((e as Error).message)}finally{setBusy(false)}
  }
  async function logEvent(kind:string,extra:Record<string,unknown>={}) {
    if(busy)return;setBusy(true);
    try {accept(await api<OperationsData>('/operations/events',{method:'POST',body:JSON.stringify({kind,...extra,
      request_id:crypto.randomUUID()})}));notify('Eveniment înregistrat în simulare.');}
    catch(e){notify((e as Error).message)}finally{setBusy(false)}
  }
  function changeMode(next:'simulation'|'live'){setMode(next);setSelected(null);setFilterEvents(false)}
  const fullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void sceneRef.current?.requestFullscreen().catch(()=>notify('Vizualizarea pe tot ecranul nu este disponibilă.'))};
  if(!data)return error?<ErrorMessage message={error}/>:<Loading/>;
  const canControl=data.permissions.can_control;
  const gate=data.gates.find(item=>item.id===chosen?.gate_id);
  const gateOpen=gate?.open||gate?.is_open;
  const presentStaff=data.staff.filter(person=>person.present);
  const events=filterEvents&&chosen?data.events.filter(event=>event.flight_id===chosen.id||Boolean(chosen.gate_id&&event.gate_id===chosen.gate_id)||Boolean(event.staff_id&&gate&&(event.staff_id===gate.assigned_staff_id||event.staff_id===gate.opened_by))):data.events;
  const totalDelay=data.flights.reduce((total,flight)=>total+(flight.delay_minutes||0),0);
  const onTime=data.kpis.on_time_percent;
  const liveTime=traffic?.fetched_at?new Date(traffic.fetched_at).toLocaleTimeString('ro-RO'):'—';
  return <section className="operations-page">
    <div className="ops-heading"><div><div className="eyebrow">{data.airport.icao} · O PERSPECTIVĂ COMPLETĂ</div>
      <h1>Operațiuni la sol<span>.</span></h1><p>Fiecare mișcare are o poveste. Urmărește firul ei.</p></div>
      <div className="ops-clock"><Clock3 size={17}/><div><strong>{mode==='simulation'?eventTime(data.simulation.clock_time):liveTime}</strong><span>{mode==='simulation'?'Ora scenariului':'Ultima verificare'}</span></div><span className="ops-sim-tag">{mode==='simulation'?'SIMULARE':'ADS-B'}</span></div>
    </div>
    {error&&<div className="ops-inline-error" role="alert">{error} Ultima stare este păstrată.</div>}
    {mode==='simulation'?<div className="ops-metrics" aria-label="Indicatorii simulării">
      <div title="Doar plecările încheiate în scenariu"><span><Plane size={15}/>Plecări la timp</span><strong>{onTime==null?'—':onTime}<small>{onTime==null?' nicio plecare încă':'%'}</small></strong></div>
      <div><span><Clock3 size={15}/>Întârziere în scenariu</span><strong className={totalDelay>=15?'ops-amber':''}>{Math.round(totalDelay)}<small> min</small></strong></div>
      <div><span><DoorOpen size={15}/>Porți deschise</span><strong>{data.gates.filter(item=>item.open||item.is_open).length}<small> / {data.gates.length}</small></strong></div>
      <div><span><Users size={15}/>Echipă prezentă</span><strong>{presentStaff.length}<small> / {data.staff.length}</small></strong></div>
    </div>:<div className="ops-live-summary"><Radio size={15}/><span>{flights.length} poziții recepționate în raza de 25 NM</span><span>Orare și întârzieri indisponibile în această sursă</span></div>}
    <div className="ops-workspace">
      <div className="ops-map-area" ref={sceneRef}>
        <div className="ops-map-toolbar"><div className="ops-segment" aria-label="Sursa traficului">
          <button className={mode==='simulation'?'active':''} onClick={()=>changeMode('simulation')}><Play size={13}/>Simulare</button>
          <button className={mode==='live'?'active':''} onClick={()=>changeMode('live')}><Radio size={13}/>Trafic ADS-B</button>
        </div><div className="ops-map-style"><label><Layers3 size={15}/><select aria-label="Stil hartă" value={mapMode} onChange={event=>setMapMode(event.target.value as 'model'|'photorealistic')}>
          <option value="model">Model 3D</option><option value="photorealistic" disabled={!mapConfig?.photorealistic_available}>Fotorealist</option></select></label>
          <button title="Tot ecranul" aria-label="Tot ecranul" onClick={fullscreen}><Expand size={16}/></button></div></div>
        <AirportScene airportId={data.airport.id} flights={sceneFlights} selectedFlightId={selectedId} onSelectFlight={setSelected}
          active={active} focusRequest={focusRequest}
          googleApiKey={mapConfig?.google_api_key||undefined} mapMode={mapMode} onMapModeChange={setMapMode}/>
        <div className="ops-scene-caption"><span>{data.airport.name}</span><small>{mapMode==='model'?'Geometrie cartografică · model 3D interpretativ':'Google Maps · data imaginilor poate diferi de geometria OSM'}{mode==='simulation'?' · Trafic simulat':''}</small></div>
        <div className="ops-legend"><span><i/>Fără alertă</span>{mode==='simulation'&&<span><i className="yellow"/>Întârziere mică</span>}<span><i className="red"/>{mode==='simulation'?`Urgență / ≥${data.thresholds.major_delay_minutes} min`:'Alertă raportată'}</span></div>
      </div>
      <aside className="ops-flight-panel">
        <div className="ops-panel-heading"><div><h2>{mode==='live'?'În apropierea aeroportului':'Zborurile scenariului'}</h2><span>{flights.length} aeronave · {mode==='live'?'ADSB.lol':'scenariu demonstrativ'}</span></div><Plane size={18}/></div>
        {mode==='live'&&<div className={`ops-feed-note ${traffic?.status!=='fresh'?'stale':''}`}><Radio size={13}/><span>{trafficError||traffic?.notice||'Se verifică traficul…'}<small>Întârzierile nu sunt furnizate de ADS-B. <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a></small></span></div>}
        <div className="ops-flight-list" aria-label="Lista aeronavelor">
          {flights.map(flight=><button key={flight.id} className={`ops-flight ${selectedId===flight.id?'selected':''}`} onClick={()=>{setSelected(flight.id);setFilterEvents(false)}}>
            <span className={`ops-aircraft-icon ${flight.severity}`}><Plane size={18}/></span><span className="ops-flight-main"><strong>{flight.callsign}</strong><small>{flight.origin||flight.aircraft_type||'Aeronava'} {flight.destination&&<>→ {flight.destination}</>}</small></span>
            <span className={`ops-flight-status ${flight.severity}`}>{statusLabel(flight,mode==='live')}</span>
          </button>)}
          {!flights.length&&<div className="ops-no-aircraft"><Plane size={24}/><strong>Nicio poziție disponibilă</strong><span>{trafficError?'Fluxul nu poate fi accesat momentan.':'Revino la simulare pentru scenariul complet.'}</span></div>}
        </div>
        {chosen&&<div className="ops-flight-detail"><div className="ops-selected-heading"><span>ÎN DETALIU</span><button onClick={()=>setFocusRequest(value=>value+1)} title="Centrează aeronava"><Focus size={15}/></button></div>
          <h3>{chosen.callsign}<small>{chosen.aircraft_type}</small></h3>
          <dl><div><dt>Stare</dt><dd>{phases[chosen.phase]||chosen.phase||'Poziție recepționată'}</dd></div>
            {mode==='simulation'?<><div><dt>Poartă</dt><dd>{chosen.gate_id||'—'}{gate&&<span> · {gateOpen?'deschisă':'închisă'}</span>}</dd></div>
              {chosen.direction==='arrival'?<div><dt>Sosire programată</dt><dd>{clock(chosen.scheduled_arrival_seconds)}</dd></div>:<><div><dt>Plecare programată</dt><dd>{clock(chosen.scheduled_departure_seconds)}</dd></div><div><dt>{chosen.actual_departure_seconds==null?'Plecare estimată':'Plecare efectivă'}</dt><dd>{clock(chosen.actual_departure_seconds??chosen.estimated_departure_seconds)}</dd></div></>}</>:
              <><div><dt>Altitudine raportată</dt><dd>{chosen.position.altitude_m==null?'—':`${Math.round(chosen.position.altitude_m).toLocaleString('ro-RO')} m`}</dd></div><div><dt>Direcție</dt><dd>{chosen.position.heading==null?'—':`${Math.round(chosen.position.heading)}°`}</dd></div>{chosen.position_age_seconds!=null&&<div><dt>Vechime poziție</dt><dd>{Math.round(chosen.position_age_seconds)} s{chosen.stale?' · nereîmprospătată':''}</dd></div>}</>}
          </dl>
          {mode==='simulation'&&chosen.delay_minutes!=null&&chosen.delay_minutes>0&&<p className="ops-cause"><AlertTriangle size={14}/>{chosen.delay_basis==='actual'?'Întârziere măsurată la plecare.':'Estimare din deschiderea porții și timpul de pregătire.'}</p>}
          {mode==='simulation'&&<button className="ops-trace-button" onClick={()=>{setFilterEvents(true);document.getElementById('ops-event-log')?.scrollIntoView({behavior:'smooth',block:'start'})}}>Vezi firul evenimentelor<ArrowUpRight size={14}/></button>}
          {mode==='simulation'&&canControl&&<div className="ops-manual-actions">
            {gate&&<><label>Operator poartă<select aria-label="Operator poartă" value={staffId} onChange={event=>setStaffId(event.target.value)}>{data.staff.map(person=><option key={person.id} value={person.id}>{person.name}{person.present?'':' · absent'}</option>)}</select></label>
              <button disabled={busy} onClick={()=>void logEvent(gateOpen?'gate_close':'gate_open',{staff_id:staffId,gate_id:gate.id})}><DoorOpen size={15}/>{gateOpen?'Închide poarta':'Deschide poarta'}</button>{data.model?.notice&&<small className="ops-model-note">{data.model.notice}</small>}</>}
            <button className={chosen.emergency?'':'ops-danger-action'} disabled={busy} onClick={()=>void logEvent(chosen.emergency?'emergency_cleared':'emergency_declared',{flight_id:chosen.id})}><AlertTriangle size={14}/>{chosen.emergency?'Închide alerta':'Simulează urgență'}</button>
          </div>}
        </div>}
      </aside>
    </div>
    {mode==='simulation'&&<><div className="ops-playback"><div className="ops-playback-buttons"><button className="ops-play" disabled={busy||!canControl} onClick={()=>void control(data.simulation.running?'pause':'start',{speed:data.simulation.speed||30})}>
      {busy?<LoaderCircle size={17} className="spin"/>:data.simulation.running?<Pause size={17}/>:<Play size={17}/>}<span>{data.simulation.running?'Pauză':'Rulează'}</span></button>
      <button disabled={busy||!canControl} onClick={()=>void control('step')} title="Următorul eveniment"><SkipForward size={17}/><span>Următorul eveniment</span></button>
      <select aria-label="Viteza simulării" value={data.simulation.speed} disabled={busy||!canControl} onChange={event=>void control(data.simulation.running?'start':'pause',{speed:Number(event.target.value)})}>{[1,10,30,60,120].map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></div>
      <div className="ops-progress"><span>{eventTime(data.simulation.clock_time).slice(0,5)}</span><div role="progressbar" aria-label="Progres scenariu" aria-valuenow={Math.round(data.simulation.elapsed_seconds)} aria-valuemin={0} aria-valuemax={data.simulation.duration_seconds}><i style={{width:`${Math.min(100,data.simulation.elapsed_seconds/data.simulation.duration_seconds*100)}%`}}/></div><span>{clock(data.simulation.duration_seconds)}</span></div>
      <button className="ops-nfc-button" disabled={!canControl} onClick={()=>setShowNfc(value=>!value)}><CreditCard size={17}/>Pontaj NFC</button>
      <button className="ops-reset" disabled={!canControl||busy} onClick={()=>setConfirmReset(true)} aria-label="Reia scenariul" title="Reia scenariul"><RotateCcw size={16}/></button>
    </div>
    {confirmReset&&<div className="ops-reset-confirm" role="alert"><span>Reiei scenariul de la 08:00? Jurnalul rulării precedente rămâne păstrat.</span><button onClick={()=>void control('reset')} disabled={busy}>Reia scenariul</button><button onClick={()=>setConfirmReset(false)}>Anulează</button></div>}
    {showNfc&&<div className="ops-nfc-panel"><div><CreditCard size={24}/><h2>Pontaj prin card</h2><p>Simulează apropierea cardului. Fiecare intrare și ieșire ajunge în jurnal.</p></div>
      <div className="ops-staff-cards">{data.staff.map(person=><div className="ops-staff-card" key={person.id}><span className="ops-staff-avatar">{person.name.split(' ').map(word=>word[0]).slice(0,2).join('')}</span><span><strong>{person.name}</strong><small>{person.title} · {person.present?'prezent':'absent'}</small></span>
        <button disabled={busy} onClick={()=>void logEvent(person.present?'nfc_check_out':'nfc_check_in',{staff_id:person.id})}>{person.present?<X size={14}/>:<Check size={14}/>}<span>{person.present?'Ieșire':'Intrare'}</span></button></div>)}</div>
      <button className="ops-nfc-close" onClick={()=>setShowNfc(false)} aria-label="Închide pontajul"><X size={17}/></button></div>}
    </>}
    {mode==='simulation'&&<section className="ops-event-log" id="ops-event-log"><div className="ops-log-heading"><div><span className="eyebrow">EVENIMENTE, ÎN ORDINE</span><h2>Un fir clar al operațiunilor<span>{events.length}</span></h2></div>
      <button className={filterEvents?'active':''} onClick={()=>setFilterEvents(value=>!value)} disabled={!chosen}>{filterEvents?`Doar ${chosen?.callsign}`:'Toate evenimentele'}<ChevronRight size={14}/></button></div>
      <div className="ops-event-columns"><span>Ora scenariului</span><span>Eveniment</span><span>Persoană / sursă</span><span>Zbor / poartă</span></div>
      <div className="ops-events">{[...events].reverse().map(event=><EventRow key={event.id||event.sequence} event={event} person={data.staff.find(person=>person.id===event.staff_id)?.name} callsign={data.flights.find(flight=>flight.id===event.flight_id)?.callsign} onSelect={id=>{setSelected(id);setMode('simulation')}}/>)}
        {!events.length&&<div className="ops-event-empty">Apasă „Următorul eveniment” sau simulează un pontaj pentru a începe.</div>}</div>
      <div className="ops-log-footer"><span>Evenimente simulate · jurnal persistent · {data.airport.name}</span><span>1–{data.thresholds.major_delay_minutes-1} min: galben · ≥{data.thresholds.major_delay_minutes} min sau urgență: roșu</span></div>
    </section>}
  </section>;
}

function EventRow({event,onSelect,person,callsign}:{event:OperationEvent;person?:string;callsign?:string;onSelect:(id:string)=>void}) {
  const Icon=event.kind.includes('nfc')?CreditCard:event.kind.includes('gate')?DoorOpen:event.kind.includes('emergency')?AlertTriangle:Plane;
  return <div className={`ops-event-row ${event.kind.includes('emergency_declared')?'critical':''}`}><time>{eventTime(event.simulated_at)}<small>#{String(event.sequence).padStart(3,'0')}</small></time>
    <div className="ops-event-description"><span className="ops-event-icon"><Icon size={16}/></span><span><strong>{event.title}</strong><small>{event.detail}</small></span></div>
    <span className="ops-event-actor">{person||event.actor}<small>{event.source==='scenario'?'Scenariu':event.source==='operator'?'Acțiune în simulator':'Control simulare'}</small></span>
    <span className="ops-event-links">{event.flight_id?<button onClick={()=>onSelect(event.flight_id!)}>{callsign||event.flight_id}<ArrowUpRight size={12}/></button>:<span>—</span>}{event.gate_id&&<small>{event.gate_id}</small>}</span></div>;
}
