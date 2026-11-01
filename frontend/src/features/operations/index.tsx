import {t,useLanguage} from '@/i18n';
import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {AlertTriangle,ArrowLeft,ArrowRight,BookOpen,ClipboardList,Clock3,LoaderCircle,Map,Pause,Play,RotateCcw,SkipForward,X} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading,ViewActiveContext} from '@/components/ui';
import {FlightMap} from './FlightMap';
import {SimulationTimeline,useSimulationTimeline} from './SimulationTimeline';
import {OperationsLedger} from './Ledger';
import {Strategies} from './Strategies';
import {eventTime} from './format';
import type {LedgerEvidenceTarget,LiveTraffic,MapConfig,OperationsData} from './types';
import './operations.css';
import './workspace.css';
import './ledger.css';
import './procedures.css';
import './compact.css';

type View='shift'|'ledger'|'strategies';
function viewFromHash():View {const view=new URLSearchParams(window.location.hash.split('?')[1]||'').get('view');return view==='ledger'||view==='strategies'?view:'shift'}
function evidenceFromHash():LedgerEvidenceTarget|undefined {const params=new URLSearchParams(location.hash.split('?')[1]||'');const eventId=params.get('event'),groupId=params.get('group');return location.hash.startsWith('#operations')&&eventId&&groupId?{eventId,groupId}:undefined}
function returnFromHash(){const value=new URLSearchParams(location.hash.split('?')[1]||'').get('returnTo');return value?.startsWith('#reports?')?value:undefined}
const presets=[{id:'normal',name:'Tură normală',description:'Echipa este pregătită. Ambele plecări sunt la timp.'},{id:'delayed',name:'Poartă deschisă târziu',description:'FL101 pleacă cu 18 minute întârziere.'},{id:'recovery',name:'Înlocuire rapidă',description:'Intervenția rezervei limitează întârzierea la 3 minute.'}];

