import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {ContactReference} from './ContactDirectory';
import {useContext,useEffect,useRef,useState} from 'react';
import {Archive,ArchiveRestore,ChevronLeft,ChevronRight,FilePenLine,FileText,Inbox,Mail,MailOpen,MapPin,Paperclip,PenLine,RefreshCw,Search,Send,Star,Trash2,UploadCloud,X} from 'lucide-react';
import {api} from '@/services/api-client';
import {initials} from '@/utils/format';
import {Empty,ErrorMessage,Loading,Modal,ViewActiveContext} from '@/components/ui';
import type {Share} from '@/types';
import type {CollaborationCategory,CollaborationContact,CoordinationDetail,CoordinationInbox,CoordinationRequest} from './coordination-types';
import {ContactAvatar} from './ContactDirectory';
import {AirportIdentity} from './AirportIdentity';
import {AirportDirectory} from './AirportDirectory';
import {DocumentPicker,RequestDetail} from './CoordinationDetails';
import {collaborationChanged} from './useCollaborationInbox';
import './coordination.css';
import './mail-workspace.css';

const categories={request:'Solicitare',document:'Document',problem:'Problemă'};
const stamp=(value:string)=>new Date(value).toLocaleDateString('ro-RO',{day:'numeric',month:'short'});
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ro');
type Folder='incoming'|'outgoing'|'starred'|'drafts'|'archived'|'all';

