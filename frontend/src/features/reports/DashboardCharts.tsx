import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useState, type ReactNode} from 'react';
import {ArrowUpRight, ChartNoAxesCombined} from 'lucide-react';
import type {ReportRow} from './types';
import {label, number, amount, shortDate} from './labels';
import {readableText} from '@/utils/text';
import {ageDays, groups} from './analysis';
import type {dailySeries, departmentComparison} from './dashboard-model';

export const BLUE='#4e8fc2', RED='#dc2938', TEAL='#248a7e', NAVY='#123f6b', GOLD='#bb7918';
export function DashboardPanel({title,subtitle,children,action,className=''}:{title:string;subtitle?:string;children:ReactNode;action?:()=>void;className?:string}){
  useLanguage();
  return <section className={`px-panel ${className}`}><header><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action?<button onClick={action} title={t("Vezi datele sursă")} aria-label={t("Date sursă: {p0}", {p0:title})}><ArrowUpRight size={15}/></button>:null}</header>{children}</section>;
}
function EmptyChart(){
  useLanguage();return <div className="px-chart-empty"><ChartNoAxesCombined size={28}/><strong>{t("Nicio înregistrare în această selecție")}</strong><span>{t("Ajustează filtrele pentru a continua analiza.")}</span></div>;}
export function TrendChart({series,tasks=false}:{series:ReturnType<typeof dailySeries>;tasks?:boolean}){
  useLanguage();
  const [active,setActive]=useState<number|null>(null);
  const points=series.points, max=Math.max(1,...points.map(p=>p.total));
  if(!points.some(p=>p.total))return <EmptyChart/>;
  const names=[tasks?'Finalizate':'Aprobate / semnate',tasks?'În așteptare':'În pregătire / analiză','Alte stări'];
  const range=(p:typeof points[number])=>p.date===p.endDate?shortDate(p.date):`${shortDate(p.date)} – ${shortDate(p.endDate)}`;
  return <div className="px-volume-chart"><div className="px-chart-legend">{[TEAL,BLUE,'#92a1b0'].map((color,i)=><span key={color}><i style={{background:color}}/>{names[i]}</span>)}</div>
    <div className="px-volume-bars">{points.map((p,i)=><button key={p.date} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)} aria-label={t("{p0}: {p1} înregistrări, {p2} {p3}, {p4} {p5}, {p6} {p7}", {p0:range(p),p1:p.total,p2:p.approved,p3:names[0],p4:p.review,p5:names[1],p6:p.total-p.approved-p.review,p7:names[2]})}>
      <b>{p.total||'·'}</b><div className="px-volume-track"><div style={{height:`${p.total/max*100}%`}}>{[p.approved,p.review,p.total-p.approved-p.review].map((n,j)=>n>0&&<span key={j} style={{flex:n,background:[TEAL,BLUE,'#92a1b0'][j]}}/>)}</div></div><span>{new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'short'}).format(new Date(p.date+'T12:00:00'))}</span><small>{p.date===p.endDate?'':t("– {p0}", {p0:new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'short'}).format(new Date(p.endDate+'T12:00:00'))})}</small>
    </button>)}</div><footer role="status">{active!==null&&points[active]?t("{p0} · {p1} înregistrări · {p2} {p3} · {p4} {p5}", {p0:range(points[active]),p1:points[active].total,p2:points[active].approved,p3:names[0].toLowerCase(),p4:points[active].review,p5:names[1].toLowerCase()}):t("Grupate după data creării · starea curentă, nu data aprobării")}</footer>
  </div>;
}

