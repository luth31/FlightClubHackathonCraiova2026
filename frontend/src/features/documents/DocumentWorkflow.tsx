import {Check,FileText,FileCheck2,PenLine,Flag,Clock3} from 'lucide-react';
import {time,actionLabel,statusLabel} from '@/utils/format';
import type {DocumentRecord} from '@/types';
import './document-workflow.css';

export function DocumentWorkflowProgress({doc}:{doc:DocumentRecord}) {
  const extracting=['queued','processing'].includes(doc.extraction_status||'');
  const active=doc.status==='archived'||doc.status==='signed'?3:doc.status==='approved'?2:extracting?0:1;
  const steps=[{label:'Ciornă',note:extracting?'Extragere automată':'Document încărcat',icon:FileText},{label:'Verificare și aprobare',note:doc.status==='in_review'?'În așteptarea aprobării':doc.validated?'Date confirmate':'Verificarea datelor extrase',icon:FileCheck2},{label:'Semnare',note:doc.status==='approved'?'Pregătit pentru semnare':'După aprobare',icon:PenLine},{label:'Finalizat',note:doc.status==='archived'?'Document arhivat':'Document semnat',icon:Flag}];
  return <ol className="document-progress" aria-label="Etapele documentului">{steps.map((step,index)=><li key={step.label} className={index<active?'completed':index===active?'current':'upcoming'} aria-current={index===active?'step':undefined}><span className="progress-icon">{index<active?<Check size={19}/>:<step.icon size={19}/>}</span><div><strong>{step.label}</strong><small>{index>active?'În așteptare':step.note}</small></div></li>)}</ol>;
}

export function DocumentActivity({doc}:{doc:DocumentRecord}) {
  const events=(doc.audit||[]).filter(event=>!['Document consultat','Document descărcat'].includes(event.action)).slice(0,4),steps=(doc.workflow?.steps||[]).filter(step=>step.actor);
  return <section className="panel document-activity"><h2>Activitate</h2>{events.length?<ol>{events.map(event=><li key={event.id}><time>{time(event.created_at)}</time><span className="activity-mark"/><div><strong>{event.actor}</strong><p>{actionLabel[event.action]||event.action}</p></div></li>)}</ol>:<p className="quiet-note">Documentul a fost încărcat. Urmează verificarea informațiilor.</p>}
    <div className="document-review-team"><h3>Responsabili</h3>{steps.map((step,index)=><div key={index}><span className="review-avatar">{step.actor!.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><span><strong>{step.actor}</strong><small>{step.label}</small></span>{['completed','done','approved'].includes(step.status)?<Check size={15}/>:<Clock3 size={15}/>}</div>)}{doc.workflow?.task?.status==='pending'&&<div><span className="review-avatar">{doc.workflow.task.assignee.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><span><strong>{doc.workflow.task.assignee}</strong><small>În așteptare · {statusLabel[doc.workflow.current_step]||doc.workflow.current_step}</small></span><Clock3 size={15}/></div>}</div>
  </section>;
}
