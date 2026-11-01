import {useEffect,useState} from 'react';
import {ArrowRight,Check,FileText,GitBranch,LoaderCircle,ShieldCheck,TrendingUp} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading} from '@/components/ui';
import {documentHref} from '@/services/navigation';
interface Strategy {id:string;title:string;sop_code:string;problem:string;evidence_count:number;evidence:Array<{group_id:string;callsign:string;date:string;delay_minutes:number}>;current_rule:string;proposed_rule:string;changes:string[];baseline:{delay_minutes:number;on_time_percent:number|null};estimate:{delay_minutes:number;on_time_percent:number|null;minutes_saved:number};assumptions:string[];document_id:string|null}
interface StrategiesData {items:Strategy[];can_draft:boolean;notice:string}
export function Strategies({revision,onEvidence,notify}:{revision:number;onEvidence:(id:string)=>void;notify:(message:string)=>void}) {
  const [data,setData]=useState<StrategiesData>(),[error,setError]=useState(''),[busy,setBusy]=useState('');
  useEffect(()=>{let disposed=false;const controller=new AbortController();api<StrategiesData>('/operations/strategies',{signal:controller.signal}).then(value=>{if(!disposed){setData(value);setError('')}}).catch(e=>{if(!disposed)setError((e as Error).message)});return()=>{disposed=true;controller.abort()}},[revision]);
  async function draft(item:Strategy){if(busy)return;setBusy(item.id);try{const result=await api<{document_id:string}>(`/operations/strategies/${encodeURIComponent(item.id)}/draft`,{method:'POST'});setData(current=>current?{...current,items:current.items.map(row=>row.id===item.id?{...row,document_id:result.document_id}:row)}:current);notify('Draft SOP creat. Este gata de verificare.')}catch(e){notify((e as Error).message)}finally{setBusy('')}}
  return <section className="ops-strategies"><div className="ops-section-heading"><div><h2>Ce schimbăm data viitoare?</h2></div><span className="ops-data-label"><ShieldCheck size={13}/>Propuneri de verificat</span></div>
    <div className="ops-improvement-path"><span><GitBranch size={18}/>Dovezi</span><ArrowRight size={17}/><span><TrendingUp size={18}/>Propunere</span><ArrowRight size={17}/><span><FileText size={18}/>Draft SOP</span></div>
    {error&&<ErrorMessage message={error}/>}{!data&&!error&&<Loading/>}
    {data?.items.map(item=>{const documentId=item.document_id;return <article className="ops-strategy-card" key={item.id}><div className="ops-strategy-heading"><span>{item.sop_code}</span><span>{item.evidence_count} observații</span></div><h3>{item.title}</h3><p>{item.problem}</p>
      <div className="ops-rule-comparison"><div><span>Acum</span><p>{item.current_rule}</p></div><ArrowRight size={21}/><div><span>Propunere</span><p>{item.proposed_rule}</p></div></div>
      <div className="ops-strategy-impact"><TrendingUp size={23}/><div><strong>−{item.estimate.minutes_saved} min <span>potențial</span></strong><span>Estimare pe aceleași evenimente</span></div><div><small>Întârziere totală</small><strong>{item.baseline.delay_minutes} → {item.estimate.delay_minutes} min</strong></div></div>
      <details className="ops-strategy-detail"><summary>Dovezi și ipoteze</summary><div className="ops-strategy-evidence">{item.evidence.slice(0,6).map((event,index)=><button key={event.group_id+index} onClick={()=>onEvidence(event.group_id)}><span>{event.callsign} · {event.date}</span><strong>+{event.delay_minutes} min <ArrowRight size={13}/></strong></button>)}</div><h4>Ce se schimbă</h4><ul>{item.changes.map(change=><li key={change}>{change}</li>)}</ul><h4>Ipoteze ale estimării</h4><ul>{item.assumptions.map(assumption=><li key={assumption}>{assumption}</li>)}</ul></details>
      <div className="ops-strategy-footer"><span>Demo · necesită aprobare</span>{documentId?<a href={documentHref(documentId,'operations')}><Check size={16}/>Deschide draftul SOP</a>:<button disabled={!!busy||!data.can_draft} onClick={()=>void draft(item)}>{busy===item.id?<LoaderCircle size={16} className="spin"/>:<FileText size={16}/>}Creează draft SOP</button>}</div>
    </article>})}
    {data&&!data.items.length&&<div className="ops-ledger-empty"><ShieldCheck size={28}/><h3>Niciun tipar care cere o schimbare</h3><p>Propunerile apar când există abateri susținute de evenimente.</p></div>}
    <aside className="ops-sharing-direction"><span><GitBranch size={23}/></span><div><h3>Împărtășește procedura</h3><p>După aprobare, trimite procedura unui aeroport partener.</p><a href="#sharing">Partajare între aeroporturi<ArrowRight size={15}/></a></div></aside>
  </section>;
}
