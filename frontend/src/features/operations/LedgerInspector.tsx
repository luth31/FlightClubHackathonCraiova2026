import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,DoorOpen,Plane,UserRound,Users,ClipboardList,ShieldCheck} from 'lucide-react';
import {api} from '@/services/api-client';
import {Modal,Loading,ErrorMessage} from '@/components/ui';
import {PersonAvatar} from '@/components/people/PersonAvatar';
import {dayLabel,shortTime} from './format';
import type {LedgerEntity,LedgerFact,LedgerEntityDetail} from './types';

export type Inspection={type:'entity'|'event';id:string;label:string};
const roleLabels:Record<string,string>={subject:'Entitate',location:'Poartă',participant:'Persoană implicată',recorder:'Înregistrat de',previous_assignee:'Responsabil anterior'};
const sourceLabels:Record<string,string>={seed:'Istoric generat',scenario:'Flux operațional',operator:'Operator',control:'Control tură',projection:'Proiecție',pending:'Planificat'};
export function EntityChip({entity,onInspect}:{entity:LedgerEntity;onInspect?:(target:Inspection)=>void}) {
  useLanguage();
  const Icon=entity.kind==='gate'?DoorOpen:entity.kind==='person'?UserRound:entity.kind==='flight'?Plane:entity.kind==='team'?Users:ClipboardList;
  const inspect=()=>onInspect?.({type:'entity',id:entity.id,label:entity.label});
  if(entity.kind==='person')return <PersonAvatar
    // Operational staff and login accounts have distinct identity namespaces.
    userId={entity.code.startsWith('account:')?entity.code.slice('account:'.length):entity.id}
    name={entity.label} className="ops-entity-chip"
    fallbackDetails={{title:entity.attributes.title,fields:[
      {label:'Registru',value:entity.attributes.registry||'Personal operațional'},
      {label:'Identificator',value:entity.code},
    ]}}
    action={onInspect?{label:'Vezi istoricul operațional',onSelect:inspect}:undefined}
  ><UserRound size={12}/>{t(entity.label)}</PersonAvatar>;
  return <button type="button" className="ops-entity-chip" onClick={event=>{event.preventDefault();event.stopPropagation();inspect()}}><Icon size={12}/>{t(entity.label)}</button>;
}
function Time({value}:{value:string|null|undefined}) {
  useLanguage();
  return <span>{value?t("{p0} · {p1}", {p0:dayLabel(value.slice(0,10)),p1:shortTime(value)}):'—'}</span>;
}
export function LedgerInspector({target,onClose}:{target:Inspection;onClose:()=>void}) {
  useLanguage();
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
  const recorder=fact?.entities.find(entity=>entity.role==='recorder'&&entity.kind==='person');
  return <Modal title={current.label} subtitle={entity?.kind_label||(current.type==='event'?'Detaliu operațiune':'Fișă operațională')} onClose={onClose} wide className="ops-inspector"><div className="ops-inspector-body">
    {stack.length>1&&<button className="ops-inspector-back" onClick={()=>{setOffset(0);setStack(old=>old.slice(0,-1))}}><ArrowLeft size={14}/>{t("Înapoi la")}{' '}{t(stack[stack.length-2].label)}</button>}
    {error&&<ErrorMessage message={error}/>} {!data&&!error&&<Loading/>}
    {entity&&<>
      <div className="ops-entity-overview"><span>{entity.kind_label}</span>{entity.entity.kind==='person'?<EntityChip entity={entity.entity}/>:<strong>{t(entity.entity.label)}</strong>}{entity.entity.attributes.route&&<p>{entity.entity.attributes.route}</p>}{entity.entity.attributes.title&&<p>{entity.entity.attributes.title}</p>}{entity.entity.attributes.airport_code&&<p>{t("Aeroport ·")}{' '}{entity.entity.attributes.airport_code}</p>}<small>{entity.total} {t("operațiuni înregistrate")}</small></div>
      <div className="ops-entity-history">{entity.events.map(event=><button key={event.id} className={`severity-${event.severity}`} onClick={()=>inspect({type:'event',id:event.id,label:event.title})}><span><strong>{event.title}</strong><small><Time value={event.actual_at}/>{event.entities?.find(item=>item.kind==='flight')&&t(" · {p0}", {p0:event.entities.find(item=>item.kind==='flight')!.label})}</small></span><span>{event.operation?.activity_label}<ArrowRight size={15}/></span></button>)}</div>
      {!entity.events.length&&<p>{t("Nu există încă operațiuni înregistrate pentru această entitate.")}</p>}
      {entity.total>entity.limit&&<div className="ops-inspector-pagination"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-entity.limit))}>{t("Mai recente")}</button><span>{offset+1}–{Math.min(offset+entity.limit,entity.total)} / {entity.total}</span><button disabled={offset+entity.limit>=entity.total} onClick={()=>setOffset(offset+entity.limit)}>{t("Mai vechi")}</button></div>}
    </>}
    {fact&&<>
      <div className={`ops-fact-transition severity-${fact.severity}`}><span>{fact.operation.activity_label}</span><strong>{fact.operation.from_label}<ArrowRight size={18}/>{fact.operation.to_label}</strong>{fact.severity!=='neutral'&&<span>{fact.delay_minutes&&fact.delay_minutes>0?t("+{p0} min întârziere", {p0:fact.delay_minutes}):fact.severity==='red'?t("Abatere majoră"):t("Abatere")}</span>}</div>
      <div className="ops-fact-entities">{fact.entities.map(entity=><div className="ops-fact-role" key={entity.id+entity.role}><small>{t(roleLabels[entity.role]||entity.role)}</small><EntityChip entity={entity} onInspect={inspect}/></div>)}</div>
      {fact.detail&&<p>{fact.detail}</p>}
      <dl className="ops-fact-meta"><div><dt>{t("Planificat")}</dt><dd><Time value={fact.planned_at}/></dd></div><div><dt>{t("Realizat · ora aeroportului")}</dt><dd><Time value={fact.actual_at}/></dd></div><div><dt>{t("Înregistrat de")}</dt><dd>{recorder?<EntityChip entity={recorder} onInspect={inspect}/>:<PersonReference name={fact.audit.recorded_by}/>}</dd></div><div><dt>{t("Sursă")}</dt><dd>{sourceLabels[fact.source]||fact.source}</dd></div><div><dt>{t("Înregistrat în sistem")}</dt><dd>{fact.audit.recorded_at?new Date(fact.audit.recorded_at).toLocaleString('ro-RO'):t("Ora originală nu este disponibilă")}</dd></div><div><dt>{t("Verificare tranziție")}</dt><dd>{fact.operation.validation==='validated'?t("Tranziție validată"):t("Istoric anterior regulilor de validare")}</dd></div></dl>
      {fact.dependencies.length>0&&<div className="ops-fact-dependencies"><h3>{t("Operațiuni prealabile")}</h3>{fact.dependencies.map(dependency=><button key={dependency.id} onClick={()=>inspect({type:'event',id:dependency.id,label:dependency.title})}><span>{dependency.title}<small><Time value={dependency.actual_at}/></small></span><ArrowRight size={15}/></button>)}</div>}
      <details className="ops-audit-technical"><summary>{t("Trasabilitate")}</summary><dl><dt>{t("ID eveniment")}</dt><dd>{fact.id}</dd>{fact.audit.run_id&&<><dt>{t("ID tură")}</dt><dd>{fact.audit.run_id}</dd></>}<dt>{t("Cod operațiune")}</dt><dd>{fact.kind}</dd><dt>{t("Versiune schemă")}</dt><dd>{fact.audit.schema_version}</dd></dl><p><ShieldCheck size={14}/>{fact.integrity_verified?t("Integritatea înregistrării verificată"):t("Integritatea înregistrării nu a putut fi confirmată")}</p><small>{t("Înregistrarea originală este păstrată fără suprascriere.")}</small></details>
    </>}
  </div></Modal>;
}
