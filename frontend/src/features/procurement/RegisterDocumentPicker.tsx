import {t,useLanguage} from '@/i18n';
import {useDeferredValue,useId,useRef,useState} from 'react';
import {Check,FileText,LoaderCircle,Search,X} from 'lucide-react';
import {ErrorMessage,Modal,Status} from '@/components/ui';
import {amount,type DocumentChoice,type ProcurementTemplate} from './types';
import './register-document-picker.css';

const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('ro');
export function matchesTemplate(doc:DocumentChoice,template:ProcurementTemplate) {
  return doc.template_id?doc.template_id===template.id:normalize(doc.category)===normalize(template.category);
}
const approved=(doc:DocumentChoice)=>['approved','signed','archived'].includes(doc.status);
const processing=(doc:DocumentChoice)=>!!doc.extraction_status&&doc.extraction_status!=='ready';

export function RegisterDocumentPicker({documents,template,caseTitle,onClose,onSelect}: {
  documents:DocumentChoice[];template:ProcurementTemplate;caseTitle:string;
  onClose:()=>void;onSelect:(doc:DocumentChoice)=>Promise<unknown>;
}) {
  useLanguage();
  const [query,setQuery]=useState(''),[readyOnly,setReadyOnly]=useState(false),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const search=useRef<HTMLInputElement>(null),submitting=useRef(false),group=useId(),term=normalize(useDeferredValue(query).trim());
  const candidates=documents.filter(doc=>matchesTemplate(doc,template));
  const results=candidates.filter(doc=>(!readyOnly||approved(doc))&&normalize(`${doc.title} ${doc.number} ${doc.supplier||''}`).includes(term))
    .sort((a,b)=>Number(approved(b))-Number(approved(a)));
  const selectedDoc=candidates.find(doc=>doc.id===selected),canSelect=!!selectedDoc&&!processing(selectedDoc);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(!selectedDoc||!canSelect||submitting.current)return;
    submitting.current=true;setBusy(true);setError('');
    try{await onSelect(selectedDoc);onClose()}catch(error){setError((error as Error).message)}finally{submitting.current=false;setBusy(false)}
  }
  return <Modal title={t("Alege din registru")} subtitle={t("{p0} · {p1}", {p0:template.label,p1:caseTitle})} className="register-picker" initialFocusRef={search} onClose={()=>{if(!submitting.current)onClose()}}>
    <form onSubmit={event=>void submit(event)} aria-busy={busy}>
      <div className="register-picker-tools">
        <label className="register-picker-search"><Search size={19} aria-hidden="true"/><input ref={search} type="search" aria-label={t("Caută documente în registru")} placeholder={t("Caută după titlu, număr sau furnizor")} value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" className="icon-button" aria-label={t("Șterge căutarea")} disabled={busy} onClick={()=>{setQuery('');search.current?.focus()}}><X size={16}/></button>}</label>
        <div className="register-picker-filters"><button type="button" aria-pressed={readyOnly} disabled={busy} onClick={()=>setReadyOnly(value=>!value)}><Check size={15}/>{t("Aprobate și semnate")}</button><span role="status">{results.length} {results.length===1?t("document"):t("documente")}</span></div>
      </div>
      <fieldset className="register-picker-list" disabled={busy}><legend className="sr-only">{t("Alege un document")}{' '}{template.label.toLocaleLowerCase('ro')}</legend>
        {results.map(doc=><label className={`register-picker-row ${selected===doc.id?'is-selected':''} ${processing(doc)?'is-processing':''}`} key={doc.id}>
          <input type="radio" name={group} value={doc.id} checked={selected===doc.id} disabled={processing(doc)} onChange={()=>{setSelected(doc.id);setError('')}}/>
          <span className="register-picker-file"><FileText size={19}/></span>
          <span className="register-picker-info"><strong>{doc.title}</strong><small>{doc.number||t("Număr de verificat")} {t("· v")}{doc.version}{doc.supplier&&t(" · {p0}", {p0:doc.supplier})}</small>{processing(doc)&&<small>{t("Extragerea trebuie finalizată înainte de asociere.")}</small>}</span>
          <span className="register-picker-meta"><Status value={doc.status}/>{doc.value!=null&&<small>{amount(doc.value,doc.currency)}</small>}</span>
        </label>)}
        {!results.length&&<div className="register-picker-empty"><Search size={28}/><strong>{query?t("Niciun document găsit"):t("Niciun document disponibil")}</strong><p>{query?t("Încearcă un alt titlu, număr sau furnizor."):readyOnly?t("Dezactivează filtrul pentru a vedea documentele în curs de aprobare."):t("Documentele deja asociate unui dosar nu apar aici. Poți încărca un PDF nou.")}</p>{(query||readyOnly)&&<button type="button" className="text-button" onClick={()=>{setQuery('');setReadyOnly(false);search.current?.focus()}}>{t("Resetează căutarea")}</button>}</div>}
      </fieldset>
      <div className="register-picker-footer">{error&&<ErrorMessage message={error}/>}<div className="register-picker-selection" aria-live="polite">{selectedDoc?<><FileText size={16}/><span><strong>{selectedDoc.title}</strong><small>{approved(selectedDoc)?t("Aprobarea documentului este păstrată."):t("După asociere, documentul trebuie verificat și aprobat.")}</small></span></>:<span>{t("Selectează documentul pe care vrei să îl adaugi.")}</span>}</div><div className="register-picker-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t("Renunță")}</button><button className="button primary" disabled={!canSelect||busy}>{busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} {busy?t("Se adaugă…"):t("Adaugă în dosar")}</button></div></div>
    </form>
  </Modal>;
}
