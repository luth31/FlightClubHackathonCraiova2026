import {t,useLanguage} from '@/i18n';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Building2,Eye,LockKeyhole,FileText,Unlink,Search,ArrowRight} from 'lucide-react';
import {api,download} from '@/services/api-client';
import {Loading,ErrorMessage,Empty,Modal,Status} from '@/components/ui';
import {date} from '@/utils/format';
import type {Share} from '@/types';
import {ReceivedLibrary} from './ReceivedLibrary';
import {Coordination} from './Coordination';
import './sharing.css';

export function SharingPage({revision,onOpen,notify}:{revision:number;onOpen:(id:string)=>void;notify:(s:string)=>void}){
  useLanguage();
  const [tab,setTab]=useState('requests'),[items,setItems]=useState<Share[]>(),[error,setError]=useState('');
  const [pending,setPending]=useState<string>(),[revoke,setRevoke]=useState<Share>(),[query,setQuery]=useState('');
  const sharesEpoch=useRef(0);
  const invalidateShares=()=>{sharesEpoch.current++};
  const load=()=>{const epoch=++sharesEpoch.current;return api<{items:Share[]}>('/shares').then(v=>{if(epoch===sharesEpoch.current){setItems(v.items);setError('')}}).catch(e=>{if(epoch===sharesEpoch.current)setError(e.message)})};
  useEffect(()=>{const changed=()=>{void load()};changed();window.addEventListener('flyleaf:shares-changed',changed);return()=>{invalidateShares();window.removeEventListener('flyleaf:shares-changed',changed)}},[revision]);
  async function revokeShare(){
    if(!revoke)return;
    setPending(revoke.id);
    try{await api(`/shares/${revoke.id}/revoke`,{method:'POST'});notify('Accesul la document a fost revocat.');setRevoke(undefined);await load()}
    catch(e){setError((e as Error).message)}finally{setPending(undefined)}
  }
  const shown=items?.filter(item=>`${item.document_title||item.title||item.document_id} ${item.recipient_airport}`.toLocaleLowerCase('ro').includes(query.trim().toLocaleLowerCase('ro')));
  return <div className="sharing-workspace">
    <div className="page-heading"><div><h1>{t("Colaborare")}</h1><p>{t("Întrebări, răspunsuri și documente între aeroporturi.")}</p></div>{tab!=='requests'&&<a className="button secondary" href="#documents">{t("Alege un document")}<ArrowRight size={16}/></a>}</div>
    <div className="sharing-controls">
      <div className="sharing-tabs" role="group" aria-label={t("Spații de colaborare")}>
        <button aria-pressed={tab==='requests'} onClick={()=>setTab('requests')}>{t("Mesagerie")}</button>
        <button aria-pressed={tab==='sent'} onClick={()=>setTab('sent')}>{t("Documente trimise")}{items&&<span className="count-badge">{items.length}</span>}</button>
        <button aria-pressed={tab==='received'} onClick={()=>setTab('received')}>{t("Documente primite")}</button>
      </div>
      <span className="sharing-access-note"><LockKeyhole size={14}/>{t("Copii cu acces controlat")}</span>
    </div>
    <div hidden={tab!=='requests'} inert={tab!=='requests'}><Coordination revision={revision} active={tab==='requests'} notify={notify} onOpen={onOpen}/></div>
    {tab==='received'?<ReceivedLibrary revision={revision}/>:tab==='sent'&&<>
      {error&&<ErrorMessage message={error}/>}
      {!!items?.length&&<label className="search-input sharing-search"><Search size={17}/><input aria-label={t("Caută documente partajate")} placeholder={t("Document sau aeroport…")} value={query} onChange={event=>setQuery(event.target.value)}/></label>}
      <div className="panel">{!shown?<Loading/>:!shown.length?<Empty title={query?t("Niciun rezultat"):t("Nicio copie trimisă")} message={query?t("Încearcă alt titlu sau aeroport."):t("Alege un document aprobat, pregătește copia și selectează destinatarul.")}/>:<div className="share-list">{shown.map(s=>{
        const inactive=s.revoked||s.revoked_at||s.status==='revoked'||s.status==='expired'||s.status==='superseded';
        return <article className="share-card" key={s.id}>
          <div className="share-document"><span className="file-icon"><FileText size={20}/></span><div><button onClick={()=>onOpen(s.document_id)}>{s.document_title||s.title||s.document_id}<ArrowUpRight size={14}/></button><small>{t("Versiunea")}{' '}{s.source_version} {t("· Copie revizuită")}</small></div><Status value={inactive?(s.status||'revoked'):'active'}/></div>
          <div className="share-meta"><span><Building2 size={15}/>{s.recipient_airport}{s.recipient_department&&t(" · {p0}", {p0:s.recipient_department})}</span><span>{t("Până la")}{' '}{date(s.expires_at)}</span></div>
          {!inactive&&<div className="share-footer"><button className="text-button" onClick={async()=>{try{await download(`/shares/${s.id}/file`,'Document-partajat.pdf')}catch(e){setError((e as Error).message)}}}><Eye size={15}/>{t("Vezi copia")}</button>{s.can_revoke!==false&&<button className="text-button danger-text" onClick={()=>setRevoke(s)}><Unlink size={14}/>{t("Revocă accesul")}</button>}</div>}
        </article>
      })}</div>}</div>
    </>}
    {revoke&&<Modal title={t("Revoci accesul la document?")} onClose={()=>setRevoke(undefined)}><div className="modal-body"><p className="dialog-copy">{revoke.recipient_airport} {t("nu va mai putea accesa copia prin FlyLeaf. O copie deja descărcată nu poate fi retrasă.")}</p><div className="modal-footer"><button className="button secondary" onClick={()=>setRevoke(undefined)}>{t("Păstrează accesul")}</button><button className="button danger" disabled={!!pending} onClick={revokeShare}>{pending?t("Se revocă…"):t("Revocă accesul")}</button></div></div></Modal>}
  </div>;
}
export {RedactionStudio as ShareDialog} from './RedactionStudio';
