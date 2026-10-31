import {useState, type FormEvent} from 'react';
import {api} from '@/services/api-client';
import {ErrorMessage, Modal} from '@/components/ui';
import type {Directory, Person} from './types';

export function AuthorityDialog({person,directory,signing,onClose,onChanged}: {
  person:Person;directory:Directory;signing?:boolean;onClose:()=>void;onChanged:(message:string)=>void;
}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const enabled=!person.roles.includes('signer');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const fields=Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setError('');
    try {
      const path=signing?`/people/${person.id}/signing-authority`:'/people/appointments';
      await api(path,{method:'POST',body:JSON.stringify(signing?{enabled,reason:fields.reason}:{
        user_id:person.id,department_id:person.department_id,effective_date:fields.effective_date,reason:fields.reason})});
      onChanged(signing?'Autoritatea de semnare a fost actualizată.':'Propunerea a fost trimisă directorului.');onClose();
    } catch(e) {setError((e as Error).message);setBusy(false)}
  }
  return <Modal title={signing?'Autoritate de semnare':'Propune un șef de departament'} subtitle={`${person.name} · ${person.department}`} onClose={onClose}>
    <form className="modal-body" onSubmit={submit}>
      <p>{signing?enabled?'Acordă dreptul personal de semnare. Documentele necesită în continuare acces și o sarcină atribuită.':'Revocă dreptul personal de semnare. Sarcinile deschise vor necesita reatribuire.':
        'Directorul aprobă numirea. Până la data intrării în vigoare, responsabilitatea rămâne la șeful actual.'}</p>
      {!signing&&<label className="field">Începând cu<input name="effective_date" type="date" defaultValue={directory.reference_date} min={directory.reference_date} required/></label>}
      <label className="field">Motiv / decizie<textarea name="reason" rows={3} minLength={3} maxLength={1000} required/></label>
      {error&&<ErrorMessage message={error}/>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Renunță</button><button className="button primary" disabled={busy}>{busy?'Se salvează…':signing?enabled?'Acordă dreptul':'Revocă dreptul':'Trimite propunerea'}</button></div>
    </form>
  </Modal>;
}
