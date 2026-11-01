import {t,useLanguage} from '@/i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/services/api-client';
import { Modal } from '@/components/ui';
import { SupplierContent } from './SupplierContent';
import { SupplierBankHistory } from './SupplierBankHistory';
import type { Supplier } from './types';
import type { DocumentRecord } from '@/types';
export function SupplierDetail({supplierId,onClose,onOpen,onReview,onRegistration}:{supplierId:string;onClose:()=>void;onOpen:(id:string)=>void;onReview:(id:string)=>void;onRegistration:(id:string)=>void}) {
  useLanguage();
  const [data,setData]=useState<Supplier>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[documents,setDocuments]=useState<DocumentRecord[]>([]),[selected,setSelected]=useState(''),[comment,setComment]=useState(''),[address,setAddress]=useState(''),[category,setCategory]=useState(''),[state,setState]=useState('active');
  useEffect(()=>{let active=true;api<Supplier>(`/suppliers/${supplierId}`).then(v=>{if(active){setData(v);setAddress(v.address);setCategory(v.category);setState(v.state)}}).catch(e=>{if(active)setError(e.message)});api<{items:DocumentRecord[]}>('/documents?category=Contract&limit=500').then(v=>{if(active)setDocuments(v.items)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[supplierId]);
  async function save(e:FormEvent){e.preventDefault();if(!data)return;setBusy(true);setError('');try{setData(await api<Supplier>(`/suppliers/${supplierId}`,{method:'PATCH',body:JSON.stringify({address,category,state,comment,registry_revision:data.registry_revision})}));setComment('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function link(){const doc=documents.find(d=>d.id===selected);if(!doc)return;setBusy(true);setError('');try{setData(await api<Supplier>(`/suppliers/${supplierId}/contracts`,{method:'POST',body:JSON.stringify({document_id:doc.id,version:doc.version})}));setSelected('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <Modal title={data?.name||t("Fișă furnizor")} onClose={onClose} wide><div className="modal-body"><SupplierContent error={error} loading={!data}>{data&&<>
    <p>{t("CUI:")}{' '}{data.tax_id||t("Neînregistrat")} · {data.state==='active'?t("Activ"):t("Suspendat")}</p>
    <p>{data.address||t("Adresă neînregistrată")} · {data.category||t("Categorie neînregistrată")}</p>
    <h3>{t("Contracte asociate")}</h3>{data.contracts.map(c=><div className="review-control" key={c.id}><button className="text-button" onClick={()=>onOpen(c.id)}>{c.title} {t("· v")}{c.version}</button>{data.can_review_bank!==false&&<small>{c.eligible_for_review?t("Disponibil pentru verificări"):c.unavailable_reason}</small>}</div>)}
    {data.can_manage&&<><label className="field">{t("Asociază un contract")}<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{t("Alege contractul aprobat")}</option>{documents.filter(d=>d.supplier?.trim().toLowerCase()===data.name.trim().toLowerCase()&&d.validated&&['approved','signed'].includes(d.status)&&!data.contracts.some(c=>c.id===d.id)).map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button className="button secondary" disabled={busy||!selected} onClick={link}>{t("Asociază contractul")}</button>
    <form className="review-decision-form" onSubmit={save}><h3>{t("Actualizează fișa")}</h3><label className="field">{t("Adresă")}<input value={address} maxLength={500} onChange={e=>setAddress(e.target.value)}/></label><label className="field">{t("Categorie")}<input value={category} maxLength={100} onChange={e=>setCategory(e.target.value)}/></label><label className="field">{t("Stare")}<select value={state} onChange={e=>setState(e.target.value)}><option value="active">{t("Activ")}</option><option value="suspended">{t("Suspendat")}</option></select></label><label className="field">{t("Motivul actualizării")}<textarea required minLength={3} value={comment} onChange={e=>setComment(e.target.value)}/></label><button className="button secondary" disabled={busy}>{t("Salvează fișa")}</button></form></>}
    {data.can_review_bank!==false&&data.bank_history&&<SupplierBankHistory history={data.bank_history} onReview={onReview} onRegistration={onRegistration}/>}
    <button className="text-button" onClick={()=>onOpen(data.document_id)}>{t("Deschide contractul sursă")}</button>
  </>}</SupplierContent></div></Modal>;
}
