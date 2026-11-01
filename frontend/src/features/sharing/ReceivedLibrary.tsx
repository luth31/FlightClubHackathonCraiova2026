import {t,useLanguage} from '@/i18n';
import {useEffect,useState} from 'react';
import {Building2,FileText,RefreshCw,ShieldCheck,ArrowUpRight} from 'lucide-react';
import {api} from '@/services/api-client';
import {ReadOnlyPdf} from '@/components/documents/ReadOnlyPdf';
import {Loading,Empty,Modal,Status} from '@/components/ui';
import {date} from '@/utils/format';
interface Received {id:string;document_title:string;source_version:number;source_airport:string;source_airport_id?:string;expires_at:string;sha256:string;file_url:string;status:string}
export function ReceivedLibrary({revision}:{revision:number}) {
  useLanguage();
  const [items,setItems]=useState<Received[]>();
  const [error,setError]=useState('');
  const [unavailable,setUnavailable]=useState<Array<{airport_id:string;message:string}>>([]);
  const [refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState<Received>();
  useEffect(()=>{let live=true;setError('');setItems(undefined);setUnavailable([]);api<{items:Received[];unavailable?:Array<{airport_id:string;message:string}>}>('/received').then(r=>{if(live){setItems(r.items);setUnavailable(r.unavailable||[])}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[revision,refresh]);
  return <>
    <div className="section-head"><h2>{t("Documente primite")}</h2><button className="text-button" onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={14}/>{t("Actualizează")}</button></div>
    {!!unavailable.length&&<p className="quiet-note" role="status">{t("Unele biblioteci nu au putut fi actualizate (")}{unavailable.map(peer=>peer.airport_id).join(', ')}{t("). Documentele celorlalți parteneri rămân disponibile.")}</p>}
    {error?<div className="note-box"><Building2 size={20}/><div><strong>{t("Biblioteca partenerului nu este disponibilă")}</strong><p>{error}</p></div></div>:!items?<Loading/>:!items.length?<Empty title={t("Încă nu ai primit documente")} message={t("Copiile partajate cu aeroportul tău apar aici.")}/>:<div className="panel share-list">{items.map(item=><article className="share-card" key={`${item.source_airport_id||item.source_airport}:${item.id}`} ><div className="share-document"><span className="file-icon"><FileText size={20}/></span><div><button onClick={()=>setSelected(item)}>{item.document_title}<ArrowUpRight size={14}/></button><small>{t("Versiunea")}{' '}{item.source_version} {t("· Copie revizuită")}</small></div><Status value={item.status}/></div><div className="share-meta"><span><Building2 size={15}/>{item.source_airport}</span><span>{t("Acces până la")}{' '}{date(item.expires_at)}</span></div><div className="share-footer"><span><ShieldCheck size={14}/>{t("Acces verificat la deschidere")}</span><button className="text-button" onClick={()=>setSelected(item)}>{t("Deschide copia")}<ArrowUpRight size={15}/></button></div></article>)}</div>}
    {selected&&<Modal title={selected.document_title} subtitle={t("{p0} · Versiunea {p1}", {p0:selected.source_airport,p1:selected.source_version})} wide onClose={()=>setSelected(undefined)}><div className="modal-body"><p className="quiet-note">{t("Copie revizuită. Accesul este controlat de aeroportul sursă și poate fi revocat.")}</p><ReadOnlyPdf source={selected.file_url} title={selected.document_title}/></div></Modal>}
  </>;
}
