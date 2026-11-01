import {AlertTriangle,ArrowUpRight,Clock3,DoorOpen,Expand,Focus,LockKeyhole,Layers3,Plane,Play,Radio} from 'lucide-react';
import {useEffect,useMemo,useRef,useState} from 'react';
import {AirportScene} from './AirportScene';
import type {AirportSceneProps,SceneFlight} from './scene-types';
import type {Flight,LiveTraffic,MapConfig,OperationsData} from './types';
import {clock} from './format';
const phases:Record<string,string>={at_gate:'La stand',parked:'La stand',boarding:'Îmbarcare',waiting:'În așteptare',waiting_gate:'Poarta este închisă',blocked:'Așteaptă echipa',taxiing:'Rulare spre pistă',takeoff:'Decolare',departed:'Plecat de la stand',airborne:'În aer',approach:'Apropiere',landing:'Aterizare',arrived:'Sosit',scheduled:'Programat',ready:'Pregătit'};
// At most two scenes per airport, created on first use and disposed with the page.
// Keeping a hidden style mounted preserves its camera, tile cache and Google session.
function SceneSlot(props:AirportSceneProps){
  const [visited,setVisited]=useState(Boolean(props.active));
  useEffect(()=>{if(props.active)setVisited(true)},[props.active]);
  return <div className="ops-scene-slot" hidden={!props.active} inert={!props.active}>
    {(visited||props.active)&&<AirportScene {...props}/>}
  </div>;
}
export function FlightMap({data,mode,onMode,mapConfig,mapMode,onMapMode,traffic,trafficError,selected,onSelect,active,animateFlights=true,simulationSpeed,onTrackingChange,busy,onEvent,onInvestigate,notify}:{
  data:OperationsData;mode:'simulation'|'live';onMode:(mode:'simulation'|'live')=>void;mapConfig?:MapConfig;mapMode:'model'|'photorealistic';onMapMode:(mode:'model'|'photorealistic')=>void;
  traffic?:LiveTraffic;trafficError:string;selected:string|null;onSelect:(id:string)=>void;active:boolean;animateFlights?:boolean;simulationSpeed?:number;onTrackingChange?:(tracking:boolean)=>void;busy:boolean;onEvent:(kind:string,extra:Record<string,unknown>)=>void;onInvestigate:(id:string)=>void;notify:(message:string)=>void;
}) {
  const [operator,setOperator]=useState('');
  const [follow,setFollow]=useState<{context:string;id:string}|null>(null);
  const sceneRef=useRef<HTMLDivElement>(null);
  const flights=useMemo(()=>mode==='live'?traffic?.aircraft||[]:data.flights,[mode,traffic?.aircraft,data.flights]);
  const chosen=flights.find(flight=>flight.id===selected)||flights[0];
  const followContext=`${data.airport.id}:${mode}`;
  const followId=follow?.context===followContext&&flights.some(f=>f.id===follow.id)?follow.id:null;
  if(follow&&!followId)setFollow(null);
  const changeFollow=(id:string|null)=>setFollow(id?{context:followContext,id}:null);
  const selectFlight=(id:string)=>{if(followId)changeFollow(id);onSelect(id)};
  useEffect(()=>{onTrackingChange?.(mode==='live'&&!!followId)},[followId,mode,onTrackingChange]);
  const gate=data.gates.find(item=>item.id===chosen?.gate_id);
  const gateOpen=gate?.open||gate?.is_open;
  const present=data.staff.filter(person=>person.present&&!person.automatic);
  const staffId=present.some(person=>person.id===operator)?operator:present.find(person=>person.id===gate?.assigned_staff_id)?.id||present[0]?.id||'';
  const sceneFlights:SceneFlight[]=useMemo(()=>flights.filter(flight=>flight.position.altitude_m!=null).map(flight=>({id:flight.id,callsign:flight.callsign,...flight.position,trajectory:mode==='simulation'?flight.trajectory:undefined,
    altitude_m:Math.max(0,(flight.position.altitude_m??data.airport.elevation_m)-data.airport.elevation_m),reported_altitude_m:flight.position.altitude_m??undefined,altitude_reference:flight.altitude_reference,ground:flight.ground,observed_at_ms:flight.observed_at?Date.parse(flight.observed_at):undefined,
    display_scale:mode==='simulation'?data.model?.aircraft_display_scale??1:1,heading:flight.position.heading??0,status:flight.severity==='red'?'critical':flight.severity==='yellow'?'caution':'neutral',source:mode==='live'?'live':'simulation'})),[flights,data.airport.elevation_m,data.model?.aircraft_display_scale,mode]);
  const canFollow=sceneFlights.some(flight=>flight.id===chosen?.id&&Number.isFinite(flight.lat)&&Number.isFinite(flight.lon));
  const isFollowing=Boolean(chosen&&followId===chosen.id);
  const label=(flight:Flight)=>flight.emergency?'Alerte':flight.delay_minutes==null?mode==='live'?'Fără orar':'În așteptare':flight.delay_minutes>0?`+${Math.round(flight.delay_minutes)} min`:flight.actual_departure_seconds!=null?'La timp':'În grafic';
  const fullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void sceneRef.current?.requestFullscreen().catch(()=>notify('Vizualizarea pe tot ecranul nu este disponibilă.'))};
  return <div className="ops-workspace">
    <div className="ops-map-area" ref={sceneRef}>
      <div className="ops-map-toolbar"><div className="ops-segment" aria-label="Sursa traficului"><button className={mode==='simulation'?'active':''} onClick={()=>onMode('simulation')}><Play size={13}/>Simulare</button><button className={mode==='live'?'active':''} onClick={()=>onMode('live')}><Radio size={13}/>Trafic ADS-B</button></div><div className="ops-map-style"><label><Layers3 size={15}/><select aria-label="Stil hartă" value={mapMode} onChange={event=>onMapMode(event.target.value as 'model'|'photorealistic')}><option value="model">Model 3D</option><option value="photorealistic" disabled={!mapConfig?.photorealistic_available}>Fotorealist</option></select></label><button title="Tot ecranul" aria-label="Tot ecranul" onClick={fullscreen}><Expand size={16}/></button></div></div>
      {(['model','photorealistic'] as const).map(style=><SceneSlot key={`${data.airport.id}-${style}`} airportId={data.airport.id} flights={sceneFlights} selectedFlightId={chosen?.id||null} followFlightId={followId} onFollowChange={changeFollow} onSelectFlight={id=>{if(id)selectFlight(id)}} active={active&&mapMode===style} animateFlights={animateFlights} simulationClock={mode==='simulation'?{runId:data.simulation.run_id,seconds:data.simulation.elapsed_seconds,speed:simulationSpeed??data.simulation.speed,playing:animateFlights}:undefined} trafficMode={mode==='live'} googleApiKey={style==='photorealistic'?mapConfig?.google_api_key||undefined:undefined} mapMode={style} onMapModeChange={onMapMode}/>)}
      <div className="ops-scene-caption"><span>{data.airport.name}</span><small>{mode==='live'?'Poziții recepționate · altitudinea raportată de aeronavă':'Tură demonstrativă'}</small></div><div className="ops-legend"><span><i/>Fără alertă</span>{mode==='simulation'&&<span><i className="yellow"/>1–14 min</span>}<span><i className="red"/>{mode==='simulation'?'≥15 min / incident':'Alertă raportată'}</span></div>
    </div>
    <aside className="ops-flight-panel"><div className="ops-panel-heading"><div><h2>{mode==='live'?'Trafic în raza aeroportului':'Zborurile turei'}</h2><span>{flights.length} aeronave · {mode==='live'?'25 mile nautice':'plecări și sosiri'}</span></div><Plane size={18}/></div>
      {mode==='live'&&<div className={`ops-feed-note ${traffic?.status!=='fresh'?'stale':''}`}><Radio size={14}/><span>{trafficError||traffic?.notice||'Se verifică traficul…'}<small>Redare cu tampon de 15 s · actualizare la 10 s. Detaliile arată ultima observație primită. Fără orar comercial asociat. <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a></small></span></div>}
      <div className="ops-flight-list" aria-label="Lista aeronavelor">{flights.map(flight=><button key={flight.id} className={`ops-flight ${chosen?.id===flight.id?'selected':''}`} onClick={()=>selectFlight(flight.id)}><span className={`ops-aircraft-icon ${flight.severity}`}><Plane size={18}/></span><span className="ops-flight-main"><strong>{flight.callsign}</strong><small>{mode==='live'?`${flight.aircraft_type||'Aeronavă'}${flight.distance_nm!=null?` · ${flight.distance_nm.toFixed(1)} NM`:''}`:flight.destination?`→ ${flight.destination}`:`← ${flight.origin}`}</small></span><span className={`ops-flight-status ${flight.severity}`}>{label(flight)}</span></button>)}{!flights.length&&<div className="ops-no-aircraft"><Plane size={25}/><strong>{traffic?.status==='fresh'?'Nicio aeronavă raportată în rază':'Poziții indisponibile momentan'}</strong><span>{traffic?.status==='fresh'?'Harta rămâne centrată pe aeroport.':'Ultima stare a fluxului este afișată mai sus.'}</span></div>}</div>
      {chosen&&<div className="ops-flight-detail"><div className="ops-selected-heading"><span>ÎN DETALIU</span><button className="ops-follow-button" disabled={!canFollow} aria-pressed={isFollowing} aria-label={isFollowing?`Oprește urmărirea ${chosen.callsign}`:`Urmărește ${chosen.callsign}`} title={canFollow?undefined:'Poziția aeronavei nu este disponibilă pe hartă'} onClick={()=>changeFollow(isFollowing?null:chosen.id)}>{isFollowing?<LockKeyhole size={14}/>:<Focus size={14}/>}<span>{isFollowing?'Urmărire activă':'Urmărește'}</span></button></div><h3>{chosen.callsign}<small>{chosen.aircraft_type}</small></h3><dl><div><dt>Stare</dt><dd>{phases[chosen.phase]||phases[chosen.status||'']||chosen.phase||'Poziție recepționată'}</dd></div>
      {mode==='simulation'?<><div><dt>Poartă</dt><dd>{chosen.gate_id||'—'}{gate&&` · ${gateOpen?'deschisă':'închisă'}`}</dd></div>{chosen.direction==='arrival'?<div><dt>Sosire programată</dt><dd>{clock(chosen.scheduled_arrival_seconds)}</dd></div>:<><div><dt>Plecare de la stand</dt><dd>{clock(chosen.scheduled_departure_seconds)} planificat</dd></div><div><dt>{chosen.actual_departure_seconds==null?'Plecare estimată':'Plecare efectivă'}</dt><dd>{clock(chosen.actual_departure_seconds??chosen.estimated_departure_seconds)}</dd></div>{chosen.boarding_remaining_seconds!=null&&<div><dt>Îmbarcare rămasă</dt><dd>{Math.ceil(chosen.boarding_remaining_seconds/60)} min</dd></div>}</>}</>:<><div><dt>Altitudine raportată</dt><dd>{chosen.position.altitude_m==null?'Necunoscută':`${Math.round(chosen.position.altitude_m).toLocaleString('ro-RO')} m`}</dd></div><div><dt>Vechime poziție</dt><dd>{Math.round(chosen.position_age_seconds||0)} s{chosen.stale?' · nereîmprospătată':''}</dd></div><div><dt>Direcție</dt><dd>{chosen.position.heading==null?'—':`${Math.round(chosen.position.heading)}°`}</dd></div></>}
      </dl>{mode==='simulation'&&<><button className="ops-trace-button" onClick={()=>onInvestigate(chosen.id)}>Vezi firul evenimentelor<ArrowUpRight size={14}/></button>{data.permissions.can_control&&!chosen.automatic&&gate&&chosen.direction!=='arrival'&&chosen.actual_departure_seconds==null&&<div className="ops-manual-actions"><label>Operator prezent<select aria-label="Operator poartă" value={staffId} onChange={event=>setOperator(event.target.value)}>{!present.length&&<option value="">Așteaptă un pontaj</option>}{present.map(person=><option key={person.id} value={person.id}>{person.name}{person.id===gate.assigned_staff_id?' · alocat':' · înlocuitor'}</option>)}</select></label><button disabled={busy||!staffId} onClick={()=>onEvent(gateOpen?'gate_close':'gate_open',{staff_id:staffId,gate_id:gate.id})}><DoorOpen size={15}/>{gateOpen?'Închide poarta':'Deschide poarta'}</button>{!present.length&&<small>Pontează un coleg pentru a deschide poarta.</small>}</div>}</>}
      {mode==='simulation'&&chosen.automatic&&<p className="ops-model-note">Zbor de rutină · gestionat automat</p>}
      {mode==='simulation'&&chosen.delay_minutes!=null&&chosen.delay_minutes>0&&<p className="ops-cause"><AlertTriangle size={14}/>{chosen.delay_basis==='actual'?'Întârziere înregistrată':'Estimare la ritmul actual al îmbarcării'}</p>}
      {mode==='live'&&<p className="ops-model-note"><Clock3 size={12}/>Poziții ADS-B recepționate</p>}</div>}
    </aside>
  </div>;
}
