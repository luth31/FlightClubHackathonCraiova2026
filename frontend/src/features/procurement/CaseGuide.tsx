import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,CheckCircle2,FileText,FolderSearch,Link2,LoaderCircle,UploadCloud} from 'lucide-react';
import {ErrorMessage,Status} from '@/components/ui';
import {getDocumentTemplate} from './api';
import {PaymentForm} from './CaseForms';
import {matchesTemplate,RegisterDocumentPicker} from './RegisterDocumentPicker';
import {caseNextHint,evidenceApproved,guideIndex,guideSlots,guideSteps} from './guide';
import {amount,type CaseDetailData,type CaseDocument,type CaseMutation,type DocumentTemplateDetail,type TemplateCatalog} from './types';

type Props={item:CaseDetailData;catalog:TemplateCatalog;mutate:CaseMutation;onOpen:(id:string)=>void;onUpload:(templateId:string,alternativeTypes?:string[])=>void;onAdvance:()=>void;onAdvanced:()=>void;onReturn:()=>void};
function useAction(){const [busy,setBusy]=useState(false),[error,setError]=useState('');return {busy,error,run:async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work()}catch(error){setError((error as Error).message)}finally{setBusy(false)}}}}

function AddEvidence({item,catalog,types,onUpload,mutate}:Pick<Props,'item'|'catalog'|'onUpload'|'mutate'>&{types:string[]}) {
  const [pickerType,setPickerType]=useState('');
  const template=catalog.templates.find(template=>template.id===pickerType);
  const choicesFor=(type:string)=>{const selected=catalog.templates.find(template=>template.id===type);return selected?item.available_documents.filter(doc=>matchesTemplate(doc,selected)):[]};
  const choices=choicesFor(pickerType);
  const multiple=types.length>1;
  return <div className="guide-add-evidence">
    <div className={`guide-add-actions ${multiple?'guide-add-alternatives':''}`}><button type="button" className="button secondary" onClick={()=>onUpload(types[0],multiple?types:undefined)}><UploadCloud size={17}/>{multiple?'Încarcă document':'Încarcă PDF nou'}</button>{types.map(type=>{const label=catalog.templates.find(template=>template.id===type)?.label.toLocaleLowerCase('ro'),count=choicesFor(type).length;return <button type="button" key={type} className="button secondary guide-register-button" onClick={()=>setPickerType(type)}><FolderSearch size={17}/>{multiple?`Alege ${label}`:'Alege din registru'}{count>0&&<span>{count}</span>}</button>})}</div>
    <p className="guide-add-note">{multiple?'Alege un document existent din registru sau încarcă un PDF nou.':'Datele din PDF se extrag automat și se verifică după încărcare.'}</p>
    {pickerType&&template&&<RegisterDocumentPicker documents={choices} template={template} caseTitle={item.title} onClose={()=>setPickerType('')} onSelect={doc=>mutate('/documents','POST',{document_id:doc.id,version:doc.version,template_id:pickerType})}/>}
  </div>;
}

function EvidenceCard({doc,item,mutate,onOpen}:Pick<Props,'item'|'mutate'|'onOpen'>&{doc:CaseDocument}) {
  const action=useAction(),ready=evidenceApproved(doc),refreshable=doc.stale&&item.capabilities.can_manage&&['draft','needs_review'].includes(item.stage)&&(doc.template_id==='invoice'||['approved','signed','archived'].includes(doc.status));
  return <article className={`guide-document ${ready?'is-complete':''}`}>
    <div className="guide-document-name"><FileText size={18}/><div><button className="text-button" onClick={()=>onOpen(doc.document_id)}>{doc.title}</button><small>{doc.number||'Număr de verificat'} · v{doc.current_version}</small></div>{ready?<CheckCircle2 size={18} className="guide-check"/>:<Status value={doc.status}/>}</div>
    {doc.stale&&<p className="proc-warning">Datele au fost actualizate. {refreshable?'Confirmă versiunea curentă pentru dosar.':['draft','needs_review'].includes(item.stage)?'Aprobă versiunea curentă, apoi actualizează documentul din dosar.':'Returnează dosarul în verificare pentru a actualiza documentul.'}</p>}
    {!ready&&<div className="guide-document-actions"><button className="button secondary" onClick={()=>onOpen(doc.document_id)}>{doc.status==='in_review'?'Deschide aprobarea':'Verifică documentul'}<ArrowRight size={15}/></button>{refreshable&&<button className="button secondary" disabled={action.busy} onClick={()=>void action.run(()=>mutate('/documents','POST',{document_id:doc.document_id,version:doc.current_version,template_id:doc.template_id}))}>Actualizează versiunea</button>}</div>}
    {action.error&&<ErrorMessage message={action.error}/>}
  </article>;
}

