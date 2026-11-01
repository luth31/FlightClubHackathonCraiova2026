import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useId, useState} from 'react';
import {ArrowUpRight, ChartNoAxesCombined, CircleCheck, Database, FileText, UsersRound, Wallet, ClipboardCheck, ShieldAlert, Network, Wrench, Boxes} from 'lucide-react';
import {label, number} from './labels';
import {readableText} from '@/utils/text';
import type {ReportBriefing, ReportPreview} from './types';

export const REPORT_ICONS = {overview:ChartNoAxesCombined, documents:FileText, contracts:Wallet, approvals:ClipboardCheck, procurement:Boxes, suppliers:ShieldAlert, people:UsersRound, sharing:Network, maintenance:Wrench};
export const CHART_COLORS = ['#257561','#7195af','#c8a464','#8c9ba8'];
export const miniCaptions:Record<string,string> = {overview:'Documente pe stare',documents:'Documente pe categorie',contracts:'Scadențe · contracte nearhivate',approvals:'Sarcini pe stare',procurement:'Documente în etapele achiziției',suppliers:'Verificări pe nivel de risc',people:'Disponibilitatea echipei',sharing:'Starea acceselor partajate',maintenance:'Documente tehnice pe categorie'};

export function PreviewChart({data}: {data:ReportPreview}) {
  useLanguage();
  const nonzero = data.series.filter(s=>s.value>0), sorted=[...nonzero].sort((a,b)=>b.value-a.value);
  const items=sorted.length>4?[...sorted.slice(0,3),{name:'Altele',value:sorted.slice(3).reduce((s,i)=>s+i.value,0)}]:sorted;
  const max=Math.max(1,...items.map(i=>i.value));
  if(data.total&&data.report.id==='procurement')return <div className="db-mini-chart db-mini-stages"><span>{t("Acoperire documentară · etape ale achiziției")}</span><div>{data.series.map((s,i)=><div key={s.name}><small>0{i+1}</small><strong>{s.value}</strong><span>{['Achiziție','Livrare','Recepție','Facturare'][i]}</span></div>)}</div><p>{t("Documente înregistrate pe etapă, nu progresul dosarelor.")}</p></div>;
  if(data.total&&data.report.id==='contracts')return <div className="db-mini-chart db-mini-maturity"><span>{t("Scadențe · contracte nearhivate")}</span><div>{data.series.map((s,i)=><div key={s.name}><b>{s.value}</b><i style={{height:Math.max(2,s.value/max*49),background:['#b7766b','#c4a063','#4f8a76','#96a7b1'][i]}}/><small>{['Depășite','≤ 30 zile','> 30 zile','Fără termen validat'][i]}</small></div>)}</div></div>;
  if(data.total&&['overview','people','approvals'].includes(data.report.id)){
    const positive=data.series.filter(s=>['approved','signed','available','completed'].includes(s.name)).reduce((n,s)=>n+s.value,0);
    const total=data.series.reduce((n,s)=>n+s.value,0);
    const legend=nonzero.length>4?[...nonzero.slice(0,3),{name:'Altele',value:nonzero.slice(3).reduce((n,s)=>n+s.value,0)}]:nonzero;
    const caption=data.report.id==='overview'?'aprobate / semnate':data.report.id==='people'?'disponibilitate':'sarcini finalizate';
    let offset=0;const segments=data.series.map((s,i)=>{const start=offset;offset+=total?s.value/total*100:0;const color=['approved','signed','available','completed'].includes(s.name)?'#3d8069':s.name==='pending'?'#c5a15e':s.name==='away'?'#87a0b2':['#9baeb3','#b79b70','#c4cdcb'][i%3];return `${color} ${start}% ${offset}%`;});
    return <div className="db-mini-chart db-mini-composition"><span>{miniCaptions[data.report.id]}</span><div><div className="db-mini-ring" style={{background:`conic-gradient(${segments.join(',')})`}}><span><strong>{Math.round(positive/Math.max(1,total)*100)}%</strong><small>{caption}</small></span></div><div>{legend.map(s=><span key={s.name}>{label(s.name)}<b>{s.value}</b></span>)}</div></div></div>;
  }
  return <div className="db-mini-chart"><span>{miniCaptions[data.report.id]}</span>{items.length ? <div>{items.map((item,i)=><div key={item.name} className="db-mini-row"><span title={label(item.name)}>{label(item.name)}</span><div><i style={{width:`${item.value/max*100}%`,background:CHART_COLORS[i%4]}}/></div><b>{number(item.value)}</b></div>)}</div>:<div className="db-no-source"><Database size={22}/><strong>{data.report.id==='suppliers'?t("Nicio verificare înregistrată"):data.report.id==='sharing'?t("Niciun document partajat"):t("Nicio înregistrare în acest domeniu")}</strong><small>{data.report.id==='suppliers'?t("Datele apar după prima verificare de furnizor."):data.report.id==='sharing'?t("Datele apar după prima partajare autorizată."):t("Schimbă departamentul sau consultă modulul sursă.")}</small></div>}</div>;
}

