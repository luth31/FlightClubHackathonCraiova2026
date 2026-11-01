import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useState} from 'react';
import {ArrowDown, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight, Download, Search, X} from 'lucide-react';
import {amount, label, shortDate} from './labels';
import {downloadRows, searchText} from './export';
import type {ReportRow} from './types';

export function ReportTable({rows, title, reportId, onOpen, onClear, busy, notify}: {rows: ReportRow[]; title: string; reportId: string; onOpen: (id: string) => void; onClear: () => void; busy: boolean; notify: (message: string) => void}) {
  useLanguage();
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [page, setPage] = useState(0), [sort, setSort] = useState<'title' | 'date' | 'value'>('date'), [descending, setDescending] = useState(false);
  const filtered = rows.filter(r => (status === 'all' || r.status === status) && searchText([r.title, r.number, r.owner, r.department, r.supplier, r.category].filter(Boolean).join(' ')).includes(searchText(search)));
  const ordered = [...filtered].sort((a, b) => {
    const first = a[sort], second = b[sort];
    if (first == null || first === '') return second == null || second === '' ? 0 : 1;
    if (second == null || second === '') return -1;
    // Keep currencies separate instead of suggesting exchange-rate comparison.
    if (sort === 'value' && a.currency !== b.currency) return (a.currency || 'RON').localeCompare(b.currency || 'RON');
    const result = sort === 'value' ? Number(first) - Number(second) : String(first).localeCompare(String(second), 'ro');
    return descending ? -result : result;
  });
  const pages = Math.max(1, Math.ceil(ordered.length / 15)), current = Math.min(page, pages - 1);
  const financial = rows.some(r => r.value != null), hasLinks = rows.some(r => r.document_id);
  function order(key: 'title' | 'date' | 'value') { setDescending(sort === key ? !descending : false); setSort(key); setPage(0); }
  function arrow(key: string) { return sort === key ? (descending ? <ArrowDown size={13}/> : <ArrowUp size={13}/>) : null; }
  const sortState = (key: string) => sort === key ? descending ? 'descending' as const : 'ascending' as const : undefined;
  function clear() { setSearch(''); setStatus('all'); setPage(0); onClear(); }
  function exportData() { downloadRows(ordered, reportId); notify(`${ordered.length} înregistrări exportate din selecția curentă.`); }
  return <section className="rp-panel rp-register" id="rp-register">
    <div className="rp-panel-title"><div><span className="rp-overline">{t("TRASABILITATE, PÂNĂ LA SURSĂ")}</span><h3>{title}<span className="rp-count">{rows.length}</span></h3><p>{hasLinks ? t("Deschide o înregistrare pentru a consulta documentul original.") : t("Înregistrările accesibile din domeniul raportului.")}</p></div><button className="rp-secondary-button" onClick={exportData} disabled={busy || !ordered.length}><Download size={15}/>{t("Export selecție (")}{ordered.length})</button></div>
    <div className="rp-table-controls"><label className="rp-table-search"><Search size={17}/><input aria-label={t("Caută în raport")} placeholder={t("Caută titlu, număr, responsabil…")} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}/>{search && <button aria-label={t("Șterge căutarea din raport")} onClick={() => { setSearch(''); setPage(0); }}><X size={15}/></button>}</label><select aria-label={t("Filtrează starea")} value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">{t("Toate stările")}</option>{status !== 'all' && !rows.some(r => r.status === status) && <option value={status}>{label(status)} (0)</option>}{[...new Set(rows.map(r => r.status))].map(s => <option key={s} value={s}>{label(s)}</option>)}</select><span aria-live="polite">{ordered.length} {t("rezultate")}</span></div>
    <p className="rp-table-print-note">{ordered.length} {t("înregistrări")}{search && t(" · Căutare: {p0}", {p0:search})}{status !== 'all' && t(" · Stare: {p0}", {p0:label(status)})}</p>
    <div className="rp-table-scroll"><table><thead><tr><th aria-sort={sortState('title')}><span className="rp-print-heading">{t("Înregistrare")}</span><button onClick={() => order('title')}>{t("Înregistrare")}{arrow('title')}</button></th><th>{t("Departament")}</th><th>{t("Responsabil / destinatar")}</th>{financial && <th aria-sort={sortState('value')}><span className="rp-print-heading">{t("Valoare")}</span><button onClick={() => order('value')} title={t("Ordonează valorile în cadrul fiecărei monede")}>{t("Valoare")}{arrow('value')}</button></th>}<th>{t("Stare")}</th><th aria-sort={sortState('date')}><span className="rp-print-heading">{t("Termen / dată")}</span><button onClick={() => order('date')}>{t("Termen / dată")}{arrow('date')}</button></th>{hasLinks && <th><span className="rp-sr-only">{t("Document sursă")}</span></th>}</tr></thead><tbody>{ordered.map((r, index) => <tr key={r.id} className={index < current * 15 || index >= (current + 1) * 15 ? 'rp-print-row' : ''}><td>{r.document_id ? <button className="rp-row-title" onClick={() => onOpen(r.document_id!)}>{r.title}<small>{r.number || r.id}{r.version ? t(" · v{p0}", {p0:r.version}) : ''}</small></button> : <span className="rp-row-title">{r.title}<small>{r.number || r.id}</small></span>}</td><td>{label(r.department)}</td><td><PersonReference name={label(r.owner)}/></td>{financial && <td className="rp-table-amount">{r.value != null ? amount(r.value, r.currency || 'RON') : '—'}</td>}<td><span className={`rp-state rp-state-${r.status}`}><i/>{label(r.status)}</span></td><td className={r.overdue || (r.days_remaining != null && r.days_remaining < 0) ? 'rp-overdue' : ''}>{shortDate(r.date)}</td>{hasLinks && <td>{r.document_id && <button className="rp-row-open" aria-label={t("Deschide {p0}", {p0:r.title})} onClick={() => onOpen(r.document_id!)}><ArrowUpRight size={16}/></button>}</td>}</tr>)}</tbody></table>{!ordered.length && <div className="rp-empty-state"><Search size={24}/><h3>{t("Nicio înregistrare pentru această selecție.")}</h3><p>{t("Ajustează căutarea sau filtrele pentru a vedea datele.")}</p><button className="rp-secondary-button" onClick={clear}>{t("Resetează căutarea și filtrele")}</button></div>}</div>
    <div className="rp-table-footer"><span>{ordered.length ? current * 15 + 1 : 0}–{Math.min((current + 1) * 15, ordered.length)} {t("din")}{' '}{ordered.length} {t("înregistrări")}</span><div><button disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={t("Pagina anterioară")}><ChevronLeft size={16}/></button><span>{t("Pagina")}{' '}{current + 1} {t("din")}{' '}{pages}</span><button disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label={t("Pagina următoare")}><ChevronRight size={16}/></button></div></div>
  </section>;
}
