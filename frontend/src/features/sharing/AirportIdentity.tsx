import {useState,type CSSProperties} from 'react';
import {Plane,ChevronDown,Building2} from 'lucide-react';
import {Modal} from '@/components/ui';
import {CollaborationParticipation} from './ContactDirectory';
import type {AirportProfile,CoordinationInbox} from './coordination-types';

export function AirportBadge({airport,size='normal'}:{airport:AirportProfile;size?:'small'|'normal'|'large'}) {
  return <span className={`airport-badge ${size}`} style={{'--airport-color':airport.color||'#176b73'} as CSSProperties} aria-hidden="true"><Plane/><strong>{airport.iata||airport.id.slice(0,3).toUpperCase()}</strong><i/></span>;
}

export function AirportIdentity({data,onChanged}:{data:CoordinationInbox;onChanged:()=>void}) {
  const [open,setOpen]=useState(false);
  return <>
    <button className="airport-account" onClick={()=>setOpen(true)} aria-label="Profilul aeroportului meu"><AirportBadge airport={data.local_airport}/><span><strong>{data.local_airport.name}</strong><small><i className={data.participation.enabled?'active':''}/>{data.participation.enabled?'Deschis colaborării':'Colaborare dezactivată'}</small></span><ChevronDown size={16}/></button>
    {open&&<Modal title="Profilul aeroportului" onClose={()=>setOpen(false)}><div className="airport-own-profile"><AirportBadge airport={data.local_airport} size="large"/><h2>{data.local_airport.name}</h2><p><Building2 size={15}/>{[data.local_airport.city,data.local_airport.country].filter(Boolean).join(', ')} · {data.local_airport.iata}</p><CollaborationParticipation value={data.participation} onChanged={onChanged}/><p className="quiet-note">Conectat ca {data.sender.name} · {data.sender.job_title}</p></div></Modal>}
  </>;
}
