import {t,useLanguage} from '@/i18n';
import {Check,FileText,FileCheck2,PenLine,Flag,Clock3} from 'lucide-react';
import {time,actionLabel,statusLabel} from '@/utils/format';
import type {DocumentRecord} from '@/types';
import {documentProgress} from './workflow-progress';
import './document-workflow.css';

export function DocumentWorkflowProgress({doc}:{doc:DocumentRecord}) {
  useLanguage();
  const steps=documentProgress(doc),icons=[FileText,FileCheck2,PenLine,Flag];
  return <ol className="document-progress" aria-label={t("Etapele documentului")}>{steps.map((step,index)=>{const Icon=icons[index]||Flag;return <li key={step.label} className={step.state} aria-current={step.state==='current'?'step':undefined}><span className="progress-icon">{step.state==='completed'?<Check size={19}/>:<Icon size={19}/>}</span><div><strong>{t(step.label)}</strong><small>{step.state==='upcoming'?t("În așteptare"):t(step.note)}</small></div></li>})}</ol>;
}

export function DocumentActivity({doc}:{doc:DocumentRecord}) {
  useLanguage();
  const events=(doc.audit||[]).filter(event=>!['Document consultat','Document descărcat'].includes(event.action)).slice(0,4),steps=(doc.workflow?.steps||[]).filter(step=>step.actor);
  return <section className="panel document-activity"><h2>{t("Activitate")}</h2>{events.length?<ol>{events.map(event=><li key={event.id}><time>{time(event.created_at)}</time><span className="activity-mark"/><div><strong>{event.actor}</strong><p>{actionLabel[event.action]||event.action}</p></div></li>)}</ol>:<p className="quiet-note">{t("Documentul a fost încărcat. Urmează verificarea informațiilor.")}</p>}
    <div className="document-review-team"><h3>{t("Responsabili")}</h3>{steps.map((step,index)=><div key={index}><span className="review-avatar">{step.actor!.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><span><strong>{step.actor}</strong><small>{t(step.label)}</small></span>{['completed','done','approved'].includes(step.status)?<Check size={15}/>:<Clock3 size={15}/>}</div>)}{doc.workflow?.task?.status==='pending'&&<div><span className="review-avatar">{doc.workflow.task.assignee.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><span><strong>{doc.workflow.task.assignee}</strong><small>{t("În așteptare ·")}{' '}{statusLabel[doc.workflow.current_step]||doc.workflow.current_step}</small></span><Clock3 size={15}/></div>}</div>
  </section>;
}
