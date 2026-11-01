import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,RefreshCw,Users} from 'lucide-react';
import {api} from '@/services/api-client';
import {t,getLocale} from '@/i18n';
import {PersonAvatar} from '@/components/people/PersonAvatar';
import {ErrorMessage,ViewActiveContext} from '@/components/ui';
import {date} from '@/utils/format';
import {dayKey,monthDays,monthKey,moveMonth,overlaps,parseDay,selectRange} from './leave-calendar-model';
import type {CalendarLeave,LeaveRange,Person} from './types';
import './leave-range-planner.css';

interface CalendarData {items:CalendarLeave[]}
const weekdays=['Lun','Mar','Mie','Joi','Vin','Sâm','Dum'];

export function LeaveRangePlanner({referenceDate,currentUserId,people,revision,range,onRangeChange,onRequest,compact=false}:{
  referenceDate:string;currentUserId:string;people:Person[];revision:number;range?:LeaveRange;
  onRangeChange?:(range:LeaveRange)=>void;onRequest?:(range:LeaveRange)=>void;compact?:boolean;
}) {
  const active=useContext(ViewActiveContext);
  const [month,setMonth]=useState(()=>monthKey(range?.starts_at||referenceDate));
  const [localRange,setLocalRange]=useState<LeaveRange>({starts_at:referenceDate,ends_at:referenceDate});
  const selected=range||localRange;
  const [selectingEnd,setSelectingEnd]=useState(false),[department,setDepartment]=useState('');
  const [items,setItems]=useState<CalendarLeave[]>([]),[rangeItems,setRangeItems]=useState<CalendarLeave[]>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  const calendar=useRef<HTMLDivElement>(null);
  const days=useMemo(()=>monthDays(month),[month]);
  const start=days[0],end=days.at(-1)!;
  const hasRange=!!selected.starts_at&&!!selected.ends_at&&selected.ends_at>=selected.starts_at;
  const needsRange=hasRange&&(selected.starts_at<start||selected.ends_at>end);
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();let pending=false;
    const load=async()=>{
      if(pending||document.hidden)return;pending=true;
      try{
        const paths=[`/people/leave/calendar?${new URLSearchParams({starts_at:start,ends_at:end})}`];
        if(needsRange)paths.push(`/people/leave/calendar?${new URLSearchParams({starts_at:selected.starts_at,ends_at:selected.ends_at})}`);
        const values=await Promise.all(paths.map(path=>api<CalendarData>(path,{signal:controller.signal})));
        if(!controller.signal.aborted){setItems(values[0].items);setRangeItems((values[1]||values[0]).items);setError('');setLoading(false)}
      }catch(e){if(!controller.signal.aborted){setError((e as Error).message);setLoading(false)}}finally{pending=false}
    };
    void load();const timer=setInterval(()=>void load(),10000);
    const visible=()=>void load();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)};
  },[start,end,needsRange,selected.starts_at,selected.ends_at,revision,refresh,active]);
  const departments=[...new Set(people.filter(p=>p.active).map(p=>p.department))].sort((a,b)=>a.localeCompare(b,getLocale()));
  const visible=items.filter(item=>!department||item.department===department);
  const conflicts=rangeItems.filter(item=>(!department||item.department===department)&&overlaps(item,selected));
  const colleagues=conflicts.filter(item=>item.user_id!==currentUserId);
  const own=rangeItems.some(item=>item.user_id===currentUserId&&overlaps(item,selected));
  function choose(day:string){const next=selectRange(selected,day,selectingEnd);setLocalRange(next);onRangeChange?.(next);setSelectingEnd(value=>!value)}
  function keyboard(event:React.KeyboardEvent<HTMLButtonElement>,day:string){
    const offset:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
    if(!(event.key in offset))return;event.preventDefault();const next=parseDay(day);next.setDate(next.getDate()+offset[event.key]);const key=dayKey(next);
    const button=calendar.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${key}"]`);button?.focus();
  }
  const monthLabel=parseDay(month).toLocaleDateString(getLocale(),{month:'long',year:'numeric'});
  return <section className={'leave-planner'+(compact?' leave-planner-compact':'')} aria-label={t('Calendarul concediilor')}>
    <header className="leave-planner-header"><div><span className="leave-planner-eyebrow">{t('PLANIFICAREA ECHIPEI')}</span><h2><CalendarDays size={20}/>{t('Calendarul concediilor')}</h2></div><div className="leave-planner-filter"><label>{t('Departament')}<select aria-label={t('Departamentul din calendar')} value={department} onChange={e=>setDepartment(e.target.value)}><option value="">{t('Toate departamentele')}</option>{departments.map(name=><option key={name} value={name}>{t(name)}</option>)}</select></label><button type="button" className="icon-button" aria-label={t('Actualizează calendarul')} onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={16}/></button></div></header>
    <div className="leave-planner-layout"><div className="leave-planner-month"><div className="leave-planner-navigation"><div><button type="button" aria-label={t('Luna anterioară')} onClick={()=>setMonth(value=>moveMonth(value,-1))}><ChevronLeft size={18}/></button><h3 aria-live="polite">{monthLabel}</h3><button type="button" aria-label={t('Luna următoare')} onClick={()=>setMonth(value=>moveMonth(value,1))}><ChevronRight size={18}/></button></div><button type="button" className="text-button" onClick={()=>setMonth(monthKey(referenceDate))}>{t('Luna curentă')}</button></div>
      <div className="leave-planner-legend"><span><i className="approved"/>{t('Aprobat')}</span><span><i className="pending"/>{t('În așteptare')}</span><small>{t(selectingEnd?'Alege ultima zi a intervalului.':'Alege prima și ultima zi.')}</small></div>
      {error&&<ErrorMessage message={t(error)} retry={()=>setRefresh(v=>v+1)}/>}
      <div className="leave-planner-grid" ref={calendar} aria-busy={loading}><div className="leave-planner-weekdays">{weekdays.map(day=><span key={day}>{t(day)}</span>)}</div><div className="leave-planner-days">{days.map((day,index)=>{
        const absences=visible.filter(item=>item.starts_at<=day&&item.ends_at>=day),inRange=hasRange&&day>=selected.starts_at&&day<=selected.ends_at;
        return <button type="button" key={day} data-calendar-day={day} aria-label={`${date(day)} · ${t('{count} absențe',{count:absences.length})}${inRange?' · '+t('selectat'):''}`} aria-pressed={inRange} className={'leave-planner-day'+(day.slice(0,7)!==month.slice(0,7)?' other-month':'')+(index%7>4?' weekend':'')+(inRange?' selected':'')+(day===referenceDate?' is-reference-date':'')} onClick={()=>choose(day)} onKeyDown={e=>keyboard(e,day)}>
          <span className="leave-planner-day-number">{Number(day.slice(-2))}</span><span className="leave-planner-day-events">{absences.slice(0,2).map(item=><span key={item.id} className={'leave-planner-day-event '+item.status} title={`${item.name} · ${t(item.status==='approved'?'Aprobat':'În așteptare')}`}><i/>{item.name}</span>)}{absences.length>2&&<small>{t('+{count} colegi',{count:absences.length-2})}</small>}</span>{absences.length>0&&<span className="leave-planner-day-mobile-count">{absences.length}</span>}
        </button>;
      })}</div></div>
    </div><aside className="leave-planner-agenda"><div className="leave-planner-agenda-heading"><Users size={18}/><h3>{hasRange?`${date(selected.starts_at)}${selected.ends_at!==selected.starts_at?' – '+date(selected.ends_at):''}`:t('Alege un interval')}</h3></div>
      {hasRange&&<p className="leave-planner-agenda-summary">{colleagues.length?t('{count} colegi au absențe în acest interval.',{count:new Set(colleagues.map(item=>item.user_id)).size}):t('Nicio absență a colegilor înregistrată pentru selecția afișată.')}</p>}
      {own&&<p className="leave-planner-own-overlap">{t('Ai deja o cerere în acest interval. Alege alte date.')}</p>}
      {conflicts.map(item=><article className="leave-planner-agenda-person" key={item.id}><PersonAvatar userId={item.user_id} name={item.name}/><div><strong>{item.name}{item.user_id===currentUserId?' · '+t('tu'):''}</strong><small>{t(item.department)}</small><span>{date(item.starts_at)} – {date(item.ends_at)}</span><em className={item.status}>{t(item.status==='approved'?'Aprobat':'În așteptare')}</em></div></article>)}
      {onRequest&&hasRange&&<button type="button" className="button primary" onClick={()=>onRequest(selected)} disabled={own||selected.ends_at<referenceDate}>{t('Solicită acest interval')}</button>}
      <p className="leave-planner-guidance">{t('Calendarul ajută la planificare. Aprobarea depinde de acoperirea turelor și de decizia responsabilului.')}</p>
    </aside></div>
  </section>;
}
