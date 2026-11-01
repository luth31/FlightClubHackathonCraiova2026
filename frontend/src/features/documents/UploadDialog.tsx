import {t,useLanguage} from '@/i18n';
import {useEffect,useRef,useState} from 'react';
import {UploadCloud,FileText,LoaderCircle,Check,ArrowRight,Trash2} from 'lucide-react';
import {Modal,ErrorMessage} from '@/components/ui';
import {api} from '@/services/api-client';
import type {DocumentRecord,User} from '@/types';
import './upload-dialog.css';

export function UploadDialog({onClose,onCreated,user,destination,onFailure}:{onClose:()=>void;onCreated:(doc:DocumentRecord)=>void;user:User;destination?:{caseId:string;revision:number;templateId:string;label:string;caseTitle?:string;templateOptions?:{id:string;label:string}[]};onFailure?:()=>void}) {
  useLanguage();
  const [file,setFile]=useState<File>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[drag,setDrag]=useState(false);
  const multiple=!!destination?.templateOptions?.length;
  const [templateId,setTemplateId]=useState(multiple?'':destination?.templateId||'');
  const input=useRef<HTMLInputElement>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  function clear(){setFile(undefined);if(input.current)input.current.value=''}
  function choose(files:FileList|null){if(!files?.length)return;const next=files[0];if(files.length>1){clear();setError('Alege un singur PDF pentru acest document.');return}if(!next.name.toLowerCase().endsWith('.pdf')){clear();setError('Fișierul nu este un PDF. Alege un document cu extensia .pdf.');return}if(next.size===0){clear();setError('Fișierul este gol. Alege un PDF care conține documentul.');return}if(next.size>25*1024*1024){clear();setError('Fișierul depășește 25 MB. Alege un PDF mai mic.');return}setFile(next);setError('')}
  async function submit(event:React.FormEvent){event.preventDefault();if(!file||busy||(destination&&!templateId))return;setBusy(true);setError('');const body=new FormData();body.append('file',file);body.append('auto_extract','true');if(destination){body.append('revision',String(destination.revision));body.append('template_id',templateId)}try{const doc=await api<DocumentRecord>(destination?`/procurement/cases/${encodeURIComponent(destination.caseId)}/upload`:'/documents',{method:'POST',body});if(mounted.current)onCreated(doc)}catch(error){if(mounted.current){setError((error as Error).message);setBusy(false);onFailure?.()}}}
  const department=user.department==='Conducere'?'Achiziții':user.business_area||user.department;
  return <Modal title={destination&&!multiple?t("Încarcă {p0}", {p0:destination.label.toLocaleLowerCase('ro')}):t("Încarcă documentul")} subtitle={t("Adaugă PDF-ul. Verifici informațiile după încărcare.")} className="upload-dialog" onClose={()=>{if(!busy)onClose()}}><form className="modal-body upload-simple" onSubmit={submit} aria-busy={busy}>
    {destination&&<div className="upload-context"><FileText size={18}/><div><strong>{multiple?t("Document pentru dosar"):destination.label}</strong><span>{t("Se adaugă în dosarul")}{' '}{destination.caseTitle||t("curent")}.</span></div></div>}
    <input ref={input} className="sr-only" type="file" accept="application/pdf,.pdf" disabled={busy} tabIndex={-1} aria-label={t("Fișier PDF")} onChange={event=>choose(event.target.files)}/>
    {file?<div className="upload-selected-file"><span className="upload-file-icon"><FileText size={24}/></span><div><strong>{file.name}</strong><span>{t("PDF ·")}{' '}{file.size>=1024*1024?t("{p0} MB", {p0:(file.size/(1024*1024)).toFixed(1)}):t("{p0} KB", {p0:Math.max(1,Math.round(file.size/1024))})}</span><small><Check size={13}/>{t("Pregătit pentru încărcare")}</small></div><button type="button" className="icon-button" disabled={busy} aria-label={t("Elimină fișierul selectat")} onClick={()=>{clear();setError('')}}><Trash2 size={18}/></button><button type="button" className="text-button upload-change-file" disabled={busy} onClick={()=>input.current?.click()}>{t("Schimbă fișierul")}</button></div>:<button type="button" className={`dropzone ${drag?'dragging':''}`} disabled={busy} onClick={()=>input.current?.click()} onDragOver={event=>{event.preventDefault();if(!busy)setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={event=>{event.preventDefault();setDrag(false);if(!busy)choose(event.dataTransfer.files)}}>
      <span className="upload-drop-icon"><UploadCloud size={26}/></span><strong>{t("Trage PDF-ul aici")}</strong><span>{t("sau")}{' '}<b>{t("alege fișierul de pe dispozitiv")}</b></span><small>{t("Un singur PDF · maximum 25 MB")}</small>
    </button>}
    {multiple&&<label className="field upload-document-type">{t("Tipul documentului")}<select required value={templateId} disabled={busy} onChange={event=>setTemplateId(event.target.value)}><option value="">{t("Alege tipul documentului")}</option>{destination?.templateOptions?.map(option=><option value={option.id} key={option.id}>{t(option.label)}</option>)}</select></label>}
    {error&&<ErrorMessage message={error}/>}
    <div className="upload-next-steps"><span><Check size={16}/>{t("Date extrase automat")}</span><ArrowRight size={14}/><span>{t("Verifici și corectezi")}</span><ArrowRight size={14}/><span>{t("Trimiți spre aprobare")}</span></div>
    <p className="upload-department-note">{t("Circuit:")}{' '}<strong>{department}</strong>{destination?t(" · Documentul va fi asociat automat dosarului."):t(" · Documentul va fi disponibil în registru.")}</p>
    {busy&&<p className="upload-busy-note" role="status"><LoaderCircle size={16} className="spin"/>{t("Se încarcă PDF-ul. Așteaptă deschiderea pasului de verificare.")}</p>}
    <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t("Renunță")}</button><button className="button primary" disabled={!file||busy||(multiple&&!templateId)}>{busy?<LoaderCircle size={17} className="spin"/>:<ArrowRight size={17}/>} {busy?t("Se încarcă…"):t("Încarcă și verifică")}</button></div>
  </form></Modal>;
}
