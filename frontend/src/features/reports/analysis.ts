import type {ReportRow} from './types';
export type Dimension='status'|'department'|'category'|'owner'|'supplier'|'currency'|'case_id'|'flow_stage';
export type Selection=Partial<Record<Dimension,string>>;
export const STAGES=['purchasing','shipping','inventory_management','invoice_verification'];
export const STAGE_NAMES=['Achiziție','Livrare / prestare','Recepție / stocuri','Facturare'];
const airportCalendar = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Bucharest'});
export function calendarDay(value:string|null|undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.isFinite(Date.parse(value)) ? value : null;
  const stamp = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value+'Z');
  return Number.isFinite(stamp.getTime()) ? airportCalendar.format(stamp) : null;
}
export function filterRows(rows:ReportRow[],selection:Selection){return rows.filter(row=>Object.entries(selection).every(([key,value])=>String(row[key as Dimension]||'Nespecificat')===value));}
export function groups(rows:ReportRow[],field:Dimension){const counts=new Map<string,number>();for(const row of rows){const name=String(row[field]||'Nespecificat');counts.set(name,(counts.get(name)||0)+1);}return [...counts].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));}
export function matrix(rows:ReportRow[],rowField:Dimension,columnField:Dimension){const rowNames=groups(rows,rowField).map(g=>g.name),columns=groups(rows,columnField).map(g=>g.name);return{columns,rows:rowNames.map(name=>({name,values:columns.map(column=>rows.filter(r=>String(r[rowField]||'Nespecificat')===name&&String(r[columnField]||'Nespecificat')===column).length)}))};}
export function currencyAmounts(rows:ReportRow[]){const totals=new Map<string,number>();for(const row of rows){if(row.value!=null){const currency=row.currency||'RON';totals.set(currency,(totals.get(currency)||0)+row.value);}}return [...totals].map(([currency,value])=>({currency,value}));}
export function ageDays(value:string|null|undefined,reference:string){if(!value)return null;const date=Date.parse(value.slice(0,10)+'T00:00:00Z'),ref=Date.parse(reference.slice(0,10)+'T00:00:00Z');return Number.isFinite(date)&&Number.isFinite(ref)?Math.round((date-ref)/86400000):null;}
export function expiryBuckets(rows:ReportRow[],reference:string){const buckets=[{name:'Depășit',value:0},{name:'0–7 zile',value:0},{name:'8–30 zile',value:0},{name:'31–90 zile',value:0},{name:'Peste 90 zile',value:0},{name:'Fără termen',value:0}];for(const row of rows){const days=ageDays(row.date,reference);const i=days==null?5:days<0?0:days<=7?1:days<=30?2:days<=90?3:4;buckets[i].value++;}return buckets;}
export function stageCoverage(rows:ReportRow[]){const ids=[...new Set(rows.map(r=>r.case_id).filter((id):id is string=>!!id))];return ids.map(id=>({id,values:STAGES.map(stage=>rows.filter(r=>r.case_id===id&&r.flow_stage===stage).length)}));}
export function activityRows(rows:ReportRow[],start:string,end:string){const days=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;const items=Array.from({length:12},(_,i)=>({date:new Date(Date.parse(start)+Math.ceil(i*days/12)*86400000).toISOString().slice(0,10),value:0}));for(const row of rows){if(!row.created_at)continue;const day=calendarDay(row.created_at);if(day&&day>=start&&day<=end){const offset=Math.round((Date.parse(day)-Date.parse(start))/86400000);items[Math.min(11,Math.floor(offset*12/days))].value++;}}return {start,end,items,total:items.reduce((s,i)=>s+i.value,0)};}
