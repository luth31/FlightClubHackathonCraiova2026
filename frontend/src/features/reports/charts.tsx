import {t,useLanguage} from '@/i18n';
import {useId, useState} from 'react';
import type {Breakdown, ReportData} from './types';
import {label} from './labels';

export function ActivityChart({data}: {data:ReportData['activity']}) {
  useLanguage();
  const gradient=useId().replace(/:/g,'');
  const [active,setActive]=useState<number|null>(null);
  const maximum=Math.max(4,...data.items.map(v=>v.value));
  const x=(i:number)=>38+i*48;
  const y=(v:number)=>172-v/maximum*134;
  const path=data.items.map((v,i)=>`${i?'L':'M'}${x(i)} ${y(v.value)}`).join(' ');
  if (!data.total) return <div className="bi-empty"><strong>{t("Nicio înregistrare nouă în acest interval.")}</strong><span>{t("Încearcă o perioadă mai lungă sau ajustează filtrele.")}</span></div>;
  return <div className="rp-activity-chart"><svg viewBox="0 0 600 216" role="img" aria-label={t("Activitate între {p0} și {p1}: {p2} înregistrări noi.", {p0:data.start,p1:data.end,p2:data.total})}>
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--rp-accent)" stopOpacity=".26"/><stop offset="1" stopColor="var(--rp-accent)" stopOpacity="0"/></linearGradient></defs>
    {[0,1,2,3].map(i=><g key={i}><line x1="38" x2="576" y1={38+i*45} y2={38+i*45} className="rp-chart-grid"/><text x="27" y={42+i*45} textAnchor="end" className="rp-chart-label">{Math.round(maximum*(1-i/3))}</text></g>)}
    <path d={`${path} L566 173 L38 173 Z`} fill={`url(#${gradient})`}/><path d={path} fill="none" stroke="var(--rp-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
    {data.items.map((v,i)=><g key={v.date}>{i%2===0&&<text x={x(i)} y="199" textAnchor="middle" className="rp-chart-label">{v.date.slice(5).split('-').reverse().join('.')}</text>}<rect x={x(i)-22} y="17" width="45" height="162" fill="transparent" onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)}/>{active===i&&<g pointerEvents="none"><line x1={x(i)} x2={x(i)} y1="27" y2="174" className="rp-chart-grid" strokeDasharray="4 4"/><circle cx={x(i)} cy={y(v.value)} r="5" fill="var(--rp-accent)" stroke="white" strokeWidth="2"/><rect x={Math.max(40,Math.min(492,x(i)-37))} y={Math.max(6,y(v.value)-37)} width="76" height="26" rx="5" fill="#253043"/><text x={Math.max(78,Math.min(530,x(i)+1))} y={Math.max(23,y(v.value)-20)} textAnchor="middle" fill="white" fontSize="10">{v.value} {t("noi")}</text></g>}</g>)}
  </svg><div className="rp-chart-foot"><span><i/>{t("Înregistrări create în interval")}</span><span>{data.start} — {data.end}</span></div></div>;
}

export function DonutChart({breakdown,onFilter}: {breakdown:Breakdown;onFilter?:(name:string)=>void}) {
  useLanguage();
  const total=breakdown.items.reduce((n,i)=>n+i.value,0);
  let offset=0;
  const slices=breakdown.items.map((item,i)=>{const from=offset;offset+=total?item.value/total*100:0;return `var(--rp-chart-${i%6}) ${from}% ${offset}%`;});
  return <div className="rp-donut-section"><div className="rp-donut" style={{background:total?`conic-gradient(${slices.join(',')})`:'var(--rp-line)'}} role="img" aria-label={breakdown.items.map(i=>`${label(i.name)}: ${i.value}`).join(', ')||t("Nu există date")}><div><strong>{total.toLocaleString('ro-RO')}</strong><small>{t("înregistrări")}</small></div></div><div className="rp-donut-legend">{breakdown.items.slice(0,8).map((item,i)=><button disabled={!onFilter} key={item.name} onClick={()=>onFilter?.(item.name)}><span><i style={{background:`var(--rp-chart-${i%6})`}}/>{label(item.name)}</span><strong>{item.value}<small>{total?Math.round(item.value/total*100):0}%</small></strong></button>)}{!total&&<p>{t("Nu există date în domeniul selectat.")}</p>}</div></div>;
}

export function RankingChart({breakdown,onFilter}: {breakdown:Breakdown;onFilter?:(name:string)=>void}) {
  useLanguage();
  const max=Math.max(1,...breakdown.items.map(i=>i.value));
  return <div className="rp-ranking">{breakdown.items.slice(0,7).map((item,i)=><button key={item.name} disabled={!onFilter} onClick={()=>onFilter?.(item.name)}><div><span><i style={{background:`var(--rp-chart-${i%6})`}}/>{label(item.name)}</span><strong>{item.value}</strong></div><div className="rp-ranking-track"><span style={{width:`${item.value/max*100}%`,background:`var(--rp-chart-${i%6})`}}/></div></button>)}{!breakdown.items.length&&<p className="rp-no-chart">{t("Nu există înregistrări în această selecție.")}</p>}</div>;
}
