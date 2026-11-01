import {t as tr,useLanguage} from '@/i18n';
import {useState} from 'react';
import {StateGraph} from '@/components/StateGraph';

export interface DocumentLifecycle {
  current:string;states:Array<{id:string;label:string}>;
  transitions:Array<{source:string;target:string;label:string;action:string;condition:string}>;
  metadata_validated:boolean;version_signed:boolean;version_note:string;
}

export function DocumentStateFlow({diagram}:{diagram:DocumentLifecycle}) {
  useLanguage();
  const [selection,setSelection]=useState('');
  const selected=diagram.states.find(s=>s.id===selection)||diagram.states.find(s=>s.id===diagram.current);
  return <div className="document-state-flow">
    <div className="state-flow-legend"><span><i className="info"/>{tr("Starea versiunii curente")}</span><span>{tr("Metadate:")}{' '}{diagram.metadata_validated?tr("validate"):tr("de validat")}</span><span>{tr("Semnătură:")}{' '}{diagram.version_signed?tr("păstrată pe această versiune"):tr("neaplicată")}</span></div>
    <StateGraph label={tr("Stările documentului")} nodes={diagram.states.map((state,column)=>({id:state.id,label:tr(state.label),column,row:0,tone:state.id===diagram.current?'info':'neutral',current:state.id===diagram.current,status:tr(state.id===diagram.current?'Starea curentă':'Stare posibilă')}))} edges={diagram.transitions.map(t=>({...t,label:tr(t.label),kind:t.action==='reject'?'correction':'transition'}))} selected={selected?.id} onSelect={setSelection}/>
    <div className="state-flow-summary"><h3>{selected&&tr(selected.label)} {tr("· tranziții și condiții")}</h3>{diagram.transitions.filter(t=>t.source===selected?.id).map(t=><p key={t.action+t.source}><strong>{tr(t.label)}</strong> → {tr(diagram.states.find(s=>s.id===t.target)?.label||'')}. {tr(t.condition)}</p>)}{selected?.id==='archived'&&<p>{tr("Documentul și semnătura existentă rămân în istoric. Sarcinile versiunii arhivate sunt închise.")}</p>}<p>{tr(diagram.version_note)}</p></div>
  </div>;
}
