import {useEffect, useId, useRef, useState} from 'react';
import {Search, X} from 'lucide-react';
import {PersonAvatar} from '@/components/people/PersonAvatar';
import {initials} from '@/utils/format';

export interface EquipmentRecipient {id:string; name:string; email:string; job_title:string; department:string; suggested?:boolean}
const normalize = (text:string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ro');

export function EmployeePicker({people, value, onChange, required=false, disabled=false, teamName}: {
  people:EquipmentRecipient[]; value:string; onChange:(id:string)=>void; required?:boolean; disabled?:boolean; teamName?:string;
}) {
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
  const root=useRef<HTMLDivElement>(null), input=useRef<HTMLInputElement>(null);
  const id=useId();
  const selected=people.find(p=>p.id===value);
  const options=people.filter(p=>normalize(`${p.name} ${p.email} ${p.job_title} ${p.department}`).includes(normalize(query.trim())));
  useEffect(()=>{
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};
    document.addEventListener('pointerdown',dismiss);
    return()=>document.removeEventListener('pointerdown',dismiss);
  },[]);
  useEffect(()=>{if(active>=0)document.getElementById(id+'-'+active)?.scrollIntoView({block:'nearest'})},[active,id]);
  function choose(person:EquipmentRecipient) {onChange(person.id);setQuery('');setOpen(false);setActive(-1)}
  return <div className="equipment-recipient" ref={root}>
    <span className="equipment-recipient-label">Responsabil{required ? ' *' : ' (opțional)'}</span>
    <input type="hidden" name="assigned_to" value={value}/>
    {selected ? <div className="equipment-recipient-chip">
      <PersonAvatar userId={selected.id} name={selected.name}/>
      <span><strong>{selected.name}</strong><small>{selected.job_title} · {selected.email}</small></span>
      <button type="button" className="icon-button" aria-label="Schimbă responsabilul" disabled={disabled} onClick={()=>{onChange('');setOpen(true);setQuery('');setTimeout(()=>input.current?.focus(),0)}}><X size={16}/></button>
    </div> : <div className="equipment-recipient-input"><Search size={17}/><input ref={input} aria-label="Caută angajat" role="combobox" autoComplete="off"
      aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open&&active>=0?id+'-'+active:undefined}
      placeholder="Nume, email, funcție sau departament…" required={required} disabled={disabled} value={query}
      onFocus={()=>setOpen(true)} onChange={e=>{e.currentTarget.setCustomValidity(e.target.value?'Alege o persoană din listă.':'');setQuery(e.target.value);setActive(-1);setOpen(true)}}
      onKeyDown={e=>{
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(current=>options.length?(current+(e.key==='ArrowDown'?1:-1)+options.length)%options.length:-1)}
        if(e.key==='Enter'&&open&&active>=0&&options[active]){e.preventDefault();choose(options[active])}
        if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false)}
        if(e.key==='Tab')setOpen(false);
      }}/></div>}
    {open&&!selected&&<div id={id} role="listbox" aria-label="Angajații aeroportului" className="equipment-recipient-options">
      {options.length ? options.map((person,index)=><div key={person.id}>
        {(index===0||!!options[index-1].suggested!==!!person.suggested)&&<div className="equipment-recipient-group" role="presentation">{person.suggested ? `Sugerați · ${teamName || 'Echipa responsabilă'}` : 'Alți angajați ai aeroportului'}</div>}
        <button id={id+'-'+index} type="button" role="option" aria-selected={active===index} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(person)}>
          <span className="avatar equipment-option-avatar" aria-hidden="true">{initials(person.name)}</span>
          <span><strong>{person.name}</strong><small>{person.job_title} · {person.department}</small><small>{person.email}</small></span>
        </button>
      </div>) : <p>Niciun angajat activ pentru această căutare.</p>}
    </div>}
  </div>;
}
