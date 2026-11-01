import {useEffect,useRef,useState} from 'react';
import {Check,Copy,CreditCard,LogIn,LogOut,Smartphone,ArrowLeft,LoaderCircle} from 'lucide-react';
import type {OperationsData} from './types';
import {cardFromHash,clearNfcLink,nfcLink,pendingNfcCard} from './nfc-links';
import {clock,eventTime} from './format';

export function NfcStation({data,busy,onScan,onBack}:{data:OperationsData;busy:boolean;onScan:(card:string,action:'check_in'|'check_out')=>Promise<OperationsData|null>;onBack:()=>void}) {
  const [card,setCard]=useState(()=>cardFromHash(window.location.hash)||pendingNfcCard()||'');
  const [action,setAction]=useState<'check_in'|'check_out'>('check_in');
  const [receipt,setReceipt]=useState<{name:string;time:string;action:string}|null>(null);
  const [copied,setCopied]=useState('');
  const [linkToCopy,setLinkToCopy]=useState('');
  const submitting=useRef(false),selection=useRef(card);selection.current=card;
  useEffect(()=>{const sync=()=>{const next=cardFromHash(window.location.hash);if(next){setCard(next);setReceipt(null);setAction('check_in')}};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
  const person=data.staff.find(item=>item.card_label?.toUpperCase()===card.toUpperCase()||item.id===card);
  async function submit(){
    if(!person||busy||submitting.current||!data.permissions.can_control||(action==='check_in'&&person.present)||(action==='check_out'&&!person.present))return;
    submitting.current=true;const scannedCard=card;
    try{const result=await onScan(person.card_label,action);if(result&&selection.current===scannedCard){setReceipt({name:person.name,time:eventTime(result.simulation.clock_time),action});clearNfcLink()}}finally{submitting.current=false}
  }
  async function copyLink(value:string){const link=nfcLink(value);setLinkToCopy(link);try{await navigator.clipboard.writeText(link);setCopied(value)}catch{setCopied('')};}
  return <section className="ops-station" aria-label="Stație de pontaj">
    <div className="ops-station-top"><button onClick={()=>{clearNfcLink();onBack()}}><ArrowLeft size={17}/>Înapoi la operațiuni</button><span><Smartphone size={15}/>NFC</span></div>
    <div className="ops-station-heading"><span className="ops-station-symbol"><CreditCard size={30}/></span><h2>Pontajul echipei</h2><p>{data.airport.name} · tura de la 08:00</p><strong>{eventTime(data.simulation.clock_time)}</strong><small>Ora turei simulate</small></div>
    {receipt?<div className="ops-scan-receipt" role="status"><Check size={29}/><h3>{receipt.action==='check_in'?'Prezență înregistrată':'Ieșire înregistrată'}</h3><strong>{receipt.name}</strong><p>{receipt.time} · pontaj confirmat</p><button onClick={()=>{setReceipt(null);setCard('')}}>Următorul card</button></div>:<>
      <form className="ops-card-input" onSubmit={event=>{event.preventDefault();void submit()}}><label htmlFor="nfc-card">Cod card</label><input id="nfc-card" value={card} onChange={event=>{setCard(event.target.value.trim());setReceipt(null)}} placeholder="DEMO-NFC-101" autoComplete="off" spellCheck={false}/></form>
      {person?<div className="ops-scan-person"><span className="ops-person-avatar">{person.name.split(' ').map(word=>word[0]).slice(0,2).join('')}</span><h3>{person.name}</h3><p>{person.title}</p><dl><div><dt>Sosire așteptată</dt><dd>{clock(person.expected_seconds)}</dd></div><div><dt>Prezență</dt><dd>{person.present?'Înregistrată':'Neînregistrată'}</dd></div></dl>
        <div className="ops-station-action"><button className={action==='check_in'?'active':''} onClick={()=>setAction('check_in')}><LogIn size={16}/>Intrare</button><button className={action==='check_out'?'active':''} onClick={()=>setAction('check_out')}><LogOut size={16}/>Ieșire</button></div>
        <button className="ops-confirm-scan" disabled={busy||!data.permissions.can_control||(action==='check_in'&&person.present)||(action==='check_out'&&!person.present)} onClick={()=>void submit()}>{busy?<LoaderCircle size={18} className="spin"/>:<Check size={18}/>}Confirmă {action==='check_in'?'intrarea':'ieșirea'}</button></div>:card?<p className="ops-inline-error" role="alert">Card necunoscut. Alege un card al echipei de mai jos.</p>:<p className="ops-scan-hint">Apropie cardul de iPhone, apoi deschide notificarea.</p>}
    </>}
    {!data.permissions.can_control&&<p className="ops-inline-error">Doar operatorii pot înregistra pontaje.</p>}
    <details className="ops-card-setup" open={!card&&!receipt}><summary>Cardurile echipei</summary><details className="ops-nfc-instructions"><summary>Scrie un card în NFC Tools</summary><ol><li>Copiază linkul colegului.</li><li>În NFC Tools: <strong>Write → Add a record → URL / URI</strong>.</li><li>Lipește linkul HTTPS și scrie cardul.</li></ol></details>
      <div className="ops-setup-cards">{data.staff.map(item=><div key={item.id}><button onClick={()=>{setCard(item.card_label);setReceipt(null);setAction('check_in')}}><CreditCard size={19}/><span><strong>{item.name}</strong><small>{item.title} · {item.card_label}</small></span></button><button aria-label={`Copiază link NFC pentru ${item.name}`} onClick={()=>void copyLink(item.card_label)}>{copied===item.card_label?<Check size={16}/>:<Copy size={16}/>}</button></div>)}</div>
      {linkToCopy&&<label className="ops-copy-link">Link de scris pe card<input readOnly value={linkToCopy} onFocus={event=>event.currentTarget.select()}/></label>}
    </details>
  </section>;
}
