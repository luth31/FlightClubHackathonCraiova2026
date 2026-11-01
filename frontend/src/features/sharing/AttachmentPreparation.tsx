import {useEffect,useState} from 'react';
import {Check,ArrowRight,RefreshCw} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage,Loading,Modal,Status} from '@/components/ui';
import {ReadOnlyPdf} from '@/components/documents/ReadOnlyPdf';
import {UploadDialog} from '@/features/documents/UploadDialog';
import type {DocumentRecord,Session,User} from '@/types';

export function UploadAttachment({onClose,onCreated}:{onClose:()=>void;onCreated:(doc:DocumentRecord)=>void}){
  const [user,setUser]=useState<User>(),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();void api<Session>('/session',{signal:controller.signal}).then(s=>{if(!controller.signal.aborted&&s.current_user)setUser(s.current_user)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[]);
  if(user)return <UploadDialog user={user} onClose={onClose} onCreated={onCreated}/>;
  return <Modal title="Încarcă un fișier pentru mesaj" onClose={onClose}><div className="modal-body">{error?<ErrorMessage message={error}/>:<Loading/>}</div></Modal>;
}

export function AttachmentPreparation({initial,onClose,onReady,onOpen}:{initial:DocumentRecord;onClose:()=>void;onReady:(doc:DocumentRecord)=>void;onOpen:(id:string)=>void}){
  const [doc,setDoc]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [userId,setUserId]=useState(''),[canTake,setCanTake]=useState(false);
  const task=doc.workflow?.task;
  useEffect(()=>{let live=true;
    void api<Session>('/session').then(async s=>{
      if(!live)return;setUserId(s.current_user?.id||'');
      if(!task?.can_reassign){setCanTake(false);return}
      const assignment=await api<{eligible_assignees:Array<{id:string}>}>(`/tasks/${task.id}`);
      if(live)setCanTake(assignment.eligible_assignees.some(p=>p.id===s.current_user?.id));
    }).catch(e=>{if(live)setError(e.message)});
    return()=>{live=false};
  },[task?.id,task?.can_reassign]);
  async function act(action:string){
    if(busy)return;setBusy(true);setError('');
    try{
      if(action==='take'&&task){
        await api(`/tasks/${task.id}/assign`,{method:'POST',body:JSON.stringify({assigned_to:userId,version:doc.version,comment:'Preiau avizarea documentului pregătit pentru colaborare.'})});
        setDoc(await api<DocumentRecord>(`/documents/${doc.id}`));
      }else if(action==='refresh')setDoc(await api<DocumentRecord>(`/documents/${doc.id}`));
      else setDoc(await api<DocumentRecord>(`/documents/${doc.id}/actions`,{method:'POST',body:JSON.stringify({action,version:doc.version})}));
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  const approved=['approved','signed'].includes(doc.status);
  return <Modal title="Pregătește fișierul pentru mesaj" subtitle="Încărcare → verificare și aprobare → cenzurare → atașare" wide onClose={()=>{if(!busy)onClose()}}><div className="modal-body attachment-preparation">
    <div className="attachment-preparation-heading"><div><strong>{doc.title}</strong><small>{doc.category} · {doc.department} · v{doc.version}</small></div><Status value={doc.status}/></div>
    <ReadOnlyPdf source={`${doc.file_url}?version=${doc.version}`} title={doc.title} word={false}/>
    {error&&<ErrorMessage message={error}/>}
    <p className="quiet-note">Fișierul este înregistrat în biblioteca aeroportului. Va ajunge la destinatar după pregătirea copiei și trimiterea mesajului.</p>
    {task&&!approved&&<p className="quiet-note">Responsabil: <strong>{task.assignee}</strong></p>}
    <div className="attachment-preparation-actions"><button className="text-button" disabled={busy} onClick={()=>void act('refresh')}><RefreshCw size={15}/>Actualizează starea</button><button className="text-button" disabled={busy} onClick={()=>onOpen(doc.id)}>Vezi metadatele și fluxul</button>
      {doc.status==='draft'&&!doc.validated&&doc.permissions?.can_validate&&<button className="button primary" disabled={busy} onClick={()=>void act('validate')}><Check size={16}/>Confirm informațiile documentului</button>}
      {doc.status==='draft'&&doc.validated&&doc.permissions?.can_submit&&<button className="button primary" disabled={busy} onClick={()=>void act('submit')}>Trimite spre avizare<ArrowRight size={16}/></button>}
      {doc.status==='in_review'&&doc.permissions?.can_review&&<button className="button primary" disabled={busy} onClick={()=>void act('approve')}><Check size={16}/>Aprobă această versiune</button>}
      {doc.status==='in_review'&&!doc.permissions?.can_review&&canTake&&<button className="button secondary" disabled={busy} onClick={()=>void act('take')}>Preia avizarea</button>}
      {approved&&doc.permissions?.can_share&&<button className="button primary" disabled={busy} onClick={()=>onReady(doc)}>Verifică datele pentru partajare<ArrowRight size={16}/></button>}
    </div>
  </div></Modal>;
}
