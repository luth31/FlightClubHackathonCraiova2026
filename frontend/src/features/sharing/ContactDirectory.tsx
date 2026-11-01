import {useState} from 'react';
import {Mail, Search, ShieldCheck, Users} from 'lucide-react';
import {PersonAvatar} from '@/components/people/PersonAvatar';
import {PersonReference} from '@/components/people/PersonReference';
import {Empty, ErrorMessage} from '@/components/ui';
import {api} from '@/services/api-client';
import type {CollaborationContact, CoordinationInbox, Participation} from './coordination-types';

export function ContactAvatar({contact,airport}:{contact:CollaborationContact;airport:string}) {
  return <PersonAvatar name={contact.name} externalAirport={airport} person={{
    ...contact, roles:[contact.role], active:true, availability:'available',
  }}/>;
}

export function ContactReference({contact,airport,local=false,embedded=false}:{contact:CollaborationContact;airport:string;local?:boolean;embedded?:boolean}) {
  return <PersonReference name={contact.name} userId={local?contact.id:undefined} embedded={embedded}
    externalAirport={local?undefined:airport}
    person={local?undefined:{...contact,roles:[contact.role],active:true,availability:'available'}}/>;
}

export function CollaborationParticipation({value,onChanged}:{value:Participation;onChanged:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function toggle(){
    if(busy)return;
    setBusy(true);setError('');
    try{await api('/collaboration/participation',{method:'PATCH',body:JSON.stringify({enabled:!value.enabled,revision:value.revision})});onChanged()}
    catch(e){setError((e as Error).message);onChanged()}finally{setBusy(false)}
  }
  return <section className={`collab-participation ${value.enabled?'enabled':''}`} aria-label="Participarea aeroportului">
    <ShieldCheck size={23}/><div><strong>{value.enabled?'Aeroport deschis colaborării':'Deschide aeroportul colaborării'}</strong>
      <p>{value.enabled?'Directorul și șefii departamentelor principale pot fi contactați de aeroporturile partenere.':'Directorul poate publica numele, emailul profesional și funcția conducerii pentru aeroporturile partenere.'}</p>
      {!value.enabled&&<small>Activarea permite schimbul de mesaje. Documentele se partajează separat, după verificare.</small>}
      {error&&<ErrorMessage message={error}/>}</div>
    {value.can_manage&&<button className={`button ${value.enabled?'secondary':'primary'}`} disabled={busy} onClick={()=>void toggle()}>{busy?'Se salvează…':value.enabled?'Dezactivează':'Activează colaborarea'}</button>}
  </section>;
}

export function ContactDirectory({data,onCompose}:{data:CoordinationInbox;onCompose:(airport:string,contact:CollaborationContact)=>void}) {
  const [query,setQuery]=useState('');
  const needle=query.trim().toLocaleLowerCase('ro');
  const contacts=data.participation.enabled?data.partners.flatMap(airport=>(airport.contacts||[]).map(contact=>({airport,contact}))):[];
  const shown=contacts.filter(({airport,contact})=>`${airport.name} ${contact.name} ${contact.email} ${contact.job_title} ${contact.department}`.toLocaleLowerCase('ro').includes(needle));
  return <section className="collab-directory" aria-label="Contacte profesionale">
    <div className="collab-directory-heading"><div><h2>Oamenii potriviți, la un mesaj distanță.</h2><p>Contacte publicate de aeroporturile care au activat colaborarea.</p></div><Users size={27}/></div>
    <label className="search-input"><Search size={18}/><input aria-label="Caută contacte" placeholder="Nume, email, funcție sau aeroport…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {!shown.length?<Empty title={needle?'Niciun contact găsit':'Niciun contact disponibil'} message={data.participation.enabled?'Contactele apar după activarea colaborării la partener și verificarea conexiunii.':'Activează colaborarea pentru a consulta contactele aeroporturilor partenere.'}/>:<div className="collab-contact-table"><table><thead><tr><th>Persoană</th><th>Funcție și departament</th><th>Email profesional</th><th><span className="sr-only">Acțiune</span></th></tr></thead><tbody>{shown.map(({airport,contact})=><tr key={`${airport.id}:${contact.id}`}>
      <td><div className="collab-contact-person"><ContactAvatar contact={contact} airport={airport.name}/><div><strong><ContactReference contact={contact} airport={airport.name}/></strong><small>{airport.name}</small></div></div></td>
      <td><strong>{contact.job_title}</strong><small>{contact.department}</small></td><td><a href={`mailto:${contact.email}`}>{contact.email}</a></td>
      <td><button className="button secondary" disabled={!data.can_create||!airport.sharing_enabled} onClick={()=>onCompose(airport.id,contact)} aria-label={`Scrie în FlyLeaf către ${contact.name}`}><Mail size={16}/>Scrie</button></td>
    </tr>)}</tbody></table></div>}
  </section>;
}
