import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowRight, CalendarDays, Check, CreditCard, Ellipsis, FileText, Plus, Search, ShieldCheck, UserRound, UserRoundPlus, Users, X} from 'lucide-react';
import {api} from '@/services/api-client';
import {documentHref} from '@/services/navigation';
import {Empty, ErrorMessage, Loading, Modal, Status} from '@/components/ui';
import {date} from '@/utils/format';
import {PersonAvatar, PersonStatus} from '@/components/people/PersonAvatar';
import {usePersonDirectory} from '@/components/people/PersonDirectory';
import {DepartmentFilter} from './DepartmentFilter';
import {Attendance} from './Attendance';
import {clearNfcLink,nfcHash} from '@/features/operations/nfc-links';
import './people.css';
import {EmployeeDialog} from './EmployeeDialog';
import {AuthorityDialog} from './AuthorityDialog';
import {AppointmentPanel} from './AppointmentPanel';
import {OrganizationChart} from './OrganizationChart';
import type {Person, Directory, Leave} from './types';

function tabFromHash(){const params=new URLSearchParams(window.location.hash.split('?')[1]||'');return params.get('tab')==='attendance'||params.get('view')==='station'?'attendance':params.get('tab')==='leave'?'leave':'directory'}

type Dialog = 'leave'|'delegation'|'employee'|null;

