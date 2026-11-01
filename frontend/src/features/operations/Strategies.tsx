import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpen,Check,ChevronRight,FileText,GitBranch,LoaderCircle,LockKeyhole,RefreshCw,Search,Share2,ShieldCheck,Sparkles} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading,Status} from '@/components/ui';
import {documentHref} from '@/services/navigation';
import {ShareDialog} from '@/features/sharing';
import type {DocumentRecord} from '@/types';
import type {AnalysisData,ProcedureLibrary,Recommendation,StrategyAnalysis} from './procedures-types';
import {ProcedureReader} from './ProcedureReader';
import {LedgerMetricCards} from './Ledger';
import {dayLabel,shortTime} from './format';
import type {LedgerEvidenceTarget} from './types';

export function Strategies({revision,onEvidence,notify,active=true}:{revision:number;onEvidence:(target:LedgerEvidenceTarget)=>void;notify:(message:string)=>void;active?:boolean}) {
  useLanguage();
  const [library,setLibrary]=useState<ProcedureLibrary>(),[data,setData]=useState<AnalysisData>();
  const [tab,setTab]=useState<'library'|'analysis'>('library'),[query,setQuery]=useState(''),[area,setArea]=useState('');
  const [selected,setSelected]=useState<string|null>(null),[share,setShare]=useState<DocumentRecord>();
  const [error,setError]=useState(''),[busy,setBusy]=useState(''),[refresh,setRefresh]=useState(0);
  const pending=useRef(false);
  const evidenceOrigin=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(!active||!evidenceOrigin.current)return;const button=evidenceOrigin.current;const frame=window.requestAnimationFrame(()=>{button.scrollIntoView({block:'center'});button.focus({preventScroll:true});evidenceOrigin.current=null});return()=>window.cancelAnimationFrame(frame)},[active]);
  useEffect(()=>{const controller=new AbortController();let disposed=false;
    if(!active)return;
    Promise.allSettled([api<ProcedureLibrary>('/operations/sops',{signal:controller.signal}),api<AnalysisData>('/operations/strategy-analysis',{signal:controller.signal})]).then(([catalog,analysis])=>{if(disposed)return;if(catalog.status==='fulfilled')setLibrary(catalog.value);if(analysis.status==='fulfilled')setData(analysis.value);if(catalog.status==='rejected')setError((catalog.reason as Error).message);else if(analysis.status==='rejected')setError((analysis.reason as Error).message)});
    return()=>{disposed=true;controller.abort()};
  },[revision,refresh,active]);
  useEffect(()=>{if(!active||!data?.running||busy==='analysis')return;const timer=setTimeout(()=>setRefresh(value=>value+1),2500);return()=>clearTimeout(timer)},[data?.running,busy,refresh,active]);
  async function analyze(){if(pending.current)return;pending.current=true;setBusy('analysis');setError('');setTab('analysis');try{
    const result=await api<{analysis:StrategyAnalysis;cached:boolean}>('/operations/strategy-analysis',{method:'POST'});
    setData(current=>current?{...current,running:false,analysis:result.analysis}:current);setRefresh(value=>value+1);notify(result.cached?'Analiza salvată corespunde acestor date.':'Analiza Luna este gata de verificare.');
  }catch(e){setError((e as Error).message)}finally{pending.current=false;setBusy('')}}
  async function draft(code:string,item?:Recommendation){if(pending.current)return;pending.current=true;setBusy(item?.id||code);setError('');try{
    const path=item?`/operations/strategy-analysis/${data!.analysis!.id}/recommendations/${item.id}/draft`:`/operations/sops/${encodeURIComponent(code)}/draft`;
    await api<{document_id:string}>(path,{method:'POST'});setRefresh(value=>value+1);notify('Ciornă SOP creată. Documentul are o sarcină de validare și urmează fluxul de avizare.');
  }catch(e){setError((e as Error).message)}finally{pending.current=false;setBusy('')}}
  async function openShare(id:string){if(pending.current)return;pending.current=true;setBusy('share');try{const doc=await api<DocumentRecord>(`/documents/${encodeURIComponent(id)}`);setSelected(null);setShare(doc)}catch(e){setError((e as Error).message)}finally{pending.current=false;setBusy('')}}
  const selectedProcedure=library?.items.find(item=>item.code===selected);
  const shown=library?.items.filter(item=>(!area||item.area===area)&&`${item.code} ${item.title} ${item.purpose}`.toLocaleLowerCase('ro').includes(query.toLocaleLowerCase('ro')));
  const analysis=data?.analysis;
  return <section className="ops-strategies sop-workspace">
    <div className="sop-heading"><div><h2>{t("Proceduri care învață din operațiuni")}</h2><p>{t("Observă abaterea. Îmbunătățește procedura. Împărtășește practica.")}</p></div>{data?.can_analyze&&<button className="button primary" disabled={!!busy||data.running||!data.configured||!data.evidence_count} onClick={()=>void analyze()}>{busy==='analysis'?<LoaderCircle size={17} className="spin"/>:<Sparkles size={17}/>}{t("Analizează cu Luna")}</button>}</div>
    <nav className="sop-tabs" aria-label={t("Proceduri și optimizare")}><button aria-pressed={tab==='library'} onClick={()=>setTab('library')}><BookOpen size={18}/>{t("Bibliotecă SOP")}{library&&<span>{library.items.length}</span>}</button><button aria-pressed={tab==='analysis'} onClick={()=>setTab('analysis')}><Sparkles size={18}/>{t("Strategii și optimizare")}{analysis&&<span>{analysis.recommendations.length}</span>}</button></nav>
    {error&&<ErrorMessage message={error}/>}{(!library||!data)&&!error&&<Loading/>}
    {tab==='library'&&library&&<>
      <div className="sop-library-controls"><label><Search size={18}/><input aria-label={t("Caută proceduri SOP")} placeholder={t("Caută o procedură sau un cod…")} value={query} onChange={event=>setQuery(event.target.value)}/></label><select aria-label={t("Domeniu SOP")} value={area} onChange={event=>setArea(event.target.value)}><option value="">{t("Toate domeniile")}</option>{[...new Set(library.items.map(item=>item.area))].map(value=><option key={value} value={value}>{value}</option>)}</select></div>
      <div className="sop-library-grid">{shown?.map(item=>{const approved=item.documents.find(doc=>['approved','signed'].includes(doc.status));return <button className="sop-library-card" key={item.code} onClick={()=>setSelected(item.code)}><header><span>{item.code}</span><span>{item.area}</span></header><h3>{item.title}</h3><p>{item.purpose}</p><footer><span>{approved?<><Check size={15}/>{t("Document aprobat")}</>:item.documents.length?<><FileText size={15}/>{t("În lucru ·")}{' '}{item.documents.length} {t("documente")}</>:<><BookOpen size={15}/>{item.steps.length} {t("pași · model de lucru")}</>}</span><ChevronRight size={18}/></footer></button>})}</div>
      {!shown?.length&&<div className="ops-ledger-empty"><Search size={24}/><h3>{t("Nicio procedură pentru aceste filtre")}</h3><button onClick={()=>{setQuery('');setArea('')}}>{t("Resetează filtrele")}</button></div>}
      <aside className="sop-partner-note"><Share2 size={22}/><div><h3>{t("O practică bună poate ajuta și")}{' '}{library.partner.name}</h3><p>{library.can_share?t("Deschide o procedură, alege documentul aprobat și pregătește copia pentru partener. Controlezi destinatarul, expirarea și revocarea."):t("Partajarea este autorizată de director sau de responsabilul de conformitate, după avizarea documentului.")}</p></div><LockKeyhole size={18}/></aside>
    </>}
    {tab==='analysis'&&data&&<>
      <div className="sop-analysis-context"><span><GitBranch size={18}/>{(analysis?.period||data.period).from} — {(analysis?.period||data.period).to}</span><span>{analysis?.evidence_count??data.evidence_count} {t("evenimente selectate pentru analiză")}</span><span><ShieldCheck size={16}/>{t("Revizuire umană")}</span></div>
      <LedgerMetricCards metrics={analysis?.baseline||data.baseline} caption={analysis?'la momentul analizei':'perioada analizată'}/>
      {(busy==='analysis'||data.running)&&<div className="sop-analyzing" role="status"><LoaderCircle size={24} className="spin"/><div><strong>{t("Luna corelează registrul cu procedurile…")}</strong><p>{t("Verifică tiparele, responsabilitățile și opțiunile de pilot. Poți continua să consulți biblioteca.")}</p></div></div>}
      {!data.configured&&<p className="sop-notice">{t("Luna nu este conectată pe acest server. Biblioteca și documentele locale rămân disponibile.")}</p>}
      {!data.can_analyze&&<p className="sop-notice"><LockKeyhole size={16}/>{t("Analizele sunt inițiate de director sau de conformitate. Poți consulta rezultatele salvate.")}</p>}
      {analysis?<>
        <div className="sop-analysis-summary"><header><span><Sparkles size={18}/>{t("Analiză Luna")}</span><small>{new Date(analysis.created_at).toLocaleString('ro-RO')} · {analysis.model}</small></header><p>{analysis.summary}</p>{analysis.stale&&<div className="sop-stale"><RefreshCw size={16}/>{t("Registrul sau procedurile s-au schimbat. Aceasta este analiza datelor salvate.")}</div>}</div>
        {analysis.recommendations.map(item=><article className="sop-recommendation" key={item.id}>
          <header><span className={`sop-priority ${item.priority}`}>{item.priority==='high'?t("Prioritate ridicată"):item.priority==='medium'?t("Prioritate medie"):t("De urmărit")}</span><span>{item.kind==='new'?t("Procedură nouă"):t("Revizie propusă")} · {item.sop_code}</span></header>
          <h3>{item.title}</h3><p>{item.problem}</p>
          <div className="sop-proposed-rule"><span>{t("Schimbarea propusă")}</span><p>{item.proposed_rule}</p></div>
          <details className="sop-support"><summary>{t("De ce merită testată schimbarea?")}</summary><p className="sop-rationale">{item.rationale}</p><h4>{t("Procedura de referință")}</h4><p>{item.current_rule}</p></details>
          <div className="sop-observed-impact"><strong>{item.impact.observed_delay_minutes} {t("min")}</strong><span>{t("întârziere observată pe")}{' '}{item.impact.completed_departures} {t("plecări citate")}<br/><small>{t("Beneficiul potențial se verifică în pilot.")}</small></span></div>
          <details className="sop-support"><summary>{item.evidence.length} {t("dovezi din registru")}</summary><div className="sop-evidence-list">{item.evidence.map(event=><button key={event.event_id} onClick={click=>{evidenceOrigin.current=click.currentTarget;onEvidence({eventId:event.event_id,groupId:event.group_id})}}><span><strong>{event.callsign} · {event.title}</strong><small>{dayLabel(event.actual_at.slice(0,10))} · {shortTime(event.actual_at)}{event.delay_minutes>0&&t(" · +{p0} min", {p0:event.delay_minutes})}</small></span><ArrowRight size={17}/></button>)}</div></details>
          <details className="sop-support"><summary>{t("Pașii propuși, ipoteze și riscuri")}</summary><ol className="sop-steps">{item.steps.map((step,index)=><li key={index}><span>{index+1}</span><div><header><strong>{step.when}</strong><span><PersonReference name={step.owner}/></span></header><p>{step.action}</p><small>{t("Dovadă:")}{' '}{step.record}</small></div></li>)}</ol><h4>{t("Ipoteze de verificat")}</h4><ul>{item.assumptions.map(value=><li key={value}>{value}</li>)}</ul><h4>{t("Riscuri și condiții")}</h4><ul>{item.risks.map(value=><li key={value}>{value}</li>)}</ul></details>
          <details className="sop-support"><summary>{t("Planul de pilot ·")}{' '}<PersonReference name={item.owner}/></summary><div className="sop-pilot"><h4>{t("Propunere de pilot")}</h4><p>{item.pilot}</p><strong>{t("Criteriu de succes")}</strong><p>{item.success_criteria}</p></div></details>
          <footer><span><ShieldCheck size={16}/>{t("Necesită validare și avizare")}</span>{item.document_id?<a className="button primary" href={documentHref(item.document_id,'operations')}><FileText size={16}/>{t("Deschide ciorna SOP")}<Status value={item.document_status||'draft'}/></a>:data.can_analyze&&<button className="button primary" disabled={!!busy} onClick={()=>void draft(item.sop_code,item)}>{busy===item.id?<LoaderCircle size={16} className="spin"/>:<FileText size={16}/>}{t("Creează ciornă SOP")}</button>}</footer>
        </article>)}
        {!analysis.recommendations.length&&<div className="ops-ledger-empty"><ShieldCheck size={28}/><h3>{t("Nicio modificare susținută de dovezile analizate")}</h3><p>{t("Luna nu a propus schimbări pentru aceste date.")}</p></div>}
        <details className="sop-support sop-analysis-limitations"><summary>{t("Limitele analizei și acoperirea datelor")}</summary><ul>{analysis.limitations.map(value=><li key={value}>{value}</li>)}</ul>{analysis.cohort?<p>{t("Din")}{' '}{analysis.cohort.observed_groups} {t("cazuri observate (")}{analysis.cohort.affected_groups} {t("cu abateri și")}{' '}{analysis.cohort.unaffected_groups} {t("fără abateri), analiza include exemple din")}{' '}{analysis.cohort.selected_affected_groups} {t("cazuri afectate și")}{' '}{analysis.cohort.selected_unaffected_groups} {t("fără abateri. Exemplele oferă context, nu demonstrează cauzalitatea.")}</p>:<p>{t("Analiză anterioară: selecția nu include sistematic cazuri fără abateri. Rulează o analiză nouă pentru comparație.")}</p>}<p>{analysis.evidence_count} {t("evenimente incluse;")}{' '}{analysis.omitted_events} {t("evenimente eligibile neincluse în selecție. Indicatorii sunt calculați pe întreaga perioadă, din plecări realizate. Propunerile nu modifică automat procedurile.")}</p></details>
      </>:busy!=='analysis'&&!data.running&&<div className="sop-analysis-empty"><Sparkles size={34}/><h3>{t("Dintr-o întârziere, o procedură mai bună")}</h3><p>{t("Luna compară indicatorii și evenimentele înregistrate cu biblioteca SOP. Fiecare propunere are dovezi, responsabil și un pilot verificabil.")}</p><span>{t("Analiza pornește doar la cerere. Pentru aceleași date se reutilizează rezultatul salvat.")}</span></div>}
    </>}
    {selectedProcedure&&<ProcedureReader procedure={selectedProcedure} canDraft={!!library?.can_draft} busy={busy} onClose={()=>setSelected(null)} onDraft={()=>void draft(selectedProcedure.code)} onShare={id=>void openShare(id)}/>}
    {share&&<ShareDialog document={share} onClose={()=>setShare(undefined)} onShared={()=>{setShare(undefined);notify('Procedura a fost partajată cu aeroportul partener.');setRefresh(value=>value+1)}}/>}
  </section>;
}
