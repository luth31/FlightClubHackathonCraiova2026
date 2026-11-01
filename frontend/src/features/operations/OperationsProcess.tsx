import {t as tr,useLanguage} from '@/i18n';
import {useMemo,useState} from 'react';
import {ArrowUpRight,GitBranch} from 'lucide-react';
import {StateGraph} from '@/components/StateGraph';
import {dependencyLayout} from '@/components/graph-layout';
import type {OperationProcess} from './types';
import type {Inspection} from './LedgerInspector';
import {shortTime} from './format';

export function OperationsProcess({process,onInspect}:{process:OperationProcess;onInspect:(target:Inspection)=>void}) {
  useLanguage();
  const [view,setView]=useState<'dependencies'|'states'>('dependencies'),[selected,setSelected]=useState(''),[stream,setStream]=useState('');
  const positions=useMemo(()=>dependencyLayout(process.nodes.map(n=>n.id),process.edges),[process]);
  const node=process.nodes.find(n=>n.id===selected);
  const machine=process.machines.find(m=>m.id===stream)||process.machines[0];
  const state=machine?.states.find(s=>s.id===selected)||machine?.states.find(s=>s.id===machine.current);
  return <details className="ops-process" open><summary><GitBranch size={17}/>{tr("Diagramă operațională · dependențe și stări")}</summary>
    <div className="state-flow-toolbar"><button aria-pressed={view==='dependencies'} onClick={()=>{setView('dependencies');setSelected('')}}>{tr("Dependențe între operațiuni")}</button><button aria-pressed={view==='states'} onClick={()=>{setView('states');setSelected('')}}>{tr("Stările unei activități")}</button>
      {view==='states'&&<select aria-label={tr("Activitatea pentru diagrama de stări")} value={machine?.id||''} onChange={e=>{setStream(e.target.value);setSelected('')}}>{process.machines.map(m=><option key={m.id} value={m.id}>{tr(m.label)}</option>)}</select>}</div>
    {view==='dependencies'?<>
      <p className="ops-process-help">{tr("Ramurile pot avansa în paralel. O operațiune cu mai multe intrări necesită toate condițiile indicate. Selectează un nod pentru detalii.")}</p>
      <div className="state-flow-legend"><span><i className="success"/>{tr("Înregistrat la timp")}</span><span><i className="warning"/>{tr("1–14 min / abatere")}</span><span><i className="danger"/>{tr("≥15 min / incident")}</span><span><i/>{tr("Neînregistrat")}</span><span><i className="info"/>{tr("Estimare")}</span><span>{tr("Linie continuă: dovadă · întreruptă: condiție de îndeplinit")}</span></div>
      <StateGraph label={tr("Dependențele operațiunilor")} direction="vertical" nodes={process.nodes.map(n=>({id:n.id,label:tr(n.title),caption:tr(n.from_label)+' → '+tr(n.to_label),status:n.status.split(' · ').map(part=>tr(part)).join(' · '),tone:n.tone,column:positions.get(n.id)!.row,row:positions.get(n.id)!.column}))} edges={process.edges} selected={selected} onSelect={setSelected}/>
      {node&&<div className="state-flow-summary" role="region" aria-label={tr("Detaliile operațiunii selectate")}><h3>{tr(node.title)}</h3><p><strong>{tr(node.from_label)} → {tr(node.to_label)}</strong> · {node.status.split(' · ').map(part=>tr(part)).join(' · ')}</p><p>{tr("Planificat:")}{' '}{shortTime(node.planned_at)} · {node.recorded?tr("Înregistrat"):tr("Estimat / neconfirmat")}: {shortTime(node.actual_at)}{node.actor&&' · '+node.actor}</p>{node.detail&&<p>{tr(node.detail)}</p>}{node.missing.length>0&&<p>{tr("Confirmări lipsă:")}{' '}{node.missing.map(part=>tr(part)).join(', ')}.</p>}{node.recorded&&<button className="button secondary" onClick={()=>onInspect({type:'event',id:node.id,label:node.title})}>{tr("Deschide dovada și responsabilul")}<ArrowUpRight size={15}/></button>}</div>}
      {process.guards.map(text=><p className="ops-process-help" key={text}>{tr(text)}</p>)}
      {process.observations.length>0&&<p className="ops-process-help">{process.observations.length} {tr("observații sunt păstrate în registrul de mai jos; nu schimbă starea unei activități.")}</p>}
    </>:machine&&<>
      <StateGraph label={tr('Stări')+' · '+tr(machine.label)} nodes={machine.states.map((s,index)=>({id:s.id,label:tr(s.label),status:tr(s.id===machine.current?'Starea curentă':'Stare posibilă'),current:s.id===machine.current,tone:s.id===machine.current?'info':'neutral',column:index,row:0}))} edges={machine.transitions.map(edge=>({...edge,label:tr(edge.label)}))} selected={state?.id} onSelect={setSelected}/>
      <div className="state-flow-summary"><h3>{state&&tr(state.label)}</h3>{machine.transitions.filter(t=>t.source===state?.id).map(t=><p key={t.code+t.source}><strong>{tr(t.label)}</strong> → {tr(machine.states.find(s=>s.id===t.target)?.label||'')}{t.requires.length>0&&'. '+tr('Necesită')+': '+t.requires.map(part=>tr(part)).join(', ')+'.'}</p>)}<p>{tr("Întârzierea colorează operațiunea; nu schimbă starea activității. Condițiile de prezență și autorizare se verifică separat.")}</p></div>
    </>}
  </details>;
}
