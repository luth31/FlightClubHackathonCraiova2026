import {useEffect,useState} from 'react';
import {ArrowUpRight,Building2,Eye,LockKeyhole,FileText,Unlink,Search,ArrowRight} from 'lucide-react';
import {api,download} from '@/services/api-client';
import {Loading,ErrorMessage,Empty,Modal,Status} from '@/components/ui';
import {date} from '@/utils/format';
import type {Share} from '@/types';
import {ReceivedLibrary} from './ReceivedLibrary';
import './sharing.css';

export function SharingPage({revision,onOpen,notify}:{revision:number;onOpen:(id:string)=>void;notify:(s:string)=>void}){
  const [tab,setTab]=useState('sent'),[items,setItems]=useState<Share[]>(),[error,setError]=useState('');
  const [pending,setPending]=useState<string>(),[revoke,setRevoke]=useState<Share>(),[query,setQuery]=useState('');
  const load=()=>api<{items:Share[]}>('/shares').then(v=>{setItems(v.items);setError('')}).catch(e=>setError(e.message));
  useEffect(()=>{load()},[revision]);
  async function revokeShare(){
    if(!revoke)return;
    setPending(revoke.id);
    try{await api(`/shares/${revoke.id}/revoke`,{method:'POST'});notify('Accesul la document a fost revocat.');setRevoke(undefined);await load()}
    catch(e){setError((e as Error).message)}finally{setPending(undefined)}
  }
  const shown=items?.filter(item=>`${item.document_title||item.title||item.document_id} ${item.recipient_airport}`.toLocaleLowerCase('ro').includes(query.trim().toLocaleLowerCase('ro')));
  return <div className="sharing-workspace">
    <div className="page-heading"><div><h1>Partajate cu aeroporturi</h1></div><a className="button primary" href="#documents">Alege un document<ArrowRight size={16}/></a></div>
    <div className="sharing-controls">
      <div className="sharing-tabs" role="tablist" aria-label="Direcția partajării">
        <button role="tab" aria-selected={tab==='sent'} onClick={()=>setTab('sent')}>Trimise{items&&<span className="count-badge">{items.length}</span>}</button>
        <button role="tab" aria-selected={tab==='received'} onClick={()=>setTab('received')}>Primite</button>
      </div>
      <span className="sharing-access-note"><LockKeyhole size={14}/>Copii cu acces controlat</span>
    </div>
    {tab==='received'?<ReceivedLibrary revision={revision}/>:<>
      {error&&<ErrorMessage message={error}/>}
      {!!items?.length&&<label className="search-input sharing-search"><Search size={17}/><input aria-label="Caută documente partajate" placeholder="Document sau aeroport…" value={query} onChange={event=>setQuery(event.target.value)}/></label>}
      <div className="panel">{!shown?<Loading/>:!shown.length?<Empty title={query?'Niciun rezultat':'Nicio copie trimisă'} message={query?'Încearcă alt titlu sau aeroport.':'Alege un document aprobat, pregătește copia și selectează destinatarul.'}/>:<div className="share-list">{shown.map(s=>{
        const inactive=s.revoked||s.revoked_at||s.status==='revoked'||s.status==='expired'||s.status==='superseded';
        return <article className="share-card" key={s.id}>
          <div className="share-document"><span className="file-icon"><FileText size={20}/></span><div><button onClick={()=>onOpen(s.document_id)}>{s.document_title||s.title||s.document_id}<ArrowUpRight size={14}/></button><small>Versiunea {s.source_version} · Copie revizuită</small></div><Status value={inactive?(s.status||'revoked'):'active'}/></div>
          <div className="share-meta"><span><Building2 size={15}/>{s.recipient_airport}{s.recipient_department&&` · ${s.recipient_department}`}</span><span>Până la {date(s.expires_at)}</span></div>
          {!inactive&&<div className="share-footer"><button className="text-button" onClick={async()=>{try{await download(`/shares/${s.id}/file`,'Document-partajat.pdf')}catch(e){setError((e as Error).message)}}}><Eye size={15}/>Vezi copia</button><button className="text-button danger-text" onClick={()=>setRevoke(s)}><Unlink size={14}/>Revocă accesul</button></div>}
        </article>
      })}</div>}</div>
    </>}
    {revoke&&<Modal title="Revoci accesul la document?" onClose={()=>setRevoke(undefined)}><div className="modal-body"><p className="dialog-copy">{revoke.recipient_airport} nu va mai putea accesa copia prin FlyLeaf. O copie deja descărcată nu poate fi retrasă.</p><div className="modal-footer"><button className="button secondary" onClick={()=>setRevoke(undefined)}>Păstrează accesul</button><button className="button danger" disabled={!!pending} onClick={revokeShare}>{pending?'Se revocă…':'Revocă accesul'}</button></div></div></Modal>}
  </div>;
}
export {RedactionStudio as ShareDialog} from './RedactionStudio';
