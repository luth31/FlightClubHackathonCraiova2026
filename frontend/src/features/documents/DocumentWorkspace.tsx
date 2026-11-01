import { useContext, useEffect, useState } from 'react';
import { Search, Plus, ArrowUpRight, FileText, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { api, download } from '@/services/api-client';
import { Loading, ErrorMessage, Empty, Status, ViewActiveContext } from '@/components/ui';
import { date, money } from '@/utils/format';
import { readableText } from '@/utils/text';
import { DocumentLibrary } from './DocumentLibrary';
import { ApprovalsPage } from '@/features/approvals';
import { ContractRenewals } from '@/features/contracts/ContractRenewals';
import type { DocumentView } from '@/services/navigation';
import type { DocumentRecord, User } from '@/types';
import {DocumentExpiry, expiryPresentation} from './DocumentExpiry';
import {DocumentPerson} from './DocumentPerson';
import './documents.css';

interface Register {
  items: Array<DocumentRecord & { validity: string }>;
  total: number; my_approvals: number; my_actions: number; reference_date: string;
  counters: { total: number; expiring: number; expired: number; unknown: number };
  facets: { categories: string[]; departments: string[]; suppliers: string[]; owners: string[]; metadata_keys?: string[] };
}
const validityLabels: Record<string, string> = { unknown: 'De verificat / fără dată', expiring: 'Expiră în 30 zile', expired: 'Expirat', valid: 'Dată în viitor' };
const filterDefaults = {q:'', status:'', category:'', department:'', supplier:'', owner:'', validity_filter:'', mine:'', contract_status:'',
  created_from:'', created_to:'', expires_from:'', expires_to:'', metadata_key:'', metadata_value:'', validated:'', follow_up:'', sort_by:'updated_at', sort_order:'desc'};
const metadataLabels: Record<string, string> = {effective_date:'Valabil de la', contract_type:'Tip contract', equipment_id:'Echipament',
  supplier_iban:'IBAN furnizor', supplier_contact:'Contact furnizor', procurement_reference:'Referință achiziție',
  department:'Departament', expiry_date:'Data expirării', revision_date:'Data reviziei', cost_center:'Centru de cost',
  asset_id:'Identificator echipament', invoice_number:'Număr factură', supplier_cui:'CUI furnizor'};
function filtersFromRoute(hash: string, query: string, filter: string) {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const result = {...filterDefaults};
  for (const key of Object.keys(result) as Array<keyof typeof result>) if (params.has(key)) result[key] = params.get(key)!;
  return {...result, q: params.get('q') || query,
    status: ['draft','in_review','approved','signed','archived'].includes(filter) ? filter : params.get('status') || '',
    category: params.get('category') || '', department: params.get('department') || '', supplier: params.get('supplier') || '', owner: params.get('owner') || '',
    validity_filter: filter === 'soon' ? 'expiring' : filter === 'expired' ? 'expired' : params.get('validity_filter') || '', mine: params.get('mine') || '',
    contract_status: filter === 'active' ? 'active' : params.get('contract_status') || ''};
}
function offsetFromRoute(hash: string) {
  const page = Number(new URLSearchParams(hash.split('?')[1] || '').get('page') || 1);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? (page - 1) * 30 : 0;
}

export function DocumentWorkspace({ view, workspaceHash, initialFilter, initialQuery, renewalId, onView, onOpen, onUpload, notify, revision, user }: {
  workspaceHash: string;
  user: User;
  view: DocumentView; initialFilter: string; initialQuery: string; renewalId?: string;
  onView: (view: DocumentView) => void; onOpen: (id: string) => void; onUpload: () => void; notify: (text: string) => void; revision: number;
}) {
  const active = useContext(ViewActiveContext);
  const [data, setData] = useState<Register>(), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(() => filtersFromRoute(workspaceHash, initialQuery, initialFilter));
  const [offset, setOffset] = useState(() => offsetFromRoute(workspaceHash)), [retry, setRetry] = useState(0);
  useEffect(() => {
    setFilters(current => {
      const next = filtersFromRoute(workspaceHash, initialQuery, initialFilter);
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
    setOffset(offsetFromRoute(workspaceHash));
  }, [workspaceHash, initialQuery, initialFilter]);
  useEffect(() => {
    if (!active || !['list', 'contracts'].includes(view)) return;
    const controller = new AbortController();
    const params = new URLSearchParams(Object.entries(filters).filter(([key, value]) => !!value && value !== filterDefaults[key as keyof typeof filterDefaults]));
    if (view === 'contracts') params.set('category', 'Contract');
    else params.delete('contract_status');
    if (offset) params.set('page', String(1 + offset / 30));
    window.history.replaceState(window.history.state, '', '#documents' + (view === 'list' ? '' : '/' + view) + (params.size ? '?' + params : ''));
    params.delete('page');
    params.set('offset', String(offset)); params.set('limit', '30');
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      api<Register>('/workspace/documents?' + params, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) setData(result);
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, view, revision, offset, retry, active]);
  function filter(key: keyof typeof filters, value: string) { setFilters(f => ({ ...f, [key]: value, ...(key === 'metadata_key' ? {metadata_value:''} : {}) })); setOffset(0); }
  async function exportRegister() {
    try {
      await download('/reports/register.csv' + (view === 'contracts' ? '?category=Contract' : ''), view === 'contracts' ? 'Registru-contracte-Flyleaf.csv' : 'Registru-documente-Flyleaf.csv');
      notify('Registrul complet accesibil a fost exportat.');
    } catch (e) { notify((e as Error).message); }
  }
  const tabs: Array<[DocumentView, string]> = [['list', 'Toate documentele'], ['contracts', 'Contracte'], ['approvals', 'Aprobări și sarcini'], ['renewals', 'Reînnoiri'], ['flow', 'Flux achiziții']];
  const navigation = <nav className="workspace-tabs" aria-label="Secțiuni Documente">{tabs.map(([id, label]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => onView(id)}>{label}{id === 'approvals' && data && <span>{data.my_actions}</span>}</button>)}</nav>;
  if (view === 'flow') return <>{navigation}<DocumentLibrary onOpen={onOpen} onUpload={onUpload} notify={notify} revision={revision} preferredView="flow" onViewChange={next => { if (next === 'list') onView('list'); }}/></>;
  return <div className="document-workspace workspace-content">
    <div className="page-heading"><div><div className="eyebrow">EVIDENȚE, DECIZII ȘI TERMENE</div><h1>Documente</h1><p>Documentele și contractele tale, de la prima verificare la următoarea reînnoire.</p></div><div className="heading-actions">{['list', 'contracts'].includes(view) && <button className="button secondary" onClick={exportRegister}><Download size={16}/>Exportă registrul complet</button>}<button className="button primary" onClick={onUpload}><Plus size={17}/>Adaugă document</button></div></div>
    {navigation}
    {view === 'approvals' ? <ApprovalsPage embedded initialFilter="mine" user={user} onOpen={onOpen} revision={revision} notify={notify}/> : view === 'renewals' ? <ContractRenewals key={renewalId || 'all'} initialId={renewalId} onOpen={onOpen} revision={revision} notify={notify}/> : <>
      <div className="workspace-kpis">{([['total', 'Documente', ''], ['expiring', 'Expiră în 30 zile', 'expiring'], ['expired', 'Expirate', 'expired'], ['unknown', 'Date de verificat', 'unknown']] as const).map(([key, label, value]) => <button key={key} aria-pressed={filters.validity_filter === value} onClick={() => filter('validity_filter', value)}><span>{label}</span><strong>{loading ? '—' : data?.counters[key] ?? '—'}</strong><small>{key === 'total' ? 'În căutarea și filtrele curente' : 'Valabilitate · fără documentele arhivate'}</small></button>)}</div>
      <div className="panel register-panel">
        <div className="workspace-filters"><label className="search-input"><Search size={17}/><input aria-label="Caută în documente" placeholder="Titlu, număr, furnizor…" maxLength={200} value={filters.q} onChange={e => filter('q', e.target.value)}/>{filters.q && <button aria-label="Șterge căutarea" onClick={() => filter('q', '')}><X size={16}/></button>}</label>
          <label>Stare<select value={filters.status} onChange={e => filter('status', e.target.value)}><option value="">Toate stările</option><option value="draft">Ciorne</option><option value="in_review">În aprobare</option><option value="approved">Aprobate / semnate</option><option value="archived">Arhivă</option></select></label>
          {view === 'contracts' && <label>Stare contract<select value={filters.contract_status} onChange={e => filter('contract_status', e.target.value)}><option value="">Toate contractele</option><option value="active">Active</option><option value="pending">În pregătire / avizare</option><option value="scheduled">Încep în viitor</option><option value="expired">Expirate</option></select></label>}
          {(['category', 'department', 'supplier', 'owner'] as const).filter(key => !(key === 'category' && view === 'contracts')).map(key => {
            const facet = ({ category: 'categories', department: 'departments', supplier: 'suppliers', owner: 'owners' } as const)[key];
            const label = { category: 'Tip document', department: 'Departament', supplier: 'Furnizor', owner: 'Responsabil' }[key];
            return <label key={key}>{label}<select value={filters[key]} onChange={e => filter(key, e.target.value)}><option value="">Toate</option>{data?.facets[facet].map(v => <option key={v} value={v}>{readableText(v)}</option>)}</select></label>;
          })}
          <label className="workspace-checkbox"><input type="checkbox" checked={!!filters.mine} onChange={e => filter('mine', e.target.checked ? 'true' : '')}/>Necesită acțiunea mea</label>
        </div>
        <div className="register-date-filters">
          <fieldset><legend>Data creării</legend><div>{(['created_from', 'created_to'] as const).map((key, i) => <label key={key}>{i ? 'Până la' : 'De la'}<input aria-label={i ? 'Creat până la' : 'Creat de la'} type="date" value={filters[key]} onChange={e => filter(key, e.target.value)}/></label>)}</div></fieldset>
          <fieldset><legend>Valabil până la — interval</legend><div>{(['expires_from', 'expires_to'] as const).map((key, i) => <label key={key}>{i ? 'Până la' : 'De la'}<input aria-label={i ? 'Expiră până la' : 'Expiră de la'} type="date" value={filters[key]} onChange={e => filter(key, e.target.value)}/></label>)}</div></fieldset>
          <label>Sortează după<select value={filters.sort_by} onChange={e => filter('sort_by', e.target.value)}>{[['updated_at','Ultima modificare'],['created_at','Data creării'],['expires_at','Valabil până la'],['title','Titlu'],['number','Număr document'],['owner','Responsabil'],['supplier','Furnizor'],['value','Valoare']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Ordine<select aria-label="Ordine" value={filters.sort_order} onChange={e => filter('sort_order', e.target.value)}><option value="asc">Crescătoare ↑</option><option value="desc">Descrescătoare ↓</option></select></label>
        </div>
        <details className="register-extra-filters" open={!!(filters.metadata_key || filters.validated || filters.follow_up)}>
          <summary>Metadate și urmărire{(filters.metadata_key || filters.validated || filters.follow_up) && ' · filtre active'}</summary>
          <div className="workspace-filters">
            <label>Câmp de metadate<select value={filters.metadata_key} onChange={e => filter('metadata_key', e.target.value)}><option value="">Alege câmpul</option>{data?.facets.metadata_keys?.map(key => <option key={key} value={key}>{metadataLabels[key] || key.replaceAll('_', ' ')}</option>)}</select></label>
            <label>Valoarea conține<input disabled={!filters.metadata_key} maxLength={200} value={filters.metadata_value} placeholder="Text sau număr" onChange={e => filter('metadata_value', e.target.value)}/></label>
            <label>Validare metadate<select value={filters.validated} onChange={e => filter('validated', e.target.value)}><option value="">Toate</option><option value="yes">Validate</option><option value="no">De verificat</option></select></label>
            <label>Alerte și urmărire<select value={filters.follow_up} onChange={e => filter('follow_up', e.target.value)}><option value="">Toate documentele</option><option value="active">Alerte active</option><option value="snoozed">Amânate de mine</option><option value="due">Memento ajuns la termen</option><option value="not_renewing">Nu se reînnoiesc</option></select></label>
          </div>
        </details>
        <div className="workspace-filter-summary"><span>{filters.validity_filter ? validityLabels[filters.validity_filter] + ' · ' : ''}Data de referință: {data ? date(data.reference_date) : '—'}</span><button className="text-button" onClick={() => { setFilters({...filterDefaults}); setOffset(0); }}>Resetează filtrele</button></div>
        <div className="register-legend" aria-label="Semnificația culorilor"><span className="tone-valid">Peste 60 zile</span><span className="tone-soon">31–60 zile</span><span className="tone-urgent">Cel mult 30 zile</span><span className="tone-expired">Expirat</span><span className="tone-muted">Amânat / nereînnoit / arhivat</span></div>
        {error ? <ErrorMessage message={error} retry={() => setRetry(v => v + 1)}/> : loading ? <Loading/> : !data?.items.length ? <Empty title="Niciun document pentru filtrele alese" message="Modifică intervalul sau resetează filtrele."/> : <div className="workspace-document-list">{data.items.map(d => {
          const presentation = expiryPresentation({expiresAt:d.expires_at, daysRemaining:d.days_remaining, validated:d.validated, status:d.status});
          const tone = d.follow_up?.alerts_suppressed || d.status === 'archived' ? 'muted' : presentation.tone;
          return <article key={d.id} className={`workspace-document-row tone-${tone}`}>
            <FileText size={22}/><button className="record-title" onClick={() => onOpen(d.id)}><strong>{readableText(d.title)}</strong><small>{readableText(d.number)} · {d.category} · v{d.version}</small><small>{readableText(d.supplier || d.department)}{view === 'contracts' && d.value != null ? ' · ' + money(d.value, d.currency) : ''}</small><small>Creat: {date(d.created_at)}</small></button>
            <span><Status value={d.status}/><small>{d.validated ? 'Metadate validate' : 'Necesită validare'}</small>
              {d.follow_up?.not_renewing ? <span className="record-followup">Nu se reînnoiește</span> : d.follow_up?.snoozed ? <span className="record-followup">Amânat până la {date(d.follow_up.remind_on!)}</span> : d.follow_up?.reminder_due ? <span className="record-followup">Memento de revizuit</span> : null}
            </span>
            <span><small>Valabil până la</small><DocumentExpiry muted={d.follow_up?.alerts_suppressed} expiresAt={d.expires_at} daysRemaining={d.days_remaining} validated={d.validated} status={d.status}/></span>
            <div className="record-owner"><small>Responsabil</small><DocumentPerson name={d.owner || 'Nedesemnat'} userId={d.owner_id}/></div>
            <button className="icon-button" aria-label={`Deschide ${d.title}`} onClick={() => onOpen(d.id)}><ArrowUpRight size={18}/></button>
          </article>;
        })}</div>}
        {data && <div className="table-footer"><span>{data.total ? offset + 1 : 0}–{Math.min(offset + 30, data.total)} din {data.total}</span><div className="workspace-pagination"><button aria-label="Pagina anterioară" disabled={!offset || loading} onClick={() => setOffset(v => Math.max(0, v - 30))}><ChevronLeft size={18}/></button><button aria-label="Pagina următoare" disabled={offset + 30 >= data.total || loading} onClick={() => setOffset(v => v + 30)}><ChevronRight size={18}/></button></div></div>}
      </div>
    </>}
  </div>;
}