export function Coordination({revision,active:tabActive,notify,onOpen,onConnections}:{revision:number;active:boolean;notify:(message:string)=>void;onOpen:(id:string)=>void;onConnections?:(data:CoordinationInbox)=>void;showConnections?:boolean}){
  useLanguage();
  const viewActive=useContext(ViewActiveContext),[visible,setVisible]=useState(!document.hidden),active=viewActive&&tabActive,pollingActive=active&&visible;
  const [data,setData]=useState<CoordinationInbox>(),[selected,setSelected]=useState<string>(),[workspace,setWorkspace]=useState<'mail'|'airports'>('mail');
  const [folder,setFolder]=useState<Folder>('incoming'),[query,setQuery]=useState(''),[onlyUnread,setOnlyUnread]=useState(false),[page,setPage]=useState(0);
  const [loadError,setLoadError]=useState(''),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[pendingRow,setPendingRow]=useState<string>();
  const [savingStars,setSavingStars]=useState<Set<string>>(()=>new Set());
  const starRevision=useRef(0),starChanges=useRef(new Map<string,{value:boolean;revision:number;pending:boolean}>());
  const [creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[subject,setSubject]=useState(''),[body,setBody]=useState('');
  const [recipient,setRecipient]=useState(''),[contactId,setContactId]=useState(''),[category,setCategory]=useState<CollaborationCategory>('request'),[toQuery,setToQuery]=useState('');
  const [recipientOptions,setRecipientOptions]=useState(false);
  const [uploadFirst,setUploadFirst]=useState(false);
  const [attachment,setAttachment]=useState<Share>(),[picker,setPicker]=useState(false),[draftReady,setDraftReady]=useState(''),[draftSaved,setDraftSaved]=useState(true);
  const target=data?.partners.find(p=>p.id===recipient),contact=target?.contacts?.find(p=>p.id===contactId);
  const createKey=useRef(crypto.randomUUID()),pending=useRef(false),alive=useRef(true),isActive=useRef(active),readEpoch=useRef(0),subjectInput=useRef<HTMLInputElement>(null);
  const draftKey=data?`flyleaf:mail-draft:${data.local_airport.id}:${data.sender.id}`:'';
  const hasDraft=!!(subject||body||contactId||attachment);
  const changed=()=>{readEpoch.current++;setRefresh(v=>v+1);collaborationChanged()};
  const edit=()=>{createKey.current=crypto.randomUUID()};
  useEffect(()=>{if(data)onConnections?.(data)},[data,onConnections]);
  useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed)},[]);
  useEffect(()=>{isActive.current=active;if(!active){setCreating(false);setPicker(false)}},[active]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{
    if(!pollingActive)return;
    const controller=new AbortController();let disposed=false;let timer:ReturnType<typeof setTimeout>;const epoch=++readEpoch.current;
    async function load(){
      const starsAtStart=starRevision.current;
      try{
        const result=await api<CoordinationInbox>('/collaboration',{signal:controller.signal});
        if(!disposed&&epoch===readEpoch.current){
          // A poll started before a local save must not restore the old star.
          const requests=result.requests.map(item=>{
            const change=starChanges.current.get(item.id);
            if(change&&(change.pending||change.revision>starsAtStart))return {...item,starred:change.value};
            if(change)starChanges.current.delete(item.id);
            return item;
          });
          setData({...result,requests});setLoadError('');
        }
      }catch(e){if(!disposed&&epoch===readEpoch.current)setLoadError((e as Error).message)}
      if(!disposed)timer=setTimeout(load,15000);
    }
    void load();return()=>{disposed=true;controller.abort();clearTimeout(timer)};
  },[pollingActive,revision,refresh]);
  useEffect(()=>{
    if(!draftKey)return;
    try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved){setSubject(String(saved.subject||'').slice(0,160));setBody(String(saved.body||'').slice(0,3000));setRecipient(saved.recipient||'');setContactId(saved.contactId||'');setCategory(saved.category in categories?saved.category:'request');setAttachment(saved.attachment||undefined);if(saved.key)createKey.current=saved.key}}catch{setDraftSaved(false)}
    setDraftReady(draftKey);
  },[draftKey]);
  useEffect(()=>{
    if(!draftKey||draftReady!==draftKey)return;
    try{if(hasDraft)localStorage.setItem(draftKey,JSON.stringify({subject,body,recipient,contactId,category,attachment,key:createKey.current}));else localStorage.removeItem(draftKey);setDraftSaved(true)}catch{setDraftSaved(false)}
  },[draftKey,draftReady,subject,body,recipient,contactId,category,attachment,hasDraft]);
  function compose(airport?:string,person?:CollaborationContact){
    if(airport&&(airport!==recipient||(person?.id||'')!==contactId)){if(airport!==recipient)setAttachment(undefined);setRecipient(airport);setContactId(person?.id||'');edit()}
    setToQuery('');setError('');setCreating(true);
  }
  function discard(){setSubject('');setBody('');setRecipient('');setContactId('');setAttachment(undefined);setCategory('request');setCreating(false);edit()}
  async function create(){
    if(pending.current||subject.trim().length<3||!body.trim()||!contact||!target?.sharing_enabled||!data?.can_create||(category==='document'&&!attachment))return;
    pending.current=true;setBusy(true);setError('');
    try{
      const result=await api<CoordinationDetail>('/collaboration',{method:'POST',body:JSON.stringify({subject:subject.trim(),topic:categories[category],category,body:body.trim(),recipient_airport_id:recipient,recipient_user_id:contact.id,share_id:attachment?.id,idempotency_key:createKey.current})});
      if(!alive.current)return;
      discard();changed();if(isActive.current){setWorkspace('mail');setFolder('outgoing');setSelected(result.id);notify(result.pending_delivery?'Mesaj salvat. Livrarea este în așteptare.':'Mesaj trimis.')}
    }catch(e){if(alive.current)setError((e as Error).message)}finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  async function update(item:CoordinationRequest,values:{starred?:boolean;archived?:boolean;read_sequence?:number}){
    if(values.starred!==undefined){
      if(starChanges.current.get(item.id)?.pending)return;
      const previous=!!item.starred;
      const change={value:values.starred,revision:++starRevision.current,pending:true};
      starChanges.current.set(item.id,change);
      const show=(starred:boolean)=>setData(current=>current?{...current,requests:current.requests.map(row=>row.id===item.id?{...row,starred}:row)}:current);
      setSavingStars(current=>new Set(current).add(item.id));setError('');show(change.value);
      try{
        const saved=await api<{starred:boolean}>(`/collaboration/${encodeURIComponent(item.id)}/mailbox`,{method:'PATCH',body:JSON.stringify(values)});
        if(!alive.current)return;
        change.value=saved.starred;change.pending=false;change.revision=++starRevision.current;
        show(saved.starred);
      }catch(e){
        if(!alive.current)return;
        change.value=previous;change.pending=false;change.revision=++starRevision.current;
        show(previous);setError((e as Error).message);
      }finally{
        if(alive.current)setSavingStars(current=>{const next=new Set(current);next.delete(item.id);return next});
      }
      return;
    }
    setPendingRow(item.id);setError('');
    try{await api(`/collaboration/${encodeURIComponent(item.id)}/mailbox`,{method:'PATCH',body:JSON.stringify(values)});changed()}
    catch(e){setError((e as Error).message)}finally{setPendingRow(undefined)}
  }
  function open(item:CoordinationRequest){setSelected(item.id);if(item.unread&&item.last_sequence!==undefined)void update(item,{read_sequence:item.last_sequence})}
  const needle=normalize(query.trim());
  const items=data?.requests.filter(item=>(folder==='all'||folder==='archived'?folder==='all'||item.archived:!item.archived&&(folder==='starred'?item.starred:folder==='incoming'?(item.in_inbox??item.direction==='incoming'):(item.in_sent??item.direction==='outgoing')))&&(!onlyUnread||item.unread)&&normalize(`${item.subject} ${item.last_message} ${item.requester_contact?.name||''} ${item.recipient_contact?.name||''} ${item.partner_name}`).includes(needle))||[];
  const pageItems=items.slice(page*20,(page+1)*20);
  useEffect(()=>setPage(0),[folder,query,onlyUnread]);
  useEffect(()=>{if(page>0&&page*20>=items.length)setPage(0)},[items.length,page]);
  const folders=[{id:'incoming',label:'Primite',icon:Inbox},{id:'starred',label:'Cu stea',icon:Star},{id:'outgoing',label:'Trimise',icon:Send},{id:'drafts',label:'Ciorne',icon:FilePenLine},{id:'archived',label:'Arhivate',icon:Archive},{id:'all',label:'Toate mesajele',icon:Mail}] as const;
  const suggestions=data?.partners.filter(p=>p.sharing_enabled&&(!recipient||p.id===recipient)).flatMap(airport=>airport.contacts.map(person=>({airport,person}))).filter(({airport,person})=>normalize(`${airport.name} ${person.name} ${person.email} ${person.job_title}`).includes(normalize(toQuery)))||[];
  return <section className="coord-workspace mail-workspace" aria-label={t("Mesagerie între aeroporturi")}>
    {loadError&&<ErrorMessage message={loadError} retry={changed}/>}{!data&&!loadError&&<Loading/>}
    {data&&<>
      <div className="collaboration-topbar"><div className="collaboration-workspace-tabs" role="group" aria-label={t("Spații de colaborare")}><button aria-pressed={workspace==='mail'} onClick={()=>setWorkspace('mail')}><Mail size={18}/>{t("Mesaje")}</button><button aria-pressed={workspace==='airports'} onClick={()=>setWorkspace('airports')}><MapPin size={18}/>{t("Aeroporturi")}</button></div><AirportIdentity data={data} onChanged={changed}/></div>
      {!data.participation.enabled&&<div className="collaboration-inactive"><span>{t("Colaborarea aeroportului tău este dezactivată.")}</span><span>{t("Directorul o poate activa din profilul aeroportului.")}</span></div>}
      {workspace==='airports'?<AirportDirectory enabled={data.participation.enabled} revision={refresh+revision} onCompose={compose}/>:<div className="collab-mail-layout">
        <aside className="collab-mail-nav" aria-label={t("Dosare de mesaje")}><button className="collab-compose-button" disabled={!data.can_create||!!loadError} onClick={()=>compose()}><PenLine size={22}/>{t("Mesaj nou")}</button>
          {folders.map(({id,label,icon:Icon})=><button key={id} className="collab-folder" aria-pressed={folder===id} onClick={()=>{setFolder(id);setSelected(undefined)}}><Icon size={18}/><span>{t(label)}</span>{id==='incoming'&&<small>{data.requests.filter(r=>r.unread&&!r.archived).length||''}</small>}{id==='drafts'&&hasDraft&&<small>1</small>}</button>)}
          <div className="mail-nav-divider"/><button className="collab-folder" onClick={()=>setWorkspace('airports')}><MapPin size={18}/><span>{t("Caută aeroporturi")}</span></button>
          <div className="mail-sender"><ContactAvatar contact={data.sender} airport={data.local_airport.name}/><span><strong><PersonReference userId={data.sender.id} name={data.sender.name}/></strong><small>{data.sender.email}</small></span></div>
        </aside>
        <main className="collab-mail-content">
          {selected?<RequestDetail key={selected} id={selected} active={active} pollingActive={pollingActive} revision={revision} onBack={()=>{setSelected(undefined);changed()}} onChanged={changed} notify={notify} onOpen={onOpen}/>:<>
            <div className="mail-search"><Search size={21}/><input aria-label={t("Caută mesaje")} placeholder={t("Caută în mesaje")} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button" aria-label={t("Șterge căutarea mesajelor")} onClick={()=>setQuery('')}><X size={17}/></button>}</div>
            <div className="mail-toolbar"><h2>{t(folders.find(f=>f.id===folder)?.label||'')}</h2><button className="icon-button" onClick={changed} aria-label={t("Actualizează mesajele")}><RefreshCw size={17}/></button>{folder!=='drafts'&&<button className={`mail-filter ${onlyUnread?'active':''}`} aria-pressed={onlyUnread} onClick={()=>setOnlyUnread(v=>!v)}>{t("Necitite")}</button>}<span className="mail-pagination">{items.length?t("{p0}–{p1} din {p2}", {p0:page*20+1,p1:Math.min((page+1)*20,items.length),p2:items.length}):''}</span>{items.length>20&&<><button className="icon-button" disabled={!page} aria-label={t("Mesajele anterioare")} onClick={()=>setPage(v=>v-1)}><ChevronLeft size={17}/></button><button className="icon-button" disabled={(page+1)*20>=items.length} aria-label={t("Mesajele următoare")} onClick={()=>setPage(v=>v+1)}><ChevronRight size={17}/></button></>}</div>
            {error&&<ErrorMessage message={error}/>}{!data.connected&&<p className="mail-connection-note">{t("Conexiune indisponibilă. Istoricul salvat rămâne accesibil.")}</p>}
            {folder==='drafts'?(hasDraft?<button className="mail-draft-row" onClick={()=>compose()}><FilePenLine size={20}/><span><strong>{subject||t("(Fără subiect)")}</strong><small>{body||t("Continuă redactarea mesajului.")}</small></span><em>{t("Ciornă")}</em></button>:<Empty title={t("Nicio ciornă")} message={t("Mesajele începute se păstrează pe acest dispozitiv.")}/>):!pageItems.length?<Empty title={query?t("Niciun mesaj găsit"):t("Niciun mesaj în această listă")} message={query?t("Încearcă alt nume sau subiect."):t("Conversațiile și documentele primite vor apărea aici.")}/>:<div className="collab-message-list">{pageItems.map(item=>{
              const person=item.direction==='incoming'?item.requester_contact:item.recipient_contact;
              return <article className={`collab-message-row ${item.unread?'unread':''}`} key={item.id}>
                <button className={`mail-star ${item.starred?'starred':''}`} aria-label={item.starred?t("Elimină steaua"):t("Adaugă stea")} aria-pressed={!!item.starred} aria-busy={savingStars.has(item.id)} disabled={pendingRow===item.id||savingStars.has(item.id)} onClick={()=>void update(item,{starred:!item.starred})}><Star size={18} fill={item.starred?'currentColor':'none'}/></button>
                <button className="collab-message-open" onClick={()=>open(item)}><span className="mail-row-sender"><strong>{person?<ContactReference contact={person} airport={item.partner_name} embedded/>:item.partner_name}</strong><small>{item.partner_name.replace('Aeroportul ','')}</small></span><span className="mail-row-copy"><span><strong>{item.subject}</strong>{item.message_count>1&&<b>{item.message_count}</b>}<i>— {item.last_message}</i></span><span className="mail-row-tags"><em>{t(categories[item.category]||t("Solicitare"))}</em>{item.status==='resolved'&&<em className="resolved">{t("Rezolvată")}</em>}{item.has_attachment&&<em><Paperclip size={12}/>{t("Document atașat")}</em>}{item.pending_delivery&&<em>{t("Livrare în așteptare")}</em>}</span></span><time dateTime={item.updated_at}>{stamp(item.updated_at)}</time></button>
                <div className="mail-row-actions"><button className="icon-button" aria-label={item.archived?t("Mută înapoi în mesaje"):t("Arhivează conversația")} disabled={pendingRow===item.id} onClick={()=>void update(item,{archived:!item.archived})}>{item.archived?<ArchiveRestore size={17}/>:<Archive size={17}/>}</button><button className="icon-button" aria-label={item.unread?t("Marchează citită"):t("Marchează necitită")} disabled={pendingRow===item.id} onClick={()=>void update(item,{read_sequence:item.unread?item.last_sequence||0:0})}>{item.unread?<MailOpen size={17}/>:<Mail size={17}/>}</button></div>
              </article>;
            })}</div>}
          </>}
        </main>
      </div>}
    </>}
    {creating&&!picker&&<Modal title={t("Mesaj nou")} className="mail-compose-window" onClose={()=>{if(!busy)setCreating(false)}} initialFocusRef={subjectInput}>
      <form className="coord-create collab-compose" onSubmit={e=>{e.preventDefault();void create()}}>
        {error&&<ErrorMessage message={error}/>}
        <div className="mail-compose-line collab-from"><span>{t("De la")}</span><span><PersonReference userId={data?.sender.id} name={data?.sender.name}/> <small>{t("&lt;")}{data?.sender.email}{t("&gt;")}</small></span></div>
        <label className="mail-compose-line mail-airport-target"><span>{t("Aeroport")}</span><select aria-label={t("Aeroport destinatar")} disabled={busy} value={recipient} onChange={e=>{setRecipient(e.target.value);setContactId('');setAttachment(undefined);setToQuery('');setRecipientOptions(true);edit()}}><option value="">{t("Alege aeroportul sau caută o persoană")}</option>{data?.partners.filter(p=>p.sharing_enabled).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="mail-compose-to"><span>{t("Către")}</span>{contact?<div className="mail-recipient-chip"><ContactAvatar contact={contact} airport={target!.name}/><span><ContactReference contact={contact} airport={target!.name}/><small>{target!.name} · {contact.email}</small></span><button type="button" aria-label={t("Schimbă destinatarul")} disabled={busy} onClick={()=>{setContactId('');setRecipientOptions(true);edit()}}><X size={15}/></button></div>:<div className="mail-to-search"><input aria-label={t("Caută destinatar")} role="combobox" aria-expanded={recipientOptions} aria-controls="mail-recipient-list" autoComplete="off" placeholder={target?t("Alege o persoană de contact"):t("Nume, email sau aeroport")} value={toQuery} disabled={busy} onFocus={()=>setRecipientOptions(true)} onKeyDown={e=>{if(e.key==='Escape'){setRecipientOptions(false);e.stopPropagation()}if(e.key==='ArrowDown'){e.preventDefault();document.querySelector<HTMLButtonElement>('#mail-recipient-list button')?.focus()}}} onChange={e=>{setToQuery(e.target.value);setRecipientOptions(true)}}/>{recipientOptions&&<div className="mail-recipient-options" id="mail-recipient-list" role="listbox" aria-label={t("Destinatari")} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setRecipientOptions(false)}}}>{suggestions.length?suggestions.map(({airport,person})=><button type="button" role="option" aria-selected={false} key={`${airport.id}:${person.id}`} onClick={()=>{if(airport.id!==recipient)setAttachment(undefined);setRecipient(airport.id);setContactId(person.id);setToQuery('');setRecipientOptions(false);edit()}}><span className="avatar mail-recipient-avatar" aria-hidden="true">{initials(person.name)}</span><span className="mail-recipient-info"><strong><ContactReference contact={person} airport={airport.name} embedded/></strong><small>{person.job_title} · {person.email}</small>{!recipient&&<small>{airport.name}</small>}</span></button>):<p>{t("Niciun contact disponibil pentru această selecție.")}</p>}</div>}</div>}</div>
        <label className="mail-compose-line"><span>{t("Subiect")}</span><input ref={subjectInput} required minLength={3} maxLength={160} disabled={busy} value={subject} onChange={e=>{setSubject(e.target.value);edit()}}/></label>
        <div className="mail-compose-category"><label>{t("Tip")}<select aria-label={t("Tipul mesajului")} value={category} disabled={busy} onChange={e=>{setCategory(e.target.value as CollaborationCategory);edit()}}>{Object.entries(categories).map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><small>{draftSaved?t("Ciornă salvată pe acest dispozitiv"):t("Ciorna nu poate fi salvată pe acest dispozitiv")}</small></div>
        <textarea aria-label={t("Mesaj")} required maxLength={3000} rows={8} disabled={busy} value={body} onChange={e=>{setBody(e.target.value);edit()}} placeholder={t("Scrie mesajul…")}/>
        {attachment&&<div className="coord-selected-attachment"><FileText size={21}/><span><strong>{attachment.document_title||attachment.title}</strong><small>{t("PDF · Copie verificată · v")}{attachment.source_version}</small></span><button type="button" className="icon-button" aria-label={t("Elimină atașamentul")} disabled={busy} onClick={()=>{setAttachment(undefined);edit()}}><X size={17}/></button></div>}
        {attachment&&<p className="mail-attachment-scope">{t("Copia păstrează permisiunile acordate aeroportului la partajare.")}</p>}
        {category==='document'&&!attachment&&<p className="mail-attachment-scope">{t("Atașează o copie verificată pentru mesajul de tip Document.")}</p>}
        <div className="mail-compose-footer"><button className="button primary" disabled={busy||subject.trim().length<3||!body.trim()||!contact||!target?.sharing_enabled||!data?.can_create||(category==='document'&&!attachment)}><Send size={16}/>{busy?t("Se trimite…"):t("Trimite mesajul")}</button><button type="button" className="icon-button" title={t("Atașează din bibliotecă")} aria-label={t("Atașează o copie")} disabled={busy||!target?.sharing_enabled} onClick={()=>{setUploadFirst(false);setPicker(true)}}><Paperclip size={20}/></button><button type="button" className="icon-button" title={t("Încarcă PDF de pe dispozitiv")} aria-label={t("Încarcă PDF de pe dispozitiv")} disabled={busy||!target?.sharing_enabled} onClick={()=>{setUploadFirst(true);setPicker(true)}}><UploadCloud size={20}/></button><span/><button type="button" className="text-button" disabled={busy} onClick={()=>setCreating(false)}>{t("Închide")}</button><button type="button" className="icon-button" title={t("Șterge ciorna")} aria-label={t("Șterge ciorna")} disabled={busy} onClick={discard}><Trash2 size={18}/></button></div>
      </form>
    </Modal>}
    {creating&&picker&&<DocumentPicker partnerId={recipient} startUpload={uploadFirst} onClose={()=>setPicker(false)} onSelected={share=>{setAttachment(share);edit();setPicker(false)}} onOpen={onOpen}/>}
  </section>;
}
