import { useEffect,useState,type FormEvent } from 'react';
import { api } from '@/services/api-client';
import { ErrorMessage } from '@/components/ui';
import { date,time } from '@/utils/format';
import type { Review } from './types';
const states:Record<string,string>={unassigned:'Neatribuit',assigned:'Atribuit',needs_reassignment:'Reatribuire necesară',awaiting_second_person:'Așteaptă o altă persoană'};
export function AssignmentForm({review,onChanged}:{review:Review;onChanged:(item:Review,message:string)=>void}) {
  const [data,setData]=useState<Review>(),[assignee,setAssignee]=useState(''),[due,setDue]=useState(''),[comment,setComment]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;api<Review>(`/supplier-reviews/${review.id}`).then(v=>{if(active){setData(v);setAssignee(v.assigned_to||'');setDue(v.due_date||v.reference_date||'')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[review.id,review.status,review.assignment_revision]);
  async function submit(e:FormEvent){e.preventDefault();if(!data)return;setBusy(true);setError('');try{const v=await api<Review>(`/supplier-reviews/${data.id}/assign`,{method:'POST',body:JSON.stringify({assigned_to:assignee,due_date:due,comment,assignment_revision:data.assignment_revision})});setData(v);setComment('');onChanged(v,'Responsabilul a fost înregistrat.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <section className="review-decision-form"><h3>Responsabil și termen</h3>{error&&<ErrorMessage message={error}/>}<p>{data?.assignee||'Fără responsabil'} · {states[data?.assignment_state||review.assignment_state]} · {date(data?.due_date||review.due_date)}{(data?.overdue??review.overdue)?' · Termen depășit':''}</p>
    {data?.can_assign&&<form onSubmit={submit}><label className="field">Responsabil<select required value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Alege o persoană autorizată</option>{data.eligible_assignees?.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label className="field">Termen<input required type="date" min={data.reference_date} value={due} onChange={e=>setDue(e.target.value)}/></label><label className="field">Motiv<textarea required minLength={3} maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)}/></label><button className="button secondary" disabled={busy}>Salvează atribuirea</button></form>}
    {data?.assignment_history.map((h,i)=><small className="assignment-history" key={i}>{h.actor} · {time(h.created_at)} · {h.comment}</small>)}
  </section>;
}
