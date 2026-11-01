import {useRef, useState} from 'react';
import {Download, Filter, Maximize2, Minimize2, RefreshCw, Star, X, SlidersHorizontal, Database, LayoutDashboard, Info, ArrowUpRight, LockKeyhole, Printer, CalendarDays, ArrowRight, CircleCheck, CircleAlert} from 'lucide-react';
import {download} from '@/services/api-client';
import type {Page} from '@/types';
import type {ReportData, ReportRow, ReportFocus} from './types';
import type {Dimension, Selection} from './analysis';
import {ageDays, filterRows, groups} from './analysis';
import {label, shortDate} from './labels';
import {ReportCanvas} from './ReportCanvas';
import {ReportTable} from './ReportTable';
import {Panel} from './bi-visuals';

const dimensions: {id: Dimension; name: string}[] = [{id: 'status', name: 'Stare'}, {id: 'category', name: 'Tip / categorie'}, {id: 'owner', name: 'Responsabil / destinatar'}, {id: 'supplier', name: 'Furnizor'}, {id: 'currency', name: 'Monedă'}];
const dimensionNames: Record<Dimension, string> = {status: 'Stare', category: 'Categorie', owner: 'Responsabil', supplier: 'Furnizor', currency: 'Monedă', department: 'Departament', case_id: 'Dosar', flow_stage: 'Etapă'};
const tabs = [{id: 'report', name: 'Privire de ansamblu', icon: LayoutDashboard}, {id: 'data', name: 'Date sursă', icon: Database}, {id: 'context', name: 'Despre raport', icon: Info}];

function ReportBrief({data, rows, onData}: {data: ReportData; rows: ReportRow[]; onData: () => void}) {
  const days = (row: ReportRow) => ageDays(row.date, data.reference_date);
  let count: number, message: string, empty: string;
  switch (data.report.id) {
    case 'contracts': count = rows.filter(r => r.validated && r.status!=='archived' && days(r) !== null && days(r)! >= 0 && days(r)! <= 30).length; message = 'contracte validate ajung la scadență în următoarele 30 de zile.'; empty = 'Niciun contract validat, nearhivat nu ajunge la scadență în următoarele 30 de zile.'; break;
    case 'approvals': count = rows.filter(r => r.status === 'pending' && r.overdue).length; message = 'sarcini deschise au termenul depășit.'; empty = 'Nicio sarcină deschisă cu termen depășit în această selecție.'; break;
    case 'suppliers': count = rows.filter(r => ['needs_review', 'verified'].includes(r.status)).length; message = 'verificări de furnizori așteaptă analiză sau decizie.'; empty = 'Nicio verificare în așteptarea unei decizii în această selecție.'; break;
    case 'people': count = rows.filter(r => r.status !== 'available').length; message = 'colegi sunt indisponibili la data de referință.'; empty = 'Toți colegii din selecție sunt disponibili la data de referință.'; break;
    case 'sharing': count = rows.filter(r => r.status === 'active' && days(r) !== null && days(r)! >= 0 && days(r)! <= 7).length; message = 'accese active expiră în următoarele 7 zile.'; empty = 'Niciun acces activ nu expiră în următoarele 7 zile.'; break;
    case 'maintenance': count = rows.filter(r => r.validated && r.status !== 'archived' && days(r) !== null && days(r)! < 0).length; message = 'documente tehnice validate au termenul depășit.'; empty = 'Niciun termen depășit pentru documentele tehnice validate, nearhivate.'; break;
    case 'procurement': count = rows.filter(r => !r.case_id).length; message = 'documente de achiziție nu sunt asociate unui dosar.'; empty = 'Toate documentele din selecție sunt asociate unui dosar.'; break;
    default: count = rows.filter(r => !r.validated).length; message = 'documente așteaptă validarea metadatelor.'; empty = 'Toate documentele din selecție au metadatele validate.';
  }
  if (count === 1) {
    const singular: Record<string, string> = {contracts: 'contract ajunge la scadență în următoarele 30 de zile.', approvals: 'sarcină deschisă are termenul depășit.', suppliers: 'verificare de furnizor așteaptă analiză sau decizie.', people: 'coleg este indisponibil la data de referință.', sharing: 'acces activ expiră în următoarele 7 zile.', maintenance: 'document tehnic validat are termenul depășit.', procurement: 'document de achiziție nu este asociat unui dosar.'};
    message = singular[data.report.id] || 'document așteaptă validarea metadatelor.';
  }
  return <div className={`bi-brief ${count ? 'attention' : ''}`}>
    {count ? <CircleAlert size={21}/> : <CircleCheck size={21}/>}<div><span>DE REȚINUT DIN SELECȚIE</span><p>{rows.length ? count ? <><strong>{count}</strong> {message}</> : empty : 'Nu există înregistrări pentru filtrele selectate. Ajustează filtrele pentru a continua.'}</p></div><button onClick={onData}>Vezi datele sursă<ArrowRight size={15}/></button>
  </div>;
}