export function DailyActivity({timeline}:{timeline:ReportBriefing['timeline']}) {
  useLanguage();
  const [period,setPeriod]=useState(30),[active,setActive]=useState<number|null>(null);
  const id=useId().replace(/:/g,'');
  const points=timeline.slice(-period), top=Math.max(4,...points.flatMap(d=>[d.documents,d.actions]));
  const maximum=Math.ceil(top/4)*4, step=620/points.length;
  const x=(i:number)=>45+step*(i+.5), y=(n:number)=>190-n/maximum*150;
  const line=points.map((d,i)=>`${i?'L':'M'} ${x(i)} ${y(d.actions)}`).join(' ');
  const sum=(field:'documents'|'actions')=>points.reduce((n,d)=>n+d[field],0);
  const current=active!==null?points[active]:undefined;
  const dayLabel=(value:string)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'short'}).format(new Date(value+'T12:00:00'));
  return <section className="db-panel db-activity"><header><div><span className="db-eyebrow">{t("FLUX DOCUMENTAR")}</span><h2>{t("Activitatea echipei")}</h2></div><div className="db-period" aria-label={t("Intervalul activității")}>{[7,30].map(p=><button key={p} aria-pressed={period===p} onClick={()=>{setPeriod(p);setActive(null);}}>{p} {t("zile")}</button>)}</div></header><div className="db-chart-summary"><span><i/>{number(sum('documents'))} <small>{t("documente înregistrate")}</small></span><span><i/>{number(sum('actions'))} <small>{t("acțiuni în jurnal")}</small></span></div>
    <div className="db-timechart"><svg viewBox="0 0 690 225" role="img" aria-label={t("Ultimele {p0} zile: {p1} documente și {p2} acțiuni documentare.", {p0:period,p1:sum('documents'),p2:sum('actions')})}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#6d8ca6" stopOpacity=".13"/><stop offset="1" stopColor="#6d8ca6" stopOpacity="0"/></linearGradient></defs>{[0,1,2,3,4].map(i=><g key={i}><line x1="44" x2="667" y1={40+i*37.5} y2={40+i*37.5} stroke="#e6ebee" strokeDasharray={i===4?'0':'3 4'}/><text x="32" y={44+i*37.5} textAnchor="end">{maximum-i*maximum/4}</text></g>)}<path d={`${line} L ${x(points.length-1)} 190 L ${x(0)} 190 Z`} fill={`url(#${id})`}/>{points.map((d,i)=><g key={d.date}><rect x={x(i)-step*.23} y={y(d.documents)} width={Math.max(3,step*.46)} height={d.documents/maximum*150} rx="3" fill={active===i?'#134d3c':'#2e826b'}/>{(period===7||i%5===0||i===points.length-1)&&<text x={x(i)} y="215" textAnchor="middle">{dayLabel(d.date)}</text>}</g>)}<path d={line} fill="none" stroke="#7596b1" strokeWidth="2.5" strokeLinejoin="round"/>{points.map((d,i)=><rect key={d.date} x={45+step*i} y="22" width={step} height="176" fill="transparent" tabIndex={0} role="img" aria-label={t("{p0}: {p1} documente, {p2} acțiuni", {p0:dayLabel(d.date),p1:d.documents,p2:d.actions})} onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)}><title>{t("{p0} · {p1} documente · {p2} acțiuni", {p0:dayLabel(d.date),p1:d.documents,p2:d.actions})}</title></rect>)}{active!==null&&<line x1={x(active)} x2={x(active)} y1="25" y2="190" stroke="#9caeb8" strokeDasharray="3 4"/>}</svg><div className="db-chart-tooltip" aria-live="polite">{current?<><strong>{dayLabel(current.date)}</strong><span>{current.documents} {t("documente")}</span><span>{current.actions} {t("acțiuni")}</span></>:<span>{t("Explorează graficul pentru detaliile fiecărei zile.")}</span>}</div></div>
    <footer><span>{t("Creări de documente și acțiuni înregistrate · Europe/Bucharest")}</span><span>{dayLabel(points[0].date)} — {dayLabel(points.at(-1)!.date)}</span></footer>
  </section>;
}

export function DeadlinePanel({data,onOpen,onReport}:{data:ReportBriefing;onOpen:(id:string)=>void;onReport:()=>void}) {
  useLanguage();
  const s=data.summary;
  const buckets=[{name:'Depășite',value:s.expired_contracts,color:'#bc6257'},{name:'În 7 zile',value:data.deadlines.filter(d=>d.remaining<=7).length,color:'#bd9250'},{name:'8–30 zile',value:data.deadlines.filter(d=>d.remaining>7).length,color:'#257561'}];
  return <section className="db-panel db-deadline-panel"><header><div><span className="db-eyebrow">{t("CONTINUITATE CONTRACTUALĂ")}</span><h2>{t("Următoarele scadențe")}</h2></div><button className="db-icon-link" onClick={onReport} aria-label={t("Deschide scadențele contractelor")}><ArrowUpRight size={18}/></button></header><div className="db-deadline-count"><strong>{s.expiring_contracts}</strong><div>{t("contracte în următoarele 30 zile")}<small>{s.expired_contracts ? t("{p0} cu termen deja depășit", {p0:s.expired_contracts}):t("Fără termene contractuale depășite")}</small></div></div><div className="db-maturity-legend">{buckets.map(b=><span key={b.name}><i style={{background:b.color}}/>{b.name}<b>{b.value}</b></span>)}</div><div className="db-deadline-items">{data.deadlines.slice(0,3).map(d=><button key={d.id} onClick={()=>d.document_id&&onOpen(d.document_id)}><div><strong>{readableText(d.title).replace(/^Contract\s*[-–]\s*/,'')}</strong><small><PersonReference name={readableText(d.owner)} embedded/> · {d.number}</small></div><span>{d.remaining===0?t("Azi"):t("{p0} zile", {p0:d.remaining})}</span></button>)}{!data.deadlines.length&&<div className="db-inline-empty"><CircleCheck size={20}/><span>{t("Niciun contract validat nu ajunge la scadență în următoarele 30 zile.")}</span></div>}</div><button className="db-text-link" onClick={onReport}>{t("Vezi portofoliul și reînnoirile")}<ArrowUpRight size={14}/></button></section>;
}
