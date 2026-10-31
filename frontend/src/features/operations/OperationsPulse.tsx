import {useEffect,useState} from 'react';
import {ArrowRight,Plane} from 'lucide-react';
import {api} from '@/services/api-client';
import type {LedgerMetrics} from './types';
import './pulse.css';
export function OperationsPulse({onOpen}:{onOpen:()=>void}) {
  const [data,setData]=useState<{metrics:LedgerMetrics;reference_date:string}>();
  useEffect(()=>{let disposed=false;const controller=new AbortController();async function load(){try{const result=await api<{metrics:LedgerMetrics;reference_date:string}>('/operations/summary',{signal:controller.signal});if(!disposed&&result.metrics)setData(result)}catch{/* The document workspace remains available if operations cannot load. */}}void load();const timer=setInterval(()=>{if(!document.hidden)void load()},15000);return()=>{disposed=true;controller.abort();clearInterval(timer)}},[]);
  if(!data)return null;
  return <section className="operations-pulse" aria-label="Situație operațională"><div className="pulse-title"><span><Plane size={23}/></span><div><strong>Aeroportul, dincolo de documente.</strong><small>Ultimele 7 zile + tura demonstrativă curentă</small></div></div><div className="pulse-kpi"><strong>{data.metrics.on_time_percent==null?'—':`${data.metrics.on_time_percent}%`}</strong><span>Plecări la timp</span></div><div className="pulse-kpi"><strong>{data.metrics.delay_minutes}<small> min</small></strong><span>Întârziere cumulată</span></div><div className={`pulse-kpi ${data.metrics.open_risks?'attention':''}`}><strong>{data.metrics.open_risks}</strong><span>Riscuri deschise</span></div><button onClick={onOpen}>Vezi operațiunile<ArrowRight size={16}/></button></section>;
}
