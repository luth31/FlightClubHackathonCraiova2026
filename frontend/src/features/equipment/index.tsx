import {t,useLanguage} from '@/i18n';
import { useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Wrench, Plus, Search, RefreshCw, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { api } from '@/services/api-client';
import { Loading, ErrorMessage, Empty, Modal, ViewActiveContext } from '@/components/ui';
import { date, time } from '@/utils/format';
import { readableText } from '@/utils/text';
import type { DocumentRecord } from '@/types';
import {EmployeePicker, type EquipmentRecipient} from './EmployeePicker';
import {DocumentPerson} from '@/features/documents/DocumentPerson';
import './equipment.css';

interface Incident { id: string; title: string; description: string; severity: string; status: string; created_at: string }
interface Job { id: string; title: string; incident_id?: string; incident_description?:string; severity?:string; kind: string; assigned_to: string; assignee: string; due_date: string; status: string; evidence: string; evidence_document_id?: string; revision: number; can_work: boolean; can_manage: boolean; can_verify: boolean; overdue: boolean; needs_reassignment: boolean }
interface Asset { id: string; code: string; name: string; category: string; location: string; supplier: string; status: string; document_id?: string; next_inspection?: string; revision: number; updated_at: string; open_incidents: number; open_jobs: number; can_manage: boolean; alert_severity?:string; support_team?:{id:string; name:string; members:EquipmentRecipient[]}|null; recipients?:EquipmentRecipient[]; incidents?: Incident[]; jobs?: Job[]; history?: Array<{ id: number; actor: string; action: string; comment: string; created_at: string }> }
interface Catalog { items: Asset[]; technicians: Array<{ id: string; name: string }>; teams:Array<{id:string;name:string}>; can_manage: boolean; reference_date: string }
const statuses: Record<string, string> = { unknown: 'De verificat', available: 'Disponibil', degraded: 'Funcționare limitată', out_of_service: 'Indisponibil', maintenance: 'În mentenanță' };
const jobStates: Record<string, string> = { assigned: 'De preluat', acknowledged: 'Preluată', in_progress: 'În lucru', blocked: 'Blocată', awaiting_verification: 'De verificat', closed: 'Verificată și închisă', cancelled: 'Anulată' };
const actions: Record<string, string> = { acknowledge: 'Confirm primirea', start: 'Încep lucrarea', block: 'Raportează blocaj', submit: 'Trimite spre verificare', verify: 'Confirmă verificarea', reject: 'Solicită refacerea', assign: 'Reatribuie', cancel: 'Anulează lucrarea', comment: 'Adaugă actualizare' };
const formTitles: Record<string, string> = { create: 'Înregistrează echipamentul', incident: 'Raportează un incident', job: 'Atribuie o lucrare', team:'Echipa responsabilă', availability: 'Verifică disponibilitatea', ...actions };

export function EquipmentPage({ assetId, workspaceHash='', onOpen, notify, onChanged }: { assetId?: string; workspaceHash?:string; onOpen: (id: string) => void; notify: (text: string) => void; onChanged: () => void }) {
  useLanguage();
  const active=useContext(ViewActiveContext);
  const focusParams=new URLSearchParams(workspaceHash.split('?')[1]||'');
  const focusId=focusParams.get('job')||focusParams.get('incident')||'';
  const lastFocus=useRef('');
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => {
    setMode(''); setFormError(''); setBusy(false);
    return () => mutation.current?.abort();
  }, [assetId]);
  const [catalog, setCatalog] = useState<Catalog>(), [asset, setAsset] = useState<Asset>();
  const [error, setError] = useState(''), [reload, setReload] = useState(0), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [tab, setTab] = useState('overview');
  const [mode, setMode] = useState(''), [job, setJob] = useState<Job>(), [incidentId, setIncidentId] = useState('');
  const [formError, setFormError] = useState(''), [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [assignedTo,setAssignedTo]=useState(''),[formRevision,setFormRevision]=useState(0);
  useEffect(() => {
    if(!active||busy)return;
    const controller = new AbortController();
    let pending=false;
    const load=()=>{
      if(pending||document.hidden)return;
      pending=true;
      void Promise.all([api<Catalog>('/equipment', { signal: controller.signal }), assetId ? api<Asset>('/equipment/' + encodeURIComponent(assetId), { signal: controller.signal }) : Promise.resolve(undefined)])
      .then(([c, a]) => { if (!controller.signal.aborted) { setCatalog(c); setAsset(a); setError(''); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(()=>{pending=false});
    };
    load();const timer=setInterval(load,3000);
    window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
    return () => {controller.abort();clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load)};
  }, [assetId, reload, active, busy]);
  useEffect(()=>{
    if(!focusId){lastFocus.current='';return}
    if(!active||asset?.id!==assetId||lastFocus.current===focusId)return;
    setTab('overview');
    const timer=setTimeout(()=>{const element=document.getElementById('equipment-item-'+focusId);if(element){element.scrollIntoView({block:'center'});element.focus({preventScroll:true});lastFocus.current=focusId}},80);
    return()=>clearTimeout(timer);
  },[focusId,asset,assetId,active]);
  useEffect(() => {
    if (!['create', 'submit'].includes(mode)) return;
    const controller = new AbortController();
    api<{ items: DocumentRecord[] }>('/documents?limit=500', { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setDocuments(d.items); }).catch(e => { if (!controller.signal.aborted) setFormError(e.message); });
    return () => controller.abort();
  }, [mode]);
  function openForm(next: string, selected?: Job, incident = '') { setMode(next); setJob(selected); setIncidentId(incident); setFormError(''); setAssignedTo(selected?.assigned_to||'');setFormRevision(asset?.revision||0); }
  async function update(path: string, body: unknown) {
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setFormError('');
    try {
      const result = await api<Asset>(path, { method: 'POST', signal: controller.signal, body: JSON.stringify(body) });
      if (controller.signal.aborted) return;
      setMode(''); onChanged(); setReload(n => n + 1); notify('Actualizarea a fost înregistrată.');
      if (!assetId) location.hash = 'equipment/' + encodeURIComponent(result.id);
      else setAsset(result);
    } catch (e) { if (!controller.signal.aborted) setFormError((e as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return;
    const form = new FormData(e.currentTarget), value = (key: string) => String(form.get(key) || '');
    if(['job','assign'].includes(mode)&&!assignedTo){setFormError('Alege responsabilul din lista de angajați.');return}
    const base = '/equipment/' + encodeURIComponent(assetId || '');
    if (mode === 'create') void update('/equipment', { code: value('code'), name: value('name'), category: value('category'), location: value('location'), supplier: value('supplier'), document_id: value('document_id') || null, next_inspection: value('next_inspection') || null, support_team_id:value('support_team_id')||null });
    else if (mode === 'incident') void update(base + '/incidents', { title: value('title'), description: value('description'), severity: value('severity'), ...(assignedTo?{assigned_to:assignedTo,due_date:value('due_date')}: {}) });
    else if (mode === 'job') void update(base + '/jobs', { title: value('title'), kind: value('kind'), incident_id: value('incident_id') || null, assigned_to: value('assigned_to'), due_date: value('due_date') });
    else if (mode === 'availability') void update(base + '/availability', { revision: formRevision, status: value('status'), comment: value('comment'), next_inspection: value('next_inspection') || null });
    else if (mode === 'team') void update(base+'/team',{revision:formRevision,support_team_id:value('support_team_id')||null});
    else if (job) void update(base + '/jobs/' + job.id + '/actions', { action: mode, revision: job.revision, comment: value('comment'), ...(mode === 'assign' ? { assigned_to: value('assigned_to'), due_date: value('due_date') || null } : {}), ...(mode === 'submit' ? { evidence_document_id: value('document_id') || null } : {}) });
  }
  function simpleAction(action: string, selected: Job) {
    void update('/equipment/' + assetId + '/jobs/' + selected.id + '/actions', { action, revision: selected.revision });
  }
  const documentSelect = <label>{t("Document asociat")}<select name="document_id" defaultValue=""><option value="">{t("Fără document atașat")}</option>{documents.map(d => <option key={d.id} value={d.id}>{readableText(d.number + ' · ' + d.title)}</option>)}</select></label>;
  const assignment = <><EmployeePicker people={asset?.recipients||[]} value={assignedTo} onChange={setAssignedTo} required={mode!=='incident'} disabled={busy} teamName={asset?.support_team?.name}/><label>{t("Termen de lucru")}<input name="due_date" type="date" required={mode!=='incident'||!!assignedTo} defaultValue={job?.due_date || catalog?.reference_date}/></label></>;
  const teamSelect=<label>{t("Echipă responsabilă")}<select name="support_team_id" defaultValue={asset?.support_team?.id||''}><option value="">{t("Echipă nedesemnată")}</option>{catalog?.teams?.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label>;
  if (error) return <ErrorMessage message={error} retry={() => setReload(n => n + 1)}/>;
  if (!catalog || (assetId ? asset?.id !== assetId : !!asset)) return <Loading/>;
  const filtered = catalog.items.filter(a => (!status || a.status === status) && readableText(a.code + ' ' + a.name + ' ' + a.location).toLocaleLowerCase('ro').includes(query.toLocaleLowerCase('ro')));
  return <div className="equipment-workspace workspace-content">
    {asset && <button className="text-button workspace-back" onClick={() => { location.hash = 'equipment'; }}><ArrowLeft size={16}/>{t("Toate echipamentele")}</button>}
    <div className="page-heading"><div><div className="eyebrow">{t("STARE, RESPONSABIL ȘI ISTORIC")}</div><h1>{asset ? asset.code + ' · ' + asset.name : t("Echipamente")}</h1><p>{asset ? asset.category + ' · ' + asset.location : t("Urmărește incidentele și lucrările până la verificarea lor.")}</p></div><div className="heading-actions"><button className="button secondary" aria-label={t("Actualizează echipamentele")} onClick={() => setReload(n => n + 1)}><RefreshCw size={16}/></button>{asset ? <button className="button primary" onClick={() => openForm('incident')}><AlertTriangle size={16}/>{t("Raportează incident")}</button> : catalog.can_manage && <button className="button primary" onClick={() => openForm('create')}><Plus size={16}/>{t("Adaugă echipament")}</button>}</div></div>
    {formError && !mode && <ErrorMessage message={formError} retry={() => { setFormError(''); setReload(n => n + 1); }}/>}
    {!asset ? <>
      <div className="workspace-kpis"><button onClick={() => setStatus('')} aria-pressed={!status}><span>{t("În registru")}</span><strong>{catalog.items.length}</strong><small>{t("Echipamente înregistrate")}</small></button><button onClick={() => setStatus('available')} aria-pressed={status === 'available'}><span>{t("Disponibile")}</span><strong>{catalog.items.filter(a => a.status === 'available').length}</strong><small>{t("Disponibilitate confirmată")}</small></button><button onClick={() => setStatus('out_of_service')} aria-pressed={status === 'out_of_service'}><span>{t("Indisponibile")}</span><strong>{catalog.items.filter(a => a.status === 'out_of_service').length}</strong><small>{t("Stare înregistrată")}</small></button><button onClick={() => setStatus('unknown')} aria-pressed={status === 'unknown'}><span>{t("De verificat")}</span><strong>{catalog.items.filter(a => a.status === 'unknown').length}</strong><small>{t("Disponibilitate neconfirmată")}</small></button></div>
      <div className="panel"><div className="workspace-filters"><label className="search-input"><Search size={17}/><input aria-label={t("Caută în echipamente")} placeholder={t("Cod, denumire sau locație…")} value={query} onChange={e => setQuery(e.target.value)}/></label><label>{t("Disponibilitate")}<select value={status} onChange={e => setStatus(e.target.value)}><option value="">{t("Toate stările")}</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label></div>
      {!filtered.length ? <Empty title={catalog.items.length ? t("Niciun echipament pentru aceste filtre") : t("Începe registrul de echipamente")} message={catalog.can_manage ? t("Adaugă primul echipament, documentul său și data următoarei inspecții.") : t("Coordonatorul tehnic poate înregistra echipamente. Aici vei găsi fișele și lucrările lor.")}/> : <div className="asset-grid">{filtered.map(a => <button key={a.id} className={`asset-card ${a.open_incidents ? 'asset-alert asset-alert-'+a.alert_severity : ''}`} onClick={() => { location.hash = 'equipment/' + a.id; }}><div><Wrench size={22}/><span className={'asset-status asset-' + a.status}>{t(statuses[a.status])}</span></div><h2>{a.code} · {a.name}</h2><p>{a.category} · {a.location}</p>{a.open_incidents>0&&<span className="equipment-alert-label"><AlertTriangle size={15}/>{a.open_incidents} {t("incidente deschise")}{a.alert_severity==='high'?t(" · Prioritate ridicată"):''}</span>}<small>{a.open_jobs} {t("lucrări active ·")}{' '}{a.support_team?.name||t("Echipă nedesemnată")}</small><small>{t("Inspecție:")}{' '}{a.next_inspection ? date(a.next_inspection) : t("Neplanificată")}</small><span className="asset-open">{t("Deschide fișa")}{' '}<ArrowUpRight size={16}/></span></button>)}</div>}</div>
      <p className="workspace-note">{t("Stările sunt înregistrate de echipă. Fiecare fișă arată ultima actualizare și istoricul verificărilor.")}</p>
    </> : <>
      <div className="asset-summary"><span className={'asset-status asset-' + asset.status}>{t(statuses[asset.status])}</span><span>{t("Ultima actualizare:")}{' '}{time(asset.updated_at)}</span><span>{t("Inspecție:")}{' '}{asset.next_inspection ? date(asset.next_inspection) : t("Neplanificată")}</span>{asset.document_id && <button className="text-button" onClick={() => onOpen(asset.document_id!)}>{t("Document asociat")}<ArrowUpRight size={15}/></button>}</div>
      <div className="equipment-support-team"><div><strong>{asset.support_team?.name||t("Echipă responsabilă nedesemnată")}</strong><p>{asset.support_team?t("Membrii echipei primesc avertizările în Acasă."):t("Incidentele ajung la coordonator pentru repartizare.")}</p></div><div className="equipment-team-members">{asset.support_team?.members.map(p=><DocumentPerson key={p.id} name={p.name} userId={p.id}/>)}</div>{asset.can_manage&&<button className="text-button" onClick={()=>openForm('team')}>{t("Schimbă echipa")}</button>}</div>
      {asset.can_manage && <div className="asset-tools"><button className="button secondary" onClick={() => openForm('job')}><Wrench size={16}/>{t("Atribuie lucrare")}</button><button className="button secondary" onClick={() => openForm('availability')}><ClipboardCheck size={16}/>{t("Verifică disponibilitatea")}</button></div>}
      <nav className="workspace-tabs" aria-label={t("Fișa echipamentului")}>{[['overview', 'Incidente și lucrări'], ['planned', 'Mentenanță planificată'], ['history', 'Istoric']].map(([key, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{t(label)}</button>)}</nav>
      {tab === 'history' ? <section className="panel equipment-history">{asset.history?.map(h => <article key={h.id}><strong>{h.action}</strong><p>{h.comment}</p><small>{h.actor} · {time(h.created_at)}</small></article>)}</section> : <>
        {tab === 'overview' && <section className="panel"><div className="workspace-section-head"><h2>{t("Incidente")}</h2><span>{asset.open_incidents} {t("deschise")}</span></div>{asset.incidents?.length ? <div className="incident-list">{asset.incidents.map(i => <article key={i.id} id={'equipment-item-'+i.id} tabIndex={-1} className={`${i.status==='open'?'incident-open incident-'+i.severity:'incident-resolved'} ${focusId===i.id?'equipment-item-focused':''}`}><div><strong>{i.status==='open'&&<AlertTriangle size={15}/>} {i.title}</strong><small>{i.status === 'open' ? t("Deschis") : t("Rezolvat")} {t("· Prioritate")}{' '}{({ low: 'scăzută', medium: 'medie', high: 'ridicată' } as Record<string, string>)[i.severity]} · {time(i.created_at)}</small><p>{i.description}</p><small>{asset.code} · {asset.location}</small></div>{asset.can_manage && i.status === 'open' && <button className="button secondary" onClick={() => openForm('job', undefined, i.id)}>{t("Atribuie lucrare")}</button>}</article>)}</div> : <Empty title={t("Niciun incident raportat")} message={t("Raportează o problemă pentru a păstra contextul și a solicita intervenția echipei.")}/>}</section>}
        <section className="panel"><div className="workspace-section-head"><h2>{tab === 'planned' ? t("Lucrări preventive") : t("Lucrări și responsabilități")}</h2></div>
          {!asset.jobs?.filter(j => tab !== 'planned' || j.kind === 'preventive').length ? <Empty title={t("Nicio lucrare în această categorie")} message={t("Coordonatorul poate atribui o intervenție sau planifica o lucrare preventivă.")}/> : <div className="equipment-jobs">{asset.jobs.filter(j => tab !== 'planned' || j.kind === 'preventive').map(j => <article key={j.id} id={'equipment-item-'+j.id} tabIndex={-1} className={`equipment-job-${j.status} ${focusId===j.id?'equipment-item-focused':''}`}>
            <div className="job-heading"><div><small>{j.kind === 'preventive' ? t("Mentenanță preventivă") : t("Intervenție")} · {t(jobStates[j.status])}{j.severity==='high'?t(" · Prioritate ridicată"):''}</small>{j.status==='assigned'&&<span className="equipment-alert-label"><AlertTriangle size={14}/>{t("Acțiune atribuită")}</span>}<h3>{j.title}</h3><p><DocumentPerson name={j.assignee} userId={j.assigned_to}/> · <span className={j.overdue ? 'work-overdue' : ''}>{date(j.due_date)}{j.overdue ? t(" · Termen depășit") : ''}</span></p><p>{asset.code} · {asset.location}</p>{j.incident_description&&<p className="job-incident-description">{j.incident_description}</p>}{j.needs_reassignment && <p className="work-overdue">{t("Responsabil indisponibil — reatribuire necesară.")}</p>}</div></div>
            {j.evidence && <div className="job-evidence"><strong>{t("Dovezi / rezultat raportat")}</strong><p>{j.evidence}</p>{j.evidence_document_id && <button className="text-button" onClick={() => onOpen(j.evidence_document_id!)}>{t("Deschide documentul de lucru")}</button>}</div>}
            {!['closed', 'cancelled'].includes(j.status) && <div className="job-actions">
              {j.can_work && j.status === 'assigned' && <button disabled={busy} className="button primary" onClick={() => simpleAction('acknowledge', j)}>{t("Confirm primirea")}</button>}
              {j.can_work && ['acknowledged', 'blocked'].includes(j.status) && <button disabled={busy} className="button primary" onClick={() => simpleAction('start', j)}>{t("Încep lucrarea")}</button>}
              {j.can_work && j.status === 'in_progress' && <button className="button primary" onClick={() => openForm('submit', j)}>{t("Trimite spre verificare")}</button>}
              {j.can_work && ['in_progress', 'acknowledged'].includes(j.status) && <button className="button secondary" onClick={() => openForm('block', j)}>{t("Raportează blocaj")}</button>}
              {j.can_verify && j.status === 'awaiting_verification' && <><button className="button primary" onClick={() => openForm('verify', j)}>{t("Confirmă verificarea")}</button><button className="button secondary" onClick={() => openForm('reject', j)}>{t("Solicită refacerea")}</button></>}
              {(j.can_work || j.can_manage) && <button className="text-button" onClick={() => openForm('comment', j)}>{t("Adaugă actualizare")}</button>}
              {j.can_manage && <><button className="text-button" onClick={() => openForm('assign', j)}>{t("Reatribuie")}</button><button className="text-button" onClick={() => openForm('cancel', j)}>{t("Anulează lucrarea")}</button></>}
            </div>}
          </article>)}</div>}
        </section>
      </>}
    </>}
    {mode && <Modal title={formTitles[mode]} subtitle={job?.title || (asset ? asset.code + ' · ' + asset.name : 'Un cod unic pentru fiecare echipament.')} onClose={() => { if (!busy) setMode(''); }}><form className="workspace-form" onSubmit={submit}>
      {mode === 'create' && <><label>{t("Cod echipament")}<input name="code" required maxLength={40} placeholder={t("B-02")}/></label><label>{t("Denumire")}<input name="name" required minLength={3} maxLength={160}/></label><label>{t("Categorie")}<input name="category" required minLength={2} maxLength={80} placeholder={t("Bandă de bagaje")}/></label><label>{t("Locație")}<input name="location" required minLength={2} maxLength={160}/></label><label>{t("Furnizor / serviciu")}<input name="supplier" maxLength={160}/></label>{teamSelect}{documentSelect}<label>{t("Următoarea inspecție")}<input name="next_inspection" type="date"/></label></>}
      {mode === 'team'&&<>{teamSelect}<p className="workspace-note">{t("Echipa aleasă primește avertizările incidentelor deschise și este sugerată prima la atribuirea lucrărilor.")}</p></>}
      {mode === 'incident' && <><label>{t("Problema pe scurt")}<input name="title" minLength={3} maxLength={160} required/></label><label>{t("Ce ai observat?")}<textarea name="description" required minLength={5} maxLength={3000} rows={4}/></label><label>{t("Prioritate raportată")}<select name="severity" defaultValue="medium"><option value="low">{t("Scăzută")}</option><option value="medium">{t("Medie")}</option><option value="high">{t("Ridicată")}</option></select></label>{asset?.support_team&&<p className="equipment-recipient-notice">{t("Avertizare pentru")}{' '}{asset.support_team.name}: {asset.support_team.members.map(p=>p.name).join(', ')||t("echipă fără membri activi")}.</p>}{asset?.can_manage&&<><h3>{t("Atribuie intervenția")}</h3>{assignment}<p className="workspace-note">{t("Poți alege orice angajat al aeroportului. Membrii echipei responsabile sunt sugerați primii. Fără destinatar, incidentul rămâne de repartizat.")}</p></>}</>}
      {mode === 'job' && <><label>{t("Lucrarea de efectuat")}<input name="title" minLength={3} maxLength={160} required defaultValue={asset?.incidents?.find(i=>i.id===incidentId)?.title||''}/></label><label>{t("Tip")}<select name="kind" defaultValue={tab === 'planned' ? 'preventive' : 'corrective'}><option value="corrective">{t("Intervenție corectivă")}</option><option value="preventive">{t("Mentenanță preventivă")}</option></select></label><label>{t("Incident asociat")}<select name="incident_id" defaultValue={incidentId}><option value="">{t("Fără incident asociat")}</option>{asset?.incidents?.filter(i => i.status === 'open').map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>{assignment}</>}
      {mode === 'availability' && <><label>{t("Stare verificată")}<select name="status" defaultValue={asset?.status}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label><label>{t("Următoarea inspecție")}<input name="next_inspection" type="date" defaultValue={asset?.next_inspection || ''}/></label><p className="workspace-note">{t("Disponibilitatea se confirmă după rezolvarea incidentelor și verificarea lucrărilor. Închiderea unei lucrări păstrează starea echipamentului până la această decizie.")}</p></>}
      {mode === 'assign' && assignment}
      {mode === 'submit' && documentSelect}
      {!['create', 'incident', 'job', 'team'].includes(mode) && <label>{mode === 'submit' ? t("Lucrarea efectuată și dovezile verificabile") : mode === 'block' ? t("Motivul blocajului și următorul pas") : t("Comentariu / rezultatul verificării")}<textarea name="comment" required minLength={5} maxLength={mode === 'availability' ? 1000 : 3000} rows={4}/></label>}
      {formError && <ErrorMessage message={formError}/>}
      <div className="workspace-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setMode('')}>{t("Renunță")}</button><button className="button primary" disabled={busy}>{busy ? t("Se salvează…") : t("Înregistrează")}</button></div>
    </form></Modal>}
  </div>;
}
