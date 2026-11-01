import {useEffect,useRef,useState} from 'react';
import {Search,ArrowUpRight,ChevronLeft,ChevronRight} from 'lucide-react';
import {api} from '@/services/api-client';
import {Loading,ErrorMessage,Empty} from '@/components/ui';
import {time,actionLabel,initials} from '@/utils/format';
import type {AuditEvent} from '@/types';
import './audit.css';

const PAGE_SIZE=25;

export function AuditPage({onOpen,revision}:{onOpen:(id:string)=>void;revision:number}){
  const [data,setData]=useState<AuditEvent[]>(),[query,setQuery]=useState(''),[error,setError]=useState(''),[page,setPage]=useState(0);
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{api<{items:AuditEvent[]}>('/audit').then(v=>setData(v.items)).catch(e=>setError(e.message))},[revision]);
  const items=data?.filter(a=>`${a.actor} ${a.document_title} ${actionLabel[a.action]||a.action}`.toLowerCase().includes(query.toLowerCase()));
  const total=items?.length||0;
  const currentPage=Math.min(page,Math.max(0,Math.ceil(total/PAGE_SIZE)-1));
  const first=currentPage*PAGE_SIZE;
  const visibleItems=items?.slice(first,first+PAGE_SIZE);
  function changePage(next:number){
    setPage(next);
    panel.current?.scrollIntoView?.({block:'start'});
  }
  return <>
    <div className="page-heading"><div><h1>Jurnal de activitate</h1></div></div>
    <div className="panel audit-panel" ref={panel}>
      <div className="filters"><label className="search-input"><Search size={18}/><input aria-label="Caută în jurnal" placeholder="Caută o persoană, un document sau o acțiune…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}}/></label><span className="result-count">{total} înregistrări</span></div>
      {error?<ErrorMessage message={error}/>:!items?<Loading/>:!items.length?<Empty title="Nicio activitate găsită"/>:<>
        <div className="table-scroll"><table className="document-table audit-table">
          <thead><tr><th>Acțiune</th><th>Document</th><th>Persoană</th><th>Data și ora</th></tr></thead>
          <tbody>{visibleItems?.map(a=><tr key={a.id}>
            <td><strong>{actionLabel[a.action]||a.action}</strong>{typeof a.detail==='string'&&a.detail&&<details className="audit-event-details"><summary>Detalii</summary><p>{a.detail}</p></details>}</td>
            <td>{a.document_id?<button className="audit-link" onClick={()=>onOpen(a.document_id!)}>{a.document_title||a.document_id}<ArrowUpRight size={13}/></button>:<span className="muted">—</span>}</td>
            <td><div className="person-inline"><span className="avatar small">{initials(a.actor)}</span>{a.actor}</div></td>
            <td className="date-cell">{time(a.created_at)}</td>
          </tr>)}</tbody>
        </table></div>
        <nav className="audit-pagination" aria-label="Pagini jurnal">
          <span aria-live="polite">{first+1}–{Math.min(first+PAGE_SIZE,total)} din {total} înregistrări</span>
          <div><button className="button secondary small-button" disabled={currentPage===0} onClick={()=>changePage(currentPage-1)}><ChevronLeft size={15}/>Anterior</button><button className="button secondary small-button" disabled={first+PAGE_SIZE>=total} onClick={()=>changePage(currentPage+1)}>Următor<ChevronRight size={15}/></button></div>
        </nav>
      </>}
    </div>
  </>;
}
