import {useEffect,useRef,useState} from 'react';
import {ErrorMessage,Loading} from '@/components/ui';
import {date} from '@/utils/format';
import {getCases,getTemplates} from './api';
import {CaseForm,createCase} from './CaseForms';
import {CaseDetail} from './CaseDetail';
import {type CaseList,type CaseSummary,type TemplateCatalog,type WorkspaceProps} from './types';
import {guideSteps} from './guide';
import './procurement.css';
import './case-guide.css';

export function ProcurementWorkspace({user,onOpen,onChanged,notify,revision=0}:WorkspaceProps) {
  const [list,setList]=useState<CaseList>(),[catalog,setCatalog]=useState<TemplateCatalog>(),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[create,setCreate]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),sequence=useRef(0);
  useEffect(()=>{let active=true;const request=++sequence.current;Promise.all([getCases(query),getTemplates()]).then(([cases,templates])=>{if(active&&request===sequence.current){setList(cases);setCatalog(templates);setError('')}}).catch(error=>{if(active&&request===sequence.current)setError(error.message)});return()=>{active=false}},[query,revision,refresh]);
  function card(item:CaseSummary) {return <button className="proc-case-card" key={item.id} onClick={()=>setSelected(item.id)}><span className="proc-eyebrow">{item.number}{item.legacy_ref&&' · Importat'}</span><strong>{item.title}</strong><span>{item.owner_name||'Neatribuit'}</span><small>{item.document_count} documente · {date(item.deadline)}</small>{item.stale_count>0&&<small className="proc-warning">{item.stale_count} dovezi depășite</small>}</button>}
  return <div className="proc-workspace">
    {!selected&&<header className="proc-heading"><div><span className="proc-eyebrow">Achiziții</span><h2>Dosare de achiziții</h2><p>De la primul document până la plată, în patru pași.</p></div>{list?.can_create&&<button className="button primary" onClick={()=>setCreate(true)}>Dosar nou</button>}</header>}
    {error&&<ErrorMessage message={error} retry={()=>setRefresh(value=>value+1)}/>}
    {!list||!catalog?<Loading/>:selected?<CaseDetail key={selected} user={user} id={selected} catalog={catalog} revision={revision} onOpen={onOpen} onChanged={onChanged} notify={notify} onBack={()=>setSelected('')} onSaved={()=>setRefresh(value=>value+1)}/>:<>
      <label className="proc-search field">Caută un dosar<input aria-label="Caută dosare" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Număr, titlu sau responsabil"/></label>
      {!list.items.length&&<p className="proc-empty">{query?'Niciun dosar corespunde căutării.':'Niciun dosar înregistrat. Creează un dosar pentru a începe cu o ciornă fără documente.'}</p>}
      <div className="proc-board proc-guided-board" aria-label="Etapele dosarelor">{guideSteps.map((step,index)=><section className={`proc-column proc-stage-${step.stages[0]}`} key={step.id}><header><h3>{index+1}. {step.label}</h3><span>{list.items.filter(item=>step.stages.includes(item.stage)).length}</span></header><p className="proc-column-description">{step.description}</p>{list.items.filter(item=>step.stages.includes(item.stage)).map(item=><div className={item.stage==='paid'?'proc-completed-card':''} key={item.id}>{card(item)}{item.stage==='paid'&&<small className="guide-completed-label">Finalizat</small>}</div>)}{!list.items.some(item=>step.stages.includes(item.stage))&&<p className="proc-column-empty">Niciun dosar</p>}</section>)}</div>
      {list.items.some(item=>item.stage==='cancelled')&&<section className="proc-cancelled"><h3>Dosare anulate</h3><div>{list.items.filter(item=>item.stage==='cancelled').map(card)}</div></section>}
    </>}
    {create&&list&&<CaseForm owners={list.owners} onClose={()=>setCreate(false)} onSaved={async body=>{const item=await createCase(body);setCreate(false);setSelected(item.id);setRefresh(value=>value+1);onChanged();notify('Dosarul a fost creat.')}}/>}
  </div>;
}
