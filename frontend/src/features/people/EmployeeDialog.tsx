import {useState, type FormEvent} from 'react';
import {api} from '@/services/api-client';
import {ErrorMessage, Modal} from '@/components/ui';
import type {Directory, Person, ProvisionResult} from './types';

function workEmail(firstName:string,lastName:string) {
  const normalize=(part:string)=>part.normalize('NFKD').replace(/\P{ASCII}/gu,'').toLowerCase();
  const first=normalize(firstName.trim());
  const last=normalize(lastName.trim()).replace(/['’]/g,'').replace(/\s+/g,'-');
  if(!/^[a-z]/.test(first)||! /^[a-z]+(?:-[a-z]+)*$/.test(last)||last.length+2>64)return '';
  return `${first[0]}.${last}@arm.ro`;
}

export function EmployeeDialog({directory, person, onClose, onChanged}: {
  directory:Directory;person?:Person;onClose:()=>void;onChanged:(message:string)=>void;
}) {
  const departments=directory.department_records||[];
  const legacyParts=person?.name.trim().split(/\s+/)||[];
  const [firstName,setFirstName]=useState(person?.first_name??legacyParts[0]??'');
  const [middleName,setMiddleName]=useState(person?.middle_name??legacyParts.slice(1,-1).join(' '));
  const [lastName,setLastName]=useState(person?.last_name??(legacyParts.length>1?legacyParts.at(-1)!:''));
  const [email,setEmail]=useState(person?.email||'');
  const [departmentId,setDepartmentId]=useState(person?.department_id||departments[0]?.id||'');
  const [jobTitle,setJobTitle]=useState(person?.job_title||'');
  const [managerId,setManagerId]=useState(person?.manager_id||'');
  const [current,setCurrent]=useState(person);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<ProvisionResult>();
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=Object.fromEntries(new FormData(event.currentTarget));
    const body={...fields,manager_id:fields.manager_id||null};
    setBusy(true);setError('');
    try {
      if(current) {
        const updated=await api<Person>(`/people/${current.id}/profile`,{method:'PATCH',body:JSON.stringify(body)});
        setCurrent(updated);onChanged('Fișa angajatului a fost actualizată.');onClose();
      } else {
        const created=await api<ProvisionResult>('/people',{method:'POST',body:JSON.stringify(body)});
        setCurrent(created.user);setResult(created);onChanged('Angajatul a fost înregistrat.');
      }
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  async function provision() {
    if(!current)return;
    setBusy(true);setError('');
    try {
      const created=await api<ProvisionResult>(`/people/${current.id}/provision`,{method:'POST'});
      setCurrent(created.user);setResult(created);onChanged('Starea contului a fost actualizată.');
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  async function instructions() {
    if(!current)return;setBusy(true);setError('');
    try {
      const response=await api<ProvisionResult>(`/people/${current.id}/activation-instructions`,{method:'POST'});
      setResult(response);onChanged('Instrucțiunile de activare au fost pregătite.');
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  async function access() {
    if(!current)return;
    setBusy(true);setError('');
    try {
      const updated=await api<Person>(`/people/${current.id}`,{method:'PATCH',body:JSON.stringify({active:!current.active})});
      setCurrent(updated);onChanged(updated.active?'Contul a fost reactivat.':'Contul a fost dezactivat.');
      if(!updated.identity_sync_pending)onClose();
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  async function synchronize() {
    if(!current)return;
    setBusy(true);setError('');
    try {
      const updated=await api<Person>(`/people/${current.id}/sync-identity`,{method:'POST'});
      setCurrent(updated);onChanged('Starea identității a fost verificată.');
      if(updated.identity_sync_pending)setError('Serviciul de identitate nu este disponibil. Accesul local respectă starea contului.');
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  const jobTitles=[...new Set([
    ...(departments.find(d=>d.id===departmentId)?.job_titles||[]),
    ...directory.items.filter(p=>p.department_id===departmentId).map(p=>p.job_title).filter(Boolean),
    ...(departmentId===person?.department_id&&person.job_title?[person.job_title]:[]),
  ])];
  const coordinators=directory.items.filter(p=>p.active&&p.id!==person?.id&&p.department_id===departmentId);
  const suggestedEmail=workEmail(firstName,lastName);
  const failed=result?.user.provisioning_status==='failed';
  return <Modal title={person?`Fișa lui ${person.name}`:'Un coleg nou în echipă'} subtitle="Datele angajatului și accesul său la AeroDesk." onClose={onClose}>
    <div className="modal-body">
      {result?<div className="employee-result" aria-live="polite">
        <h3>{failed?'Contul așteaptă activarea':'Angajatul a fost înregistrat'}</h3>
        {failed?<><ErrorMessage message={result.provisioning_error||'Contul de autentificare nu a putut fi creat.'}/><button className="button primary" disabled={busy} onClick={()=>void provision()}>Reîncearcă activarea</button></>:
          result.temporary_password?<><p>Aceste date sunt afișate o singură dată. Transmite-le angajatului printr-un canal sigur.</p>
            <label className="field">Cont<input readOnly value={result.user.login_username||result.user.id}/></label>
            <label className="field">Parola inițială<input readOnly value={result.temporary_password} autoComplete="off"/></label>
            <p className="quiet-note">{directory.auth_mode==='oidc'?'Angajatul își schimbă parola la prima conectare.':'Folosește această parolă pentru conectarea locală.'}</p></>:
          <p>{result.invitation_status==='failed'?'Contul a fost creat, dar emailul de activare nu a putut fi trimis. Solicită retrimiterea instrucțiunilor.':'Instrucțiunile de activare au fost trimise angajatului.'}</p>}
        {result.invitation_status==='failed'&&<button className="button secondary" disabled={busy} onClick={()=>void instructions()}>Retrimite instrucțiunile</button>}
        {error&&<ErrorMessage message={error}/>}<div className="modal-footer"><button className="button primary" onClick={onClose}>{result.temporary_password?'Am preluat datele':'Închide'}</button></div>
      </div>:<>
        <form onSubmit={save}>
          <div className="form-grid employee-name-fields">
            <label className="field">Prenume<input name="first_name" value={firstName} onChange={e=>setFirstName(e.target.value)} minLength={1} maxLength={75} autoComplete="given-name" required/></label>
            <label className="field">Al doilea prenume (opțional)<input name="middle_name" value={middleName} onChange={e=>setMiddleName(e.target.value)} maxLength={75} autoComplete="additional-name"/></label>
            <label className="field">Nume de familie<input name="last_name" value={lastName} onChange={e=>setLastName(e.target.value)} minLength={1} maxLength={100} autoComplete="family-name" required/></label>
          </div>
          {!person&&<div className="field"><label htmlFor="employee-email">Email de serviciu</label>
            <div className="employee-email-row"><input id="employee-email" name="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required placeholder="Inițială prenume.nume@arm.ro" aria-describedby="employee-email-help"/>
              <button type="button" className="button secondary" disabled={busy||!suggestedEmail} onClick={()=>setEmail(suggestedEmail)}>Generează emailul</button></div>
            <span id="employee-email-help" className="quiet-note">Generează o sugestie din prenume și numele de familie. Poți modifica adresa dacă este deja folosită sau nepotrivită.</span></div>}
          <label className="field">Departament<select name="department_id" value={departmentId} onChange={e=>{setDepartmentId(e.target.value);setManagerId('');setJobTitle('');}} required>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <div className="form-grid"><label className="field">Funcție<select name="job_title" value={jobTitle} onChange={e=>setJobTitle(e.target.value)} required><option value="">Alege funcția</option>{jobTitles.map(title=><option key={title} value={title}>{title}</option>)}</select></label>
          <label className="field">Coordonator<select name="manager_id" value={coordinators.some(p=>p.id===managerId)?managerId:''} onChange={e=>setManagerId(e.target.value)}><option value="">Fără coordonator desemnat</option>{coordinators.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
          {!person&&<label className="field">Acces inițial<select name="access_profile" defaultValue="employee"><option value="employee">Angajat</option><option value="technician">Tehnician</option></select></label>}
          <p className="quiet-note">Fiecare angajat poate solicita concediu. Numirea ca șef și autoritatea de semnare se acordă separat.</p>
          {error&&<ErrorMessage message={error}/>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Renunță</button><button className="button primary" disabled={busy||(!person&&!email.trim())}>{busy?'Se salvează…':person?'Salvează fișa':'Creează contul'}</button></div>
        </form>
        {current&&<div className="employee-access"><h3>Accesul la aplicație</h3>
          <p>{current.active?'Dezactivarea închide sesiunile, revocă delegările și păstrează documentele și istoricul.':'Contul este inactiv. Documentele și istoricul rămân păstrate.'}</p>
          {current.identity_sync_pending&&<><p className="quiet-note">Sincronizarea cu serviciul de identitate este în așteptare.</p><button className="button secondary" disabled={busy} onClick={()=>void synchronize()}>Reîncearcă sincronizarea</button></>}
          {current.active&&(!current.provisioning_status||current.provisioning_status==='ready')&&(!current.roles.some(role=>['admin','director','hr','finance','reviewer','signer','department_head'].includes(role))||directory.can_admin_delegations)&&<button className="button secondary" disabled={busy} onClick={()=>void instructions()}>Retrimite instrucțiunile</button>}
          {current.provisioning_status&&['pending','failed','processing'].includes(current.provisioning_status)?<button className="button secondary" disabled={busy} onClick={()=>void provision()}>Reîncearcă activarea</button>:
            <button className="button secondary" disabled={busy} onClick={()=>void access()}>{current.active?'Dezactivează contul':'Reactivează contul'}</button>}
        </div>}
      </>}
    </div>
  </Modal>;
}
