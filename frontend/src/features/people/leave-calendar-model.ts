import type {CalendarLeave,LeaveRange} from './types';

export const dayKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const parseDay=(value:string)=>new Date(value+'T12:00:00');
export const monthKey=(value:string)=>value.slice(0,7)+'-01';
export function monthDays(month:string) {
  const first=parseDay(monthKey(month));
  first.setDate(first.getDate()-(first.getDay()+6)%7);
  return Array.from({length:42},(_,index)=>{const value=new Date(first);value.setDate(first.getDate()+index);return dayKey(value)});
}
export function moveMonth(month:string,offset:number) {const value=parseDay(monthKey(month));value.setMonth(value.getMonth()+offset);return dayKey(value)}
export function overlaps(item:CalendarLeave,range:LeaveRange) {return !!range.starts_at&&!!range.ends_at&&item.starts_at<=range.ends_at&&item.ends_at>=range.starts_at}
export function selectRange(current:LeaveRange,day:string,selectingEnd:boolean):LeaveRange {
  if(!selectingEnd||!current.starts_at)return {starts_at:day,ends_at:day};
  return {starts_at:day<current.starts_at?day:current.starts_at,ends_at:day<current.starts_at?current.starts_at:day};
}
