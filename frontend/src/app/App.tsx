import {useCallback,useEffect,useRef,useState} from 'react';
import {House,FolderOpen,Files,ClipboardCheck,Building2,UsersRound,Landmark,History,Search,Sparkles,ChevronDown,ChevronRight,Menu,LogOut,ShieldCheck,Plane} from 'lucide-react';
import {pageLabels,useNavigation} from '@/services/navigation';
import {api,setIdentity} from '@/services/api-client';
import {Loading,ErrorMessage,Toast,ViewActiveContext} from '@/components/ui';
import {DashboardPage} from '@/features/dashboard';
import {DocumentLibrary,DocumentDetail,UploadDialog} from '@/features/documents';
import {ContractsPage} from '@/features/contracts';
import {ApprovalsPage} from '@/features/approvals';
import {SharingPage} from '@/features/sharing';
import {AuditPage} from '@/features/audit';
import {SuppliersPage} from '@/features/suppliers';
import {PeoplePage} from '@/features/people';
import {AssistantDialog} from '@/features/assistant';
import {LoginPage} from '@/features/auth';
import {initials,roleLabel} from '@/utils/format';
import type {Page,Session} from '@/types';
const nav=[{id:'home',label:'Acasă',icon:House},{id:'documents',label:'Documente',icon:FolderOpen},{id:'contracts',label:'Contracte',icon:Files},{id:'suppliers',label:'Furnizori',icon:Landmark},{id:'approvals',label:'Aprobări',icon:ClipboardCheck},{id:'people',label:'Echipă',icon:UsersRound}];
const secondNav=[{id:'sharing',label:'Partajate cu aeroporturi',icon:Building2},{id:'audit',label:'Jurnal de activitate',icon:History}];
export function App() {
  const [session,setSession]=useState<Session>(), [error,setError]=useState(''),
    [filter,setFilter]=useState(''), [upload,setUpload]=useState(false),
    [assistant,setAssistant]=useState(false), [revision,setRevision]=useState(0),
    [toast,setToast]=useState(''), [mobileOpen,setMobileOpen]=useState(false),
    [userMenu,setUserMenu]=useState(false), [switching,setSwitching]=useState(false);
  const canViewSuppliers = !session?.current_user || session.current_user.roles.some(r=>['director','finance'].includes(r));
  const {page,doc,navigate:goToPage,openDocument,returnToOrigin} = useNavigation(session?.current_user?.id,canViewSuppliers);
  const mainRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<{element: HTMLElement; page: Page; userId: string} | undefined>(undefined);
  const userId = session?.current_user?.id;
  useEffect(()=>{
    if(doc){mainRef.current?.querySelector<HTMLElement>('.back-button')?.focus({preventScroll:true});return}
    const previous = returnFocus.current;
    if(previous?.page===page&&previous.userId===userId&&previous.element.isConnected&&!previous.element.closest('[hidden],[inert]'))
      previous.element.focus({preventScroll:true});
    else mainRef.current?.focus({preventScroll:true});
  },[doc,page,userId]);
  const refresh=()=>api<Session>('/session').then(s=>{
    setSession(s);
    if(s.current_user)setIdentity(s.current_user.id);
    setError('');
  }).catch(e=>setError(e.message));
  useEffect(()=>{refresh()},[]);
  useEffect(()=>{
    setMobileOpen(false);
    setUserMenu(false);
    setUpload(false);
    setAssistant(false);
  },[page,doc]);
  useEffect(()=>{
    if(!toast)return;
    const t=setTimeout(()=>setToast(''),4200);
    return()=>clearTimeout(t);
  },[toast]);
  const notify=useCallback((s:string)=>setToast(s),[]);
  const closeUpload=useCallback(()=>setUpload(false),[]),closeAssistant=useCallback(()=>setAssistant(false),[]);
  const navigate=(p:Page,f='')=>{setFilter(f);goToPage(p);setMobileOpen(false);setUserMenu(false);setUpload(false);setAssistant(false)};
  const openDoc=(id:string)=>{
    const element=document.activeElement;
    if(!doc&&userId&&element instanceof HTMLElement&&mainRef.current?.contains(element))returnFocus.current={element,page,userId};
    openDocument(id);setMobileOpen(false);setUserMenu(false);setUpload(false);setAssistant(false);
  };
  async function changeUser(id:string){
    setSwitching(true);
    try{
      await api('/auth/login',{method:'POST',body:JSON.stringify({user_id:id,password:'AeroDesk2026!'})});
      setIdentity(id);
      await refresh();
      setRevision(v=>v+1);
      navigate('home');
      notify('Contul de demonstrație a fost schimbat.');
    }catch(e){notify((e as Error).message)}finally{setSwitching(false)}
  }
  const changed=()=>setRevision(v=>v+1);
  if(error)return <div className="app-load-error"><ErrorMessage message={error} retry={refresh}/></div>;
  if(!session)return <Loading/>;
  if(!session.current_user)return <LoginPage session={session} onLogin={s=>{setSession(s);setRevision(v=>v+1)}}/>;
  const user=session.current_user,airport=typeof session.airport==='string'?session.airport:session.airport?.name||'Aeroportul Dunărea';
  return <div className="app-shell">
    {mobileOpen&&<div className="sidebar-overlay" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen?'open':''}`}>
      <a href="#home" className="brand" onClick={event=>{
        if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        event.preventDefault();navigate('home');
      }}>
        <span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25 16 5l11 20h-7l-4-8-4 8z" fill="currentColor"/><path d="M8 21h18" stroke="#91b6a3" strokeWidth="2"/></svg></span>
        AeroDesk<span className="brand-period">.</span>
      </a>
      <div className="airport-switch"><span className="airport-symbol"><Plane size={18}/></span><div><strong>{airport}</strong><small>Spațiu de lucru</small></div><ShieldCheck size={15}/></div>
      <div className="nav-label">SPAȚIUL MEU</div>
      <nav aria-label="Navigare principală">
        {nav.filter(n=>n.id!=='suppliers'||canViewSuppliers).map(n=><button key={n.id} className={page===n.id?'active':''} onClick={()=>navigate(n.id as Page)} aria-current={page===n.id?'page':undefined}>
          <n.icon size={19}/><span>{n.label}</span>{page===n.id&&<span className="active-dot"/>}
        </button>)}
      </nav>
      <div className="nav-label second-label">ÎMPREUNĂ</div>
      <nav aria-label="Colaborare și istoric">
        {secondNav.map(n=><button key={n.id} className={page===n.id?'active':''} onClick={()=>navigate(n.id as Page)} aria-current={page===n.id?'page':undefined}>
          <n.icon size={18}/><span>{n.label}</span>
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="demo-label"><span/>Mediu demonstrativ</div><p>Date fictive pentru demonstrație</p>
        <div className="user-switcher">
          <button className="user-button" onClick={()=>setUserMenu(!userMenu)} aria-expanded={userMenu}><span className="avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>{roleLabel[user.role]||user.role}</small></span><ChevronDown size={15}/></button>
          {userMenu&&<div className="user-menu">
            <div className="user-menu-heading">{session.auth?.mode==='oidc'?'Contul tău':'Schimbă contul demo'}</div>
            {session.auth?.mode!=='oidc'&&session.users.map(u=><button disabled={switching} key={u.id} onClick={()=>changeUser(u.id)}><span className="avatar small">{initials(u.name)}</span><span>{u.name}<small>{roleLabel[u.role]||u.role}</small></span>{u.id===user.id&&<span className="active-dot"/>}</button>)}
            <button className="logout-button" onClick={async()=>{
              const result=await api<{redirect_url?:string}>('/auth/logout',{method:'POST'});setUserMenu(false);
              if(result.redirect_url){location.assign(result.redirect_url);return}
              await refresh();
            }}><LogOut size={16}/>Ieși din cont</button>
          </div>}
        </div>
      </div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div className="breadcrumb">
          <button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Deschide meniul"><Menu size={21}/></button>
          <span>Spațiul de lucru</span><ChevronRight size={13}/>
          {doc?<><button className="breadcrumb-parent" onClick={returnToOrigin}>{pageLabels[page]}</button><ChevronRight size={13}/><strong>Document</strong></>:<strong>{pageLabels[page]}</strong>}
        </div>
        <div className="topbar-actions">
          <button className="quick-search" onClick={()=>navigate('documents')} aria-label="Caută un document"><Search size={17}/><span>Caută un document</span></button><span className="topbar-divider"/>
          <button className="assistant-trigger" onClick={()=>setAssistant(true)}><Sparkles size={16}/>Întreabă AeroDesk</button><span className="avatar top-avatar">{initials(user.name)}</span>
        </div>
      </header>
      <div className="mobile-demo-banner"><span/>Date fictive pentru demonstrație</div>
      <main className="main-content" key={user.id} ref={mainRef} tabIndex={-1}>
        {/* Keep the originating list mounted so filters, tabs and pagination survive a document visit. */}
        <div className="workspace-view" hidden={!!doc} inert={!!doc}>
          <ViewActiveContext value={!doc}>
          {page==='home'&&<DashboardPage name={user.name} referenceDate={session.reference_date} onOpen={openDoc} onNavigate={navigate} onUpload={()=>setUpload(true)} revision={revision}/>}
          {page==='documents'&&<DocumentLibrary onOpen={openDoc} onUpload={()=>setUpload(true)} notify={notify} initialFilter={filter} revision={revision}/>}
          {page==='contracts'&&<ContractsPage initialFilter={filter} onOpen={openDoc} revision={revision} notify={notify}/>}
          {page==='approvals'&&<ApprovalsPage onOpen={openDoc} revision={revision} notify={notify}/>}
          {page==='sharing'&&<SharingPage revision={revision} onOpen={openDoc} notify={notify}/>}
          {page==='suppliers'&&<SuppliersPage revision={revision} notify={notify} onOpen={openDoc} user={user}/>}
          {page==='people'&&<PeoplePage revision={revision} notify={notify}/>}
          {page==='audit'&&<AuditPage revision={revision} onOpen={openDoc}/>}
          </ViewActiveContext>
        </div>
        {doc&&<DocumentDetail key={doc} id={doc} origin={page} onOpen={openDoc} onClose={returnToOrigin} onChanged={changed} notify={notify} user={user}/>}
      </main>
      <footer className="workspace-footer"><span>AeroDesk <span>·</span> Mai multă ordine. Mai mult timp pentru echipă.</span><span><span className="connection-dot"/>Spațiu local de demonstrație</span></footer>
    </div>
    {upload&&<UploadDialog user={user} onClose={closeUpload} onCreated={d=>{setUpload(false);changed();notify('Documentul a fost înregistrat. Verifică informațiile extrase.');openDoc(d.id)}}/>}
    {assistant&&<AssistantDialog onClose={closeAssistant} onOpen={openDoc}/>}
    {toast&&<Toast message={toast}/>}
  </div>;
}