export function PowerReport({data, days, department, onDays, onDepartment, onOpen, onNavigate, onRefresh, refreshing, pinned, onPin, notify}: {data: ReportData; days: number; department: string; onDays: (days: number) => void; onDepartment: (value: string) => void; onOpen: (id: string) => void; onNavigate: (page: Page) => void; onRefresh: () => void; refreshing: boolean; pinned: boolean; onPin: () => void; notify: (message: string) => void}) {
  const [selection, setSelection] = useState<Selection>(()=>{const status=new URLSearchParams(location.hash.split('?')[1]||'').get('status');return status?{status}:{};}), [filters, setFilters] = useState(false), [tab, setTab] = useState(()=>new URLSearchParams(location.hash.split('?')[1]||'').get('view')==='data'?'data':'report'), [exporting, setExporting] = useState(false);
  const [focus,setFocus] = useState<ReportFocus>(()=>{const value=new URLSearchParams(location.hash.split('?')[1]||'').get('focus');return value==='due30'||value==='overdue'?value:'';});
  const ref = useRef<HTMLDivElement>(null);
  const focusedRows = data.rows.filter(row=>{if(!focus)return true;const remaining=ageDays(row.date,data.reference_date);if(focus==='due30')return !!row.validated&&row.status!=='archived'&&remaining!==null&&remaining>=0&&remaining<=30;return data.report.id==='approvals'?row.status==='pending'&&row.overdue:!!row.validated&&row.status!=='archived'&&remaining!==null&&remaining<0;});
  const rows = filterRows(focusedRows, selection);
  const sourcePage: Page = data.report.id === 'people' ? 'people' : data.report.id === 'approvals' ? 'approvals' : data.report.id === 'contracts' ? 'contracts' : data.report.id === 'suppliers' ? 'suppliers' : data.report.id === 'sharing' ? 'sharing' : 'documents';
  function set(field: Dimension, value: string) { setSelection(prev => { const next = {...prev}; if (!value) delete next[field]; else next[field] = value; return next; }); }
  function pick(field: Dimension, value: string) { setSelection(prev => { const next = {...prev}; if (next[field] === value) delete next[field]; else next[field] = value; return next; }); }
  function pair(a: Dimension, x: string, b: Dimension, y: string) { setSelection(prev => { const next = {...prev}; if (next[a] === x && next[b] === y) { delete next[a]; delete next[b]; } else { next[a] = x; next[b] = y; } return next; }); }
  function reset() { setSelection({}); setFocus(''); if (department) onDepartment(''); }
  async function exportData() {
    setExporting(true);
    try { await download(`/reports/${encodeURIComponent(data.report.id)}/export.csv?days=${days}&department=${encodeURIComponent(data.department)}&as_of=${data.reference_date}`, `aerodesk-${data.report.id}.csv`); notify('Raportul complet a fost exportat în CSV.'); }
    catch (e) { notify((e as Error).message); }
    finally { setExporting(false); }
  }
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await ref.current?.requestFullscreen(); }
    catch { notify('Modul ecran complet nu este disponibil în acest browser.'); }
  }
  const active = Object.entries(selection), filterCount = active.length + (department ? 1 : 0) + (focus?1:0);
  const hasActivity = ['overview', 'documents'].includes(data.report.id);
  return <div ref={ref} className={`bi-report bi-theme-${data.report.id}`}>
    <header className="bi-report-header"><div><span className="bi-eyebrow">{data.report.category} / AERODESK ANALYTICS</span><h1>{data.report.title}</h1><p>{data.report.subtitle}</p></div><div className="bi-toolbar">
      <button onClick={onPin} aria-pressed={pinned} aria-label="Raport favorit" title="Adaugă sau elimină din favorite"><Star size={17} fill={pinned ? 'currentColor' : 'none'}/></button>
      <button onClick={onRefresh} disabled={refreshing} aria-label="Actualizează raportul" title="Actualizează raportul"><RefreshCw size={17} className={refreshing ? 'rp-spin' : ''}/></button>
      <button onClick={fullscreen} aria-label="Comută ecran complet" title="Prezintă pe ecran complet"><Maximize2 className="bi-expand-icon" size={17}/><Minimize2 className="bi-shrink-icon" size={17}/></button>
      <button onClick={() => window.print()} disabled={refreshing} title="Tipărește vederea curentă sau salvează ca PDF"><Printer size={16}/><span>PDF / Tipărire</span></button>
      <button className="bi-export-button" onClick={exportData} disabled={exporting || refreshing} title="Exportă toate înregistrările din departamentul ales. Pentru selecția filtrată, folosește exportul din Date sursă."><Download size={16}/>{exporting ? 'Se exportă…' : 'CSV complet'}</button>
    </div></header>
    <nav className="bi-view-nav" aria-label="Vederile raportului"><div>{tabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}><t.icon size={16}/>{t.name}{t.id === 'data' && <span>{rows.length}</span>}</button>)}</div><button className="bi-filter-toggle" onClick={() => setFilters(!filters)} aria-expanded={filters} aria-controls="report-filters"><SlidersHorizontal size={16}/>Filtre{filterCount > 0 && <b>{filterCount}</b>}</button></nav>
    <div className="bi-selection-bar"><div><span className="bi-snapshot-dot"/><span aria-live="polite">{refreshing ? 'Se actualizează datele…' : `${rows.length} din ${data.total} înregistrări`}</span><span className="bi-bar-divider"/>{data.department || 'Toate departamentele'}</div>{hasActivity && tab === 'report' ? <div className="bi-period"><span>Activitate</span>{[30, 90, 365].map(period => <button key={period} aria-pressed={days === period} onClick={() => onDays(period)} title="Perioada se aplică doar graficului de înregistrări create">{period === 365 ? '1 an' : `${period} zile`}</button>)}</div> : <span>Selectează un element din grafic pentru a filtra</span>}</div>
    {(active.length > 0 || department || focus) && <div className="bi-active-filters"><Filter size={14}/>{department && <button onClick={() => onDepartment('')}>Departament: {department}<X size={13}/></button>}{focus&&<button onClick={()=>setFocus('')}>{focus==='due30'?'Scadență în 30 zile':'Termen depășit'}<X size={13}/></button>}{active.map(([field, value]) => <button key={field} onClick={() => set(field as Dimension, '')}>{dimensionNames[field as Dimension]}: {label(value)}<X size={13}/></button>)}<button className="bi-reset" onClick={reset}>Șterge toate filtrele</button></div>}
    <div className="bi-print-context">{focus&&<p>Selecție: {focus==="due30"?"Scadențe validate în următoarele 30 zile":"Termene depășite"}</p>}FlyLeaf · Date demonstrative · {rows.length} înregistrări · {data.department || 'Toate departamentele'}<br/>Referință termene: {shortDate(data.reference_date)} · Generat: {shortDate(data.generated_at)}{hasActivity && <> · Activitate: {data.activity.start} — {data.activity.end}</>}{active.length > 0 && <p>Filtre: {active.map(([field, value]) => `${dimensionNames[field as Dimension]}: ${label(value)}`).join(' · ')}</p>}</div>
    <div className={`bi-workspace ${filters ? 'with-filters' : ''}`}><section className="bi-canvas" aria-label={tabs.find(t => t.id === tab)?.name} aria-busy={refreshing}>
      {tab === 'report' ? <><ReportBrief data={data} rows={rows} onData={() => setTab('data')}/><ReportCanvas data={data} rows={rows} pick={pick} pair={pair} onOpen={onOpen}/></> : tab === 'data' ? <ReportTable rows={rows} title={data.table_title} reportId={data.report.id} onOpen={onOpen} onClear={reset} busy={refreshing} notify={notify}/> : <div className="bi-context">
        <Panel title="Sursă și acces"><h2>{data.report.source}</h2><p>{data.scope}</p><p><LockKeyhole size={15}/> Numerele, graficele și exporturile urmează accesul contului.</p><button onClick={() => onNavigate(sourcePage)}>Deschide modulul sursă<ArrowUpRight size={15}/></button></Panel>
        <Panel title="Cum se citesc datele"><p>Indicatorii și distribuțiile descriu situația curentă. Perioada activității filtrează numai graficul înregistrărilor create.</p><p>Termene calculate la <strong>{shortDate(data.reference_date)}</strong>. Valorile contractuale sunt separate pe monedă.</p><p>CSV complet exportă întregul domeniu al departamentului. Exportul din Date sursă include selecția din grafice, căutarea și filtrul de stare, pentru toate paginile.</p><p>PDF / Tipărire salvează vederea curentă, cu filtrele și data de referință.</p></Panel>
        <Panel title="Ultimele acțiuni accesibile"><div className="bi-audit">{data.recent_activity.length ? data.recent_activity.slice(0, 8).map(e => <div key={e.id}><span>{shortDate(e.created_at)}</span><div><strong>{e.action}</strong><small>{e.actor}</small>{e.document_id && <button onClick={() => onOpen(e.document_id!)}>{e.title}<ArrowUpRight size={13}/></button>}</div></div>) : <p>Nicio acțiune în acest domeniu.</p>}</div></Panel>
      </div>}
    </section>{filters && <aside className="bi-filter-pane" id="report-filters"><header><Filter size={16}/><strong>Restrânge perspectiva</strong><button aria-label="Închide filtrele" onClick={() => setFilters(false)}><X size={17}/></button></header><p>Indicatorii, graficele și datele sursă urmează aceeași selecție.</p><label>Departament<select value={department} onChange={e => onDepartment(e.target.value)}><option value="">Toate departamentele</option>{data.departments.map(d => <option key={d} value={d}>{label(d)}</option>)}</select></label>
      {dimensions.filter(d => groups(data.rows, d.id).some(g => g.name !== 'Nespecificat')).map(d => <label key={d.id}>{d.name}<select value={selection[d.id] || ''} onChange={e => set(d.id, e.target.value)}><option value="">Toate valorile</option>{selection[d.id] && !groups(data.rows, d.id).some(g => g.name === selection[d.id]) && <option value={selection[d.id]}>{label(selection[d.id]!)} (0)</option>}{groups(data.rows, d.id).map(g => <option key={g.name} value={g.name}>{label(g.name)} ({g.value})</option>)}</select></label>)}
      <button className="bi-clear-filters" onClick={reset} disabled={!filterCount}>Resetează filtrele</button><div className="bi-filter-note"><Info size={15}/><span>Poți filtra și direct din grafice. Repetă selecția pentru a o elimina. Agregatele marcate „Domeniu server” păstrează domeniul departamentului.</span></div>
    </aside>}</div>
    <footer className="bi-report-footer"><span><CalendarDays size={14}/>Referință termene: <strong>{shortDate(data.reference_date)}</strong></span><span><i/>Actualizat {new Intl.DateTimeFormat('ro-RO', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest'}).format(new Date(data.generated_at))} · actualizare la {data.refresh_seconds}s</span></footer>
  </div>;
}
