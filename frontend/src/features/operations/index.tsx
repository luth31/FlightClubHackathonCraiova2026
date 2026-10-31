import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpen,Check,ClipboardList,Clock3,CreditCard,DoorOpen,LoaderCircle,Map,Pause,Plane,Play,RotateCcw,SkipForward,Smartphone,Users} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading,Modal,ViewActiveContext} from '@/components/ui';
import {FlightMap} from './FlightMap';
import {OperationsLedger} from './Ledger';
import {Strategies} from './Strategies';
import {NfcStation} from './NfcStation';
import {clock,eventTime} from './format';
import type {LiveTraffic,MapConfig,OperationsData} from './types';
import './operations.css';
import './workspace.css';
type View='shift'|'ledger'|'strategies'|'station';
function viewFromHash():View {const view=new URLSearchParams(window.location.hash.split('?')[1]||'').get('view');return view==='ledger'||view==='strategies'||view==='station'?view:'shift'}

export function OperationsPage({notify}:{notify:(message:string)=>void}) {
  const viewActive=useContext(ViewActiveContext);
  const [visible,setVisible]=useState(!document.hidden),[view,setView]=useState<View>(viewFromHash);
  const [data,setData]=useState<OperationsData>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [mode,setMode]=useState<'simulation'|'live'>('simulation');
  const [mapMode,setMapMode]=useState<'model'|'photorealistic'>('model'),[mapConfig,setMapConfig]=useState<MapConfig>();
  const [traffic,setTraffic]=useState<LiveTraffic>(),[trafficError,setTrafficError]=useState('');
  const [selected,setSelected]=useState<string|null>('flight-101'),[focusLedger,setFocusLedger]=useState<string|null>(null);
  const [showNfc,setShowNfc]=useState(false),[confirmReset,setConfirmReset]=useState(false);
  const [resetMode,setResetMode]=useState<'interactive'|'replay'>('interactive');
  const dataRef=useRef<OperationsData|undefined>(undefined),pending=useRef(false);
  const active=viewActive&&visible;
  const accept=useCallback((value:OperationsData)=>{if(dataRef.current?.simulation.run_id===value.simulation.run_id&&value.simulation.revision<dataRef.current.simulation.revision)return;dataRef.current=value;setData(value);setError('')},[]);
  useEffect(()=>{const change=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',change);const route=()=>{if(window.location.hash.startsWith('#operations'))setView(current=>window.location.hash.includes('view=')?viewFromHash():current==='station'?'shift':current)};window.addEventListener('hashchange',route);return()=>{document.removeEventListener('visibilitychange',change);window.removeEventListener('hashchange',route)}},[]);
  useEffect(()=>{let disposed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){try{const value=await api<OperationsData>('/operations',{signal:controller.signal});if(!disposed)accept(value)}catch(e){if(!disposed)setError((e as Error).message)}if(!disposed)timer=setTimeout(poll,dataRef.current?.simulation.running?1000:2500)}
    if(active)void poll();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[active,accept]);
  useEffect(()=>{const controller=new AbortController();let disposed=false;api<MapConfig>('/operations/map-config',{signal:controller.signal}).then(value=>{if(!disposed){setMapConfig(value);setMapMode(value.default_mode)}}).catch(()=>{});return()=>{disposed=true;controller.abort()}},[]);
  useEffect(()=>{if(mode!=='live'||!active||view!=='shift')return;let disposed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){let interval=30;try{const result=await api<LiveTraffic>('/operations/traffic',{signal:controller.signal});if(!disposed){setTraffic(result);setTrafficError('');interval=Math.max(15,result.poll_after_seconds)}}catch(e){if(!disposed)setTrafficError((e as Error).message)}if(!disposed)timer=setTimeout(poll,interval*1000)}void poll();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[mode,active,view]);
  function navigate(next:View){setView(next);setShowNfc(false);const hash=`#operations${next==='shift'?'':`?view=${next}`}`;window.history.replaceState(window.history.state,'',hash)}
  async function mutate(path:string,body:Record<string,unknown>):Promise<OperationsData|null>{if(pending.current)return null;pending.current=true;setBusy(true);try{const next=await api<OperationsData>(path,{method:'POST',body:JSON.stringify(body)});accept(next);return next}catch(e){notify((e as Error).message);return null}finally{pending.current=false;setBusy(false)}}
  async function control(action:string,extra:Record<string,unknown>={}){const next=await mutate('/operations/control',{action,...extra});if(next)setConfirmReset(false)}
  async function logEvent(kind:string,extra:Record<string,unknown>={}){if(await mutate('/operations/events',{kind,...extra,request_id:crypto.randomUUID()}))notify('Acțiune înregistrată. Planul și indicatorii au fost actualizați.')}
  async function scan(card_id:string,action:'check_in'|'check_out'){return mutate('/operations/nfc',{card_id,action,request_id:crypto.randomUUID()})}
  function investigate(id:string){setFocusLedger(id);navigate('ledger')}
  if(!data)return error?<ErrorMessage message={error}/>:<Loading/>;
  const isInteractive=data.simulation.scenario_mode!=='replay';
  const staff=data.staff.filter(person=>person.present),gateCount=data.gates.filter(gate=>gate.open||gate.is_open).length;
  const risks=data.flights.filter(flight=>flight.direction==='departure'&&flight.actual_departure_seconds==null&&flight.severity!=='neutral').length;
  const actualDelay=data.flights.filter(flight=>flight.actual_departure_seconds!=null).reduce((sum,flight)=>sum+(flight.delay_minutes||0),0);
  const chosen=data.flights.find(flight=>flight.id===selected)||data.flights[0];
  const gate=data.gates.find(item=>item.id===chosen?.gate_id),assigned=data.staff.find(person=>person.id===gate?.assigned_staff_id),openedBy=data.staff.find(person=>person.id===gate?.opened_by);
  return <section className={`operations-page ${view==='station'&&viewActive?'ops-station-mode':''}`}>
    {view==='station'&&<>{error&&<ErrorMessage message={error}/>}<NfcStation data={data} busy={busy} onScan={scan} onBack={()=>navigate('shift')}/></>}
    <div hidden={view==='station'} inert={view==='station'}>
    <header className="ops-heading"><div><div className="eyebrow">{data.airport.icao} · OPERAȚIUNI CONECTATE</div><h1>O tură, văzută în întregime<span>.</span></h1><p>De la prima alocare până la ultima plecare.</p></div><div className="ops-heading-actions"><button className="ops-phone-link" onClick={()=>navigate('station')}><Smartphone size={16}/>Stație mobilă</button><div className="ops-clock"><Clock3 size={17}/><div><strong>{eventTime(data.simulation.clock_time)}</strong><span>Ora turei · {isInteractive?'interactivă':'replay'}</span></div></div></div></header>
    <nav className="ops-tabs" aria-label="Vizualizări operaționale">{([{id:'shift',label:'Tura curentă',icon:Map},{id:'ledger',label:'Registru operațional',icon:ClipboardList},{id:'strategies',label:'Proceduri & îmbunătățiri',icon:BookOpen}] as const).map(tab=><button key={tab.id} className={view===tab.id?'active':''} aria-current={view===tab.id?'page':undefined} onClick={()=>{setFocusLedger(null);navigate(tab.id)}}><tab.icon size={17}/>{tab.label}</button>)}<span className="ops-demo-indicator"><i/>Spațiu demonstrativ</span></nav>
    {error&&<div className="ops-inline-error" role="alert">{error} Ultima stare este păstrată.</div>}
    {view==='ledger'&&<OperationsLedger revision={data.simulation.revision} focusFlight={focusLedger} onInvestigate={id=>{setSelected(id);navigate('shift')}}/>}
    {view==='strategies'&&<Strategies revision={data.simulation.revision} onEvidence={investigate} notify={notify}/>}
    <div hidden={view!=='shift'} inert={view!=='shift'}>
      <div className="ops-shift-metrics"><div><span><Plane size={15}/>Plecări la timp</span><strong>{data.kpis.on_time_percent==null?'—':`${data.kpis.on_time_percent}%`}</strong><small>{data.kpis.on_time_percent==null?'Nicio plecare încheiată încă':'Din plecările încheiate în tură'}</small></div><div><span><Clock3 size={15}/>Întârziere realizată</span><strong className={actualDelay?'ops-tone-amber':''}>{Math.round(actualDelay)}<small> min</small></strong><small>{risks?`${risks} zboruri necesită intervenție`:'Fără întârzieri deschise'}</small></div><div><span><Users size={15}/>Echipă prezentă</span><strong>{staff.length}<small> / {data.staff.length}</small></strong><small>Confirmată prin pontaj</small></div><div><span><DoorOpen size={15}/>Porți deschise</span><strong>{gateCount}<small> / {data.gates.filter(gate=>gate.assigned_staff_id).length}</small></strong><small>Acțiuni înregistrate de operatori</small></div></div>
      <section className="ops-shift-control"><div className="ops-control-title"><span className={`ops-run-dot ${data.simulation.running?'running':''}`}/><div><strong>{isInteractive?'Tu conduci tura':'Replay de repetiție'}</strong><small>{isInteractive?'Cardurile și porțile așteaptă acțiunile echipei.':'Pontajele și deschiderile sunt redate automat.'}</small></div></div><div className="ops-control-actions"><button className="ops-primary" disabled={busy||!data.permissions.can_control} onClick={()=>void control(data.simulation.running?'pause':'start',{speed:data.simulation.speed||1})}>{busy?<LoaderCircle size={16} className="spin"/>:data.simulation.running?<Pause size={16}/>:<Play size={16}/>} {data.simulation.running?'Pauză':'Rulează timpul'}</button><select aria-label="Viteza simulării" value={data.simulation.speed} disabled={busy||!data.permissions.can_control} onChange={event=>void control(data.simulation.running?'start':'pause',{speed:Number(event.target.value)})}>{[1,10,30,60,120].map(speed=><option value={speed} key={speed}>{speed}×</option>)}</select><button disabled={busy||!data.permissions.can_control} onClick={()=>void control('step')}><SkipForward size={16}/>Următorul eveniment</button><button className="ops-primary-light" disabled={!data.permissions.can_control} onClick={()=>setShowNfc(true)}><CreditCard size={16}/>Pontaj NFC</button><button aria-label="Reia scenariul" disabled={busy||!data.permissions.can_control} onClick={()=>setConfirmReset(true)}><RotateCcw size={16}/></button></div>
        <div className="ops-milestones"><span>Salt la:</span>{[{at:240,label:'08:04 · poartă'},{at:1200,label:'08:20 · plecare planificată'},{at:1320,label:'08:22 · intervenție'},{at:2700,label:'08:45 · rezultat'}].map(item=><button key={item.at} disabled={busy||!data.permissions.can_control||data.simulation.elapsed_seconds>=item.at} onClick={()=>void control('advance_to',{target_seconds:item.at})}>{item.label}</button>)}</div>
      </section>
      {chosen&&mode==='simulation'&&chosen.direction!=='arrival'&&<section className={`ops-causal-chain severity-${chosen.severity}`} aria-label="Cauza și efectul operațional"><div className="ops-chain-heading"><strong>{chosen.callsign} <span>→ {chosen.destination}</span></strong><button onClick={()=>investigate(chosen.id)}>Urmărește dovezile<ArrowRight size={14}/></button></div><div className="ops-chain-steps"><div className={assigned?.present?'complete':'waiting'}><span><CreditCard size={17}/></span><div><small>1. PREZENȚA ECHIPEI</small><strong>{assigned?.name||'Echipă alocată'}</strong><p>{assigned?.present?`Pontaj la ${clock(assigned.actual_arrival_seconds)}`:`Așteptat la ${clock(assigned?.expected_seconds)} · fără pontaj`}</p></div></div><Chevron/><div className={gate?.open?'complete':'waiting'}><span><DoorOpen size={17}/></span><div><small>2. DESCHIDEREA PORȚII</small><strong>{gate?.id} · {gate?.open?`deschisă la ${clock(gate.opened_at_seconds)}`:`planificată ${clock(gate?.planned_open_seconds)}`}</strong><p>{openedBy?`De ${openedBy.name}${openedBy.id!==assigned?.id?' · înlocuitor':''}`:'Un operator prezent trebuie să deschidă poarta.'}</p></div></div><Chevron/><div className={chosen.actual_departure_seconds!=null?'complete':'waiting'}><span><Plane size={17}/></span><div><small>3. PLECAREA DE LA STAND</small><strong>{clock(chosen.actual_departure_seconds??chosen.estimated_departure_seconds)} <em>{chosen.actual_departure_seconds!=null?'realizat':'estimat'}</em></strong><p>Plan: {clock(chosen.scheduled_departure_seconds)}{chosen.delay_minutes?` · +${Math.round(chosen.delay_minutes)} min`:''}</p></div></div></div></section>}
      <FlightMap data={data} mode={mode} onMode={next=>{setMode(next);setSelected(next==='simulation'?'flight-101':null)}} mapConfig={mapConfig} mapMode={mapMode} onMapMode={setMapMode} traffic={traffic} trafficError={trafficError} selected={selected} onSelect={setSelected} active={active&&view==='shift'} busy={busy} onEvent={(kind,extra)=>void logEvent(kind,extra)} onInvestigate={investigate} notify={notify}/>
      <div className="ops-shift-footer"><span><Check size={15}/>Fiecare pontaj și acțiune rămâne în registru.</span><button onClick={()=>navigate('ledger')}>Deschide registrul operațional<ArrowRight size={15}/></button></div>
    </div>
    {showNfc&&<Modal title="Pontaj NFC" onClose={()=>setShowNfc(false)} className="ops-nfc-modal"><NfcStation data={data} busy={busy} onScan={scan} onBack={()=>setShowNfc(false)}/></Modal>}
    {confirmReset&&<Modal title="O nouă repetiție" onClose={()=>setConfirmReset(false)}><div className="ops-reset-body"><p>Tura începe din nou la 08:00. Evenimentele precedente rămân păstrate în istoric.</p><label><input type="radio" name="scenario" checked={resetMode==='interactive'} onChange={()=>setResetMode('interactive')}/><span><strong>Interactivă</strong><small>Scanați cardurile și deschideți porțile pe scenă.</small></span></label><label><input type="radio" name="scenario" checked={resetMode==='replay'} onChange={()=>setResetMode('replay')}/><span><strong>Replay automat</strong><small>O repetiție completă, cu evenimente automate.</small></span></label><button className="ops-primary" disabled={busy} onClick={()=>void control('reset',{scenario_mode:resetMode})}><RotateCcw size={16}/>Începe o tură nouă</button></div></Modal>}
    </div>
  </section>;
}
function Chevron(){return <ArrowRight className="ops-chain-arrow" size={18}/>}
