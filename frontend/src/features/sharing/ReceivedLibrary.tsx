import {useEffect,useState} from 'react';
import {Building2,FileText,RefreshCw,ShieldCheck,ArrowUpRight} from 'lucide-react';
import {api,fileUrl} from '@/services/api-client';
import {Loading,Empty,Modal,Status} from '@/components/ui';
import {date} from '@/utils/format';
interface Received {id:string;document_title:string;source_version:number;source_airport:string;expires_at:string;sha256:string;file_url:string;status:string}
export function ReceivedLibrary({revision}:{revision:number}) {
  const [items,setItems]=useState<Received[]>();
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState<Received>();
  useEffect(()=>{let live=true;setError('');setItems(undefined);api<{items:Received[]}>('/received').then(r=>{if(live)setItems(r.items)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[revision,refresh]);
  return <>
    <div className="section-head"><h2>Primite de la aeroportul partener</h2><button className="text-button" onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={14}/>Actualizează</button></div>
    {error?<div className="note-box"><Building2 size={20}/><div><strong>Biblioteca partenerului nu este disponibilă</strong><p>{error}</p></div></div>:!items?<Loading/>:!items.length?<Empty title="Încă nu ai primit documente" message="Copiile aprobate și partajate explicit cu aeroportul tău vor apărea aici."/>:<div className="panel share-list">{items.map(item=><article className="share-card" key={item.id}><div className="share-document"><span className="file-icon"><FileText size={20}/></span><div><button onClick={()=>setSelected(item)}>{item.document_title}<ArrowUpRight size={14}/></button><small>Versiunea {item.source_version} · Copie revizuită</small></div><Status value={item.status}/></div><div className="share-meta"><span><Building2 size={15}/>{item.source_airport}</span><span>Acces până la {date(item.expires_at)}</span></div><div className="share-footer"><span><ShieldCheck size={14}/>Acces verificat la sursă la fiecare deschidere</span><button className="text-button" onClick={()=>setSelected(item)}>Deschide copia<ArrowUpRight size={15}/></button></div></article>)}</div>}
    {selected&&<Modal title={selected.document_title} subtitle={`${selected.source_airport} · Versiunea ${selected.source_version}`} wide onClose={()=>setSelected(undefined)}><div className="modal-body"><p className="quiet-note">Copie revizuită. Accesul este controlat de aeroportul sursă și poate fi revocat.</p><iframe title="Document primit de la aeroportul partener" src={fileUrl(selected.file_url)} style={{width:'100%',height:'65vh',border:'1px solid #e2e7df',borderRadius:8}}/></div></Modal>}
  </>;
}
