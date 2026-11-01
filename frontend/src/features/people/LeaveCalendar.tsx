import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useContext,useEffect,useState} from 'react';
import {ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, FileText, Users} from 'lucide-react';
import {Empty,ErrorMessage,Modal,Status,ViewActiveContext} from '@/components/ui';
import {api} from '@/services/api-client';
import {documentHref} from '@/services/navigation';
import {date} from '@/utils/format';
import type {CalendarLeave, Directory, Leave,LeaveRange} from './types';
import {addDays,calendarDate,calendarRange,calendarWeekEvents,formatCalendarDate,leaveReviewerLabel,monthDays,shiftMonth,weekStart} from './leave-calendar';
import './leave-calendar.css';

const weekdays=['Lun','Mar','Mie','Joi','Vin','Sâm','Dum'];
const statusLabels:Record<string,string>={approved:'Aprobat',pending:'În așteptare'};

export function LeaveCalendar({directory,onReview,onRequest}:{directory:Directory;onReview:(leave:Leave)=>void;onRequest?:(range:LeaveRange)=>void}) {
  useLanguage();
  const active=useContext(ViewActiveContext);
  const today=directory.reference_date;
  const [cursor,setCursor]=useState(today);
  const [view,setView]=useState<'month'|'week'>('month');
  const [approved,setApproved]=useState(true);
  const [pending,setPending]=useState(true);
  const [person,setPerson]=useState('');
  const [department,setDepartment]=useState('');
  const [calendarItems,setCalendarItems]=useState<CalendarLeave[]>(directory.leave_calendar||[]);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<CalendarLeave>();
  const [requestView,setRequestView]=useState<'all'|'mine'|'review'>('all');
  const events=calendarItems.filter(event=>(event.status==='approved'&&approved||event.status==='pending'&&pending)&&(!person||event.user_id===person)&&(!department||event.department===department));
  const miniDays=monthDays(cursor);
  const days=view==='month'?miniDays:Array.from({length:7},(_,i)=>addDays(weekStart(cursor),i));
  const rangeStart=days[0],rangeEnd=days.at(-1)!;
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();let pending=false;
    const load=async()=>{if(pending||document.hidden)return;pending=true;try{const result=await api<{items:CalendarLeave[]}>(`/people/leave/calendar?${new URLSearchParams({starts_at:rangeStart,ends_at:rangeEnd})}`,{signal:controller.signal});if(!controller.signal.aborted){setCalendarItems(result.items);setError('')}}catch(e){if(!controller.signal.aborted)setError((e as Error).message)}finally{pending=false}};
    void load();const timer=setInterval(()=>void load(),10000),visible=()=>void load();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)};
  },[active,rangeStart,rangeEnd,directory]);
  const starts=days.filter((_,i)=>i%7===0);
  const visible=events.filter(event=>event.starts_at<=days.at(-1)!&&event.ends_at>=days[0]);
  const monthLabel=formatCalendarDate(cursor,{month:'long',year:'numeric'});
  const label=view==='month'?monthLabel:calendarRange(days[0],days[6]);
  const details=directory.leaves.find(event=>event.id===selected?.id);
  const reviewCount=directory.leaves.filter(event=>event.can_decide).length;
  const requests=directory.leaves.filter(event=>requestView==='mine'?event.user_id===directory.current_user_id:requestView==='review'?event.can_decide:true)
    .sort((a,b)=>Number(b.can_decide)-Number(a.can_decide)||b.starts_at.localeCompare(a.starts_at));
  function move(amount:number) {setCursor(view==='month'?shiftMonth(cursor,amount):addDays(cursor,amount*7));}
  return <div className="leave-workspace">
    <section className="leave-calendar" aria-label={t("Calendarul concediilor echipei")}>
      <header className="leave-calendar-heading"><div><CalendarDays size={21}/><h2>{t("Calendar concedii")}</h2></div><span><Users size={15}/>{t("Toată echipa")}</span></header>
      {error&&<ErrorMessage message={error}/>}
      <div className="leave-calendar-layout">
        <aside className="leave-sidebar">
          <div className="leave-mini-heading"><strong>{monthLabel}</strong><div><button aria-label={t("Luna anterioară în calendarul mic")} onClick={()=>setCursor(shiftMonth(cursor,-1))}><ChevronLeft size={16}/></button><button aria-label={t("Luna următoare în calendarul mic")} onClick={()=>setCursor(shiftMonth(cursor,1))}><ChevronRight size={16}/></button></div></div>
          <div className="leave-mini-calendar" aria-label={t("Alege o dată")}>{weekdays.map(day=><span key={day}>{t(day)[0]}</span>)}{miniDays.map(day=><button key={day} className={`${day===cursor?'is-selected':''} ${day.slice(0,7)!==cursor.slice(0,7)?'is-outside':''}`} aria-label={formatCalendarDate(day,{dateStyle:'full'})} aria-pressed={day===cursor} aria-current={day===today?'date':undefined} onClick={()=>setCursor(day)}>{calendarDate(day).getUTCDate()}</button>)}</div>
          <div className="leave-calendar-filters"><label className="leave-person-filter">{t("Departament")}<select aria-label={t("Departamentul din calendar")} value={department} onChange={e=>setDepartment(e.target.value)}><option value="">{t("Toate departamentele")}</option>{directory.departments.map(name=><option key={name} value={name}>{t(name)}</option>)}</select></label><h3>{t("Concediile echipei")}</h3><label className="leave-filter-approved"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/><span>{t("Aprobate")}</span><Check size={14}/></label><label className="leave-filter-pending"><input type="checkbox" checked={pending} onChange={e=>setPending(e.target.checked)}/><span>{t("În așteptare")}</span><Clock3 size={14}/></label><label className="leave-person-filter">{t("Persoană")}<select aria-label={t("Filtrează concediile după persoană")} value={person} onChange={e=>setPerson(e.target.value)}><option value="">{t("Toți colegii")}</option>{directory.items.filter(item=>item.active&&(!department||item.department===department)).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <p className="leave-calendar-note">{t("Intervalele includ prima și ultima zi. Cererile respinse apar doar în lista de cereri.")}</p>
        </aside>
        <div className="leave-calendar-main">
          <div className="leave-calendar-toolbar">{onRequest&&<button type="button" className="leave-today" onClick={()=>onRequest({starts_at:cursor<today?today:cursor,ends_at:cursor<today?today:cursor})}>{t("Cerere nouă")}</button>}<button className="leave-today" onClick={()=>setCursor(today)}>{t("Astăzi")}</button><div className="leave-calendar-navigation"><button aria-label={t("Perioada anterioară")} onClick={()=>move(-1)}><ChevronLeft size={18}/></button><button aria-label={t("Perioada următoare")} onClick={()=>move(1)}><ChevronRight size={18}/></button></div><h3 aria-live="polite">{label}</h3><div className="leave-view-toggle" role="group" aria-label={t("Vizualizare calendar")}><button aria-pressed={view==='month'} onClick={()=>setView('month')}>{t("Lună")}</button><button aria-pressed={view==='week'} onClick={()=>setView('week')}>{t("Săptămână")}</button></div></div>
          <div className="leave-calendar-scroll" tabIndex={0} role="region" aria-label={t("Calendar cu derulare orizontală")}>
            <div className={`leave-calendar-grid leave-calendar-${view}`}>
              <div className="leave-weekdays">{weekdays.map((day,i)=><div key={day} className={i>4?'is-weekend':''}>{t(day)}{view==='week'&&<strong className={days[i]===today?'is-today':''}>{calendarDate(days[i]).getUTCDate()}</strong>}</div>)}</div>
              {starts.map(start=>{
                const segments=calendarWeekEvents(events,start);
                const rows=Math.max(0,...segments.map(segment=>segment.row+1));
                return <div className="leave-week" key={start} style={{minHeight:view==='week'?Math.max(340,rows*33+50):Math.max(108,rows*30+42)}}>
                  <div className="leave-day-backgrounds">{Array.from({length:7},(_,i)=>{const day=addDays(start,i);return <div key={day} className={`${i>4?'is-weekend':''} ${day.slice(0,7)!==cursor.slice(0,7)?'is-outside':''}`} aria-label={formatCalendarDate(day,{dateStyle:'full'})}>{view==='month'&&<span className={day===today?'is-today':''}>{calendarDate(day).getUTCDate()}</span>}</div>})}</div>
                  <div className="leave-week-events" style={{gridTemplateRows:`repeat(${Math.max(1,rows)}, ${view==='week'?29:26}px)`}}>{segments.map(({event,column,span,row,continuesBefore,continuesAfter})=><button key={event.id} className={`leave-event leave-event-${event.status} ${continuesBefore?'continues-before':''} ${continuesAfter?'continues-after':''}`} style={{gridColumn:`${column+1} / span ${span}`,gridRow:row+1}} onClick={()=>setSelected(event)} title={t("{p0} · {p1} · {p2}", {p0:event.name,p1:t(statusLabels[event.status]),p2:calendarRange(event.starts_at,event.ends_at)})} aria-label={t("{p0}, {p1}, {p2}", {p0:event.name,p1:t(statusLabels[event.status]),p2:calendarRange(event.starts_at,event.ends_at)})}>
                    {event.status==='approved'?<Check size={13}/>:<Clock3 size={13}/>}<span><PersonReference name={event.name} userId={event.user_id} embedded/></span>{span>2&&<small>{t(statusLabels[event.status])}</small>}
                  </button>)}</div>
                </div>;
              })}
            </div>
          </div>
          <div className="leave-calendar-footer" role="status">{visible.length?t("{p0} {p1} în perioada afișată", {p0:visible.length,p1:t(visible.length===1?'concediu':'concedii')}):t("Niciun concediu în perioada afișată pentru filtrele selectate.")}<span>{t("Toată ziua")}</span></div>
        </div>
      </div>
    </section>
    <section className="panel leave-requests" aria-label={t("Cereri de concediu")}><div className="leave-requests-heading"><div><h2>{t("Cereri de concediu")}</h2><p>{t("Aprobarea revine superiorului sau înlocuitorului său disponibil. Conducerea fără superior își poate aproba propria cerere.")}</p></div><label>{t("Arată")}<select aria-label={t("Filtrează cererile")} value={requestView} onChange={e=>setRequestView(e.target.value as typeof requestView)}><option value="all">{t("Toate cererile accesibile")}</option><option value="mine">{t("Cererile mele")}</option><option value="review">{t("De aprobat (")}{reviewCount})</option></select></label></div>
      {requests.length?<div className="delegation-list">{requests.map(leave=><article className="delegation-card" key={leave.id}><div><strong><PersonReference name={leave.name} userId={leave.user_id}/></strong><p>{date(leave.starts_at)} – {date(leave.ends_at)}</p><small>{leave.reason} · {leave.department}</small>{leave.status==='pending'&&<p className="leave-reviewer">{t("Aprobă:")}{' '}{leave.reviewers?.length?leave.reviewers.map((reviewer,index)=><span key={reviewer.id}>{index>0&&', '}<PersonReference userId={reviewer.id} name={reviewer.name}>{leaveReviewerLabel(reviewer,leave.user_id)}</PersonReference></span>):t("Niciun aprobator disponibil · contactează administratorul")}</p>}</div><div className="delegation-actions"><Status value={leave.status}/>{leave.document_id&&<a className="button secondary small" href={documentHref(leave.document_id,'people')}><FileText size={15}/>{t("Document")}{leave.document_version&&leave.document_version>1?t(" · v{p0}", {p0:leave.document_version}):''}</a>}{leave.can_decide&&<button className="button secondary small" onClick={()=>onReview(leave)}>{t("Revizuiește")}<ArrowRight size={15}/></button>}</div></article>)}</div>:<Empty title={t("Nicio cerere de concediu")} message={t("Cererile tale și cele pe care le poți revizui vor apărea aici.")}/>}
    </section>
    {selected&&<Modal title={selected.name} titleContent={<PersonReference name={selected.name} userId={selected.user_id}/>} subtitle={calendarRange(selected.starts_at,selected.ends_at)} onClose={()=>setSelected(undefined)}><div className="modal-body leave-event-details"><Status value={selected.status}/><p><CalendarDays size={17}/>{t("Toată ziua ·")}{' '}{selected.department}</p>{details&&<p>{details.reason}</p>}{details?.status==='pending'&&details.reviewers?.length!==undefined&&<p>{t("Aprobă:")}{' '}{details.reviewers.length?details.reviewers.map((reviewer,index)=><span key={reviewer.id}>{index>0&&', '}<PersonReference userId={reviewer.id} name={reviewer.name}>{leaveReviewerLabel(reviewer,details.user_id)}</PersonReference></span>):t("Niciun aprobator disponibil")}</p>}<div className="modal-footer">{details?.document_id&&<a className="button secondary" href={documentHref(details.document_id,'people')}><FileText size={16}/>{t("Vezi documentul")}</a>}{details?.can_decide?<button className="button primary" onClick={()=>{setSelected(undefined);onReview(details)}}>{t("Revizuiește cererea")}<ArrowRight size={16}/></button>:<button className="button secondary" onClick={()=>setSelected(undefined)}>{t("Închide")}</button>}</div></div></Modal>}
  </div>;
}
