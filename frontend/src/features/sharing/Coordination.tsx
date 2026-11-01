import {useContext,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Building2,Check,ChevronRight,Clock3,FileText,Inbox,Plus,RefreshCw,Send,ShieldCheck,Unlink,WifiOff,X} from 'lucide-react';
import {api,fileUrl} from '@/services/api-client';
import {roleLabel} from '@/utils/format';
import {Empty,ErrorMessage,Loading,Modal,ViewActiveContext} from '@/components/ui';
import type {DocumentRecord,Share} from '@/types';
import type {CoordinationDetail,CoordinationInbox,SharedAttachment} from './coordination-types';
import {RedactionStudio} from './RedactionStudio';
import {collaborationChanged} from './useCollaborationInbox';
import './coordination.css';

const statusLabel={open:'Deschisă',resolved:'Rezolvată',declined:'Fără continuare'};
const stamp=(value:string)=>new Date(value).toLocaleString('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

async function documentsForSharing(status:'approved'|'signed',signal:AbortSignal){
  const items:DocumentRecord[]=[];
  const limit=200;
  for(let offset=0;!signal.aborted;offset+=limit){
    const page=await api<{items:DocumentRecord[];total?:number}>(`/documents?status=${status}&limit=${limit}&offset=${offset}`,{signal});
    items.push(...page.items);
    if(page.items.length<limit||items.length>=(page.total??Infinity))break;
  }
  return {items};
}

export function Coordination({revision,active:tabActive,notify,onOpen,onConnections,showConnections=true}:{revision:number;active:boolean;notify:(message:string)=>void;onOpen:(id:string)=>void;onConnections?:(data:CoordinationInbox)=>void;showConnections?:boolean}) {
  const viewActive=useContext(ViewActiveContext),[visible,setVisible]=useState(!document.hidden),active=viewActive&&tabActive,pollingActive=active&&visible;
  const [data,setData]=useState<CoordinationInbox>(),[selected,setSelected]=useState<string>(),[creating,setCreating]=useState(false);
  const [filter,setFilter]=useState<'all'|'incoming'|'outgoing'>('all'),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState(false),[subject,setSubject]=useState(''),[body,setBody]=useState(''),[topic,setTopic]=useState('Proceduri');
  const [recipient,setRecipient]=useState(''),[department,setDepartment]=useState('');
  const target=data?.partners?.find(partner=>partner.id===recipient);
  useEffect(()=>{if(data)onConnections?.(data)},[data,onConnections]);
  const createKey=useRef(crypto.randomUUID()),pending=useRef(false),alive=useRef(true),isActive=useRef(active);
  const subjectInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed)},[]);
  useEffect(()=>{isActive.current=active;if(!active)setCreating(false)},[active]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{
    if(!pollingActive)return;
    const controller=new AbortController();let disposed=false;let timer:ReturnType<typeof setTimeout>;
    async function load(){try{const result=await api<CoordinationInbox>('/collaboration',{signal:controller.signal});if(!disposed){setData(result);setLoadError('')}}catch(e){if(!disposed)setLoadError((e as Error).message)}if(!disposed)timer=setTimeout(load,15000)}
    void load();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[pollingActive,revision,refresh]);
  async function create(){
    if(pending.current||!subject.trim()||!body.trim()||!department||!target?.connected||!data?.can_create)return;
    pending.current=true;setBusy(true);setError('');
    try{
      const result=await api<CoordinationDetail>('/collaboration',{method:'POST',body:JSON.stringify({subject:subject.trim(),topic,body:body.trim(),recipient_airport_id:recipient,recipient_department:department,idempotency_key:createKey.current})});
      if(!alive.current)return;
      setRefresh(value=>value+1);setSubject('');setBody('');setDepartment('');createKey.current=crypto.randomUUID();collaborationChanged();
      if(isActive.current){setCreating(false);setSelected(result.id);notify(result.pending_delivery?'Cererea a fost salvată. Trimiterea este în așteptare.':'Cererea a fost trimisă aeroportului partener.')}
    }catch(e){if(alive.current)setError((e as Error).message)}finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  if(selected)return <RequestDetail key={selected} id={selected} active={active} pollingActive={pollingActive} revision={revision} partnerId={data?.partner.id} onBack={()=>{setSelected(undefined);setRefresh(value=>value+1)}} onChanged={()=>{setRefresh(value=>value+1);collaborationChanged()}} notify={notify} onOpen={onOpen}/>;
  const items=data?.requests.filter(item=>filter==='all'||item.direction===filter);
  return <section className="coord-workspace" aria-label="Cereri între aeroporturi">
    {showConnections&&data&&<PartnerConnections data={data}/>}
    <div className="coord-intro"><div><h2>Un subiect. Un răspuns, la locul lui.</h2><p>Discută direct cu departamentul potrivit din aeroportul partener.</p></div>{data?.can_create&&<button className="button primary" disabled={!data.connected||!!loadError} onClick={()=>{setError('');setRecipient(data.partners?.length===1?data.partners[0].id:'');setDepartment('');setCreating(true)}}><Plus size={18}/>Cerere nouă</button>}</div>
    {data&&!data.can_create&&data.connected&&<p className="coord-form-note">Cererile sunt inițiate de șefii de departament și de director.</p>}
    {loadError&&<ErrorMessage message={loadError} retry={()=>setRefresh(value=>value+1)}/>}
    {data&&!data.connected&&<div className="coord-offline" role="status"><WifiOff size={20}/><div><strong>Legătura cu partenerul nu este disponibilă</strong><p>Poți consulta cererile salvate. Reluăm verificarea automat.</p></div><button className="text-button" onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={16}/>Reîncearcă</button></div>}
    {!data&&!loadError&&<Loading/>}
    {data&&<><div className="coord-filters" aria-label="Filtrează cererile">{([{value:'all',label:'Toate'},{value:'incoming',label:'De la partener'},{value:'outgoing',label:'Trimise de noi'}] as const).map(item=><button key={item.value} aria-pressed={filter===item.value} onClick={()=>setFilter(item.value)}>{item.label}</button>)}<button className="coord-refresh" onClick={()=>setRefresh(value=>value+1)} aria-label="Actualizează cererile"><RefreshCw size={17}/></button></div>
      {!items?.length?<Empty title="Nicio cerere în această listă" message={filter==='incoming'?'Cererile aeroportului partener vor apărea aici.':'Pornește de la o întrebare concretă. Aeroportul și rolul tău sunt adăugate automat.'}/>:<div className="coord-request-list">{items.map(item=><button className="coord-request-card" key={item.id} onClick={()=>setSelected(item.id)}><span className={`coord-request-icon ${item.direction}`} aria-hidden="true">{item.direction==='incoming'?<Inbox size={22}/>:<Send size={21}/>}</span><span className="coord-request-copy"><span className="coord-request-meta">{item.direction==='incoming'?'De la':'Către'} {item.partner_name}<span>·</span>{item.topic}{item.recipient_department&&<><span>·</span>{item.recipient_department}</>}</span><strong>{item.subject}</strong><span className="coord-request-preview">{item.last_message||'Deschide cererea'}</span><span className="coord-request-meta">{item.message_count} {item.message_count===1?'mesaj':'mesaje'} · {stamp(item.updated_at)}{item.pending_delivery&&<span className="coord-pending"><Clock3 size={13}/>Livrare în așteptare</span>}</span></span><span className={`coord-status ${item.status}`}>{statusLabel[item.status]}</span><ChevronRight size={20}/></button>)}</div>}
      <p className="coord-footnote"><ShieldCheck size={17}/>Documentele se trimit ca copii verificate, cu acces controlat.</p>
    </>}
    {creating&&<Modal title="O cerere către aeroportul partener" subtitle="Alege aeroportul și echipa care îți poate răspunde" onClose={()=>{if(!busy)setCreating(false)}} initialFocusRef={subjectInput}>
      <form className="coord-create" onSubmit={event=>{event.preventDefault();void create()}}>
        {error&&<ErrorMessage message={error}/>}
        <div className="coord-destination">
          <label className="field">Aeroport destinatar<select aria-label="Aeroport destinatar" required disabled={busy} value={recipient} onChange={event=>{setRecipient(event.target.value);setDepartment('');createKey.current=crypto.randomUUID()}}><option value="">Alege aeroportul</option>{data?.partners?.map(partner=><option key={partner.id} value={partner.id} disabled={!partner.connected}>{partner.name}{!partner.connected?' · indisponibil':''}</option>)}</select></label>
          <label className="field">Departament destinatar<select aria-label="Departament destinatar" required disabled={busy||!target?.connected} value={department} onChange={event=>{setDepartment(event.target.value);createKey.current=crypto.randomUUID()}}><option value="">Alege departamentul</option>{target?.departments.map(item=><option key={item.name} value={item.name}>{item.label}</option>)}</select></label>
        </div>
        {target&&!target.departments.length&&<p className="coord-form-note">Directorul de departamente al partenerului nu este disponibil. Reîncearcă după sincronizare.</p>}
        <label className="field">De ce ai nevoie?<input ref={subjectInput} required maxLength={160} disabled={busy} value={subject} onChange={event=>{setSubject(event.target.value);createKey.current=crypto.randomUUID()}} placeholder="Ex. Procedura pentru predarea turei"/></label>
        <label className="field">Context pentru colegi<textarea required maxLength={3000} rows={4} disabled={busy} value={body} onChange={event=>{setBody(event.target.value);createKey.current=crypto.randomUUID()}} placeholder="Ce vrei să clarifici și cum te-ar ajuta răspunsul?"/></label>
        <details><summary>Tipul cererii</summary><label className="field">Subiect<select disabled={busy} value={topic} onChange={event=>{setTopic(event.target.value);createKey.current=crypto.randomUUID()}}>{['Proceduri','Documente','Experiență practică','Alt subiect'].map(item=><option key={item}>{item}</option>)}</select></label></details>
        <p className="coord-form-note">Mesajul ajunge la șeful departamentului selectat; directorul aeroportului are vizibilitate asupra cererii. Documentele se pot adăuga ulterior, după verificarea copiei.</p>
        <div className="coord-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>setCreating(false)}>Renunță</button><button className="button primary" disabled={busy||!subject.trim()||!body.trim()||!data?.can_create||!department||!target?.connected}><Send size={17}/>{busy?'Se trimite…':'Trimite cererea'}</button></div>
      </form>
    </Modal>}
  </section>;
}

function RequestDetail({id,active,pollingActive,revision,partnerId,onBack,onChanged,notify,onOpen}:{id:string;active:boolean;pollingActive:boolean;revision:number;partnerId?:string;onBack:()=>void;onChanged:()=>void;notify:(message:string)=>void;onOpen:(id:string)=>void}) {
  const [data,setData]=useState<CoordinationDetail>(),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[refresh,setRefresh]=useState(0);
  const [body,setBody]=useState(''),[attachment,setAttachment]=useState<Share>(),[picker,setPicker]=useState(false),[preview,setPreview]=useState<SharedAttachment>();
  const [busy,setBusy]=useState(false),[closing,setClosing]=useState<'resolved'|'declined'>();
  const requestKey=useRef(crypto.randomUUID()),statusKey=useRef(crypto.randomUUID()),pending=useRef(false),alive=useRef(true),readEpoch=useRef(0);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{heading.current?.focus({preventScroll:true})},[data?.id]);
  useEffect(()=>{if(!active){setPicker(false);setPreview(undefined);setClosing(undefined)}},[active]);
  useEffect(()=>{
    if(!pollingActive)return;
    let disposed=false;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController(),epoch=++readEpoch.current;
    async function load(){try{const result=await api<CoordinationDetail>(`/collaboration/${encodeURIComponent(id)}`,{signal:controller.signal});if(!disposed&&epoch===readEpoch.current){setData(result);setLoadError('')}}catch(e){if(!disposed&&epoch===readEpoch.current)setLoadError((e as Error).message)}if(!disposed)timer=setTimeout(load,15000)}
    void load();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[pollingActive,id,revision,refresh]);
  async function send(){
    if(pending.current||(!body.trim()&&!attachment))return;
    pending.current=true;setBusy(true);setError('');
    try{const result=await api<CoordinationDetail>(`/collaboration/${encodeURIComponent(id)}/messages`,{method:'POST',body:JSON.stringify({body:body.trim()||(attachment?'Document partajat în răspuns la cerere.':''),share_id:attachment?.id,idempotency_key:requestKey.current})});if(alive.current){readEpoch.current++;setRefresh(value=>value+1);setData(result);setBody('');setAttachment(undefined);requestKey.current=crypto.randomUUID();onChanged();notify(result.pending_delivery?'Răspuns salvat. Livrarea este în așteptare.':'Răspuns trimis.')}}catch(e){if(alive.current)setError((e as Error).message)}finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  async function close(){
    if(!closing||pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{const result=await api<CoordinationDetail>(`/collaboration/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status:closing,idempotency_key:statusKey.current})});if(alive.current){readEpoch.current++;setRefresh(value=>value+1);setData(result);setClosing(undefined);statusKey.current=crypto.randomUUID();onChanged();notify('Starea cererii a fost actualizată.')}}catch(e){if(alive.current)setError((e as Error).message)}finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  return <section className="coord-detail">
    <button className="text-button coord-back" onClick={onBack}><ArrowLeft size={18}/>Toate cererile</button>
    {loadError&&<ErrorMessage message={loadError} retry={()=>setRefresh(value=>value+1)}/>}
    {!data&&!loadError&&<Loading/>}
    {data&&<><header className="coord-detail-heading"><div><span className="coord-request-meta">{data.direction==='incoming'?'De la':'Către'} {data.partner_name} · {data.topic}{data.recipient_department&&` · ${data.recipient_department}`}</span><h2 ref={heading} tabIndex={-1}>{data.subject}</h2></div><span className={`coord-status ${data.status}`}>{statusLabel[data.status]}</span></header>
      {!data.connected&&<p className="coord-offline" role="status"><WifiOff size={18}/>Partenerul este momentan indisponibil. Conversația salvată rămâne aici.</p>}
      <div className="coord-messages" aria-label="Mesajele cererii">{data.messages.map(message=><article key={message.id} className={`coord-message ${message.is_local?'local':'remote'} ${message.kind}`}><header><strong>{message.author_airport_name}</strong><span>{message.author_role==='director'?'Director aeroport':message.author_role==='department_head'?'Șef de departament':roleLabel[message.author_role]||message.author_role}</span><time dateTime={message.created_at}>{stamp(message.created_at)}</time></header>{message.body&&<p>{message.body}</p>}{message.kind==='resolved'&&<span className="coord-event"><Check size={16}/>Cerere rezolvată</span>}{message.kind==='declined'&&<span className="coord-event">Cerere încheiată fără continuare</span>}{message.attachment&&<button className="coord-attachment" disabled={!['active','verify_on_open'].includes(message.attachment.status)} onClick={()=>setPreview(message.attachment!)}><FileText size={23}/><span><strong>{message.attachment.title}</strong><small>Versiunea {message.attachment.source_version} · {['active','verify_on_open'].includes(message.attachment.status)?'Copie partajată · acces verificat la deschidere':message.attachment.status==='revoked'?'Acces revocat':'Acces indisponibil'}</small></span><ArrowRight size={18}/></button>}{message.delivery==='pending'&&<span className="coord-pending"><Clock3 size={14}/>Livrare în așteptare</span>}</article>)}</div>
      {error&&!closing&&<ErrorMessage message={error}/>}
      {(data.can_reply||!data.connected)&&data.status==='open'&&<form className="coord-reply" onSubmit={event=>{event.preventDefault();void send()}}><label htmlFor="coord-reply-body">Răspunde în acest context</label><textarea id="coord-reply-body" rows={3} maxLength={3000} disabled={busy||!data.connected||!!loadError} value={body} onChange={event=>{setBody(event.target.value);requestKey.current=crypto.randomUUID()}} placeholder="O clarificare, o experiență sau documentul potrivit…"/>
        {attachment&&<div className="coord-selected-attachment"><FileText size={21}/><span><strong>{attachment.document_title||attachment.title}</strong><small>Copie deja partajată · va fi legată de acest răspuns</small></span><button type="button" className="icon-button" aria-label="Elimină documentul din răspuns" disabled={busy} onClick={()=>{setAttachment(undefined);requestKey.current=crypto.randomUUID()}}><X size={17}/></button></div>}
        <div className="coord-reply-actions"><button type="button" className="text-button" disabled={busy||!data.connected||!!loadError} onClick={()=>setPicker(true)}><FileText size={18}/>{attachment?'Schimbă documentul':'Adaugă un document'}</button><button className="button primary" disabled={busy||!data.connected||!!loadError||(!body.trim()&&!attachment)}><Send size={17}/>{busy?'Se trimite…':'Trimite răspunsul'}</button></div>
      </form>}
      {data.status==='open'&&(data.can_resolve||data.can_decline)&&<div className="coord-complete"><p>{data.can_resolve?'Ai primit informația de care aveai nevoie?':'Nu puteți contribui la acest subiect?'}</p><button className="text-button" disabled={busy||!data.connected||!!loadError} onClick={()=>{setError('');setClosing(data.can_resolve?'resolved':'declined')}}>{data.can_resolve?<Check size={17}/>:<Unlink size={17}/>} {data.can_resolve?'Marchează rezolvată':'Încheie fără continuare'}</button></div>}
      {data.status!=='open'&&<p className="coord-closed"><Check size={18}/>Cererea este încheiată. Mesajele și documentele rămân disponibile conform drepturilor de acces.</p>}
    </>}
    {picker&&<DocumentPicker partnerId={partnerId} onClose={()=>setPicker(false)} onSelected={share=>{setAttachment(share);requestKey.current=crypto.randomUUID();setPicker(false)}} onOpen={onOpen}/>}
    {preview&&<Modal title={preview.title} subtitle={`Versiunea ${preview.source_version} · copie partajată`} wide onClose={()=>setPreview(undefined)}><div className="modal-body"><iframe title="Copie partajată în cerere" src={fileUrl(preview.file_url)} className="coord-document-preview"/><p className="coord-form-note">Accesul este verificat de aeroportul sursă la fiecare deschidere.</p></div></Modal>}
    {closing&&<Modal title={closing==='resolved'?'Marchezi cererea ca rezolvată?':'Închei cererea fără continuare?'} onClose={()=>{if(!busy)setClosing(undefined)}}><div className="coord-create">{error&&<ErrorMessage message={error}/>}<p>Partenerul va vedea această decizie. Istoricul conversației se păstrează.</p><div className="coord-form-actions"><button className="button secondary" disabled={busy} onClick={()=>setClosing(undefined)}>Înapoi</button><button className="button primary" disabled={busy} onClick={()=>void close()}>{busy?'Se salvează…':'Confirmă încheierea'}</button></div></div></Modal>}
  </section>;
}

function DocumentPicker({partnerId,onClose,onSelected,onOpen}:{partnerId?:string;onClose:()=>void;onSelected:(share:Share)=>void;onOpen:(id:string)=>void}) {
  const [shares,setShares]=useState<Share[]>(),[documents,setDocuments]=useState<DocumentRecord[]>(),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const [tab,setTab]=useState<'shared'|'prepare'>('shared'),[query,setQuery]=useState(''),[selected,setSelected]=useState<DocumentRecord>(),[busy,setBusy]=useState(false);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{let disposed=false;const controller=new AbortController();setError('');
    Promise.allSettled([api<{items:Array<Share&{recipient_airport_id?:string}>}>('/shares',{signal:controller.signal}),documentsForSharing('approved',controller.signal),documentsForSharing('signed',controller.signal)]).then(results=>{
      if(disposed)return;
      const [shared,approved,signed]=results;
      if(shared.status==='fulfilled')setShares(shared.value.items.filter(item=>!item.revoked&&!item.revoked_at&&!item.recipient_department&&(!item.status||item.status==='active')&&(!partnerId||item.recipient_airport_id===partnerId)));
      const docs=[...(approved.status==='fulfilled'?approved.value.items:[]),...(signed.status==='fulfilled'?signed.value.items:[])];
      setDocuments([...new Map(docs.filter(item=>['approved','signed'].includes(item.status)).map(item=>[item.id,item])).values()]);
      const failed=results.find(item=>item.status==='rejected');if(failed?.status==='rejected')setError((failed.reason as Error).message);
    });return()=>{disposed=true;controller.abort()};
  },[refresh,partnerId]);
  async function prepare(id:string){setBusy(true);setError('');try{const doc=await api<DocumentRecord>(`/documents/${encodeURIComponent(id)}`);if(!alive.current)return;if(!doc.permissions?.can_share)throw new Error('Nu ai dreptul să partajezi acest document.');setSelected(doc)}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}}
  const needle=query.trim().toLocaleLowerCase('ro');
  const shownShares=shares?.filter(item=>`${item.document_title||item.title} ${item.recipient_airport}`.toLocaleLowerCase('ro').includes(needle));
  const shownDocuments=documents?.filter(item=>item.title.toLocaleLowerCase('ro').includes(needle));
  if(selected)return <RedactionStudio document={selected} onClose={()=>setSelected(undefined)} recipientAirportId={partnerId} forCoordination onShared={share=>{if(share)onSelected(share);else{setSelected(undefined);setRefresh(value=>value+1);setError('Copia a fost creată. Selecteaz-o din documentele deja partajate.')}}}/>;
  return <Modal title="Adaugă un document la răspuns" onClose={onClose} wide><div className="coord-picker">
    <p>Alege o copie partajată sau pregătește un document aprobat. Originalul nu se atașează automat.</p>
    <div className="coord-filters"><button aria-pressed={tab==='shared'} onClick={()=>setTab('shared')}>Deja partajate</button><button aria-pressed={tab==='prepare'} onClick={()=>setTab('prepare')}>Pregătește o copie</button></div>
    {error&&<ErrorMessage message={error} retry={()=>setRefresh(value=>value+1)}/>}
    <label className="field">Caută documentul<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Titlul documentului"/></label>
    <div className="coord-picker-list">{tab==='shared'?(!shownShares?<Loading/>:shownShares.length?shownShares.map(item=><button key={item.id} onClick={()=>onSelected(item)}><FileText size={21}/><span><strong>{item.document_title||item.title}</strong><small>Versiunea {item.source_version} · {item.recipient_airport}</small></span><Plus size={18}/></button>):<Empty title="Nicio copie disponibilă" message="Pregătește o copie dintr-un document aprobat."/>):(!shownDocuments?<Loading/>:shownDocuments.length?shownDocuments.map(item=><div className="coord-picker-document" key={item.id}><FileText size={21}/><span><strong>{item.title}</strong><small>Versiunea {item.version} · {item.department}</small></span><button className="text-button" disabled={busy} onClick={()=>void prepare(item.id)}>Pregătește<ArrowRight size={17}/></button><button className="icon-button" aria-label={`Deschide ${item.title}`} onClick={()=>{onClose();onOpen(item.id)}}><FileText size={17}/></button></div>):<Empty title="Niciun document aprobat" message="Documentul trebuie aprobat înainte de partajare."/>)}</div>
  </div></Modal>;
}

export function PartnerConnections({data}:{data:CoordinationInbox}) {
  const partners=data.partners||[];
  return <section className="coord-network" aria-label="Aeroporturi partenere">
    <header><div><span>Rețeaua ta</span><h2>{data.local_airport?.name||'Aeroportul tău'}</h2></div><span>{partners.length} {partners.length===1?'legătură configurată':'legături configurate'}</span></header>
    {!partners.length?<p>Niciun aeroport conectat. Legăturile apar aici după configurarea schimbului între aeroporturi.</p>:<div className="coord-connections">{partners.map(partner=><article key={partner.id} className="coord-connection"><Building2 size={24}/><div><strong>{partner.name}</strong><span>{partner.sharing_enabled?'Schimb de cereri și copii aprobate':'Partajare dezactivată'}</span><small>{partner.last_synced_at?`Ultima sincronizare · ${stamp(partner.last_synced_at)}`:'Conexiune încă neverificată'}</small></div><span className={`coord-connection-status ${partner.connected?'online':'offline'}`}>{partner.connected?'Conectat':'Indisponibil'}</span></article>)}</div>}
    <small className="coord-network-note">Sunt afișate doar legăturile configurate. Documentele se transmit numai prin partajare explicită.</small>
  </section>;
}
