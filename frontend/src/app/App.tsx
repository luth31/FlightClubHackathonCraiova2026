import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {House,FolderOpen,Wrench,Building2,UsersRound,Landmark,History,Search,Sparkles,ChevronRight,Menu,LogOut,Plane,BarChart3} from 'lucide-react';
import {pageLabels,useNavigation} from '@/services/navigation';
import {pagePermissions} from '@/services/access';
import {api,setIdentity,clearIdentity,onSessionExpired,isSessionExpired} from '@/services/api-client';
import {Loading,ErrorMessage,Toast,ViewActiveContext,Modal} from '@/components/ui';
import {DashboardPage} from '@/features/dashboard/PersonalHome';
import {DocumentDetail,UploadDialog} from '@/features/documents';
import {DocumentWorkspace} from '@/features/documents/DocumentWorkspace';
import {EquipmentPage} from '@/features/equipment';
import {QuickSearch} from '@/components/QuickSearch';
import {SharingPage} from '@/features/sharing';
import {useCollaborationInbox} from '@/features/sharing/useCollaborationInbox';
import {AuditPage} from '@/features/audit';
import {SuppliersPage} from '@/features/suppliers';
import {SupplierCatalogPage} from '@/features/suppliers/SupplierCatalogPage';
import {PeoplePage} from '@/features/people';
import {PersonAvatar} from '@/components/people/PersonAvatar';
import {PersonDirectoryProvider} from '@/components/people/PersonDirectory';
import {ReportsPage} from '@/features/reports';
import {AssistantPage} from '@/features/assistant/AssistantPage';
import {LoginPage} from '@/features/auth';
import {rememberNfcLink,pendingNfcCard,nfcHash} from '@/features/operations/nfc-links';
import {roleLabel} from '@/utils/format';
import type {Page,Session} from '@/types';
const OperationsPage = lazy(()=>import('@/features/operations').then(module=>({default:module.OperationsPage})));
function RetainedOperations({visible,notify}:{visible:boolean;notify:(message:string)=>void}) {
  const [visited,setVisited]=useState(visible);
  useEffect(()=>{if(visible)setVisited(true)},[visible]);
  if(!visited&&!visible)return null;
  return <div hidden={!visible} inert={!visible}><ViewActiveContext value={visible}>
    <Suspense fallback={<Loading/>}><OperationsPage notify={notify}/></Suspense>
  </ViewActiveContext></div>;
}
const nav=[{id:'home',label:'Acasă',icon:House},{id:'operations',label:'Operațiuni la sol',icon:Plane},{id:'documents',label:'Documente',icon:FolderOpen},{id:'suppliers',label:'Furnizori',icon:Landmark},{id:'equipment',label:'Echipamente',icon:Wrench},{id:'assistant',label:'Întreabă FlyLeaf',icon:Sparkles},{id:'people',label:'Echipă',icon:UsersRound},{id:'reports',label:'Rapoarte',icon:BarChart3}];
const secondNav=[{id:'sharing',label:'Colaborare',icon:Building2},{id:'audit',label:'Jurnal de activitate',icon:History}];
export function App() {
  const [session,setSession]=useState<Session>(), [error,setError]=useState(''),
    [upload,setUpload]=useState(false),
    [search,setSearch]=useState(false), [revision,setRevision]=useState(0),
    [toast,setToast]=useState(''), [mobileOpen,setMobileOpen]=useState(false),
    [loggingOut,setLoggingOut]=useState(false), [logoutError,setLogoutError]=useState(''),
    [confirmingLogout,setConfirmingLogout]=useState(false);
  const logoutPending = useRef(false);
  const cancelLogoutRef = useRef<HTMLButtonElement>(null);
  const sessionEpoch = useRef(0);
  const allowedPages = pagePermissions(session?.current_user);
  const collaborationInbox = useCollaborationInbox(!!session?.current_user && allowedPages.sharing, session?.current_user?.id);
  const labels = pageLabels;
  const {page,doc,workspaceHash,documentView,query,filter,renewalId,equipmentId,assistantDocumentId,navigate:goToPage,openDocument,returnToOrigin} = useNavigation(session?.current_user?.id,allowedPages);
  const mainRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<{element: HTMLElement; page: Page; userId: string} | undefined>(undefined);
  const userId = session?.current_user?.id;
  useEffect(()=>{
    const searchShortcut=(event:KeyboardEvent)=>{
      if(userId&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();setSearch(true);
      }
    };
    window.addEventListener('keydown',searchShortcut);
    return()=>window.removeEventListener('keydown',searchShortcut);
  },[userId]);
  useEffect(()=>{
    if(doc){mainRef.current?.querySelector<HTMLElement>('.back-button')?.focus({preventScroll:true});return}
    const previous = returnFocus.current;
    if(previous?.page===page&&previous.userId===userId&&previous.element.isConnected&&!previous.element.closest('[hidden],[inert]'))
      previous.element.focus({preventScroll:true});
    else mainRef.current?.focus({preventScroll:true});
  },[doc,page,userId]);
  const refresh=()=>{
    const epoch=sessionEpoch.current;
    return api<Session>('/session').then(s=>{
      if(epoch!==sessionEpoch.current)return;
      setSession(s);
      if(s.current_user)setIdentity(s.current_user.id);
      setError('');
    }).catch(e=>{if(epoch===sessionEpoch.current)setError(e.message)});
  };
  useEffect(()=>onSessionExpired(()=>{
    sessionEpoch.current++;
    returnFocus.current=undefined;
    setError('');setToast('');setUpload(false);setSearch(false);
    setMobileOpen(false);setLogoutError('');setConfirmingLogout(false);
    setSession(current=>current?{...current,current_user:null,users:[]}:current);
  }),[]);
  useEffect(()=>{rememberNfcLink();window.addEventListener('hashchange',rememberNfcLink);return()=>window.removeEventListener('hashchange',rememberNfcLink)},[]);
  useEffect(()=>{
    if(!userId||!allowedPages.people||window.location.hash&&window.location.hash!=='#')return;
    const card=pendingNfcCard();
    if(card)window.location.hash=nfcHash(card);
  },[userId,allowedPages.people]);
  useEffect(()=>{refresh()},[]);
  useEffect(()=>{
    setMobileOpen(false);
    setUpload(false);
    setSearch(false);
  },[page,doc]);
  useEffect(()=>{
    if(!toast)return;
    const t=setTimeout(()=>setToast(''),4200);
    return()=>clearTimeout(t);
  },[toast]);
  const notify=useCallback((s:string)=>{if(!isSessionExpired())setToast(s)},[]);
  const closeUpload=useCallback(()=>setUpload(false),[]),closeSearch=useCallback(()=>setSearch(false),[]);
  const navigate=(p:Page,f='')=>{goToPage(p,f?'?filter='+encodeURIComponent(f):'');setMobileOpen(false);setUpload(false);setSearch(false)};
  const openDoc=(id:string)=>{
    const element=document.activeElement;
    if(!doc){
      returnFocus.current=userId&&element instanceof HTMLElement&&mainRef.current?.contains(element)
        ? {element,page,userId} : undefined;
    }
    openDocument(id);setMobileOpen(false);setUpload(false);setSearch(false);
  };
  async function logout(){
    if(logoutPending.current)return;
    logoutPending.current=true;
    setLoggingOut(true);
    setLogoutError('');
    try{
      const result=await api<{redirect_url?:string|null}>('/auth/logout',{method:'POST'});
      // Ignore session requests started before this successful logout.
      sessionEpoch.current++;
      clearIdentity();
      returnFocus.current=undefined;
      setError('');
      setToast('');
      setConfirmingLogout(false);
      navigate('home');
      setSession(current=>current?{...current,current_user:null,users:[]}:current);
      if(result.redirect_url)location.assign(result.redirect_url);
    }catch(e){setLogoutError((e as Error).message)}finally{
      logoutPending.current=false;
      setLoggingOut(false);
    }
  }
  function requestLogout(){
    if(logoutPending.current)return;
    setLogoutError('');
    setConfirmingLogout(true);
  }
  function cancelLogout(){
    if(logoutPending.current)return;
    setConfirmingLogout(false);
    setLogoutError('');
  }
  const changed=()=>setRevision(v=>v+1);
  if(error)return <div className="app-load-error"><ErrorMessage message={error} retry={refresh}/></div>;
  if(!session)return <Loading/>;
  if(!session.current_user)return <LoginPage session={session} onLogin={s=>{setSession(s);setRevision(v=>v+1)}}/>;
  const user=session.current_user,airport=typeof session.airport==='string'?session.airport:session.airport?.name||'Aeroportul Craiova';
  return <PersonDirectoryProvider key={`${user.airport_id || ''}:${user.id}`} revision={revision} account={{userId:user.id,signOut:requestLogout,signingOut:loggingOut,signOutError:logoutError}}><div className="app-shell workspace-shell">
    {mobileOpen&&<div className="sidebar-overlay" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen?'open':''}`}>
      <a href="#home" className="brand" onClick={event=>{
        if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        event.preventDefault();navigate('home');
      }}>
        <span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25 16 5l11 20h-7l-4-8-4 8z" fill="currentColor"/><path d="M8 21h18" stroke="#91b6a3" strokeWidth="2"/></svg></span>
        FlyLeaf<span className="brand-period">.</span>
      </a>
      <div className="airport-switch"><span className="airport-symbol"><Plane size={18}/></span><div><strong>{airport}</strong></div></div>
      <div className="nav-label">SPAȚIU DE LUCRU</div>
      <nav aria-label="Navigare principală">
        {nav.filter(n=>allowedPages[n.id as Page]).map(n=><button key={n.id} className={page===n.id?'active':''} onClick={()=>navigate(n.id as Page)} aria-current={page===n.id?'page':undefined}>
          <n.icon size={19}/><span>{labels[n.id as Page]}</span>{page===n.id&&<span className="active-dot"/>}
        </button>)}
      </nav>
      {secondNav.some(n=>allowedPages[n.id as Page])&&<div className="nav-label second-label">COLABORARE</div>}
      <nav aria-label="Colaborare și istoric">
        {secondNav.filter(n=>allowedPages[n.id as Page]).map(n=><button key={n.id} className={page===n.id?'active':''} onClick={()=>navigate(n.id as Page)} aria-current={page===n.id?'page':undefined}>
          <n.icon size={18}/><span>{n.label}</span>{n.id==='sharing'&&collaborationInbox.pendingCount>0&&<span className="collaboration-nav-count" aria-label={collaborationInbox.pendingCount===1?'1 cerere primită deschisă':`${collaborationInbox.pendingCount} cereri primite deschise`}>{collaborationInbox.pendingCount}</span>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="user-switcher">
          <PersonAvatar userId={user.id} name={user.name} accountRole={roleLabel[user.role]||user.role} className="user-button user-menu-trigger" disabled={loggingOut} openOnFocus={false}/>
        </div>
        <button className="logout-button sidebar-logout" disabled={loggingOut} onClick={requestLogout} aria-busy={loggingOut}>
          <LogOut size={16}/>{loggingOut?'Se deconectează…':'Ieși din cont'}
        </button>
      </div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div className="breadcrumb">
          <button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Deschide meniul"><Menu size={21}/></button>

          {doc?<><button className="breadcrumb-parent" onClick={returnToOrigin}>{labels[page]}</button><ChevronRight size={13}/><strong>Document</strong></>:<strong>{labels[page]}</strong>}
        </div>
        <div className="topbar-actions">
          <button className="quick-search" onClick={()=>setSearch(true)} aria-label="Caută un document"><Search size={17}/><span>Caută un document</span></button><span className="topbar-divider"/>
          <PersonAvatar userId={user.id} name={user.name} className="avatar top-avatar" openOnFocus={false}/>
        </div>
      </header>
      <main className="main-content" key={user.id} ref={mainRef} tabIndex={-1}>
        {/* Keep the originating list mounted so filters, tabs and pagination survive a document visit. */}
        <div className="workspace-view" hidden={!!doc} inert={!!doc}>
          <ViewActiveContext value={!doc}>
          {page==='home'&&<DashboardPage name={user.name} onOpen={openDoc} onNavigate={navigate} onUpload={()=>setUpload(true)} revision={revision}/>}
          {page==='documents'&&<DocumentWorkspace workspaceHash={workspaceHash} view={documentView || 'list'} initialQuery={query || ''} initialFilter={filter || ''} renewalId={renewalId} onView={view=>goToPage('documents','/'+view)} onOpen={openDoc} onUpload={()=>setUpload(true)} notify={notify} revision={revision} user={user} onChanged={changed}/>}
          {page==='equipment'&&<EquipmentPage assetId={equipmentId} workspaceHash={workspaceHash} onOpen={openDoc} notify={notify} onChanged={changed}/>}
          {page==='assistant'&&<AssistantPage key={assistantDocumentId || 'all'} documentId={assistantDocumentId} onOpen={openDoc}/>}

          {page==='sharing'&&<SharingPage revision={revision} onOpen={openDoc} notify={notify}/>}
          {page==='suppliers'&&(user.roles.some(role=>['director','finance'].includes(role))
            ? <SuppliersPage revision={revision} notify={notify} onOpen={openDoc} user={user}/>
            : <SupplierCatalogPage revision={revision} onOpen={openDoc}/>)}
          {page==='people'&&<PeoplePage revision={revision} notify={notify}/>}
          {page==='reports'&&<ReportsPage user={user} revision={revision} onOpen={openDoc} onNavigate={navigate} notify={notify}/>}
          {page==='audit'&&<AuditPage revision={revision} onOpen={openDoc}/>}
          </ViewActiveContext>
        </div>
        {/* Retain tiles in this session; hidden operations stop polling and rendering. */}
        <RetainedOperations visible={page==='operations'&&!doc} notify={notify}/>
        {doc&&<DocumentDetail key={doc} id={doc} origin={page} onOpen={openDoc} onClose={returnToOrigin} onChanged={changed} notify={notify} user={user}/>}
      </main>

    </div>
    {upload&&<UploadDialog user={user} onClose={closeUpload} onCreated={d=>{setUpload(false);changed();notify('Documentul a fost înregistrat. Verifică informațiile extrase.');openDoc(d.id)}}/>}
    {search&&<QuickSearch onClose={closeSearch} onOpen={openDoc} onAll={q=>{setSearch(false);goToPage('documents','/list?q='+encodeURIComponent(q))}}/>}
    {confirmingLogout&&<Modal title="Vrei să ieși din cont?" onClose={cancelLogout} initialFocusRef={cancelLogoutRef} className="logout-confirmation">
      <div className="modal-body">
        <p>Sesiunea ta FlyLeaf se va încheia. Te poți conecta din nou oricând.</p>
        {logoutError&&<ErrorMessage message={logoutError}/>}
        <div className="modal-footer">
          <button type="button" className="button secondary" ref={cancelLogoutRef} disabled={loggingOut} onClick={cancelLogout}>Rămâi conectat</button>
          <button type="button" className="button primary" disabled={loggingOut} onClick={()=>void logout()} aria-busy={loggingOut}><LogOut size={16}/>{loggingOut?'Se deconectează…':'Ieși din cont'}</button>
        </div>
      </div>
    </Modal>}
    {toast&&<Toast message={toast}/>}
  </div></PersonDirectoryProvider>;
}
