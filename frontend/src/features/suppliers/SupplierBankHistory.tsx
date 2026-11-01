import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import { time } from '@/utils/format';
import type { Supplier } from './types';

export function SupplierBankHistory({history,onReview,onRegistration}:{history:Supplier['bank_history'];onReview:(id:string)=>void;onRegistration:(id:string)=>void}) {
  useLanguage();
  return <><h3>{t("Istoric bancar")}</h3><p>{t("Conturile și deciziile sunt păstrate în ordine cronologică.")}</p>
    {history.map(h=><article className="recorded-decision" key={h.version}><div><strong>{t("Versiunea")}{' '}{h.version} · {h.iban}</strong><p>{h.created_at?time(h.created_at):t("Moment neînregistrat")}</p><p>{t("Verificator:")}{' '}<PersonReference name={h.verified_actor?.name||h.verified_by||'Neînregistrat'} userId={h.verified_by}/> {t("· Aprobator:")}{' '}<PersonReference name={h.approved_actor?.name||h.approved_by||'Neînregistrat'} userId={h.approved_by}/></p>{h.source_case_id&&<button className="text-button" onClick={()=>onReview(h.source_case_id!)}>{t("Deschide verificarea sursă")}</button>}{h.source_registration_id&&<button className="text-button" onClick={()=>onRegistration(h.source_registration_id!)}>{t("Deschide dosarul de înregistrare")}</button>}</div></article>)}
  </>;
}