function SuggestedLink({source,targets,type,label,item,mutate}:Pick<Props,'item'|'mutate'>&{source:CaseDocument;targets:CaseDocument[];type:string;label:string}) {
  const [selected,setSelected]=useState(''),action=useAction();
  const target=targets.find(doc=>doc.document_id===(selected||(targets.length===1?targets[0].document_id:'')));
  return <form className="guide-suggestion" onSubmit={event=>{event.preventDefault();if(target)void action.run(()=>mutate('/links','POST',{source_id:source.document_id,source_version:source.version,target_id:target.document_id,target_version:target.version,type}))}}>
    <Link2 size={17}/><div><strong>{label}</strong><p>{source.title}</p>{targets.length===1?<small>→ {targets[0].title}</small>:<label className="field">Document corespunzător<select value={selected} required onChange={event=>setSelected(event.target.value)}><option value="">Alege documentul corespunzător</option>{targets.map(doc=><option key={doc.document_id} value={doc.document_id}>{doc.title}</option>)}</select></label>}</div>
    <button className="button secondary" disabled={!item.capabilities.can_manage||!target||action.busy}>{action.busy?<LoaderCircle size={15} className="spin"/>:<Check size={15}/>}Confirmă legătura</button>{action.error&&<ErrorMessage message={action.error}/>}</form>;
}

function SuggestedConnections({item,mutate,step}:Pick<Props,'item'|'mutate'>&{step:number}) {
  const sources=item.documents.filter(doc=>!doc.stale);
  const rules=[
    {step:0,types:['specifications'],targetTypes:['necessity'],type:'specifies_need',label:'Caietul de sarcini detaliază necesitatea'},
    {step:2,types:['inbound_delivery','service_report'],targetTypes:['contract','purchase_order'],type:'delivers_against',label:'Livrarea corespunde contractului sau comenzii'},
    {step:2,types:['acceptance'],targetTypes:['inbound_delivery','service_report'],type:'accepts_delivery',label:'Recepția confirmă livrarea'},
    {step:3,types:['invoice'],targetTypes:['contract','purchase_order'],type:'invoices_against',label:'Factura corespunde contractului sau comenzii'},
    {step:3,types:['invoice'],targetTypes:['acceptance'],type:'invoices_against',label:'Factura corespunde recepției'},
  ];
  const suggestions=rules.filter(rule=>rule.step===step).flatMap(rule=>sources.filter(doc=>rule.types.includes(doc.template_id)).flatMap(source=>{
    if(item.links.some(link=>!link.stale&&link.type===rule.type&&link.source_id===source.document_id&&sources.some(doc=>doc.document_id===link.target_id&&rule.targetTypes.includes(doc.template_id))))return [];
    const targets=sources.filter(doc=>rule.targetTypes.includes(doc.template_id)&&(!['contract','purchase_order'].includes(doc.template_id)||doc.document_id===item.primary_document_id||item.links.some(link=>!link.stale&&link.type==='fulfills_request'&&link.source_id===doc.document_id&&link.target_id===item.primary_document_id)));
    return targets.length?[{...rule,source,targets}]:[];
  }));
  if(!suggestions.length)return null;
  return <section className="guide-connections"><h3>Confirmă documentele care corespund</h3><p className="quiet-note">Am pregătit legăturile. Verifică documentele înainte de confirmare.</p>{suggestions.map(suggestion=><SuggestedLink key={`${suggestion.source.document_id}:${suggestion.type}:${suggestion.targetTypes.join()}`} {...suggestion} item={item} mutate={mutate}/>)}</section>;
}

function PrimaryCommitment({item,mutate}:Pick<Props,'item'|'mutate'>) {
  const [selected,setSelected]=useState(''),action=useAction();
  if(item.primary_document_id)return <p className="guide-primary"><CheckCircle2 size={17}/>Contract principal: <strong>{item.documents.find(doc=>doc.document_id===item.primary_document_id)?.title}</strong></p>;
  const choices=item.documents.filter(doc=>!doc.stale&&['contract','purchase_order'].includes(doc.template_id));
  if(!choices.length||!item.capabilities.can_manage)return null;
  const selectedId=selected||(choices.length===1?choices[0].document_id:'');
  return <form className="guide-suggestion" onSubmit={event=>{event.preventDefault();if(selectedId)void action.run(()=>mutate('','PATCH',{primary_document_id:selectedId}))}}><FileText size={17}/><div><strong>Confirmă contractul principal</strong>{choices.length===1?<p>{choices[0].title}</p>:<label className="field">Contract sau comandă principală<select required value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Alege documentul principal</option>{choices.map(doc=><option key={doc.document_id} value={doc.document_id}>{doc.title}</option>)}</select></label>}</div><button className="button secondary" disabled={!selectedId||action.busy}>Confirmă</button>{action.error&&<ErrorMessage message={action.error}/>}</form>;
}

