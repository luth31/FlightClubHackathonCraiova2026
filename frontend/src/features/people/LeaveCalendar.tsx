import {PersonReference} from '@/components/people/PersonReference';
import {useState} from 'react';
import {ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, FileText, Users} from 'lucide-react';
import {Empty, Modal, Status} from '@/components/ui';
import {documentHref} from '@/services/navigation';
import {date} from '@/utils/format';
import type {CalendarLeave, Directory, Leave} from './types';
import {addDays,calendarDate,calendarRange,calendarWeekEvents,formatCalendarDate,leaveReviewerLabel,monthDays,shiftMonth,weekStart} from './leave-calendar';
import './leave-calendar.css';

const weekdays=['Lun','Mar','Mie','Joi','Vin','Sâm','Dum'];
const statusLabels:Record<string,string>={approved:'Aprobat',pending:'În așteptare'};

export function LeaveCalendar({directory,onReview}:{directory:Directory;onReview:(leave:Leave)=>void}) {
  const today=directory.reference_date;
  const [cursor,setCursor]=useState(today);
  const [view,setView]=useState<'month'|'week'>('month');
  const [approved,setApproved]=useState(true);
  const [pending,setPending]=useState(true);
  const [person,setPerson]=useState('');
  const [selected,setSelected]=useState<CalendarLeave>();
  const [requestView,setRequestView]=useState<'all'|'mine'|'review'>('all');
  const allEvents=directory.leave_calendar||directory.leaves;
  const events=allEvents.filter(event=>(event.status==='approved'&&approved||event.status==='pending'&&pending)&&(!person||event.user_id===person));
  const miniDays=monthDays(cursor);
  const days=view==='month'?miniDays:Array.from({length:7},(_,i)=>addDays(weekStart(cursor),i));
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
    <section className="leave-calendar" aria-label="Calendarul concediilor echipei">
      <header className="leave-calendar-heading"><div><CalendarDays size={21}/><h2>Calendar concedii</h2></div><span><Users size={15}/>Toată echipa</span></header>
      <div className="leave-calendar-layout">
        <aside className="leave-sidebar">
          <div className="leave-mini-heading"><strong>{monthLabel}</strong><div><button aria-label="Luna anterioară în calendarul mic" onClick={()=>setCursor(shiftMonth(cursor,-1))}><ChevronLeft size={16}/></button><button aria-label="Luna următoare în calendarul mic" onClick={()=>setCursor(shiftMonth(cursor,1))}><ChevronRight size={16}/></button></div></div>
          <div className="leave-mini-calendar" aria-label="Alege o dată">{weekdays.map(day=><span key={day}>{day[0]}</span>)}{miniDays.map(day=><button key={day} className={`${day===cursor?'is-selected':''} ${day.slice(0,7)!==cursor.slice(0,7)?'is-outside':''}`} aria-label={formatCalendarDate(day,{dateStyle:'full'})} aria-pressed={day===cursor} aria-current={day===today?'date':undefined} onClick={()=>setCursor(day)}>{calendarDate(day).getUTCDate()}</button>)}</div>
          <div className="leave-calendar-filters"><h3>Concediile echipei</h3><label className="leave-filter-approved"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/><span>Aprobate</span><Check size={14}/></label><label className="leave-filter-pending"><input type="checkbox" checked={pending} onChange={e=>setPending(e.target.checked)}/><span>În așteptare</span><Clock3 size={14}/></label><label className="leave-person-filter">Persoană<select aria-label="Filtrează concediile după persoană" value={person} onChange={e=>setPerson(e.target.value)}><option value="">Toți colegii</option>{directory.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <p className="leave-calendar-note">Intervalele includ prima și ultima zi. Cererile respinse apar doar în lista de cereri.</p>
        </aside>
        <div className="leave-calendar-main">
          <div className="leave-calendar-toolbar"><button className="leave-today" onClick={()=>setCursor(today)}>Astăzi</button><div className="leave-calendar-navigation"><button aria-label="Perioada anterioară" onClick={()=>move(-1)}><ChevronLeft size={18}/></button><button aria-label="Perioada următoare" onClick={()=>move(1)}><ChevronRight size={18}/></button></div><h3 aria-live="polite">{label}</h3><div className="leave-view-toggle" role="group" aria-label="Vizualizare calendar"><button aria-pressed={view==='month'} onClick={()=>setView('month')}>Lună</button><button aria-pressed={view==='week'} onClick={()=>setView('week')}>Săptămână</button></div></div>
          <div className="leave-calendar-scroll" tabIndex={0} role="region" aria-label="Calendar cu derulare orizontală">
            <div className={`leave-calendar-grid leave-calendar-${view}`}>
              <div className="leave-weekdays">{weekdays.map((day,i)=><div key={day} className={i>4?'is-weekend':''}>{day}{view==='week'&&<strong className={days[i]===today?'is-today':''}>{calendarDate(days[i]).getUTCDate()}</strong>}</div>)}</div>
              {starts.map(start=>{
                const segments=calendarWeekEvents(events,start);
                const rows=Math.max(0,...segments.map(segment=>segment.row+1));
                return <div className="leave-week" key={start} style={{minHeight:view==='week'?Math.max(340,rows*33+50):Math.max(108,rows*30+42)}}>
                  <div className="leave-day-backgrounds">{Array.from({length:7},(_,i)=>{const day=addDays(start,i);return <div key={day} className={`${i>4?'is-weekend':''} ${day.slice(0,7)!==cursor.slice(0,7)?'is-outside':''}`} aria-label={formatCalendarDate(day,{dateStyle:'full'})}>{view==='month'&&<span className={day===today?'is-today':''}>{calendarDate(day).getUTCDate()}</span>}</div>})}</div>
                  <div className="leave-week-events" style={{gridTemplateRows:`repeat(${Math.max(1,rows)}, ${view==='week'?29:26}px)`}}>{segments.map(({event,column,span,row,continuesBefore,continuesAfter})=><button key={event.id} className={`leave-event leave-event-${event.status} ${continuesBefore?'continues-before':''} ${continuesAfter?'continues-after':''}`} style={{gridColumn:`${column+1} / span ${span}`,gridRow:row+1}} onClick={()=>setSelected(event)} title={`${event.name} · ${statusLabels[event.status]} · ${calendarRange(event.starts_at,event.ends_at)}`} aria-label={`${event.name}, ${statusLabels[event.status]}, ${calendarRange(event.starts_at,event.ends_at)}`}>
                    {event.status==='approved'?<Check size={13}/>:<Clock3 size={13}/>}<span><PersonReference name={event.name} userId={event.user_id} embedded/></span>{span>2&&<small>{statusLabels[event.status]}</small>}
                  </button>)}</div>
                </div>;
              })}
            </div>
          </div>
          <div className="leave-calendar-footer" role="status">{visible.length?`${visible.length} ${visible.length===1?'concediu':'concedii'} în perioada afișată`:'Niciun concediu în perioada afișată pentru filtrele selectate.'}<span>Toată ziua</span></div>
        </div>
      </div>
    </section>
    <section className="panel leave-requests" aria-label="Cereri de concediu"><div className="leave-requests-heading"><div><h2>Cereri de concediu</h2><p>Aprobarea revine superiorului sau înlocuitorului său disponibil. Conducerea fără superior își poate aproba propria cerere.</p></div><label>Arată<select aria-label="Filtrează cererile" value={requestView} onChange={e=>setRequestView(e.target.value as typeof requestView)}><option value="all">Toate cererile accesibile</option><option value="mine">Cererile mele</option><option value="review">De aprobat ({reviewCount})</option></select></label></div>
      {requests.length?<div className="delegation-list">{requests.map(leave=><article className="delegation-card" key={leave.id}><div><strong><PersonReference name={leave.name} userId={leave.user_id}/></strong><p>{date(leave.starts_at)} – {date(leave.ends_at)}</p><small>{leave.reason} · {leave.department}</small>{leave.status==='pending'&&<p className="leave-reviewer">Aprobă: {leave.reviewers?.length?leave.reviewers.map((reviewer,index)=><span key={reviewer.id}>{index>0&&', '}<PersonReference userId={reviewer.id} name={reviewer.name}>{leaveReviewerLabel(reviewer,leave.user_id)}</PersonReference></span>):'Niciun aprobator disponibil · contactează administratorul'}</p>}</div><div className="delegation-actions"><Status value={leave.status}/>{leave.document_id&&<a className="button secondary small" href={documentHref(leave.document_id,'people')}><FileText size={15}/>Document{leave.document_version&&leave.document_version>1?` · v${leave.document_version}`:''}</a>}{leave.can_decide&&<button className="button secondary small" onClick={()=>onReview(leave)}>Revizuiește<ArrowRight size={15}/></button>}</div></article>)}</div>:<Empty title="Nicio cerere de concediu" message="Cererile tale și cele pe care le poți revizui vor apărea aici."/>}
    </section>
    {selected&&<Modal title={selected.name} titleContent={<PersonReference name={selected.name} userId={selected.user_id}/>} subtitle={calendarRange(selected.starts_at,selected.ends_at)} onClose={()=>setSelected(undefined)}><div className="modal-body leave-event-details"><Status value={selected.status}/><p><CalendarDays size={17}/>Toată ziua · {selected.department}</p>{details&&<p>{details.reason}</p>}{details?.status==='pending'&&details.reviewers?.length!==undefined&&<p>Aprobă: {details.reviewers.length?details.reviewers.map((reviewer,index)=><span key={reviewer.id}>{index>0&&', '}<PersonReference userId={reviewer.id} name={reviewer.name}>{leaveReviewerLabel(reviewer,details.user_id)}</PersonReference></span>):'Niciun aprobator disponibil'}</p>}<div className="modal-footer">{details?.document_id&&<a className="button secondary" href={documentHref(details.document_id,'people')}><FileText size={16}/>Vezi documentul</a>}{details?.can_decide?<button className="button primary" onClick={()=>{setSelected(undefined);onReview(details)}}>Revizuiește cererea<ArrowRight size={16}/></button>:<button className="button secondary" onClick={()=>setSelected(undefined)}>Închide</button>}</div></div></Modal>}
  </div>;
}
