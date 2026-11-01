import {useEffect,useState} from 'react';
import {api} from '@/services/api-client';
import {Empty,ErrorMessage,Loading,Modal,Status} from '@/components/ui';
import {date} from '@/utils/format';
import type {Appointment} from './types';

export function AppointmentPanel({revision,notify,onChanged,hideEmpty=false}: {
  revision:number;notify:(message:string)=>void;onChanged?:()=>void;hideEmpty?:boolean;
}) {
  const [items,setItems]=useState<Appointment[]>(),[error,setError]=useState('');
  const [selected,setSelected]=useState<Appointment>(),[comment,setComment]=useState('');
  const [busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[formError,setFormError]=useState('');
  useEffect(()=>{let live=true;api<{items:Appointment[]}>('/people/appointments').then(data=>{
    if(live){setItems(data.items||[]);setError('')}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[revision,refresh]);
  async function decide(action:'approve'|'reject') {
    if(!selected)return;setBusy(true);setFormError('');
    try {
      await api(`/people/appointments/${selected.id}/decision`,{method:'POST',body:JSON.stringify({action,comment})});
      notify(action==='approve'?'Numirea a fost aprobată.':'Propunerea a fost respinsă.');
      setSelected(undefined);setRefresh(n=>n+1);onChanged?.();
    } catch(e) {setFormError((e as Error).message)} finally {setBusy(false)}
  }
  if(hideEmpty&&items?.length===0&&!error)return null;
  return <section className="panel appointment-panel" aria-label="Numiri în departamente">
    <div className="people-panel-intro"><div><h2>Numiri în departamente</h2>{!!items?.length&&<p>Autoritatea de semnare se acordă separat.</p>}</div></div>
    {error?<ErrorMessage message={error} retry={()=>setRefresh(n=>n+1)}/>:!items?<Loading/>:!items.length?<Empty title="Nicio propunere de numire" message="Propunerile HR și deciziile directorului vor apărea aici."/>:
      <div className="delegation-list">{items.map(item=><article className="delegation-card" key={item.id}><div><strong>{item.name}</strong><p>{item.department} · din {date(item.effective_date)}</p><small>{item.reason} · Propus de {item.proposer_name}</small>{item.decider_name&&<p className="quiet-note">Decizie: {item.decider_name}{item.decision_comment?` · ${item.decision_comment}`:''}</p>}</div><div className="delegation-actions"><Status value={item.status}/>{item.can_decide&&<button className="button secondary small" onClick={()=>{setSelected(item);setComment('');setFormError('')}}>Revizuiește numirea</button>}</div></article>)}</div>}
    {selected&&<Modal title={`Numirea lui ${selected.name}`} subtitle={`${selected.department} · ${date(selected.effective_date)}`} onClose={()=>setSelected(undefined)}>
      <div className="modal-body"><p>{selected.reason}</p><label className="field">Observații<textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} maxLength={1000} placeholder="Motiv obligatoriu la respingere."/></label>
        {formError&&<ErrorMessage message={formError}/>}<div className="modal-footer"><button className="button secondary" disabled={busy||comment.trim().length<3} onClick={()=>void decide('reject')}>Respinge numirea</button><button className="button primary" disabled={busy} onClick={()=>void decide('approve')}>Aprobă numirea</button></div></div>
    </Modal>}
  </section>;
}
