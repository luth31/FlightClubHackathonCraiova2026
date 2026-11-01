import type {CalendarLeave, LeaveReviewer} from './types';
import {t,getLocale} from '@/i18n';

export function leaveReviewerLabel(reviewer:LeaveReviewer,requesterId:string) {
  if(reviewer.delegated_from_name)return t('{name} ({role} pentru {principal})',{name:reviewer.name,role:t(reviewer.via==='delegation'?'delegat':'înlocuitor ierarhic'),principal:reviewer.delegated_from_name});
  return reviewer.id===requesterId?t('{name} (aprobare proprie)',{name:reviewer.name}):reviewer.name;
}

// Date-only arithmetic in UTC keeps inclusive leave ranges stable across DST.
export function calendarDate(value:string) { return new Date(`${value}T00:00:00Z`); }
export function dateKey(value:Date) { return value.toISOString().slice(0,10); }
export function addDays(value:string,amount:number) {
  const result=calendarDate(value);result.setUTCDate(result.getUTCDate()+amount);return dateKey(result);
}
export function shiftMonth(value:string,amount:number) {
  const result=calendarDate(value);result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+amount);return dateKey(result);
}
export function weekStart(value:string) { return addDays(value,-((calendarDate(value).getUTCDay()+6)%7)); }
export function monthDays(value:string) {
  const first=value.slice(0,7)+'-01';
  const last=addDays(shiftMonth(first,1),-1);
  const start=weekStart(first),end=addDays(weekStart(last),6);
  const result:string[]=[];
  for(let day=start;day<=end;day=addDays(day,1))result.push(day);
  return result;
}
export function formatCalendarDate(value:string,options:Intl.DateTimeFormatOptions) {
  return calendarDate(value).toLocaleDateString(getLocale(),{...options,timeZone:'UTC'});
}
export function calendarRange(start:string,end:string) {
  return `${formatCalendarDate(start,{day:'numeric',month:'short'})} – ${formatCalendarDate(end,{day:'numeric',month:'short',year:'numeric'})}`;
}
export function calendarWeekEvents(events:CalendarLeave[],start:string) {
  const end=addDays(start,6);
  const rows:number[]=[];
  return events.filter(event=>event.starts_at<=end&&event.ends_at>=start)
    .sort((a,b)=>a.starts_at.localeCompare(b.starts_at)||b.ends_at.localeCompare(a.ends_at)||a.name.localeCompare(b.name,'ro')||a.id.localeCompare(b.id))
    .map(event=>{
      const first=event.starts_at<start?start:event.starts_at;
      const last=event.ends_at>end?end:event.ends_at;
      const column=Math.round((+calendarDate(first)-+calendarDate(start))/86400000);
      const span=Math.round((+calendarDate(last)-+calendarDate(first))/86400000)+1;
      let row=rows.findIndex(occupied=>occupied<=column);
      if(row===-1)row=rows.length;
      rows[row]=column+span;
      return {event,column,span,row,continuesBefore:event.starts_at<start,continuesAfter:event.ends_at>end};
    });
}
