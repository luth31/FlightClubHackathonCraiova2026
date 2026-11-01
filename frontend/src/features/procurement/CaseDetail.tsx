import {t,useLanguage} from '@/i18n';
import {useContext,useEffect,useRef,useState} from 'react';
import {ErrorMessage,Loading,Status,ViewActiveContext} from '@/components/ui';
import {date,time} from '@/utils/format';
import {getCase,ProcurementError,procurementApi} from './api';
import {AllocationForm,AssociationForm,CaseForm,DecisionForm,LinkForm,PaymentForm,type Decision} from './CaseForms';
import {amount,stageLabels,type CaseDetailData,type CaseMutation,type Payment,type TemplateCatalog,type WorkspaceProps} from './types';
import {CaseGuide} from './CaseGuide';
import {UploadDialog} from '@/features/documents/UploadDialog';

const events:Record<string,string>={created:'Dosar creat',updated:'Dosar actualizat',advance:'Etapă confirmată',return:'Dosar returnat',cancel:'Dosar anulat',reopen:'Dosar redeschis',document_attached:'Document asociat',document_refreshed:'Dovadă actualizată',document_removed:'Document eliminat',link_created:'Relație înregistrată',link_removed:'Relație eliminată',allocation_saved:'Alocare înregistrată',allocation_removed:'Alocare eliminată',payment:'Plată înregistrată',refund:'Rambursare înregistrată',reversal:'Înregistrare corectată'};
Object.assign(events,{evidence_attached:'Document asociat',evidence_refreshed:'Dovadă actualizată',evidence_removed:'Document eliminat',link_confirmed:'Relație confirmată',allocation_confirmed:'Alocare confirmată',legacy_imported:'Dosar importat'});
const paymentLabels:Record<string,string>={payment:'Plată',refund:'Rambursare',reversal:'Stornare',correction_reversal:'Stornare'};
const checklist=[{label:'Necesitate și specificații',groups:[['necessity'],['specifications']]},{label:'Angajament principal',groups:[['contract','purchase_order']]},{label:'Livrare și recepție',groups:[['inbound_delivery','service_report'],['acceptance']]},{label:'Facturi și acoperire',groups:[['invoice']]}];
const decimal=(value:unknown)=>{const [whole,fraction='']=String(value).split('.');return `${whole}.${fraction.padEnd(2,'0')}`};
type AdvancedTab = 'documents'|'relations'|'finance'|'history';
function acknowledged(before:CaseDetailData,after:CaseDetailData,suffix:string,body:Record<string,unknown>|undefined) {
  if(!body)return false;
  if(suffix==='/payments')return after.payments.some(entry=>!before.payments.some(old=>old.id===entry.id)&&entry.invoice_id===body.invoice_id&&entry.invoice_version===body.invoice_version&&entry.kind===body.kind&&entry.reference===body.reference&&entry.date===body.date&&decimal(entry.amount)===decimal(body.amount));
  if(suffix.endsWith('/reverse'))return after.payments.some(entry=>!before.payments.some(old=>old.id===entry.id)&&suffix===`/payments/${encodeURIComponent(entry.reversed_entry_id||'')}/reverse`&&entry.reference===body.reference&&entry.date===body.date);
  if(suffix==='/actions')return after.history.some(entry=>!before.history.some(old=>old.id===entry.id)&&entry.action===body.action&&entry.from_stage===before.stage&&entry.comment===(body.comment||'')&&(body.action!=='return'||entry.to_stage===body.target_stage));
  return false;
}
export function CaseDetail({id,catalog,user,onBack,onSaved,onOpen,onChanged,notify,revision=0}: WorkspaceProps&{id:string;catalog:TemplateCatalog;onBack:()=>void;onSaved:()=>void}) {
  useLanguage();
  const [item,setItem]=useState<CaseDetailData>(),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[edit,setEdit]=useState(false),[decision,setDecision]=useState<Decision>(),[correction,setCorrection]=useState<Payment>();
  const sequence=useRef(0),current=useRef<CaseDetailData | undefined>(undefined),mutationBusy=useRef(false),pending=useRef(new Map<string,CaseDetailData>());
  const [advanced,setAdvanced]=useState(false),[advancedTab,setAdvancedTab]=useState<AdvancedTab>('documents'),[upload,setUpload]=useState(''),[uploadTypes,setUploadTypes]=useState<string[]>([]),advancedPanel=useRef<HTMLDetailsElement>(null);
  const viewActive=useContext(ViewActiveContext),extracting=!!item?.documents.some(doc=>['queued','processing'].includes(doc.extraction_status||''));
  useEffect(()=>{if(!viewActive)return;let active=true;const request=++sequence.current;getCase(id).then(data=>{if(active&&request===sequence.current){current.current=data;setItem(data);setError('')}}).catch(error=>{if(active&&request===sequence.current)setError(error.message)});return()=>{active=false}},[id,revision,refresh,viewActive]);
  useEffect(()=>{if(!viewActive||!extracting)return;const timer=window.setInterval(()=>{if(!document.hidden&&!mutationBusy.current)setRefresh(value=>value+1)},2500);return()=>window.clearInterval(timer)},[viewActive,extracting]);
  const mutate:CaseMutation=async(suffix,method,body)=>{
    const key=JSON.stringify([suffix,method,body]),detail=pending.current.get(key)||current.current;if(!detail)throw new Error('Dosarul se încarcă.');
    if(mutationBusy.current)throw new Error('Așteaptă finalizarea operației curente, apoi reîncearcă.');
    mutationBusy.current=true;++sequence.current;
    try {
      const path=`/cases/${encodeURIComponent(id)}${suffix}${method==='DELETE'?`?revision=${detail.revision}`:''}`;
      const data=await procurementApi<CaseDetailData>(path,{method,...(method!=='DELETE'?{body:JSON.stringify({...body,revision:detail.revision})}:{})});
      pending.current.delete(key);current.current=data;setItem(data);setError('');onSaved();onChanged();notify('Dosarul a fost actualizat.');return data;
    } catch(error) {
      if(error instanceof ProcurementError&&error.status===409) {
        try {
          const fresh=await getCase(id);current.current=fresh;setItem(fresh);
          if(acknowledged(detail,fresh,suffix,body)){pending.current.delete(key);setError('');onSaved();onChanged();notify('Operația a fost deja înregistrată.');return fresh}
          if(suffix==='/actions'&&fresh.stage!==detail.stage)pending.current.set(key,detail);else pending.current.delete(key);
        }catch{setError('Nu am putut reîncărca versiunea curentă a dosarului.');}
      }else if(!(error instanceof ProcurementError)||error.status>=500)pending.current.set(key,detail);
      throw error;
    } finally {mutationBusy.current=false}
  };
  async function quick(suffix:string,method:string,body?:Record<string,unknown>) {try{await mutate(suffix,method,body)}catch(error){setError((error as Error).message)}}
  if(!item)return <section className="proc-detail"><button className="text-button" onClick={onBack}>{t("← Toate dosarele")}</button>{error?<ErrorMessage message={error} retry={()=>setRefresh(value=>value+1)}/>:<Loading/>}</section>;
  const title=(documentId:string)=>item.documents.find(doc=>doc.document_id===documentId)?.title;
  const visibleLinks=item.links.filter(link=>title(link.source_id)&&title(link.target_id)),showFinance=item.balances!==null,showAllocations=showFinance||item.capabilities.can_finance;
  const tabs:{id:AdvancedTab;label:string;count?:number}[]=[{id:'documents',label:'Documente',count:item.documents.length},{id:'relations',label:'Relații',count:visibleLinks.length},...(showFinance?[{id:'finance' as const,label:'Financiar'}]:[]),{id:'history',label:'Istoric',count:item.history.length}];
  const selectedTab=advancedTab==='finance'&&!showFinance?'documents':advancedTab;
  const tabId=(tab:AdvancedTab)=>`proc-${id}-tab-${tab}`,panelId=(tab:AdvancedTab)=>`proc-${id}-panel-${tab}`;
  return <section className="proc-detail" aria-label={t("Dosar {p0}", {p0:item.number})}>
    <button className="text-button" onClick={onBack}>{t("← Toate dosarele")}</button>
    <header className="proc-detail-header"><div><span className="proc-eyebrow">{item.number}{item.legacy_ref&&t(" · Importat din evidența existentă")}</span><h2>{item.title}</h2><p>{item.description||t("Fără descriere")}</p></div><span className={`proc-stage proc-stage-${item.stage}`}>{t(stageLabels[item.stage]||item.stage,undefined,"procurement")}</span></header>
    {error&&<ErrorMessage message={error} retry={()=>setRefresh(value=>value+1)}/>}
    <div className="proc-summary"><div><small>{t("Responsabil")}</small><strong>{item.owner_name||t("Neatribuit")}</strong></div><div><small>{t("Termen livrare")}</small><strong>{date(item.deadline)}</strong></div><div><small>{t("Angajament principal")}</small><strong>{item.primary_document_id?(title(item.primary_document_id)||'Document cu acces restricționat'):t("Neselectat")}</strong></div>{showFinance&&<div><small>{t("Valoare anticipată, cu TVA")}</small><strong>{amount(item.anticipated_value,item.currency)}</strong></div>}</div>
    <CaseGuide item={item} catalog={catalog} mutate={mutate} onOpen={onOpen} onUpload={(type,alternatives=[])=>{setUploadTypes(alternatives);setUpload(type)}} onAdvance={()=>setDecision('advance')} onReturn={()=>setDecision('return')} onAdvanced={()=>{setAdvanced(true);requestAnimationFrame(()=>advancedPanel.current?.scrollIntoView({block:'start',behavior:'smooth'}))}}/>
    <details ref={advancedPanel} className="proc-advanced" open={advanced} onToggle={event=>setAdvanced(event.currentTarget.open)}><summary><strong>{t("Avansat")}</strong><span>{t("Documente, relații, financiar și istoric")}</span></summary><div className="proc-advanced-content">
    <div className="proc-advanced-toolbar"><span>{t("Etapă curentă:")}{' '}<strong>{t(stageLabels[item.stage]||item.stage,undefined,"procurement")}</strong></span><div className="proc-admin-actions">
      {item.capabilities.can_manage&&<button className="button secondary" onClick={()=>setEdit(true)}>{t("Editează dosarul")}</button>}
      {item.capabilities.can_return&&<button className="button secondary" onClick={()=>setDecision('return')}>{t("Returnează dosarul")}</button>}
      {item.capabilities.can_cancel&&<button className="text-button proc-danger" onClick={()=>setDecision('cancel')}>{t("Anulează dosarul")}</button>}
      {item.capabilities.can_reopen&&<button className="button secondary" onClick={()=>setDecision('reopen')}>{t("Redeschide dosarul")}</button>}
    </div></div>
    <div className="proc-advanced-tabs" role="tablist" aria-label={t("Detalii avansate ale dosarului")}>{tabs.map((tab,index)=><button key={tab.id} type="button" role="tab" id={tabId(tab.id)} aria-controls={panelId(tab.id)} aria-selected={selectedTab===tab.id} tabIndex={selectedTab===tab.id?0:-1} onClick={()=>setAdvancedTab(tab.id)} onKeyDown={event=>{
      let next:number;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      else return;
      event.preventDefault();setAdvancedTab(tabs[next].id);document.getElementById(tabId(tabs[next].id))?.focus();
    }}>{t(tab.label)}{tab.count!==undefined&&<span>{tab.count}</span>}</button>)}</div>
    <section className="proc-section proc-advanced-panel proc-evidence" role="tabpanel" id={panelId('documents')} aria-labelledby={tabId('documents')} tabIndex={0} hidden={selectedTab!=='documents'}><header className="proc-panel-heading"><h3>{t("Documentele dosarului")}</h3><p>{t("Verifică documentele asociate și versiunile folosite în flux.")}</p></header><ul className="proc-checklist">{checklist.map(check=>{
      const complete=check.groups.every(types=>item.documents.some(doc=>types.includes(doc.template_id)&&doc.complete&&!doc.stale&&['approved','signed','archived'].includes(doc.status)));
      return <li key={check.label}><span aria-hidden="true">{complete?'✓':'○'}</span>{t(check.label)}<small>{complete?t("Documente prezente"):t("De verificat")}</small></li>;
    })}</ul>
    {!item.documents.length&&<p className="quiet-note">{t("Niciun document asociat. Încarcă PDF-ul din pasul curent sau alege un document din registru.")}</p>}
    {item.documents.map(doc=><article className={`proc-document ${doc.stale?'proc-stale':''}`} key={doc.document_id}><div><button className="text-button" onClick={()=>onOpen(doc.document_id)}>{doc.title}</button><small>{t(catalog.templates.find(template=>template.id===doc.template_id)?.label||doc.template_id)} · {doc.number} {t("· v")}{doc.version}</small></div><Status value={doc.status}/>{doc.stale&&<p className="proc-warning">{t("Dovadă depășită: versiune asociată v")}{doc.version}{t(", versiune curentă v")}{doc.current_version}{t(". Revizuiește relațiile și alocările după actualizare.")}</p>}{doc.errors.length>0&&<ul className="proc-field-errors">{doc.errors.map((error,index)=><li key={index}>{error}</li>)}</ul>}{item.capabilities.can_manage&&<div className="proc-document-actions">{doc.stale&&<button className="button secondary" onClick={()=>void quick('/documents','POST',{document_id:doc.document_id,version:doc.current_version,template_id:doc.template_id})}>{t("Actualizează la v")}{doc.current_version}</button>}<button className="text-button proc-danger" onClick={()=>void quick(`/documents/${encodeURIComponent(doc.document_id)}`,'DELETE')}>{t("Elimină asocierea")}</button></div>}</article>)}
    {item.capabilities.can_manage&&<details className="proc-form-disclosure"><summary>{t("Asociază un document din registru")}</summary><AssociationForm item={item} catalog={catalog} mutate={mutate}/></details>}
    </section>
    <section className="proc-section proc-advanced-panel" role="tabpanel" id={panelId('relations')} aria-labelledby={tabId('relations')} tabIndex={0} hidden={selectedTab!=='relations'}><header className="proc-panel-heading"><h3>{t("Relații și acoperire")}</h3><p>{t("Legăturile dintre documente și sumele acoperite prin recepții.")}</p></header><div className={`proc-relations-layout ${showAllocations?'':'proc-relations-single'}`}><div><h4>{t("Legături confirmate")}</h4>{!visibleLinks.length&&<p className="quiet-note">{t("Nicio relație confirmată între documente.")}</p>}{visibleLinks.map(link=><article className="proc-link" key={link.id}><strong>{t(catalog.relationships.find(rule=>rule.id===link.type)?.label||link.type)}</strong><p>{title(link.source_id)} {t("· v")}{link.source_version} → {title(link.target_id)} {t("· v")}{link.target_version}</p>{link.stale&&<small className="proc-warning">{t("Relație depășită — elimină și reconfirmă versiunile curente.")}</small>}{item.capabilities.can_manage&&<button className="text-button proc-danger" onClick={()=>void quick(`/links/${encodeURIComponent(link.id)}`,'DELETE')}>{t("Elimină relația")}</button>}</article>)}
    {item.capabilities.can_manage&&<details className="proc-form-disclosure"><summary>{t("Adaugă o relație")}</summary><LinkForm item={item} catalog={catalog} mutate={mutate}/></details>}</div>
    {showAllocations&&<div><h4>{t("Alocări factură–recepție")}</h4>{!item.allocations.length&&<p className="quiet-note">{t("Nicio sumă alocată.")}</p>}{item.allocations.filter(allocation=>title(allocation.invoice_id)&&title(allocation.acceptance_id)).map(allocation=><article className="proc-allocation" key={allocation.id}><strong>{amount(allocation.amount,item.currency)}</strong><p>{title(allocation.invoice_id)} {t("· v")}{allocation.invoice_version} ← {title(allocation.acceptance_id)} {t("· v")}{allocation.acceptance_version}</p>{item.capabilities.can_manage&&<button className="text-button proc-danger" onClick={()=>void quick(`/allocations/${encodeURIComponent(allocation.id)}`,'DELETE')}>{t("Elimină alocarea")}</button>}</article>)}{item.capabilities.can_manage&&<details className="proc-form-disclosure"><summary>{t("Alocă o sumă unei recepții")}</summary><AllocationForm item={item} mutate={mutate}/></details>}</div>}
    </div></section>
    {showFinance&&<section className="proc-section proc-advanced-panel proc-finance" role="tabpanel" id={panelId('finance')} aria-labelledby={tabId('finance')} tabIndex={0} hidden={selectedTab!=='finance'}><header className="proc-panel-heading"><h3>{t("Situația financiară")}</h3><p>{t("Valori cu TVA, calculate pe factură. Plățile istorice se păstrează la schimbarea versiunii.")}</p></header><div className="proc-balances">{([['committed','Angajat'],['accepted','Recepționat'],['invoiced','Facturat brut'],['credited','Credite'],['paid','Plătit net'],['outstanding','Rest de plată'],['overpaid','Supraplată']] as const).map(([key,label])=><div key={key} className={key==='outstanding'?'proc-balance-highlight':undefined}><small>{t(label,undefined,"procurement")}</small><strong>{amount(item.balances![key],item.currency)}</strong></div>)}</div>
    <h4>{t("Solduri pe factură")}</h4>{!item.balances!.invoices.length&&<p className="quiet-note">{t("Nicio factură asociată.")}</p>}
    <div className="proc-table-scroll"><table className="proc-invoice-table"><thead><tr><th>{t("Factură")}</th><th>{t("Brut")}</th><th>{t("Credit")}</th><th>{t("Net")}</th><th>{t("Plătit")}</th><th>{t("Rest de plată")}</th><th>{t("Supraplată")}</th></tr></thead><tbody>{item.balances!.invoices.map(invoice=><tr key={invoice.document_id}><th>{invoice.title||title(invoice.document_id)||t("Factură cu acces restricționat")}</th>{(['gross','credit','net','paid','outstanding','overpaid'] as const).map(key=><td key={key}>{amount(invoice[key],item.currency)}</td>)}</tr>)}</tbody></table></div>
    {((item.capabilities.can_pay&&decimal(item.balances!.outstanding)!=='0.00')||(item.capabilities.can_refund&&decimal(item.balances!.overpaid)!=='0.00'))&&<details className="proc-form-disclosure"><summary>{t("Înregistrează o plată sau rambursare")}</summary><PaymentForm item={item} mutate={mutate}/></details>}
    <h4>{t("Istoric plăți, rambursări și corecții")}</h4>{!item.payments.length&&<p className="quiet-note">{t("Nicio înregistrare financiară.")}</p>}{item.payments.map(payment=>{
      const reversed=item.payments.some(entry=>entry.reversed_entry_id===payment.id);
      return <article className="proc-payment" key={payment.id}><div><strong>{paymentLabels[payment.kind]||payment.kind} · {amount(payment.amount,item.currency)}</strong><p>{title(payment.invoice_id)||t("Factură cu acces restricționat")} {t("· v")}{payment.invoice_version} · {payment.reference} · {date(payment.date)}</p><small>{payment.actor} · {time(payment.created_at)}{payment.reversed_entry_id?t(" · Corectează o înregistrare anterioară"):''}{reversed?t(" · Înregistrare corectată"):''}</small></div>{item.capabilities.can_finance&&!payment.reversed_entry_id&&!reversed&&<button className="text-button" onClick={()=>setCorrection(payment)}>{t("Corectează înregistrarea")}</button>}</article>;
    })}</section>}
    <section className="proc-section proc-advanced-panel proc-history" role="tabpanel" id={panelId('history')} aria-labelledby={tabId('history')} tabIndex={0} hidden={selectedTab!=='history'}><header className="proc-panel-heading"><h3>{t("Activitatea dosarului")}</h3><p>{t("Decizii, documente și modificări, cu autorul și data fiecărei acțiuni.")}</p></header>{!item.history.length&&<p className="quiet-note">{t("Nicio activitate înregistrată.")}</p>}{item.history.map(event=>{
      const evidence=event.evidence&&typeof event.evidence==='object'&&!Array.isArray(event.evidence)?event.evidence as Record<string,unknown>:{};
      const documents=Object.entries(evidence).filter(([id,version])=>title(id)&&typeof version==='number');
      return <article key={event.id}><div><strong>{t(events[event.action]||event.action)}</strong><small>{event.actor} · {time(event.created_at)}</small></div>{event.from_stage&&event.to_stage&&<p>{t(stageLabels[event.from_stage]||event.from_stage,undefined,"procurement")} → {t(stageLabels[event.to_stage]||event.to_stage,undefined,"procurement")}</p>}{event.comment&&<p>{event.comment}</p>}{documents.length>0&&<ul className="proc-event-evidence">{documents.map(([id,version])=><li key={id}>{title(id)} {t("· v")}{String(version)}</li>)}</ul>}{showFinance&&typeof evidence.committed_value==='string'&&<p>{t("Valoare angajată la decizie:")}{' '}{amount(evidence.committed_value,item.currency)}</p>}</article>;
    })}</section>
    </div></details>
    {upload&&<UploadDialog user={user} destination={{caseId:id,caseTitle:item.title,revision:item.revision,templateId:upload,label:catalog.templates.find(template=>template.id===upload)?.label||'documentul',templateOptions:uploadTypes.length>1?uploadTypes.map(type=>({id:type,label:catalog.templates.find(template=>template.id===type)?.label||type})):undefined}} onFailure={()=>setRefresh(value=>value+1)} onClose={()=>{setUpload('');setRefresh(value=>value+1)}} onCreated={doc=>{setUpload('');setRefresh(value=>value+1);onSaved();onChanged();notify('PDF-ul a fost adăugat în dosar. Verifică valorile extrase.');onOpen(doc.id)}}/>}
    {edit&&<CaseForm item={item} owners={item.owners} onClose={()=>setEdit(false)} onSaved={async body=>{await mutate('','PATCH',body);setEdit(false)}}/>}
    {decision&&<DecisionForm item={item} stages={catalog.stages} action={decision} mutate={mutate} onClose={()=>setDecision(undefined)}/>}
    {correction&&<DecisionForm item={item} stages={catalog.stages} payment={correction} mutate={mutate} onClose={()=>setCorrection(undefined)}/>}
  </section>;
}
