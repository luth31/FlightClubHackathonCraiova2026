from pathlib import Path
from sqlalchemy import text
from app.documents.service import get_document,current_version,file_hash
from app.core.security import require_role,has_role
from app.core.exceptions import DomainError
from app.core.audit import record,now
from app.core.signing import sign_file
from app.tasks import service as task_service

def apply_action(db,user,document_id,action,comment='',expected_version=None):
    # SQLite write lock serializes version approval and sign requests; a second sign is idempotent.
    db.execute(text('BEGIN IMMEDIATE'))
    document=get_document(db,document_id,user,edit=action not in ('sign','approve','reject'))
    from app.people.leave_documents import is_leave_document
    if is_leave_document(document):
        raise DomainError('Decizia se înregistrează în Echipă → Concedii. Documentul se actualizează automat.',409)
    version=current_version(db,document)
    if expected_version is not None and expected_version!=document.version:
        raise DomainError('Documentul s-a schimbat. Reîncarcă versiunea curentă.',409)
    if action=='sign': require_role(user,'signer')
    if action=='sign' and document.status=='signed':
        return document
    if file_hash(version.file_path)!=version.sha256:
        raise DomainError('Integritatea fișierului nu poate fi confirmată.',409)
    if action=='validate':
        if document.status not in ('draft','in_review'): raise DomainError('Metadatele se validează înainte de aprobare.',409)
        task=task_service.require_task(db,user,document,'validation')
        task_service.complete_task(db,task,user,'Metadate validate',comment)
        document.validated=True
        document.extra={**document.extra,'validated_by':user.name,'validated_at':now(),'extraction_evidence':[{**e,'validated':True} for e in document.extra.get('extraction_evidence',[])]}
        label='Metadate validate'
    elif action=='submit':
        if document.status!='draft': raise DomainError('Doar o ciornă poate fi trimisă spre avizare.',409)
        if not document.validated: raise DomainError('Validează metadatele înainte de trimitere.',409)
        document.status='in_review'; label='Trimis spre avizare'
        task_service.ensure_task(db,document,'approval',user,reopen=True)
    elif action in ('approve','reject'):
        require_role(user,'reviewer','director','hr','department_head')
        try:
            from app.people.service import can_review_department
            if not can_review_department(db,user,document.department): raise DomainError('Avizarea este în responsabilitatea altui departament.',403)
        except ImportError:
            pass
        if document.status!='in_review': raise DomainError('Documentul nu așteaptă avizarea.',409)
        task=task_service.require_task(db,user,document,'approval')
        if action=='reject':
            if not comment.strip(): raise DomainError('Adaugă motivul returnării pentru corectare.',422)
            document.status='draft'; document.validated=False; label='Returnat pentru corectare'
            task_service.complete_task(db,task,user,label,comment)
            task_service.ensure_task(db,document,'validation',user,preferred=document.created_by,reopen=True)
        else:
            if not document.validated: raise DomainError('Metadatele nu sunt validate.',409)
            document.status='approved'; version.approved_by=user.id; version.approved_at=now(); label='Document aprobat'
            task_service.complete_task(db,task,user,label,comment)
            task_service.ensure_task(db,document,'signature',user,reopen=True)
    elif action=='sign':
        require_role(user,'signer')
        if document.status!='approved' or not version.approved_at: raise DomainError('Semnarea necesită avizarea acestei versiuni.',409)
        task=task_service.require_task(db,user,document,'signature')
        target=Path(version.file_path).with_name(f'v{version.version}.signed.pdf')
        fingerprint=sign_file(user,version.file_path,str(target))
        version.signed_path=str(target); version.signed_sha256=file_hash(target); version.signer_id=user.id; version.certificate_fingerprint=fingerprint
        document.status='signed'; label='Document semnat'
        task_service.complete_task(db,task,user,label,comment)
    elif action=='archive':
        require_role(user,'director','reviewer')
        if document.status not in ('approved','signed'): raise DomainError('Se arhivează numai un document aprobat sau semnat.',409)
        document.status='archived'; label='Document arhivat'
        for kind in ('validation','approval','signature'):
            pending=task_service.current_task(db,document,kind)
            if pending and pending.status=='pending':
                pending.status='cancelled';task_service.task_event(db,pending,user,'Document arhivat',comment)
    else: raise DomainError('Acțiune necunoscută.',422)
    document.updated_at=now()
    record(db,user,label,document,f'Versiunea {document.version}'+(f' · {comment}' if comment else ''))
    db.commit(); return document
