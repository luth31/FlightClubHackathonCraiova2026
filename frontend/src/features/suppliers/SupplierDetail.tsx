import { useEffect, useState } from 'react';
import { api } from '@/services/api-client';
import { Modal, Loading, ErrorMessage } from '@/components/ui';
import { time } from '@/utils/format';
import type { Supplier } from './types';
export function SupplierDetail({supplierId,onClose,onOpen,onReview}:{supplierId:string;onClose:()=>void;onOpen:(id:string)=>void;onReview:(id:string)=>void}) {
  const [data,setData]=useState<Supplier>(),[error,setError]=useState('');
  useEffect(()=>{let active=true;api<Supplier>(`/supplier-reviews/registry/${supplierId}`).then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[supplierId]);
  return <Modal title={data?.name||'Fișă furnizor'} onClose={onClose} wide>{error?<ErrorMessage message={error}/>:!data?<Loading/>:<>
    <h3>Istoric bancar</h3><p>Conturile și deciziile sunt păstrate în ordine cronologică.</p>
    {data.bank_history.map(h=><article className="recorded-decision" key={h.version}><div><strong>Versiunea {h.version} · {h.iban}</strong><p>{h.created_at?time(h.created_at):'Moment neînregistrat'}</p><p>Verificator: {h.verified_actor?.name||h.verified_by||'Neînregistrat'} · Aprobator: {h.approved_actor?.name||h.approved_by||'Registru demonstrativ'}</p>{h.source_case_id&&<button className="text-button" onClick={()=>onReview(h.source_case_id!)}>Deschide verificarea sursă</button>}</div></article>)}
    <button className="text-button" onClick={()=>onOpen(data.document_id)}>Deschide contractul sursă</button>
  </>}</Modal>;
}