export function DepartmentBars({items,selected,onPick}:{items:ReturnType<typeof departmentComparison>;selected:string[];onPick:(name:string)=>void}){
  useLanguage();
  if(!items.length)return <EmptyChart/>;
  const max=Math.max(4,Math.ceil(Math.max(...items.map(i=>Math.max(i.total,i.pending)))/4)*4),step=475/items.length;
  return <div className="px-department-chart"><div className="px-chart-legend"><span><i style={{background:BLUE}}/>{t("Documente")}</span><span><i style={{background:RED}}/>{t("Decizii în așteptare")}</span></div>
    <svg viewBox="0 0 565 274" role="img" aria-label={t("Documente și decizii în așteptare pe departament")}>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="45" x2="533" y1={30+i*44} y2={30+i*44} stroke="var(--px-chart-grid, #dce5ed)" strokeDasharray="2 4"/><text x="34" y={34+i*44} textAnchor="end">{number(max*(1-i/4))}</text></g>)}
      {items.map((item,i)=>{const x=49+step*(i+.5),w=Math.min(29,step*.3);return <g key={item.name} role="button" tabIndex={0} aria-label={t("{p0}: {p1} documente, {p2} decizii. Filtrează departamentul.", {p0:label(item.name),p1:item.total,p2:item.pending})} onClick={()=>onPick(item.name)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(item.name);}}} className="px-svg-button">
        <rect x={x-step*.44} y="17" width={step*.88} height="222" rx="4" fill={selected.includes(item.name)?'var(--px-chart-selection, #dfecf7)':'transparent'}/>
        <rect x={x-w-2} y={206-item.total/max*176} width={w} height={item.total/max*176} fill={BLUE}/><rect x={x+2} y={206-item.pending/max*176} width={w} height={item.pending/max*176} fill={RED}/>
        <text x={x-w/2-2} y={198-item.total/max*176} textAnchor="middle" className="px-point-label">{item.total}</text><text x={x+w/2+2} y={198-item.pending/max*176} textAnchor="middle" className="px-point-label">{item.pending}</text>
        <text x={x} y="228" textAnchor="middle">{label(item.name).length>16?label(item.name).slice(0,14)+'…':label(item.name)}</text><title>{label(item.name)} {t("· click pentru filtrare")}</title>
      </g>;})}
    </svg><footer>{t("Selectează un departament pentru a filtra întregul panou.")}</footer>
  </div>;
}

export function ExposureChart({rows,today,currency,onOpen}:{rows:ReportRow[];today:string;currency:string;onOpen:(id:string)=>void}){
  useLanguage();
  const [hover,setHover]=useState<string|null>(null);
  const points=rows.filter(r=>r.currency===currency&&r.value!=null&&ageDays(r.date,today)!==null);
  if(!points.length)return <EmptyChart/>;
  const days=(r:ReportRow)=>ageDays(r.date,today)!;
  const min=Math.min(-30,Math.floor(Math.min(...points.map(days))/30)*30),max=Math.max(90,Math.ceil(Math.max(...points.map(days))/30)*30);
  const valueMax=Math.max(1000,Math.ceil(Math.max(...points.map(r=>r.value!))/10000)*10000),x=(n:number)=>62+(n-min)/(max-min)*440,y=(n:number)=>211-n/valueMax*160;
  const color=(r:ReportRow)=>!r.validated||r.status==='archived'?'#a5b2bf':days(r)<0?RED:days(r)<=30?GOLD:BLUE;
  const current=points.find(p=>p.id===hover);
  return <div className="px-exposure"><div className="px-chart-legend"><span><i style={{background:BLUE}}/>{t("&gt; 30 zile")}</span><span><i style={{background:GOLD}}/>{t("≤ 30 zile")}</span><span><i style={{background:RED}}/>{t("Depășite")}</span><span><i style={{background:'#a5b2bf'}}/>{t("Nevalidate / arhivate")}</span></div>
    <svg viewBox="0 0 565 274" role="img" aria-label={t("Expunerea contractelor în {p0}: valoare versus zile până la scadență", {p0:currency})}>
      <rect x={x(min)} y="40" width={x(0)-x(min)} height="171" fill="var(--px-chart-danger, #f8eaed)"/><rect x={x(0)} y="40" width={x(30)-x(0)} height="171" fill="var(--px-chart-warning, #fbf4e4)"/>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="61" x2="517" y1={51+i*40} y2={51+i*40} stroke="var(--px-chart-grid, #dce5ed)" strokeDasharray="2 4"/><text x="51" y={55+i*40} textAnchor="end">{number(valueMax*(1-i/4)/1000)}{t("k")}</text></g>)}
      {[min,0,30,Math.round(max/2),max].filter((v,i,a)=>a.indexOf(v)===i).map(day=><g key={day}><line x1={x(day)} x2={x(day)} y1="40" y2="211" stroke={day===0?'#c68f97':'var(--px-chart-grid, #e4ebf0)'} strokeDasharray="3 4"/><text x={x(day)} y="232" textAnchor="middle">{day===0?t("Azi"):day}</text></g>)}
      <text x="63" y="26" className="px-axis-caption">{t("Valoare · mii")}{' '}{currency}</text><text x="290" y="257" textAnchor="middle">{t("Zile până la scadență")}</text>
      {points.map(r=><circle key={r.id} cx={x(days(r))} cy={y(r.value!)} r={hover===r.id?10:7} fill={color(r)} fillOpacity=".8" stroke="white" strokeWidth="1.5" tabIndex={0} role="button" aria-label={t("{p0}, {p1}, {p2} zile. Deschide documentul.", {p0:readableText(r.title),p1:amount(r.value!,currency),p2:days(r)})} onMouseEnter={()=>setHover(r.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(r.id)} onBlur={()=>setHover(null)} onClick={()=>r.document_id&&onOpen(r.document_id)} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&r.document_id){e.preventDefault();onOpen(r.document_id);}}}><title>{t("{p0} · {p1} · {p2} zile", {p0:readableText(r.title),p1:amount(r.value!,currency),p2:days(r)})}</title></circle>)}
    </svg><footer>{current?t("{p0} · {p1}", {p0:readableText(current.title),p1:amount(current.value!,currency)}):t("Fiecare punct este un contract. Selectează-l pentru documentul sursă.")}</footer>
  </div>;
}

