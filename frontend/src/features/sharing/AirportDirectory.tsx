import {lazy,Suspense,useEffect,useState} from 'react';
import {Search,MapPin,ArrowUpRight,ChevronLeft,ChevronRight,CheckCircle2,X,Mail,Users} from 'lucide-react';
import {api} from '@/services/api-client';
import {Empty,ErrorMessage,Loading} from '@/components/ui';
import {AirportBadge} from './AirportIdentity';
import {ContactAvatar} from './ContactDirectory';
import type {AirportProfile,PartnerConnection,CollaborationContact} from './coordination-types';
const AirportMap=lazy(()=>import('./AirportMap').then(m=>({default:m.AirportMap})));
interface Results {items:PartnerConnection[];total:number;offset:number;limit:number;google_api_key?:string|null;local_airport:AirportProfile}
export const mapsLink=(query:string)=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);

export function AirportDirectory({onCompose,enabled,revision}:{onCompose:(airport:string,person:CollaborationContact)=>void;enabled:boolean;revision:number}) {
  const [query,setQuery]=useState(''),[available,setAvailable]=useState(true),[offset,setOffset]=useState(0);
  const [data,setData]=useState<Results>(),[selected,setSelected]=useState<string>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let live=true;setBusy(true);setError('');
    const timer=setTimeout(()=>{void api<Results>('/collaboration/airports?'+new URLSearchParams({q:query,available:String(available),offset:String(offset),limit:'12'}),{signal:controller.signal}).then(result=>{if(live){setData(result);setSelected(current=>result.items.some(a=>a.id===current)?current:undefined)}}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setBusy(false)})},query?300:0);
    return()=>{live=false;clearTimeout(timer);controller.abort()};
  },[query,available,offset,refresh,revision]);
  const airport=data?.items.find(a=>a.id===selected);
  return <section className="airport-directory" aria-label="Directorul aeroporturilor">
    <div className="airport-directory-heading"><div><h2>Găsește un aeroport. Începe o conversație.</h2><p>Caută un partener și ia legătura cu persoana potrivită.</p></div><span className="directory-count">{data?.total??'—'} {data?.total===1?'aeroport':'aeroporturi'}</span></div>
    <div className="airport-search-bar"><label className="search-input"><Search size={20}/><input aria-label="Caută aeroporturi" placeholder="Nume, oraș sau cod aeroport — de exemplu, Sibiu" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0)}}/>{query&&<button className="icon-button" aria-label="Șterge căutarea" onClick={()=>{setQuery('');setOffset(0)}}><X size={16}/></button>}</label><label className="airport-availability-filter"><input type="checkbox" checked={available} onChange={e=>{setAvailable(e.target.checked);setOffset(0)}}/>În colaborare</label></div>
    {error&&<ErrorMessage message={error} retry={()=>setRefresh(v=>v+1)}/>}
    {!data&&!error?<Loading/>:data&&<>
      <Suspense fallback={<div className="airport-map-loading"><Loading/></div>}><AirportMap airports={data.items} selected={selected} onSelect={setSelected} googleKey={data.google_api_key}/></Suspense>
      <div className={`airport-results-layout ${airport?'has-selection':''}`}>
        <div className="airport-results"><header><h3>{query?'Rezultatele căutării':'Aeroporturi în director'}</h3><small>{busy?'Se caută…':`${data.total} ${data.total===1?'rezultat':'rezultate'}`}</small></header>
          {!data.items.length?<Empty title="Niciun aeroport găsit în director" message="Încearcă alt nume sau include aeroporturile cu colaborarea dezactivată."/>:data.items.map(item=><button key={item.id} className={`airport-result ${selected===item.id?'selected':''}`} onClick={()=>setSelected(item.id)} aria-pressed={selected===item.id}><AirportBadge airport={item}/><span><strong>{item.name}</strong><small>{item.city}, {item.country} <b>·</b> {item.iata} / {item.icao}</small><em className={item.participation_enabled?'active':''}>{item.participation_enabled?<CheckCircle2 size={13}/>:<span className="status-dot"/>}{item.participation_enabled?'În colaborare':'Colaborare dezactivată'}{item.participation_enabled&&` · ${item.contacts.length} contacte`}</em></span><ChevronRight size={18}/></button>)}
          <div className="airport-results-footer"><a href={mapsLink(query?`${query} airport`:'airports')} target="_blank" rel="noreferrer">{query?`Caută „${query}” pe Google Maps`:'Explorează aeroporturi pe Google Maps'}<ArrowUpRight size={14}/></a>{data.total>data.limit&&<span><button className="icon-button" aria-label="Aeroporturile anterioare" disabled={!offset||busy} onClick={()=>setOffset(v=>Math.max(0,v-data.limit))}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="Aeroporturile următoare" disabled={offset+data.limit>=data.total||busy} onClick={()=>setOffset(v=>v+data.limit)}><ChevronRight size={17}/></button></span>}</div>
        </div>
        {airport&&<aside className="airport-public-profile" aria-label={`Profil ${airport.name}`}><button className="icon-button airport-profile-close" aria-label="Închide profilul aeroportului" onClick={()=>setSelected(undefined)}><X size={18}/></button><AirportBadge airport={airport} size="large"/><h2>{airport.name}</h2><p><MapPin size={14}/>{airport.city}, {airport.country}</p><a href={mapsLink(`${airport.name} ${airport.icao}`)} target="_blank" rel="noreferrer">Vezi pe Google Maps<ArrowUpRight size={14}/></a><div className="airport-profile-divider"/><h3><Users size={16}/>Contacte profesionale</h3>
          {!airport.participation_enabled?<p className="quiet-note">Acest aeroport nu primește mesaje în FlyLeaf până la activarea colaborării.</p>:!enabled?<p className="quiet-note">Activează colaborarea aeroportului tău pentru a vedea contactele.</p>:!airport.connected?<p className="quiet-note">Contactele nu pot fi verificate momentan. Reîncearcă mai târziu.</p>:!airport.contacts.length?<p className="quiet-note">Nu există contacte publicate.</p>:airport.contacts.map(person=><div className="airport-contact-row" key={person.id}><ContactAvatar contact={person} airport={airport.name}/><div><strong>{person.name}</strong><small>{person.job_title}</small><a href={`mailto:${person.email}`}>{person.email}</a></div><button className="icon-button" aria-label={`Scrie în FlyLeaf către ${person.name}`} disabled={!airport.sharing_enabled} onClick={()=>onCompose(airport.id,person)}><Mail size={18}/></button></div>)}
        </aside>}
      </div>
    </>}
  </section>;
}