function cents(value:string){if(!/^\d+(\.\d{1,2})?$/.test(value))return 0n;const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))}
function decimal(value:bigint){return `${value/100n}.${String(value%100n).padStart(2,'0')}`}
function InvoiceCoverage({invoice,item,mutate}:Pick<Props,'item'|'mutate'>&{invoice:CaseDocument}) {
  const [metadata,setMetadata]=useState<DocumentTemplateDetail>(),[loadError,setLoadError]=useState(''),[selected,setSelected]=useState(''),action=useAction();
  useEffect(()=>{let active=true;getDocumentTemplate(invoice.document_id).then(data=>{if(active){setMetadata(data);setLoadError('')}}).catch(error=>{if(active)setLoadError(error.message)});return()=>{active=false}},[invoice.document_id,invoice.version,invoice.extraction_status]);
  if(loadError)return <ErrorMessage message={loadError}/>;
  if(!metadata||metadata.version!==invoice.version)return null;
  const validAllocations=item.allocations.filter(allocation=>allocation.invoice_id===invoice.document_id&&allocation.invoice_version===invoice.version&&item.documents.some(doc=>doc.document_id===allocation.acceptance_id&&doc.version===allocation.acceptance_version&&evidenceApproved(doc))&&item.links.some(link=>!link.stale&&link.type==='invoices_against'&&link.source_id===invoice.document_id&&link.target_id===allocation.acceptance_id));
  const gross=cents(String(metadata.fields.value||'0')),allocated=validAllocations.reduce((sum,allocation)=>sum+cents(allocation.amount),0n),remaining=gross-allocated;
  if(remaining<=0n)return null;
  const choices=item.documents.filter(doc=>doc.template_id==='acceptance'&&evidenceApproved(doc)&&item.links.some(link=>!link.stale&&link.type==='invoices_against'&&link.source_id===invoice.document_id&&link.target_id===doc.document_id));
  const targetId=selected||(choices.length===1?choices[0].document_id:''),target=choices.find(doc=>doc.document_id===targetId);
  return <form className="guide-suggestion" onSubmit={event=>{event.preventDefault();if(target)void action.run(async()=>{const acceptance=await getDocumentTemplate(target.document_id);if(acceptance.version!==target.version)throw new Error('Recepția a fost actualizată. Reîncarcă dosarul.');const validOld=validAllocations.find(allocation=>allocation.acceptance_id===target.document_id);const proposed=remaining+cents(validOld?.amount||'0');const others=item.allocations.filter(allocation=>allocation.acceptance_id===target.document_id&&allocation.invoice_id!==invoice.document_id).reduce((sum,allocation)=>sum+cents(allocation.amount),0n);if(cents(String(acceptance.fields.accepted_amount||'0'))-others<proposed)throw new Error('Recepția nu acoperă suma rămasă. Împarte suma între recepții în Avansat.');await mutate('/allocations','POST',{invoice_id:invoice.document_id,invoice_version:invoice.version,acceptance_id:target.document_id,acceptance_version:target.version,amount:decimal(proposed)})})}}>
    <CheckCircle2 size={17}/><div><strong>Confirmă acoperirea facturii</strong><p>{invoice.title} · {amount(decimal(remaining),item.currency)}</p>{choices.length===1?<small>Recepție: {choices[0].title}</small>:choices.length?<label className="field">Recepție corespunzătoare<select required value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Alege recepția</option>{choices.map(doc=><option key={doc.document_id} value={doc.document_id}>{doc.title}</option>)}</select></label>:<small>Confirmă mai întâi legătura dintre factură și recepția aprobată.</small>}</div>
    <button className="button secondary" disabled={!target||action.busy||!item.capabilities.can_manage}>Confirmă suma</button>{action.error&&<ErrorMessage message={action.error}/>}</form>;
}