export function CategoryMatrix({rows,onPick}:{rows:ReportRow[];onPick:(department:string,category:string)=>void}){
  useLanguage();
  const departments=groups(rows,'department'),categories=groups(rows,'category').slice(0,6),max=Math.max(1,...departments.flatMap(d=>categories.map(c=>rows.filter(r=>r.department===d.name&&r.category===c.name).length)));
  if(!rows.length)return <EmptyChart/>;
  return <div className="px-matrix-wrap"><table className="px-matrix"><thead><tr><th>{t("Departament")}</th>{categories.map(c=><th key={c.name}>{label(c.name)}</th>)}</tr></thead><tbody>{departments.map(d=><tr key={d.name}><th>{label(d.name)}</th>{categories.map(c=>{const value=rows.filter(r=>r.department===d.name&&r.category===c.name).length;return <td key={c.name}><button style={{background:value?`rgba(45,132,199,${.12+value/max*.78})`:'var(--px-subtle, #f0f4f7)',color:value/max>.5?'white':'var(--px-matrix-ink, #31536f)'}} onClick={()=>onPick(d.name,c.name)} aria-label={t("{p0}, {p1}: {p2} documente", {p0:label(d.name),p1:label(c.name),p2:value})}>{value||'—'}</button></td>;})}</tr>)}</tbody></table><footer>{t("Primele 6 categorii · selectează o celulă pentru filtrare.")}</footer></div>;
}

export function StatusChart({rows,onPick}:{rows:ReportRow[];onPick:(value:string)=>void}){
  useLanguage();
  const items=groups(rows,'status'),colors=items.map(item=>({approved:TEAL,signed:'#216c62',in_review:BLUE,draft:GOLD,archived:'#92a1b0',rejected:RED,cancelled:'#92a1b0',completed:TEAL,pending:GOLD}[item.name]||BLUE));let offset=0;
  if(!rows.length)return <EmptyChart/>;
  const segments=items.map((s,i)=>{const start=offset;offset+=s.value/rows.length*100;return `${colors[i%colors.length]} ${start}% ${offset}%`;});
  return <div className="px-status-chart"><div className="px-status-ring" role="img" aria-label={items.map(s=>`${label(s.name)} ${s.value}`).join(', ')} style={{background:`conic-gradient(${segments.join(',')})`}}><div><strong>{rows.length}</strong><span>{t("înregistrări")}</span></div></div><div className="px-status-legend">{items.map((item,i)=><button key={item.name} onClick={()=>onPick(item.name)}><i style={{background:colors[i%colors.length]}}/><span>{label(item.name)}</span><strong>{item.value}</strong><small>{Math.round(item.value/rows.length*100)}%</small></button>)}</div></div>;
}

export function RankingChart({items,onPick,unit='înregistrări'}:{items:{name:string;value:number}[];onPick:(value:string)=>void;unit?:string}){
  useLanguage();
  if(!items.length)return <EmptyChart/>;const max=Math.max(1,...items.map(i=>i.value));
  return <div className="px-ranking">{items.slice(0,7).map((item,i)=><button key={item.name} onClick={()=>onPick(item.name)}><div><span><small>{String(i+1).padStart(2,'0')}</small><PersonReference name={label(item.name)} embedded/></span><b>{number(item.value)} <small>{unit}</small></b></div><i><span style={{width:`${item.value/max*100}%`,background:i===0?BLUE:i===1?'#7db8e4':'#a4cbe9'}}/></i></button>)}</div>;
}
