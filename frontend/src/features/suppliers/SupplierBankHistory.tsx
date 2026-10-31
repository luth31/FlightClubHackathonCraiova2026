import { time } from '@/utils/format';
import type { Supplier } from './types';

export function SupplierBankHistory({history,onReview,onRegistration}:{history:Supplier['bank_history'];onReview:(id:string)=>void;onRegistration:(id:string)=>void}) {
  return <><h3>Istoric bancar</h3><p>Conturile și deciziile sunt păstrate în ordine cronologică.</p>
    {history.map(h=><article className="recorded-decision" key={h.version}><div><strong>Versiunea {h.version} · {h.iban}</strong><p>{h.created_at?time(h.created_at):'Moment neînregistrat'}</p><p>Verificator: {h.verified_actor?.name||h.verified_by||'Neînregistrat'} · Aprobator: {h.approved_actor?.name||h.approved_by||'Neînregistrat'}</p>{h.source_case_id&&<button className="text-button" onClick={()=>onReview(h.source_case_id!)}>Deschide verificarea sursă</button>}{h.source_registration_id&&<button className="text-button" onClick={()=>onRegistration(h.source_registration_id!)}>Deschide dosarul de înregistrare</button>}</div></article>)}
  </>;
}
