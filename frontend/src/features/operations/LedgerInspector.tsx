import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,DoorOpen,Plane,UserRound,Users,ClipboardList,ShieldCheck} from 'lucide-react';
import {api} from '@/services/api-client';
import {Modal,Loading,ErrorMessage} from '@/components/ui';
import {dayLabel,shortTime} from './format';
import type {LedgerEntity,LedgerFact,LedgerEntityDetail} from './types';

export type Inspection={type:'entity'|'event';id:string;label:string};
const roleLabels:Record<string,string>={subject:'Entitate',location:'Poartă',participant:'Persoană implicată',recorder:'Înregistrat de',previous_assignee:'Responsabil anterior'};
const sourceLabels:Record<string,string>={seed:'Istoric generat',scenario:'Flux operațional',operator:'Operator',control:'Control tură',projection:'Proiecție',pending:'Planificat'};
export function EntityChip({entity,onInspect}:{entity:LedgerEntity;onInspect:(target:Inspection)=>void}) {
  const Icon=entity.kind==='gate'?DoorOpen:entity.kind==='person'?UserRound:entity.kind==='flight'?Plane:entity.kind==='team'?Users:ClipboardList;
  return <button type="button" className="ops-entity-chip" onClick={event=>{event.preventDefault();event.stopPropagation();onInspect({type:'entity',id:entity.id,label:entity.label})}}><Icon size={12}/>{entity.label}</button>;
}
function Time({value}:{value:string|null|undefined}) {
  return <span>{value?`${dayLabel(value.slice(0,10))} · ${shortTime(value)}`:'—'}</span>;
}
export function LedgerInspector({target,onClose}:{target:Inspection;onClose:()=>void}) {
  const [stack,setStack]=useState<Inspection[]>([target]);
  const current=stack[stack.length-1];
  const [data,setData]=useState<LedgerEntityDetail|LedgerFact>();
  const [error,setError]=useState(''),[offset,setOffset]=useState(0);
  const inspect=(item:Inspection)=>{setOffset(0);setStack(old=>[...old,item])};
  useEffect(()=>{const controller=new AbortController();setData(undefined);setError('');
    api<LedgerEntityDetail|LedgerFact>(current.type==='entity'?`/operations/entities/${encodeURIComponent(current.id)}?offset=${offset}`:`/operations/facts/${encodeURIComponent(current.id)}`,{signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setData(value)}).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message)});
    return()=>controller.abort();
  },[current,offset]);
  const entity=data&&'entity' in data?data:undefined;
  const fact=data&&'operation' in data?data:undefined;
  return <Modal title={current.label} subtitle={entity?.kind_label||(current.type==='event'?'Detaliu operațiune':'Fișă operațională')} onClose={onClose} wide className="ops-inspector"><div className="ops-inspector-body">
    {stack.length>1&&<button className="ops-inspector-back" onClick={()=>{setOffset(0);setStack(old=>old.slice(0,-1))}}><ArrowLeft size={14}/>Înapoi la {stack[stack.length-2].label}</button>}
    {error&&<ErrorMessage message={error}/>} {!data&&!error&&<Loading/>}
    {entity&&<>
      <div className="ops-entity-overview"><span>{entity.kind_label}</span><strong>{entity.entity.label}</strong>{entity.entity.attributes.route&&<p>{entity.entity.attributes.route}</p>}{entity.entity.attributes.title&&<p>{entity.entity.attributes.title}</p>}{entity.entity.attributes.airport_code&&<p>Aeroport · {entity.entity.attributes.airport_code}</p>}<small>{entity.total} operațiuni înregistrate</small></div>
      <div className="ops-entity-history">{entity.events.map(event=><button key={event.id} className={`severity-${event.severity}`} onClick={()=>inspect({type:'event',id:event.id,label:event.title})}><span><strong>{event.title}</strong><small><Time value={event.actual_at}/>{event.entities?.find(item=>item.kind==='flight')&&` · ${event.entities.find(item=>item.kind==='flight')!.label}`}</small></span><span>{event.operation?.activity_label}<ArrowRight size={15}/></span></button>)}</div>
      {!entity.events.length&&<p>Nu există încă operațiuni înregistrate pentru această entitate.</p>}
      {entity.total>entity.limit&&<div className="ops-inspector-pagination"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-entity.limit))}>Mai recente</button><span>{offset+1}–{Math.min(offset+entity.limit,entity.total)} / {entity.total}</span><button disabled={offset+entity.limit>=entity.total} onClick={()=>setOffset(offset+entity.limit)}>Mai vechi</button></div>}
    </>}
    {fact&&<>
      <div className="ops-fact-transition"><span>{fact.operation.activity_label}</span><strong>{fact.operation.from_label}<ArrowRight size={18}/>{fact.operation.to_label}</strong></div>
      <div className="ops-fact-entities">{fact.entities.map(entity=><div className="ops-fact-role" key={entity.id+entity.role}><small>{roleLabels[entity.role]||entity.role}</small><EntityChip entity={entity} onInspect={inspect}/></div>)}</div>
      {fact.detail&&<p>{fact.detail}</p>}
      <dl className="ops-fact-meta"><div><dt>Planificat</dt><dd><Time value={fact.planned_at}/></dd></div><div><dt>Realizat · ora aeroportului</dt><dd><Time value={fact.actual_at}/></dd></div><div><dt>Înregistrat de</dt><dd>{fact.audit.recorded_by}</dd></div><div><dt>Sursă</dt><dd>{sourceLabels[fact.source]||fact.source}</dd></div><div><dt>Înregistrat în sistem</dt><dd>{fact.audit.recorded_at?new Date(fact.audit.recorded_at).toLocaleString('ro-RO'):'Ora originală nu este disponibilă'}</dd></div><div><dt>Verificare tranziție</dt><dd>{fact.operation.validation==='validated'?'Tranziție validată':'Istoric anterior regulilor de validare'}</dd></div></dl>
      {fact.dependencies.length>0&&<div className="ops-fact-dependencies"><h3>Operațiuni prealabile</h3>{fact.dependencies.map(dependency=><button key={dependency.id} onClick={()=>inspect({type:'event',id:dependency.id,label:dependency.title})}><span>{dependency.title}<small><Time value={dependency.actual_at}/></small></span><ArrowRight size={15}/></button>)}</div>}
      <details className="ops-audit-technical"><summary>Trasabilitate</summary><dl><dt>ID eveniment</dt><dd>{fact.id}</dd>{fact.audit.run_id&&<><dt>ID tură</dt><dd>{fact.audit.run_id}</dd></>}<dt>Cod operațiune</dt><dd>{fact.kind}</dd><dt>Versiune schemă</dt><dd>{fact.audit.schema_version}</dd></dl><p><ShieldCheck size={14}/>{fact.integrity_verified?'Integritatea înregistrării verificată':'Integritatea înregistrării nu a putut fi confirmată'}</p><small>Înregistrarea originală este păstrată fără suprascriere.</small></details>
    </>}
  </div></Modal>;
}
