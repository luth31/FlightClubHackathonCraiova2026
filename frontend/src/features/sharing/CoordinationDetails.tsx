import {ContactReference} from './ContactDirectory';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Clock3,FileText,Plus,Send,Unlink,UploadCloud,WifiOff,X} from 'lucide-react';
import {api,fileUrl} from '@/services/api-client';
import {ReadOnlyPdf} from '@/components/documents/ReadOnlyPdf';
import {roleLabel} from '@/utils/format';
import {Empty,ErrorMessage,Loading,Modal} from '@/components/ui';
import type {DocumentRecord,Share} from '@/types';
import type {CoordinationDetail,SharedAttachment} from './coordination-types';
import {RedactionStudio} from './RedactionStudio';
import {ContactAvatar} from './ContactDirectory';
import {UploadAttachment,AttachmentPreparation} from './AttachmentPreparation';
const statusLabel={open:'Deschisă',resolved:'Rezolvată',declined:'Fără continuare'};
const stamp=(value:string)=>new Date(value).toLocaleString('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
async function documentsForSharing(status:string,signal:AbortSignal){
  const items:DocumentRecord[]=[];
  const limit=200;
  for(let offset=0;!signal.aborted;offset+=limit){
    const page=await api<{items:DocumentRecord[];total?:number}>(`/documents?status=${status}&limit=${limit}&offset=${offset}`,{signal});
    items.push(...page.items);
    if(page.items.length<limit||items.length>=(page.total??Infinity))break;
  }
  return {items};
}

export function RequestDetail({id,active,pollingActive,revision,partnerId,onBack,onChanged,notify,onOpen}:{id:string;active:boolean;pollingActive:boolean;revision:number;partnerId?:string;onBack:()=>void;onChanged:()=>void;notify:(message:string)=>void;onOpen:(id:string)=>void}) {
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
    <button className="text-button coord-back" onClick={onBack}><ArrowLeft size={18}/>Înapoi la mesaje</button>
    {loadError&&<ErrorMessage message={loadError} retry={()=>setRefresh(value=>value+1)}/>}
    {!data&&!loadError&&<Loading/>}
    {data&&<><header className="coord-detail-heading"><div><span className="coord-request-meta">{data.direction==='incoming'?'De la':'Către'} {data.partner_name} · {data.topic}{data.recipient_department&&` · ${data.recipient_department}`}</span><h2 ref={heading} tabIndex={-1}>{data.subject}</h2></div><span className={`coord-status ${data.status}`}>{statusLabel[data.status]}</span></header>
      {!data.connected&&<p className="coord-offline" role="status"><WifiOff size={18}/>Partenerul este momentan indisponibil. Conversația salvată rămâne aici.</p>}
      {data.requester_contact&&data.recipient_contact&&<dl className="collab-envelope"><div><dt>De la</dt><dd><ContactReference contact={data.requester_contact} airport={data.partner_name} local={data.direction==='outgoing'}/> <span>&lt;{data.requester_contact.email}&gt;</span></dd></div><div><dt>Către</dt><dd><ContactReference contact={data.recipient_contact} airport={data.partner_name} local={data.direction==='incoming'}/> <span>&lt;{data.recipient_contact.email}&gt;</span></dd></div></dl>}
      {data.connected&&!(data.can_reply||data.can_participate)&&data.status==='open'&&<p className="collab-empty-notice">Schimbul de mesaje este momentan oprit. Colaborarea trebuie să fie activă în ambele aeroporturi, iar participanții să fie încă autorizați.</p>}
      <div className="coord-messages" aria-label="Mesajele cererii">{data.messages.map(message=><article key={message.id} className={`coord-message ${message.is_local?'local':'remote'} ${message.kind}`}><header><>{message.author_contact&&<ContactAvatar contact={message.author_contact} airport={message.author_airport_name}/>}<strong>{message.author_contact?<ContactReference contact={message.author_contact} airport={message.author_airport_name} local={message.is_local}/>:message.author_airport_name}</strong></><span>{message.author_role==='director'?'Director aeroport':message.author_role==='department_head'?'Șef de departament':roleLabel[message.author_role]||message.author_role}</span><time dateTime={message.created_at}>{stamp(message.created_at)}</time></header>{message.body&&<p>{message.body}</p>}{message.kind==='resolved'&&<span className="coord-event"><Check size={16}/>Cerere rezolvată</span>}{message.kind==='declined'&&<span className="coord-event">Cerere încheiată fără continuare</span>}{message.attachment&&<button className="coord-attachment" disabled={!['active','verify_on_open'].includes(message.attachment.status)} onClick={()=>setPreview(message.attachment!)}><img className="mail-document-thumbnail" alt="" loading="lazy" src={fileUrl(message.attachment.file_url.replace('/file','/thumbnail'))} onError={event=>{event.currentTarget.hidden=true}}/><span><strong>{message.attachment.title}</strong><small>Versiunea {message.attachment.source_version} · {['active','verify_on_open'].includes(message.attachment.status)?'Copie partajată · acces verificat la deschidere':message.attachment.status==='revoked'?'Acces revocat':'Acces indisponibil'}</small></span><ArrowRight size={18}/></button>}{message.delivery==='pending'&&<span className="coord-pending"><Clock3 size={14}/>Livrare în așteptare</span>}</article>)}</div>
      {error&&!closing&&<ErrorMessage message={error}/>}
      {(data.can_reply||data.can_participate)&&data.status==='open'&&<form className="coord-reply" onSubmit={event=>{event.preventDefault();void send()}}><label htmlFor="coord-reply-body">Răspunde</label><textarea id="coord-reply-body" rows={3} maxLength={3000} disabled={busy||!data.connected||!data.can_reply||!!loadError} value={body} onChange={event=>{setBody(event.target.value);requestKey.current=crypto.randomUUID()}} placeholder="Scrie răspunsul…"/>
        {attachment&&<div className="coord-selected-attachment"><FileText size={21}/><span><strong>{attachment.document_title||attachment.title}</strong><small>Copie deja partajată · va fi legată de acest răspuns</small></span><button type="button" className="icon-button" aria-label="Elimină documentul din răspuns" disabled={busy} onClick={()=>{setAttachment(undefined);requestKey.current=crypto.randomUUID()}}><X size={17}/></button></div>}
        <div className="coord-reply-actions"><button type="button" className="text-button" disabled={busy||!data.connected||!data.can_reply||!!loadError} onClick={()=>setPicker(true)}><FileText size={18}/>{attachment?'Schimbă documentul':'Adaugă un document'}</button><button className="button primary" disabled={busy||!data.connected||!data.can_reply||!!loadError||(!body.trim()&&!attachment)}><Send size={17}/>{busy?'Se trimite…':'Trimite răspunsul'}</button></div>
      </form>}
      {data.status==='open'&&(data.can_resolve||data.can_decline)&&<div className="coord-complete"><p>{data.can_resolve?'Ai primit informația de care aveai nevoie?':'Nu puteți contribui la acest subiect?'}</p><button className="text-button" disabled={busy||!data.connected||!data.can_reply||!!loadError} onClick={()=>{setError('');setClosing(data.can_resolve?'resolved':'declined')}}>{data.can_resolve?<Check size={17}/>:<Unlink size={17}/>} {data.can_resolve?'Marchează rezolvată':'Încheie fără continuare'}</button></div>}
      {data.status!=='open'&&<p className="coord-closed"><Check size={18}/>Cererea este încheiată. Mesajele și documentele rămân disponibile conform drepturilor de acces.</p>}
    </>}
    {picker&&<DocumentPicker partnerId={data?.partner?.id||partnerId} onClose={()=>setPicker(false)} onSelected={share=>{setAttachment(share);requestKey.current=crypto.randomUUID();setPicker(false)}} onOpen={onOpen}/>}
    {preview&&<Modal title={preview.title} subtitle={`Versiunea ${preview.source_version} · copie partajată`} wide onClose={()=>setPreview(undefined)}><div className="modal-body"><ReadOnlyPdf source={preview.file_url} title={preview.title}/><p className="coord-form-note">Accesul este verificat de aeroportul sursă la fiecare deschidere.</p></div></Modal>}
    {closing&&<Modal title={closing==='resolved'?'Marchezi cererea ca rezolvată?':'Închei cererea fără continuare?'} onClose={()=>{if(!busy)setClosing(undefined)}}><div className="coord-create">{error&&<ErrorMessage message={error}/>}<p>Partenerul va vedea această decizie. Istoricul conversației se păstrează.</p><div className="coord-form-actions"><button className="button secondary" disabled={busy} onClick={()=>setClosing(undefined)}>Înapoi</button><button className="button primary" disabled={busy} onClick={()=>void close()}>{busy?'Se salvează…':'Confirmă încheierea'}</button></div></div></Modal>}
  </section>;
}

export function DocumentPicker({partnerId,onClose,onSelected,onOpen,startUpload=false}:{partnerId?:string;onClose:()=>void;onSelected:(share:Share)=>void;onOpen:(id:string)=>void;startUpload?:boolean}) {
  const [shares,setShares]=useState<Share[]>(),[documents,setDocuments]=useState<DocumentRecord[]>(),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const [tab,setTab]=useState<'shared'|'prepare'>('shared'),[query,setQuery]=useState(''),[selected,setSelected]=useState<DocumentRecord>(),[busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(startUpload),[preparing,setPreparing]=useState<DocumentRecord>();
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{let disposed=false;const controller=new AbortController();setError('');
    Promise.allSettled([api<{items:Array<Share&{recipient_airport_id?:string}>}>('/shares',{signal:controller.signal}),documentsForSharing('approved',controller.signal),documentsForSharing('signed',controller.signal),documentsForSharing('draft',controller.signal),documentsForSharing('in_review',controller.signal)]).then(results=>{
      if(disposed)return;
      const [shared,...documentResults]=results;
      if(shared.status==='fulfilled')setShares(shared.value.items.filter(item=>!item.revoked&&!item.revoked_at&&!item.recipient_department&&(!item.status||item.status==='active')&&(!partnerId||item.recipient_airport_id===partnerId)));
      const docs=documentResults.flatMap(result=>result.status==='fulfilled'?result.value.items:[]);
      setDocuments([...new Map(docs.filter(item=>item.department!=='Resurse umane').map(item=>[item.id,item])).values()]);
      const failed=results.find(item=>item.status==='rejected');if(failed?.status==='rejected')setError((failed.reason as Error).message);
    });return()=>{disposed=true;controller.abort()};
  },[refresh,partnerId]);
  async function prepare(id:string){setBusy(true);setError('');try{const doc=await api<DocumentRecord>(`/documents/${encodeURIComponent(id)}`);if(!alive.current)return;if(!doc.permissions?.can_share)throw new Error('Nu ai dreptul să partajezi acest document.');if(['approved','signed'].includes(doc.status))setSelected(doc);else setPreparing(doc)}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}}
  const needle=query.trim().toLocaleLowerCase('ro');
  const shownShares=shares?.filter(item=>`${item.document_title||item.title} ${item.recipient_airport}`.toLocaleLowerCase('ro').includes(needle));
  const shownDocuments=documents?.filter(item=>item.title.toLocaleLowerCase('ro').includes(needle));
  if(uploading)return <UploadAttachment onClose={()=>setUploading(false)} onCreated={doc=>{setUploading(false);setPreparing(doc);setRefresh(v=>v+1)}}/>;
  if(preparing)return <AttachmentPreparation initial={preparing} onClose={()=>{setPreparing(undefined);setRefresh(v=>v+1)}} onReady={doc=>{setPreparing(undefined);setSelected(doc)}} onOpen={id=>{onClose();onOpen(id)}}/>;
  if(selected)return <RedactionStudio document={selected} onClose={()=>setSelected(undefined)} recipientAirportId={partnerId} forCoordination onShared={share=>{if(share)onSelected(share);else{setSelected(undefined);setRefresh(value=>value+1);setError('Copia a fost creată. Selecteaz-o din documentele deja partajate.')}}}/>;
  return <Modal title="Atașează o copie verificată" onClose={onClose} wide><div className="coord-picker">
    <p>Alege un document din bibliotecă sau încarcă un PDF de pe dispozitiv. Copia se verifică înainte de atașare.</p>
    <div className="coord-filters"><button aria-pressed={tab==='shared'} onClick={()=>setTab('shared')}>Deja partajate</button><button aria-pressed={tab==='prepare'} onClick={()=>setTab('prepare')}>Pregătește o copie</button><button className="button secondary" onClick={()=>setUploading(true)}><UploadCloud size={17}/>Încarcă PDF</button></div>
    {error&&<ErrorMessage message={error} retry={()=>setRefresh(value=>value+1)}/>}
    <label className="field">Caută documentul<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Titlul documentului"/></label>
    <div className="coord-picker-list">{tab==='shared'?(!shownShares?<Loading/>:shownShares.length?shownShares.map(item=><button key={item.id} onClick={()=>onSelected(item)}><FileText size={21}/><span><strong>{item.document_title||item.title}</strong><small>Versiunea {item.source_version} · {item.recipient_airport}</small></span><Plus size={18}/></button>):<Empty title="Nicio copie disponibilă" message="Pregătește o copie dintr-un document aprobat."/>):(!shownDocuments?<Loading/>:shownDocuments.length?shownDocuments.map(item=><div className="coord-picker-document" key={item.id}><FileText size={21}/><span><strong>{item.title}</strong><small>Versiunea {item.version} · {item.department}</small></span><button className="text-button" disabled={busy} onClick={()=>void prepare(item.id)}>Pregătește<ArrowRight size={17}/></button><button className="icon-button" aria-label={`Deschide ${item.title}`} onClick={()=>{onClose();onOpen(item.id)}}><FileText size={17}/></button></div>):<Empty title="Niciun document aprobat" message="Documentul trebuie aprobat înainte de partajare."/>)}</div>
  </div></Modal>;
}

