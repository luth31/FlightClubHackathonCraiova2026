import {ArrowUpRight,FileText,LoaderCircle,Share2,ShieldCheck} from 'lucide-react';
import {Modal,Status} from '@/components/ui';
import {documentHref} from '@/services/navigation';
import type {Procedure} from './procedures-types';

export function ProcedureReader({procedure,canDraft,busy,onClose,onDraft,onShare}:{procedure:Procedure;canDraft:boolean;busy:string;onClose:()=>void;onDraft:()=>void;onShare:(id:string)=>void}) {
  return <Modal title={procedure.title} subtitle={`${procedure.code} · ${procedure.area}`} wide className="sop-reader-modal" onClose={onClose}>
    <div className="sop-reader">
      <div className="sop-reader-meta"><span>Responsabil<strong>{procedure.owner}</strong></span><span>Referință<strong>Model {procedure.revision}</strong></span><span><ShieldCheck size={17}/>Validare locală necesară</span></div>
      {!!procedure.documents.length&&<section className="sop-local-documents"><h3>Documente locale · avizare și partajare</h3>{procedure.documents.map(doc=><div key={doc.id}><a href={documentHref(doc.id,'operations')}><FileText size={18}/><span>{doc.title}<small>Versiunea {doc.version}</small></span></a><Status value={doc.status}/>{doc.can_share&&<button className="button secondary" disabled={!!busy} onClick={()=>onShare(doc.id)}><Share2 size={16}/>Partajează</button>}</div>)}</section>}
      <p className="sop-lead">{procedure.purpose}</p>
      <section><h3>Când se aplică</h3><p>{procedure.trigger}</p></section>
      <section><h3>Înainte de începere</h3><ul>{procedure.prerequisites.map(item=><li key={item}>{item}</li>)}</ul></section>
      <section><h3>Pași și responsabilități</h3><ol className="sop-steps">{procedure.steps.map((step,index)=><li key={index}><span>{String(index+1).padStart(2,'0')}</span><div><header><strong>{step.when}</strong><span>{step.owner}</span></header><p>{step.action}</p><small>Dovadă: {step.record}</small></div></li>)}</ol></section>
      <div className="sop-reader-pair"><section><h3>Excepții și escaladare</h3><ul>{procedure.escalation.map(item=><li key={item}>{item}</li>)}</ul></section><section><h3>Ce măsurăm</h3><ul>{procedure.metrics.map(item=><li key={item}>{item}</li>)}</ul></section></div>
      <section><h3>Înregistrări păstrate</h3><div className="sop-records">{procedure.records.map(item=><span key={item}><FileText size={15}/>{item}</span>)}</div></section>
      <details className="sop-support"><summary>Validare locală, revizuire și surse</summary><ul>{procedure.local_validation.map(item=><li key={item}>{item}</li>)}</ul><p>{procedure.review}</p>{procedure.source_refs.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={15}/></a>)}</details>

      <footer className="sop-reader-footer"><p>Aplicarea și partajarea necesită avizarea documentului local.</p>{canDraft&&<button className="button primary" disabled={!!busy} onClick={onDraft}>{busy===procedure.code?<LoaderCircle size={16} className="spin"/>:<FileText size={16}/>}Creează ciornă locală</button>}</footer>
    </div>
  </Modal>;
}
