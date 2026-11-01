import {t,useLanguage} from '@/i18n';
import { useContext, useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '@/services/api-client';
import { Loading, ErrorMessage, Empty, ViewActiveContext } from '@/components/ui';
import { date, time, actionLabel } from '@/utils/format';
import { readableText } from '@/utils/text';
import type { AuditEvent, DocumentRecord, Page } from '@/types';

interface PersonalAction { id: string; document_id?: string; equipment_id?: string; job_id?:string; incident_id?:string; attention?:string; details?:string; title: string; type: string; due_date: string; description: string; overdue: boolean; target: string }
interface PersonalHome { reference_date: string; stats: { tasks: number; due_today: number; overdue: number; approvals: number; renewals: number }; actions: PersonalAction[]; recent_documents: DocumentRecord[]; activity: Array<AuditEvent & { equipment_id?: string; equipment_name?: string }> }
const labels: Record<string, string> = { reminder: 'Memento', approval: 'Aprobare', validation: 'Validare', signature: 'Semnare', renewal: 'Reînnoire', expiry: 'Valabilitate', maintenance: 'Intervenție atribuită', verification: 'Verificare lucrare', triage: 'Incident de atribuit', team_alert:'Avertizare pentru echipa ta', reassignment:'Reatribuire necesară', inspection: 'Inspecție' };

export function DashboardPage({ name, onOpen, onNavigate, onUpload, revision }: { name: string; onOpen: (id: string) => void; onNavigate: (page: Page, filter?: string) => void; onUpload: () => void; revision: number }) {
  useLanguage();
  const active = useContext(ViewActiveContext);
  const [data, setData] = useState<PersonalHome>(), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let pending=false;
    const load = () => {
      if(pending||document.hidden)return;
      pending=true;
      void api<PersonalHome>('/workspace/home', { signal: controller.signal }).then(d => { if (!controller.signal.aborted) { setData(d); setError(''); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(()=>{pending=false});
    };
    void load();
    const interval = setInterval(load, 3000);
    window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
    return () => { controller.abort(); clearInterval(interval);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load); };
  }, [revision, reload, active]);
  if (error) return <ErrorMessage message={error} retry={() => setReload(v => v + 1)}/>;
  if (!data) return <Loading/>;
  const items = data.actions.filter(a => filter === 'all' || (filter === 'overdue' && a.overdue) || (filter === 'today' && a.due_date === data.reference_date) || (filter === 'approval' && a.type === 'approval') || (filter === 'renewal' && a.type === 'renewal'));
  function open(action: PersonalAction) {
    if (action.target === 'equipment') location.hash = 'equipment/' + encodeURIComponent(action.equipment_id!) +
      (action.job_id ? '?job='+encodeURIComponent(action.job_id) : action.incident_id ? '?incident='+encodeURIComponent(action.incident_id) : '');
    else if (action.target === 'renewal') location.hash = 'documents/renewals?renewal=' + encodeURIComponent(action.id);
    else if (action.document_id) onOpen(action.document_id);
  }
  return <div className="personal-home workspace-content">
    <div className="page-heading"><div><div className="eyebrow">{t("SPAȚIUL TĂU DE LUCRU")}</div><h1>{t("Bună,")}{' '}{name.split(' ')[0]}.</h1><p>{t("Acțiunile tale, termenele tale și documentele la care revii.")}</p></div><div className="heading-actions"><button className="button secondary" aria-label={t("Actualizează activitatea mea")} onClick={() => setReload(v => v + 1)}><RefreshCw size={16}/></button><button className="button primary" onClick={onUpload}><Plus size={16}/>{t("Adaugă document")}</button></div></div>
    <p className="workspace-reference"><CalendarDays size={15}/>{date(data.reference_date)} {t("· Dată de referință")}</p>
    <div className="workspace-kpis">{[['all', 'Acțiunile mele', data.stats.tasks], ['today', 'Scadente azi', data.stats.due_today], ['overdue', 'Termen depășit', data.stats.overdue], ['approval', 'De aprobat de mine', data.stats.approvals]].map(([key, title, value]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(String(key))}><span>{t(String(title))}</span><strong>{value}</strong><small>{t("În responsabilitatea ta")}{' '}<ArrowUpRight size={13}/></small></button>)}</div>
    <div className="personal-columns"><div>
      <section className="panel"><div className="workspace-section-head"><h2>{t("Ce ai de rezolvat")}</h2><button className="text-button" onClick={() => setFilter(filter === 'renewal' ? 'all' : 'renewal')}>{t("Reînnoirile mele (")}{data.stats.renewals})</button></div>
        <div className="workspace-filter-summary"><span>{filter === 'all' ? t("Toate acțiunile mele") : filter === 'today' ? t("Scadente azi") : filter === 'overdue' ? t("Termen depășit") : filter === 'approval' ? t("Aprobările mele") : t("Reînnoirile mele")} · {items.length}</span>{filter !== 'all' && <button className="text-button" onClick={() => setFilter('all')}>{t("Vezi toate")}</button>}</div>
        {items.length ? <div className="personal-actions">{items.map(a => <button key={a.id} className={'personal-action-'+(a.attention||'normal')} onClick={() => open(a)}><span><small className={a.overdue ? 'work-overdue' : ''}>{['danger','critical'].includes(a.attention||'')&&<AlertTriangle size={14}/>} {t(labels[a.type] || a.type)}{a.attention==='critical'?t(" · Prioritate ridicată"):''}{a.overdue ? t(" · Termen depășit") : ''}</small><strong>{readableText(a.title)}</strong><small>{a.description}</small>{a.details&&<small className="personal-action-details">{a.details}</small>}</span><span>{a.due_date ? date(a.due_date) : a.type==='team_alert'?t("Vezi incidentul"):t("De repartizat")}<ArrowUpRight size={17}/></span></button>)}</div> : <Empty title={t("Nicio acțiune în această categorie")} message={t("Când primești o sarcină sau un termen, îl găsești aici.")}/>}
      </section>
      <section className="panel"><div className="workspace-section-head"><h2>{t("Deschise recent de tine")}</h2><button className="text-button" onClick={() => onNavigate('documents')}>{t("Documente")}</button></div>{data.recent_documents.length ? <div className="lookup-results">{data.recent_documents.map(d => <button key={d.id} onClick={() => onOpen(d.id)}><span><strong>{readableText(d.title)}</strong><small>{d.number} {t("· v")}{d.version}</small></span><ArrowUpRight size={16}/></button>)}</div> : <Empty title={t("Documentele tale recente")} message={t("Documentele pe care le deschizi vor apărea aici.")}/>}</section>
    </div><aside className="panel personal-activity"><div className="workspace-section-head"><h2>{t("Activitate relevantă pentru tine")}</h2></div>{data.activity.length ? data.activity.map(a => <article key={a.id}><strong>{actionLabel[a.action] || a.action}</strong>{a.document_id && <button className="text-button" onClick={() => onOpen(a.document_id!)}>{readableText(a.document_title || '')}</button>}{a.equipment_id && <button className="text-button" onClick={() => { location.hash = 'equipment/' + encodeURIComponent(a.equipment_id!); }}>{a.equipment_name}</button>}<small>{a.actor} · {time(a.created_at)}</small></article>) : <Empty title={t("Nicio activitate încă")} message={t("Vei vedea acțiunile tale și actualizările documentelor și echipamentelor de care răspunzi.")}/>}</aside></div>
  </div>;
}
