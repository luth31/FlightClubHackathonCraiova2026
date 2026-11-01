import {t,useLanguage} from '@/i18n';
import {useState} from 'react';
import {Mail, Search, ShieldCheck, Users} from 'lucide-react';
import {PersonAvatar} from '@/components/people/PersonAvatar';
import {PersonReference} from '@/components/people/PersonReference';
import {Empty, ErrorMessage} from '@/components/ui';
import {api} from '@/services/api-client';
import type {CollaborationContact, CoordinationInbox, Participation} from './coordination-types';

export function ContactAvatar({contact,airport}:{contact:CollaborationContact;airport:string}) {
  useLanguage();
  return <PersonAvatar name={contact.name} externalAirport={airport} person={{
    ...contact, roles:[contact.role], active:true, availability:'available',
  }}/>;
}

export function ContactReference({contact,airport,local=false,embedded=false}:{contact:CollaborationContact;airport:string;local?:boolean;embedded?:boolean}) {
  useLanguage();
  return <PersonReference name={contact.name} userId={local?contact.id:undefined} embedded={embedded}
    externalAirport={local?undefined:airport}
    person={local?undefined:{...contact,roles:[contact.role],active:true,availability:'available'}}/>;
}

export function CollaborationParticipation({value,onChanged}:{value:Participation;onChanged:()=>void}) {
  useLanguage();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function toggle(){
    if(busy)return;
    setBusy(true);setError('');
    try{await api('/collaboration/participation',{method:'PATCH',body:JSON.stringify({enabled:!value.enabled,revision:value.revision})});onChanged()}
    catch(e){setError((e as Error).message);onChanged()}finally{setBusy(false)}
  }
  return <section className={`collab-participation ${value.enabled?'enabled':''}`} aria-label={t("Participarea aeroportului")}>
    <ShieldCheck size={23}/><div><strong>{value.enabled?t("Aeroport deschis colaborării"):t("Deschide aeroportul colaborării")}</strong>
      <p>{value.enabled?t("Directorul și șefii departamentelor principale pot fi contactați de aeroporturile partenere."):t("Directorul poate publica numele, emailul profesional și funcția conducerii pentru aeroporturile partenere.")}</p>
      {!value.enabled&&<small>{t("Activarea permite schimbul de mesaje. Documentele se partajează separat, după verificare.")}</small>}
      {error&&<ErrorMessage message={error}/>}</div>
    {value.can_manage&&<button className={`button ${value.enabled?'secondary':'primary'}`} disabled={busy} onClick={()=>void toggle()}>{busy?t("Se salvează…"):value.enabled?t("Dezactivează"):t("Activează colaborarea")}</button>}
  </section>;
}

export function ContactDirectory({data,onCompose}:{data:CoordinationInbox;onCompose:(airport:string,contact:CollaborationContact)=>void}) {
  useLanguage();
  const [query,setQuery]=useState('');
  const needle=query.trim().toLocaleLowerCase('ro');
  const contacts=data.participation.enabled?data.partners.flatMap(airport=>(airport.contacts||[]).map(contact=>({airport,contact}))):[];
  const shown=contacts.filter(({airport,contact})=>`${airport.name} ${contact.name} ${contact.email} ${contact.job_title} ${contact.department}`.toLocaleLowerCase('ro').includes(needle));
  return <section className="collab-directory" aria-label={t("Contacte profesionale")}>
    <div className="collab-directory-heading"><div><h2>{t("Oamenii potriviți, la un mesaj distanță.")}</h2><p>{t("Contacte publicate de aeroporturile care au activat colaborarea.")}</p></div><Users size={27}/></div>
    <label className="search-input"><Search size={18}/><input aria-label={t("Caută contacte")} placeholder={t("Nume, email, funcție sau aeroport…")} value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {!shown.length?<Empty title={needle?t("Niciun contact găsit"):t("Niciun contact disponibil")} message={data.participation.enabled?t("Contactele apar după activarea colaborării la partener și verificarea conexiunii."):t("Activează colaborarea pentru a consulta contactele aeroporturilor partenere.")}/>:<div className="collab-contact-table"><table><thead><tr><th>{t("Persoană")}</th><th>{t("Funcție și departament")}</th><th>{t("Email profesional")}</th><th><span className="sr-only">{t("Acțiune")}</span></th></tr></thead><tbody>{shown.map(({airport,contact})=><tr key={`${airport.id}:${contact.id}`}>
      <td><div className="collab-contact-person"><ContactAvatar contact={contact} airport={airport.name}/><div><strong><ContactReference contact={contact} airport={airport.name}/></strong><small>{airport.name}</small></div></div></td>
      <td><strong>{contact.job_title}</strong><small>{contact.department}</small></td><td><a href={`mailto:${contact.email}`}>{contact.email}</a></td>
      <td><button className="button secondary" disabled={!data.can_create||!airport.sharing_enabled} onClick={()=>onCompose(airport.id,contact)} aria-label={t("Scrie în FlyLeaf către {p0}", {p0:contact.name})}><Mail size={16}/>{t("Scrie")}</button></td>
    </tr>)}</tbody></table></div>}
  </section>;
}