export function PeoplePage({revision,notify}:{revision:number;notify:(message:string)=>void}) {
  const {refresh:refreshProfiles}=usePersonDirectory();
  const [data,setData]=useState<Directory>();
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [tab,setTab]=useState(tabFromHash);
  const [query,setQuery]=useState('');
  const searchInput=useRef<HTMLInputElement>(null);
  const [department,setDepartment]=useState('');
  const [dialog,setDialog]=useState<Dialog>(null);
  const [decision,setDecision]=useState<Leave>();
  const [account,setAccount]=useState<Person>();
  const [authority,setAuthority]=useState<{person:Person;signing:boolean}>();
  const [comment,setComment]=useState('');
  const [busy,setBusy]=useState(false);
  const [formError,setFormError]=useState('');
  useEffect(()=>{let live=true;api<Directory>('/people').then(v=>{if(live){setData(v);setError('')}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[revision,refresh]);
  useEffect(()=>{const route=()=>{if(window.location.hash.startsWith('#people')||window.location.hash.startsWith('#operations?view=station'))setTab(tabFromHash())};window.addEventListener('hashchange',route);return()=>window.removeEventListener('hashchange',route)},[]);
  const reload=(message:string)=>{refreshProfiles();notify(message);setRefresh(v=>v+1);setDialog(null);setDecision(undefined);setAccount(undefined);setFormError('');setBusy(false)};
  async function mutate(path:string,body:unknown,message:string,method='POST') {
    setBusy(true);setFormError('');
    try{await api(path,{method,body:JSON.stringify(body)});if(path==='/people/leave')setTab('leave');reload(message)}catch(e){setFormError((e as Error).message);setBusy(false)}
  }
  if(error&&!data)return <ErrorMessage message={error} retry={()=>setRefresh(v=>v+1)}/>;
  if(!data)return <Loading/>;
  if(tab==='attendance')return data.can_record_attendance?<Attendance onBack={()=>{clearNfcLink();setTab('directory');window.location.hash='#people'}}/>:<div><button className="text-button" onClick={()=>{clearNfcLink();setTab('directory');window.location.hash='#people'}}>Înapoi la echipă</button><ErrorMessage message="Pontajul este disponibil echipei operaționale și directorului."/></div>;
  const selectedData=data;
  const people=data.items.filter(p=>(!department||p.department===department)&&`${p.name} ${p.job_title}`.toLocaleLowerCase('ro').includes(query.toLocaleLowerCase('ro')));
  const reviewers=data.items.filter(p=>p.active&&(p.is_department_head||p.roles?.some(r=>['reviewer','director'].includes(r))));
  const departmentIds=new Set(data.department_records?.map(department=>department.id));
  const canProposeHead=(person:Person)=>data.can_propose_heads&&person.active&&!person.is_department_head&&
    person.can_propose_head!==false&&departmentIds.has(person.department_id||'');
  const managementChanged=(message:string)=>{refreshProfiles();notify(message);setRefresh(v=>v+1)};
  const pending=data.leaves.filter(l=>l.status==='pending');
  function submitLeave(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);void mutate('/people/leave',Object.fromEntries(f),'Cererea a fost trimisă și documentul PDF a fost generat.');}
  function submitDelegation(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);void mutate('/people/delegations',Object.fromEntries(f),'Delegarea a fost înregistrată.');}
  return <>
    <div className="page-heading"><div><h1>Echipa ta</h1></div><div className="people-heading-actions"><button className="button secondary" onClick={()=>{setDialog('leave');setFormError('')}}><CalendarDays size={17}/>Cerere de concediu</button>{data.can_manage_delegations&&<button className="button secondary" onClick={()=>{setDialog('delegation');setFormError('')}}><Plus size={17}/>Delegare</button>}{data.can_create_users&&<button className="button primary" onClick={()=>setDialog('employee')}><Plus size={17}/>Adaugă angajat</button>}{data.can_record_attendance&&<details className="people-more-actions" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))event.currentTarget.open=false}} onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}><summary aria-label="Mai multe opțiuni" title="Mai multe opțiuni"><Ellipsis size={20}/></summary><div><button onClick={()=>{setTab('attendance');window.location.hash=nfcHash()}}><CreditCard size={17}/>Pontaj NFC</button></div></details>}</div></div>
    <div className="people-overview"><div><Users size={20}/><span><strong>{data.items.filter(p=>p.active).length}</strong> colegi activi</span></div><div><CalendarDays size={20}/><span><strong>{data.items.filter(p=>p.availability==='away').length}</strong> în concediu</span></div><div><ShieldCheck size={20}/><span><strong>{data.delegations.filter(d=>d.status==='active').length}</strong> delegări active</span></div></div>
    <div className="people-tabs" role="tablist" aria-label="Informații echipă">{[['directory','Colegi'],['organization','Organigramă'],['delegations','Delegări'],['leave','Concedii'],...(data.can_view_appointments?[['appointments','Numiri']]:[])].map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>setTab(key)}>{label}{key==='leave'&&pending.length>0&&<span>{pending.length}</span>}</button>)}</div>
    {error&&<ErrorMessage message={error}/>}
    {tab==='organization'&&<OrganizationChart directory={data}/>}
    {tab==='directory'&&<div className="panel"><div className="people-directory-toolbar"><div className="search-input people-search"><Search size={18} aria-hidden="true"/><input ref={searchInput} aria-label="Caută un coleg" placeholder="Caută un coleg…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" className="people-search-clear" aria-label="Șterge căutarea" title="Șterge căutarea" onClick={()=>{setQuery('');searchInput.current?.focus()}}><X size={16} aria-hidden="true"/></button>}</div><DepartmentFilter departments={data.departments} value={department} onChange={setDepartment}/></div><div className="people-results" role="status">{people.length} {people.length===1?'persoană':'persoane'}{department&&` · ${department}`}</div><div className="people-grid">{people.map(p=><article className="person-card" key={p.id}>
      <div className="person-card-top"><PersonAvatar name={p.name} person={p} referenceDate={data.reference_date} className="person-avatar"/><div className="person-identity"><h2>{p.name}</h2><p className="person-job">{p.job_title}</p></div></div>
      <div className="person-card-labels"><PersonStatus person={p}/></div><span className="person-department">{p.department}</span>
      <div className="person-authority">{p.is_department_head&&<span>Șef de departament</span>}{data.can_view_appointments&&p.head_appointment&&<span>{p.head_appointment.status==='approved'?`Numire aprobată · din ${date(p.head_appointment.effective_date)}`:'Numire în aprobare'}</span>}{p.roles?.includes('signer')&&<span>Semnatar autorizat</span>}{p.provisioning_status==='failed'&&<span>Activare de reîncercat</span>}{p.identity_sync_pending&&<span>Sincronizare în așteptare</span>}</div>
      <div className="person-details"><a href={`mailto:${p.email}`}>{p.email}</a>{p.manager_name&&<span><UserRound size={14}/>Coordonator: {p.manager_name}</span>}</div>
      {(data.can_manage_accounts&&p.id!==data.current_user_id||canProposeHead(p)||data.can_manage_signing&&p.active&&p.id!==data.current_user_id)&&<details className="person-management-disclosure"><summary>Administrare</summary><div className="person-management-actions">
        {data.can_manage_accounts&&p.id!==data.current_user_id&&<button className="person-action person-action-manage" onClick={()=>setAccount(p)}><span>Gestionează angajatul</span><ArrowRight size={16} aria-hidden="true"/></button>}
        {data.can_propose_heads&&p.active&&p.id!==data.current_user_id&&!departmentIds.has(p.department_id||'')&&<small className="quiet-note">Atribuie un departament funcțional în „Gestionează angajatul” înainte de a propune numirea ca șef.</small>}
        {(canProposeHead(p)||(data.can_manage_signing&&p.active&&p.id!==data.current_user_id))&&<div className="person-authority-actions">
          {canProposeHead(p)&&<button className="person-action" onClick={()=>setAuthority({person:p,signing:false})}><UserRoundPlus size={16} aria-hidden="true"/><span>Propune șef</span></button>}
          {data.can_manage_signing&&p.active&&p.id!==data.current_user_id&&<button className="person-action" onClick={()=>setAuthority({person:p,signing:true})}><ShieldCheck size={16} aria-hidden="true"/><span>Autoritate de semnare</span></button>}
        </div>}
      </div></details>}
    </article>)}</div>{!people.length&&<Empty title="Niciun coleg găsit"/>}</div>}
    {tab==='appointments'&&data.can_view_appointments&&<AppointmentPanel revision={revision+refresh} notify={notify} onChanged={()=>{refreshProfiles();setRefresh(v=>v+1)}}/>}
    {tab==='delegations'&&<div className="panel"><div className="people-panel-intro"><ShieldCheck size={22}/><p>Delegatul aprobă în nume propriu, în perioada stabilită. Dreptul de semnătură rămâne personal.</p></div>{data.delegations.length?<div className="delegation-list">{data.delegations.map(d=><article className="delegation-card" key={d.id}><div><div className="delegation-people"><strong>{d.from_name}</strong><ArrowRight size={17}/><strong>{d.to_name}</strong></div><p>{d.scope}</p><small>{date(d.starts_at)} – {date(d.ends_at)} · {d.reason}</small></div><div className="delegation-actions"><Status value={d.status}/>{d.active&&(d.from_user===data.current_user_id||data.can_admin_delegations)&&<button className="text-button" disabled={busy} onClick={()=>void mutate(`/people/delegations/${d.id}/revoke`,{},'Delegarea a fost revocată.')}>Revocă</button>}</div></article>)}</div>:<Empty title="Nicio delegare" message="Înainte de o absență, numește un coleg pentru aprobările tale."/>}{formError&&!dialog&&<ErrorMessage message={formError}/>}</div>}
    {tab==='leave'&&<div className="panel">{data.leaves.length?<div className="delegation-list">{data.leaves.map(l=><article className="delegation-card" key={l.id}><div><strong>{l.name}</strong><p>{date(l.starts_at)} – {date(l.ends_at)}</p><small>{l.reason} · {l.department}</small></div><div className="delegation-actions"><Status value={l.status}/>{l.document_id&&<a className="button secondary small" href={documentHref(l.document_id,'people')}><FileText size={15}/>Document{l.document_version&&l.document_version>1?` · v${l.document_version}`:''}</a>}{l.can_decide&&<button className="button secondary small" onClick={()=>{setDecision(l);setComment('');setFormError('')}}>Revizuiește<ArrowRight size={15}/></button>}</div></article>)}</div>:<Empty title="Nicio cerere de concediu" message="Cererile trimise și deciziile vor apărea aici."/>}</div>}
    {dialog==='leave'&&<Modal title="Cerere de concediu" subtitle="Cererea PDF se generează automat și merge la aprobare." onClose={()=>setDialog(null)}><form className="modal-body" onSubmit={submitLeave}><div className="form-grid"><label className="field">Din data<input name="starts_at" type="date" defaultValue="2026-11-09" min={data.reference_date} required/></label><label className="field">Până la<input name="ends_at" type="date" defaultValue="2026-11-13" min={data.reference_date} required/></label></div><label className="field">Tip / motiv<select name="reason"><option>Concediu de odihnă</option><option>Zi liberă pentru eveniment personal</option><option>Concediu fără plată</option></select></label>{formError&&<ErrorMessage message={formError}/>}<div className="modal-footer"><button type="button" className="button secondary" onClick={()=>setDialog(null)}>Renunță</button><button className="button primary" disabled={busy}>{busy?'Se trimite…':'Trimite cererea'}<ArrowRight size={16}/></button></div></form></Modal>}
    {dialog==='delegation'&&<Modal title="Cine preia aprobările?" subtitle="Aprobările sunt preluate în intervalul ales." onClose={()=>setDialog(null)}><form className="modal-body" onSubmit={submitDelegation}><label className="field">Persoana înlocuită<select name="from_user" defaultValue={data.current_user_id}>{reviewers.filter(p=>selectedData.can_admin_delegations||p.id===selectedData.current_user_id).map(p=><option key={p.id} value={p.id}>{p.name} · {p.department}</option>)}</select></label><label className="field">Delegat<select name="to_user" required defaultValue=""><option value="" disabled>Alege un coleg autorizat</option>{reviewers.map(p=><option key={p.id} value={p.id}>{p.name} · {p.department}</option>)}</select></label><div className="form-grid"><label className="field">Începe la<input name="starts_at" type="date" required defaultValue="2026-11-09"/></label><label className="field">Se încheie la<input name="ends_at" type="date" required defaultValue="2026-11-13"/></label></div><label className="field">Motiv<input name="reason" defaultValue="Înlocuire pe durata concediului" required minLength={3}/></label><p className="quiet-note">Se deleagă doar aprobările din departamentul persoanei înlocuite. Semnarea documentelor nu se deleagă.</p>{formError&&<ErrorMessage message={formError}/>}<div className="modal-footer"><button type="button" className="button secondary" onClick={()=>setDialog(null)}>Renunță</button><button className="button primary" disabled={busy}>{busy?'Se salvează…':'Salvează delegarea'}<Check size={16}/></button></div></form></Modal>}
    {decision&&<Modal title={`Cererea lui ${decision.name}`} subtitle={`${date(decision.starts_at)} – ${date(decision.ends_at)}`} onClose={()=>setDecision(undefined)}><div className="modal-body"><p>{decision.reason}</p>{decision.document_id&&<a className="button secondary small" href={documentHref(decision.document_id,'people')}><FileText size={15}/>Vezi cererea PDF</a>}<label className="field">Observații<textarea rows={3} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Motivul este obligatoriu la respingere."/></label>{formError&&<ErrorMessage message={formError}/>}<div className="modal-footer"><button className="button secondary" disabled={busy} onClick={()=>void mutate(`/people/leave/${decision.id}/decision`,{action:'reject',comment},'Cererea a fost respinsă cu motiv.')}><X size={16}/>Respinge</button><button className="button primary" disabled={busy} onClick={()=>void mutate(`/people/leave/${decision.id}/decision`,{action:'approve',comment},'Concediul a fost aprobat.')}><Check size={16}/>Aprobă concediul</button></div></div></Modal>}
    {(dialog==='employee'||account)&&<EmployeeDialog directory={data} person={account} onClose={()=>{setDialog(null);setAccount(undefined)}} onChanged={managementChanged}/>}
    {authority&&<AuthorityDialog directory={data} person={authority.person} signing={authority.signing} onClose={()=>setAuthority(undefined)} onChanged={managementChanged}/>}
  </>;
}