export function OperationsPage({notify}:{notify:(message:string)=>void}) {
  useLanguage();
  const viewActive=useContext(ViewActiveContext);
  const [visible,setVisible]=useState(!document.hidden),[view,setView]=useState<View>(viewFromHash);
  const [liveData,setData]=useState<OperationsData>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [mode,setMode]=useState<'simulation'|'live'>('simulation');
  const [mapMode,setMapMode]=useState<'model'|'photorealistic'>('model'),[mapConfig,setMapConfig]=useState<MapConfig>();
  const [traffic,setTraffic]=useState<LiveTraffic>(),[trafficError,setTrafficError]=useState('');
  const [selected,setSelected]=useState<string|null>('flight-101'),[focusLedger,setFocusLedger]=useState<string|null>(()=>evidenceFromHash()?.groupId||null);
  const [evidence,setEvidence]=useState<LedgerEvidenceTarget|undefined>(evidenceFromHash);
  const [reportReturn,setReportReturn]=useState(returnFromHash);
  const [alert,setAlert]=useState<{runId:string;id:string;text:string}>();
  const announced=useRef(new Set<string>()),dataRef=useRef<OperationsData|undefined>(undefined),pending=useRef(false);
  const active=viewActive&&visible;
  const timeline=useSimulationTimeline(liveData,active&&view==='shift'&&mode==='simulation');
  const previewing=timeline.previewing&&mode==='simulation';
  const data=previewing&&timeline.frame?timeline.frame:liveData;
  const accept=useCallback((value:OperationsData)=>{if(dataRef.current&&value.simulation.revision<dataRef.current.simulation.revision)return;dataRef.current=value;setData(value);setError('')},[]);
  useEffect(()=>{const change=()=>setVisible(!document.hidden);const route=()=>{if(window.location.hash.startsWith('#operations')){setView(viewFromHash());const target=evidenceFromHash();setEvidence(target);setFocusLedger(target?.groupId||null);setReportReturn(returnFromHash())}};document.addEventListener('visibilitychange',change);window.addEventListener('hashchange',route);return()=>{document.removeEventListener('visibilitychange',change);window.removeEventListener('hashchange',route)}},[]);
  useEffect(()=>{let disposed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){try{const value=await api<OperationsData>('/operations',{signal:controller.signal});if(!disposed)accept(value)}catch(e){if(!disposed)setError((e as Error).message)}if(!disposed)timer=setTimeout(poll,dataRef.current?.simulation.running?1000:2500)}
    if(active)void poll();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[active,accept]);
  useEffect(()=>{const controller=new AbortController();let disposed=false;api<MapConfig>('/operations/map-config',{signal:controller.signal}).then(value=>{if(!disposed){setMapConfig(value);setMapMode(value.default_mode)}}).catch(()=>{});return()=>{disposed=true;controller.abort()}},[]);
  useEffect(()=>{if(mode!=='live'||!active||view!=='shift')return;let disposed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){let interval=10;try{const result=await api<LiveTraffic>('/operations/traffic',{signal:controller.signal});if(!disposed){setTraffic(result);setTrafficError('');interval=Math.max(10,result.poll_after_seconds)}}catch(e){if(!disposed)setTrafficError((e as Error).message)}if(!disposed)timer=setTimeout(poll,interval*1000)}void poll();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[mode,active,view]);
  useEffect(()=>{
    if(!active||mode!=='simulation'||!data)return;
    for(const flight of data.flights){
      const key=`${data.simulation.run_id}:${flight.id}`;
      if(flight.severity!=='red'||announced.current.has(key))continue;
      announced.current.add(key);
      const text=flight.emergency?`${flight.callsign}: incident raportat. Consultă registrul pentru detalii.`:`${flight.callsign}: întârziere ${flight.actual_departure_seconds==null?'estimată':'înregistrată'} de ${Math.round(flight.delay_minutes||0)} minute. Consultă registrul pentru detalii.`;
      setAlert({runId:data.simulation.run_id,id:flight.id,text});notify(text);
    }
  },[active,mode,data,notify]);
  function navigate(next:View){setView(next);window.history.replaceState(window.history.state,'',`#operations${next==='shift'?'':`?view=${next}`}`)}
  async function control(action:string,extra:Record<string,unknown>={}){
    if(pending.current)return false;pending.current=true;setBusy(true);
    try{const next=await api<OperationsData>('/operations/control',{method:'POST',body:JSON.stringify({action,...extra})});accept(next);return true}catch(e){notify((e as Error).message);return false}finally{pending.current=false;setBusy(false)}
  }
  async function recordEvent(kind:string,extra:Record<string,unknown>){
    if(pending.current||previewing||liveData?.simulation.scenario_mode!=='interactive'||!liveData.permissions.can_control)return;
    pending.current=true;setBusy(true);
    try{accept(await api<OperationsData>('/operations/events',{method:'POST',body:JSON.stringify({kind,...extra,request_id:crypto.randomUUID(),expected_revision:liveData.simulation.revision})}))}
    catch(e){notify((e as Error).message)}finally{pending.current=false;setBusy(false)}
  }
  async function chooseScenario(id:string){if(await control('reset',{scenario_mode:id,expected_revision:liveData?.simulation.revision})){setMode('simulation');setSelected('flight-101');setFocusLedger(null);setEvidence(undefined);setAlert(undefined)}}
  function investigate(id:string){setEvidence(undefined);setFocusLedger(id);navigate('ledger')}
  function openEvidence(target:LedgerEvidenceTarget){setReportReturn(undefined);setEvidence(target);setFocusLedger(target.groupId);navigate('ledger')}
  function seek(seconds:number){timeline.seek(seconds);if(dataRef.current?.simulation.running&&!pending.current&&dataRef.current.permissions.can_control)void control('pause')}
  function togglePlayback(){if(timeline.previewing||!liveData?.permissions.can_control||liveData.simulation.elapsed_seconds>=liveData.simulation.duration_seconds)timeline.togglePlayback();else void control(liveData.simulation.running?'pause':'start',{speed:liveData.simulation.speed||30})}
  async function applyTime(){if(await control('advance_to',{target_seconds:timeline.seconds,expected_revision:liveData?.simulation.revision}))timeline.reset()}
  if(!data||!liveData)return error?<ErrorMessage message={error}/>:<Loading/>;
  const manual=liveData.simulation.scenario_mode==='interactive';
  const scenarios=manual?[...(data.scenarios||presets),{id:'interactive',name:'Tură cu pontaj',description:'Prezența și deschiderea porții sunt înregistrate de echipă.'}]:data.scenarios||presets;
  const scenario=scenarios.find(item=>item.id===liveData.simulation.scenario_mode);
  const playbackMode=previewing||!liveData.permissions.can_control||liveData.simulation.elapsed_seconds>=liveData.simulation.duration_seconds;
  const playing=playbackMode?timeline.playing:liveData.simulation.running;
  const atEnd=timeline.seconds>=liveData.simulation.duration_seconds;
  const delay=data.flights.filter(flight=>flight.actual_departure_seconds!=null).reduce((sum,flight)=>sum+(flight.delay_minutes||0),0);
  const severe=data.flights.filter(flight=>flight.severity==='red').length;
  return <section className="operations-page ops-compact">
    <header className="ops-heading"><h1>{t("Operațiuni de sol")}</h1><div className="ops-clock"><Clock3 size={17}/><strong>{eventTime(data.simulation.clock_time)}</strong></div></header>
    <div className="ops-scenario-bar"><label>{t("Scenariu")}<select aria-label={t("Scenariu operațional")} value={scenario?.id||''} disabled={busy||!liveData.permissions.can_control} onChange={event=>void chooseScenario(event.target.value)}><option value="" disabled>{t("Alege un scenariu")}</option>{scenarios.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p>{scenario?.description||t("Alege unul dintre cele trei scenarii automate.")}</p></div>
    <nav className="ops-tabs" aria-label={t("Vizualizări operaționale")}>{([{id:'shift',label:'Tura curentă',icon:Map},{id:'ledger',label:'Registru',icon:ClipboardList},{id:'strategies',label:'Proceduri SOP',icon:BookOpen}] as const).map(tab=><button key={tab.id} className={view===tab.id?'active':''} aria-current={view===tab.id?'page':undefined} onClick={()=>{setFocusLedger(null);setEvidence(undefined);navigate(tab.id)}}><tab.icon size={16}/>{t(tab.label)}</button>)}</nav>
    {error&&<div className="ops-inline-error" role="alert">{error}</div>}
    {alert&&alert.runId===data.simulation.run_id&&<div className="ops-critical-alert" role="alert"><AlertTriangle size={20}/><p>{alert.text}</p><button onClick={()=>investigate(alert.id)}>{t("Vezi registrul")}<ArrowRight size={15}/></button><button aria-label={t("Închide alerta")} onClick={()=>setAlert(undefined)}><X size={17}/></button></div>}
    {view==='ledger'&&evidence&&<button className="ops-evidence-return" onClick={()=>{if(reportReturn)location.hash=reportReturn;else navigate('strategies')}}><ArrowLeft size={16}/>{reportReturn?t("Înapoi la raportul operațional"):t("Înapoi la dovezile din registru")}</button>}
    {view==='ledger'&&<OperationsLedger key={evidence?`${evidence.groupId}:${evidence.eventId}`:data.simulation.run_id} evidence={evidence} revision={data.simulation.revision} runId={data.simulation.run_id} atSeconds={previewing?timeline.seconds:undefined} scenarioName={scenario?.name} focusFlight={focusLedger} onInvestigate={id=>{setSelected(id);navigate('shift')}}/>}
    {(view==='strategies'||(evidence&&!reportReturn))&&<div hidden={view!=='strategies'} inert={view!=='strategies'}><Strategies revision={data.simulation.revision} active={active&&view==='strategies'} onEvidence={openEvidence} notify={notify}/></div>}
    <div hidden={view!=='shift'} inert={view!=='shift'}>
      <div className="ops-metric-strip"><span>{t("Plecări la timp")}{' '}<strong>{data.kpis.on_time_percent==null?'—':t("{p0}%", {p0:data.kpis.on_time_percent})}</strong></span><span>{t("Întârziere înregistrată")}{' '}<strong className={delay>=15?'ops-tone-red':''}>{delay} {t("min")}</strong></span><span>{t("Abateri majore")}{' '}<strong className={severe?'ops-tone-red':''}>{severe}</strong></span></div>
      {mode==='simulation'&&<section className="ops-shift-control" aria-label={t("Controlul scenariului")}><div className="ops-control-actions">
        <button className="ops-primary" disabled={busy||!scenario} onClick={togglePlayback}>{busy?<LoaderCircle size={16} className="spin"/>:playing?<Pause size={16}/>:<Play size={16}/>} {playing?t("Pauză"):atEnd?t("Reia redarea"):t("Pornește")}</button>
        <button title={t("Următorul eveniment")} aria-label={t("Următorul eveniment")} disabled={busy||atEnd||!scenario} onClick={()=>playbackMode?timeline.step():void control('step')}><SkipForward size={16}/></button>
        <label className="ops-speed">{t("Viteză")}<select aria-label={t("Viteza redării")} value={playbackMode?timeline.speed:liveData.simulation.speed} disabled={busy} onChange={event=>playbackMode?timeline.setSpeed(Number(event.target.value)):void control(liveData.simulation.running?'start':'pause',{speed:Number(event.target.value)})}>{[1,10,30,60,120].map(speed=><option value={speed} key={speed}>{speed}×</option>)}</select></label>
        <button className="ops-restart" title={t("Reia scenariul de la zero")} aria-label={t("Reia scenariul")} disabled={busy||!scenario||!liveData.permissions.can_control} onClick={()=>scenario&&void chooseScenario(scenario.id)}><RotateCcw size={15}/></button>
      </div><SimulationTimeline live={liveData} frame={timeline.frame} seconds={timeline.seconds} previewing={previewing} loading={timeline.loading} error={timeline.error} selected={selected} onSeek={seek} onReturn={timeline.reset} onApply={()=>void applyTime()} busy={busy}/></section>}
      <FlightMap simulationSpeed={previewing?timeline.speed:data.simulation.speed} animateFlights={mode==='live'||timeline.playing||(!previewing&&!!liveData.simulation.running)} data={{...data,permissions:{can_control:manual&&!previewing&&liveData.permissions.can_control}}} mode={mode} onMode={next=>{setMode(next);setSelected(next==='simulation'?'flight-101':null)}} mapConfig={mapConfig} mapMode={mapMode} onMapMode={setMapMode} traffic={traffic} trafficError={trafficError} selected={selected} onSelect={setSelected} active={active&&view==='shift'} busy={busy} onEvent={(kind,extra)=>void recordEvent(kind,extra)} onInvestigate={investigate} notify={notify}/>
    </div>
  </section>;
}
