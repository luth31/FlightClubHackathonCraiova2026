import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useState, type FormEvent} from 'react';
import {api} from '@/services/api-client';
import {ErrorMessage, Modal} from '@/components/ui';
import type {Directory, Person} from './types';

export function AuthorityDialog({person,directory,signing,onClose,onChanged}: {
  person:Person;directory:Directory;signing?:boolean;onClose:()=>void;onChanged:(message:string)=>void;
}) {
  useLanguage();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const enabled=!person.roles.includes('signer');
  const department=directory.department_records?.find(item=>item.id===person.department_id);
  const departmentError=!signing&&!department?
    'Atribuie mai întâi un departament funcțional în „Gestionează angajatul”, apoi propune numirea ca șef.':'';
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(departmentError){setError(departmentError);return;}
    const fields=Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setError('');
    try {
      const path=signing?`/people/${person.id}/signing-authority`:'/people/appointments';
      await api(path,{method:'POST',body:JSON.stringify(signing?{enabled,reason:fields.reason}:{
        user_id:person.id,department_id:department?.id,effective_date:fields.effective_date,reason:fields.reason})});
      onChanged(signing?'Autoritatea de semnare a fost actualizată.':'Propunerea a fost trimisă directorului.');onClose();
    } catch(e) {setError((e as Error).message);setBusy(false)}
  }
  return <Modal title={signing?t("Autoritate de semnare"):t("Propune un șef de departament")} subtitle={<><PersonReference person={person}/> · {person.department}</>} onClose={onClose}>
    <form className="modal-body" onSubmit={submit}>
      <p>{signing?enabled?t("Acordă dreptul personal de semnare. Documentele necesită în continuare acces și o sarcină atribuită."):t("Revocă dreptul personal de semnare. Sarcinile deschise vor necesita reatribuire."):
        t("Directorul aprobă numirea. Până la data intrării în vigoare, responsabilitatea rămâne la șeful actual.")}</p>
      {!signing&&<label className="field">{t("Începând cu")}<input name="effective_date" type="date" defaultValue={directory.reference_date} min={directory.reference_date} required/></label>}
      <label className="field">{t("Motiv / decizie")}<textarea name="reason" rows={3} minLength={3} maxLength={1000} required/></label>
      {(error||departmentError)&&<ErrorMessage message={error||departmentError}/>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>{t("Renunță")}</button><button className="button primary" disabled={busy||!!departmentError}>{busy?t("Se salvează…"):signing?enabled?t("Acordă dreptul"):t("Revocă dreptul"):t("Trimite propunerea")}</button></div>
    </form>
  </Modal>;
}
