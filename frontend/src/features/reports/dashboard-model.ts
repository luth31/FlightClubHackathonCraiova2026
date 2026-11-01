import {ageDays, calendarDay} from './analysis.ts';
import type {ReportBriefing, ReportRow} from './types';

export interface DashboardFilters {departments:string[];categories:string[];statuses:string[];months:string[];period:'all'|'30'|'7'}
export const emptyDashboardFilters:DashboardFilters={departments:[],categories:[],statuses:[],months:[],period:'all'};
export const toggleValue=(values:string[],value:string)=>values.includes(value)?values.filter(v=>v!==value):[...values,value];
const dayMs=86400000;
const shifted=(day:string,offset:number)=>new Date(Date.parse(day+'T00:00:00Z')+offset*dayMs).toISOString().slice(0,10);

export function dashboardSelection(data:ReportBriefing, filters:DashboardFilters) {
  const inPeriod=(value?:string|null)=>{
    const day=calendarDay(value);
    if(filters.months.length&&(!day||!filters.months.includes(day.slice(0,7))))return false;
    if(filters.period!=='all'&&(!day||day<shifted(data.date,1-Number(filters.period))||day>data.date))return false;
    return true;
  };
  const documents=data.analysis.documents.filter(r=>(!filters.departments.length||filters.departments.includes(r.department))
    &&(!filters.categories.length||filters.categories.includes(r.category||'Nespecificat'))
    &&(!filters.statuses.length||filters.statuses.includes(r.status))&&inPeriod(r.created_at));
  const ids=new Set(documents.map(r=>r.id));
  const tasks=data.analysis.tasks.filter(r=>!!r.document_id&&ids.has(r.document_id));
  const contracts=data.analysis.contracts.filter(r=>ids.has(r.id));
  const events=data.analysis.events.filter(e=>ids.has(e.document_id)&&inPeriod(e.created_at));
  const pending=tasks.filter(t=>t.status==='pending');
  const approved=documents.filter(r=>['approved','signed'].includes(r.status));
  const live=contracts.filter(r=>r.validated&&r.status!=='archived');
  const due=live.filter(r=>{const days=ageDays(r.date,data.date);return days!==null&&days>=0&&days<=30;});
  const expired=live.filter(r=>(ageDays(r.date,data.date)??1)<0);
  return {documents,tasks,contracts,events,pending,approved,due,expired,
    priorities:data.priorities.filter(p=>!!p.document_id&&ids.has(p.document_id))};
}

export function dailySeries(rows:ReportRow[],today:string,filters:DashboardFilters) {
  const actualDays=rows.map(r=>calendarDay(r.created_at)).filter((d):d is string=>!!d&&d<=today).sort();
  let start=filters.period==='all'?(actualDays[0]||shifted(today,-29)):shifted(today,1-Number(filters.period));
  let end=today;
  if(filters.months.length){start=[...filters.months].sort()[0]+'-01';const last=[...filters.months].sort().at(-1)!;const [year,month]=last.split('-').map(Number);end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);if(end>today)end=today;}
  if(start>end)start=end;
  if((Date.parse(end)-Date.parse(start))/dayMs>90){
    const cursor=new Date(start.slice(0,7)+'-01T00:00:00Z');
    const points:{date:string;total:number;approved:number;review:number}[]=[];
    while(cursor.toISOString().slice(0,10)<=end){points.push({date:cursor.toISOString().slice(0,10),total:0,approved:0,review:0});cursor.setUTCMonth(cursor.getUTCMonth()+1);}
    for(const row of rows){const day=calendarDay(row.created_at);if(!day||day<start||day>end)continue;const bucket=points.find(p=>p.date.slice(0,7)===day.slice(0,7));if(!bucket)continue;bucket.total++;if(['approved','signed','completed'].includes(row.status))bucket.approved++;if(['draft','in_review','pending'].includes(row.status))bucket.review++;}
    return {start,end,points};
  }
  const days=Math.max(1,Math.round((Date.parse(end)-Date.parse(start))/dayMs)+1), size=days<=14?days:Math.min(16,Math.ceil(days/3));
  const result=Array.from({length:size},(_,i)=>({date:shifted(start,Math.floor(i*days/size)),total:0,approved:0,review:0}));
  for(const row of rows){const day=calendarDay(row.created_at);if(!day||day<start||day>end)continue;const bucket=Math.min(size-1,Math.floor((Date.parse(day)-Date.parse(start))/dayMs*size/days));result[bucket].total++;if(['approved','signed','completed'].includes(row.status))result[bucket].approved++;if(['draft','in_review','pending'].includes(row.status))result[bucket].review++;}
  return {start,end,points:result};
}

export function departmentComparison(documents:ReportRow[],tasks:ReportRow[]){
  const names=[...new Set(documents.map(r=>r.department))];
  return names.map(name=>({name,total:documents.filter(r=>r.department===name).length,pending:tasks.filter(r=>r.department===name&&r.status==='pending').length})).sort((a,b)=>b.total-a.total);
}