export function CaseGuide({item,catalog,mutate,onOpen,onUpload,onAdvance,onAdvanced,onReturn}:Props) {
  const setup=useRef<HTMLDivElement>(null),payment=useRef<HTMLElement>(null);
  const current=guideIndex(item.stage),[selected,setSelected]=useState<number>(),step=selected??current,closed=['paid','cancelled'].includes(item.stage),slots=guideSlots[step];
  const evidenceSlots=step===1?slots.flatMap(slot=>slot.types.map(type=>({label:catalog.templates.find(template=>template.id===type)?.label||slot.label,types:[type],alternative:true}))):slots.map(slot=>({...slot,alternative:false}));
  const missing=slots.find(slot=>!item.documents.some(doc=>slot.types.includes(doc.template_id)));
  const currentDocs=item.documents.filter(doc=>slots.some(slot=>slot.types.includes(doc.template_id))),review=currentDocs.find(doc=>!evidenceApproved(doc)),stale=item.documents.some(doc=>doc.stale)||item.links.some(link=>link.stale);
  const paymentDue=item.stage==='invoiced'&&item.balances&&cents(item.balances.outstanding)>0n;
  const invoiceGross=review?.template_id==='invoice'?item.balances?.invoices.find(invoice=>invoice.document_id===review.document_id)?.gross:undefined;
  const invoiceLinks=review?item.links.filter(link=>!link.stale&&link.type==='invoices_against'&&link.source_id===review.document_id):[];
  const invoiceAllocated=review?item.allocations.filter(allocation=>allocation.invoice_id===review.document_id&&allocation.invoice_version===review.version&&item.documents.some(doc=>doc.document_id===allocation.acceptance_id&&doc.version===allocation.acceptance_version&&evidenceApproved(doc))).reduce((sum,allocation)=>sum+cents(allocation.amount),0n):0n;
  const invoiceNeedsSetup=step===3&&review?.template_id==='invoice'&&review.complete&&!review.stale&&item.capabilities.can_manage&&(!invoiceLinks.some(link=>item.documents.some(doc=>doc.document_id===link.target_id&&['contract','purchase_order'].includes(doc.template_id)))||!invoiceLinks.some(link=>item.documents.some(doc=>doc.document_id===link.target_id&&doc.template_id==='acceptance'))||(invoiceGross!==undefined&&invoiceAllocated<cents(invoiceGross)));
  const action=step!==current?<button className="button primary" onClick={()=>setSelected(undefined)}>Revino la pasul curent<ArrowRight size={16}/></button>
    :missing&&item.capabilities.can_manage?<button className="button primary" onClick={()=>onUpload(missing.types[0],missing.types.length>1?missing.types:undefined)}><UploadCloud size={17}/>{missing.types.length>1?'Încarcă document':`Încarcă ${catalog.templates.find(template=>template.id===missing.types[0])?.label.toLocaleLowerCase('ro')}`}</button>
    :missing?<span className="quiet-note">Documentele sunt adăugate de responsabilul dosarului.</span>
    :invoiceNeedsSetup?<button className="button primary" onClick={()=>setup.current?.scrollIntoView({block:'center',behavior:'smooth'})}>Confirmă factura și recepția<ArrowRight size={17}/></button>
    :review?<button className="button primary" onClick={()=>onOpen(review.document_id)}>Deschide documentul<ArrowRight size={17}/></button>
    :item.capabilities.can_advance?<button className="button primary" onClick={onAdvance}>{item.next_action}<ArrowRight size={17}/></button>
    :paymentDue?<button className="button primary" onClick={()=>payment.current?.scrollIntoView({block:'center',behavior:'smooth'})}>Vezi plata<ArrowRight size={17}/></button>
    :item.capabilities.can_manage&&item.blockers.length?<button className="button secondary" onClick={()=>setup.current?.scrollIntoView({block:'center',behavior:'smooth'})}>Verifică documentele care corespund<ArrowRight size={16}/></button>
    :<button className="button secondary" onClick={onAdvanced}>Vezi responsabilitățile și detaliile</button>;
  return <div className="case-guide">
    <nav aria-label="Pașii dosarului" className="guide-steps">{guideSteps.map((entry,index)=><button key={entry.id} className={`${step===index?'is-selected':''} ${index<current||item.stage==='paid'?'is-done':''}`} aria-current={index===current?'step':undefined} aria-pressed={step===index} onClick={()=>setSelected(index)}><span>{index<current||item.stage==='paid'?<Check size={17}/>:index+1}</span><div><strong>{entry.label}</strong><small>{entry.description}</small></div></button>)}</nav>
    <section className="guide-next"><div><span className="proc-eyebrow">{closed?'Stare dosar':step===current?'Următorul pas':`Pasul ${step+1} din 4`}</span><h3>{closed?item.stage==='paid'?'Dosar finalizat':'Dosar anulat':step===current?invoiceNeedsSetup?'Confirmă factura și recepția':caseNextHint(item):guideSteps[step].label}</h3><p>{closed?'Documentele și deciziile sunt păstrate în istoricul dosarului.':missing?'Adaugă PDF-ul. Vei verifica valorile extrase în document.':invoiceNeedsSetup?'Confirmă documentele și suma acoperită de recepție, apoi finalizează aprobarea facturii.':review?'Deschide documentul, verifică datele și urmărește aprobarea responsabilului desemnat.':item.blockers.length?'Confirmă legăturile sugerate și rezolvă verificările rămase.':'Documentele sunt pregătite pentru etapa următoare.'}</p></div>
      {!closed&&action}
    </section>
    {step===1&&<p className="guide-alternative-note">Folosește un contract sau o comandă de achiziție. Unul dintre ele este suficient pentru acest pas.</p>}
    <div className="guide-evidence-grid">{evidenceSlots.map(slot=>{const documents=item.documents.filter(doc=>slot.types.includes(doc.template_id));return <section className="guide-evidence" key={slot.label}><header><h3>{slot.label}</h3><span>{documents.length&&documents.every(evidenceApproved)?<CheckCircle2 size={18}/>:<FileText size={18}/>}</span></header>{documents.map(doc=><EvidenceCard key={doc.document_id} doc={doc} item={item} mutate={mutate} onOpen={onOpen}/>)}{!documents.length&&<p className="quiet-note">{slot.alternative?item.documents.some(doc=>slots.some(group=>group.types.includes(doc.template_id)))?'Opțional: adaugă doar dacă achiziția îl necesită.':'Adaugă acest document sau folosește cealaltă opțiune.':'Adaugă documentul pentru acest pas.'}</p>}{!closed&&item.capabilities.can_manage&&<AddEvidence key={slot.types.join()} item={item} catalog={catalog} types={slot.types} mutate={mutate} onUpload={onUpload}/>}</section>})}</div>
    {!closed&&<div ref={setup}>{step===1&&<PrimaryCommitment item={item} mutate={mutate}/>}<SuggestedConnections item={item} mutate={mutate} step={step}/>{step===3&&item.capabilities.can_manage&&currentDocs.filter(doc=>doc.template_id==='invoice'&&!doc.stale).map(doc=><InvoiceCoverage key={`${doc.document_id}:${doc.version}`} invoice={doc} item={item} mutate={mutate}/>)}</div>}
    {step===3&&item.balances&&<section ref={payment} className="guide-payment"><h3>{item.stage==='paid'?'Plată finalizată':'Plata dosarului'}</h3><div className="guide-payment-summary"><div><small>Valoare angajată</small><strong>{amount(item.balances.committed,item.currency)}</strong></div><div><small>Plătit</small><strong>{amount(item.balances.paid,item.currency)}</strong></div><div><small>Rest de plată</small><strong>{amount(item.balances.outstanding,item.currency)}</strong></div>{cents(item.balances.overpaid)>0n&&<div><small>Supraplată</small><strong>{amount(item.balances.overpaid,item.currency)}</strong></div>}</div>{!closed&&((item.capabilities.can_pay&&cents(item.balances.outstanding)>0n)||(item.capabilities.can_refund&&cents(item.balances.overpaid)>0n))&&<PaymentForm item={item} mutate={mutate}/>}</section>}
    {!closed&&step===current&&<section className="guide-ready"><div>{item.blockers.length?<details><summary>{item.blockers.length} {item.blockers.length===1?'verificare rămasă':'verificări rămase'}</summary><ul>{item.blockers.map((blocker,index)=><li key={index}>{blocker}</li>)}</ul></details>:<p><CheckCircle2 size={17}/>Verificările sunt îndeplinite.</p>}{!item.capabilities.can_advance&&!item.blockers.length&&<p className="quiet-note">{item.stage==='committed'?'Confirmarea recepției aparține responsabilului Tehnic sau directorului.':['accepted','invoiced'].includes(item.stage)?'Confirmarea etapei aparține Financiarului sau directorului.':'Confirmarea etapei aparține responsabilului Achiziții sau directorului.'}</p>}</div><div className="guide-ready-actions">{stale&&item.capabilities.can_return&&!['draft','needs_review'].includes(item.stage)&&<button className="button secondary" onClick={onReturn}>Returnează în verificare</button>}<button className="button primary" disabled={!item.capabilities.can_advance} onClick={onAdvance}>{item.next_action}<ArrowRight size={16}/></button><button className="text-button" onClick={onAdvanced}>Vezi detaliile avansate</button></div></section>}
  </div>;
}
