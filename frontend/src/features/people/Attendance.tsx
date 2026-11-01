import {t,useLanguage} from '@/i18n';
import {useCallback,useContext,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Pause,Play,RotateCcw} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading,ViewActiveContext} from '@/components/ui';
import {NfcStation} from '@/features/operations/NfcStation';
import type {OperationsData} from '@/features/operations/types';

export function Attendance({onBack}:{onBack:()=>void}) {
  useLanguage();
  const active=useContext(ViewActiveContext);
  const [visible,setVisible]=useState(!document.hidden);
  const [data,setData]=useState<OperationsData>(),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false);
  const current=useRef<OperationsData|undefined>(undefined),pending=useRef(false);
  const accept=useCallback((next:OperationsData)=>{
    if(current.current&&next.simulation.revision<current.current.simulation.revision)return;
    current.current=next;setData(next);setLoadError('');
  },[]);
  const refresh=useCallback(async()=>{const next=await api<OperationsData>('/operations');accept(next);return next},[accept]);
  useEffect(()=>{const change=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change)},[]);
  useEffect(()=>{
    if(!active||!visible)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try{const next=await api<OperationsData>('/operations',{signal:controller.signal});if(!controller.signal.aborted)accept(next)}
      catch(e){if(!controller.signal.aborted)setLoadError((e as Error).message)}
      if(!controller.signal.aborted)timer=setTimeout(poll,current.current?.simulation.running?1000:2500);
    }
    void poll();return()=>{controller.abort();clearTimeout(timer)};
  },[active,visible,accept]);
  async function mutate(path:string,body:Record<string,unknown>):Promise<OperationsData|null>{
    if(pending.current)return null;
    pending.current=true;setBusy(true);setError('');
    try{const next=await api<OperationsData>(path,{method:'POST',body:JSON.stringify(body)});accept(next);return next}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});return null}
    finally{pending.current=false;setBusy(false)}
  }
  if(!data)return <div className="people-attendance"><button className="text-button" onClick={onBack}><ArrowLeft size={16}/>{t("Înapoi la echipă")}</button>{loadError?<ErrorMessage message={loadError} retry={()=>void refresh().catch(e=>setLoadError(e.message))}/>:<Loading/>}</div>;
  const manual=data.simulation.scenario_mode==='interactive';
  const ended=data.simulation.elapsed_seconds>=data.simulation.duration_seconds;
  return <div className="people-attendance">
    {(error||loadError)&&<ErrorMessage message={error||loadError}/>}
    <NfcStation key={data.simulation.run_id} data={data} busy={busy} onBack={onBack} onScan={(card,action)=>mutate('/operations/nfc',{card_id:card,action,request_id:crypto.randomUUID()})}/>
    {data.permissions.can_control&&<details className="people-attendance-options"><summary>{t("Opțiuni tură")}<span>{manual?t("Cu pontaj"):t("Scenariu automat")}</span></summary>
      <div>{manual&&!ended?<><p>{data.simulation.running?t("Tura este în desfășurare."):t("Tura este în pauză.")}</p><button className="button secondary" disabled={busy} onClick={()=>void mutate('/operations/control',{action:data.simulation.running?'pause':'start'})}>{data.simulation.running?<Pause size={16}/>:<Play size={16}/>} {data.simulation.running?t("Pauză"):t("Pornește tura")}</button></>:<><p>{t("Începe o tură de la 08:00, cu prezența înregistrată prin carduri. Tura actuală rămâne în registru.")}</p><button className="button secondary" disabled={busy} onClick={()=>void mutate('/operations/control',{action:'reset',scenario_mode:'interactive',expected_revision:data.simulation.revision})}><RotateCcw size={16}/>{t("Pornește tură cu pontaj")}</button></>}
      <a className="text-button" href="#operations">{t("Vezi operațiunile")}<ArrowUpRight size={15}/></a></div>
    </details>}
  </div>;
}
