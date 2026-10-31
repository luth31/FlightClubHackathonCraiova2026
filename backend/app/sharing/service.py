import uuid
import re
from pathlib import Path
from datetime import date
import fitz
from sqlalchemy import select,desc
from app.sharing.models import Share,SharePreview
from app.documents.service import get_document,current_version,file_hash,DEPARTMENTS
from app.core.audit import now,record
from app.core.security import require_role,can_read
from app.core.exceptions import DomainError
from app.config import settings

def preview(db,user,document_id,terms):
    require_role(user,'director','reviewer')
    doc=get_document(db,document_id,user)
    if doc.status not in ('approved','signed'): raise DomainError('Aprobă documentul înainte de pregătirea unei copii partajate.',409)
    if doc.department=='Resurse umane': raise DomainError('Documentele de personal nu se partajează între aeroporturi în acest prototip.',403)
    version=current_version(db,doc)
    if file_hash(version.file_path)!=version.sha256:
        raise DomainError('Integritatea originalului nu poate fi confirmată.',409)
    source=fitz.open(version.file_path)
    redactions=[]
    for term in terms:
        term=term.strip()
        if not term: continue
        if len(term)>500: raise DomainError('Termenul de anonimizat este prea lung.',422)
        count=0
        for page in source:
            for rectangle in page.search_for(term):
                page.add_redact_annot(rectangle,fill=(0.12,0.17,0.2))
                count+=1
        redactions.append({'term':term,'occurrences':count})
    for page in source: page.apply_redactions()
    # Rebuild pages in a new PDF, excluding annotations, links, widgets and the original catalog.
    clean=fitz.open(); clean.insert_pdf(source,links=False,annots=False,widgets=False)
    safe_title=doc.title
    safe_author=settings.airport_name
    for term in terms:
        if term.strip():
            safe_title=re.sub(re.escape(term.strip()),'[redactat]',safe_title,flags=re.IGNORECASE)
            safe_author=re.sub(re.escape(term.strip()),'[redactat]',safe_author,flags=re.IGNORECASE)
    clean.set_metadata({'title':f'{safe_title} — copie revizuită','author':safe_author,'subject':'Copie demonstrativă pentru partajare; semnătura originalului nu se transferă.'})
    preview_id=uuid.uuid4().hex
    folder=settings.storage_dir/'shares'; folder.mkdir(parents=True,exist_ok=True)
    path=folder/f'{preview_id}.pdf'
    clean.save(path,garbage=4,deflate=True,clean=True)
    clean.close(); source.close()
    item=SharePreview(id=preview_id,document_id=doc.id,source_version=doc.version,creator_id=user.id,file_path=str(path),sha256=file_hash(path),redactions=redactions,created_at=now())
    db.add(item); record(db,user,'Copie de partajare pregătită',doc,f'{sum(r["occurrences"] for r in redactions)} fragmente eliminate efectiv')
    db.commit()
    return {'preview_id':preview_id,'file_url':f'/api/share-previews/{preview_id}/file','redactions':redactions,'sha256':item.sha256,'source_version':doc.version}

def create_share(db,user,document_id,body):
    require_role(user,'director','reviewer')
    doc=get_document(db,document_id,user)
    preview=db.get(SharePreview,body.preview_id)
    if not preview or preview.document_id!=doc.id or preview.creator_id!=user.id: raise DomainError('Copia de partajare nu există.',404)
    if preview.source_version!=doc.version: raise DomainError('Documentul s-a schimbat. Pregătește o copie nouă.',409)
    if doc.status not in ('approved','signed'): raise DomainError('Versiunea trebuie aprobată înainte de partajare.',409)
    if not body.reviewed: raise DomainError('Confirmă că ai verificat integral copia de partajare.',422)
    if body.expires_at<=settings.reference_date: raise DomainError('Alege o dată de expirare ulterioară datei de referință.',422)
    if body.recipient_airport_id not in ('dunarea','carpati'): raise DomainError('Aeroportul destinatar nu este un partener configurat.',422)
    if body.recipient_airport_id==user.airport_id: raise DomainError('Alege aeroportul partener.',422)
    if body.recipient_department and body.recipient_department not in DEPARTMENTS:
        raise DomainError('Departamentul destinatar nu este valid.',422)
    item=Share(id='share-'+uuid.uuid4().hex[:12],document_id=doc.id,document_title=doc.title,source_version=doc.version,preview_id=preview.id,recipient_airport={'dunarea':'Aeroportul Dunărea','carpati':'Aeroportul Carpați'}[body.recipient_airport_id],recipient_airport_id=body.recipient_airport_id,created_by=user.id,created_at=now(),expires_at=str(body.expires_at),revoked=False,reviewed=True)
    item.recipient_department=body.recipient_department or None
    db.add(item); record(db,user,'Document partajat',doc,f'{item.recipient_airport} · {item.recipient_department or "avizatori și directori autorizați"} · versiunea {doc.version} · până la {body.expires_at}'); db.commit()
    return serialize(item,db)

def serialize(item,db):
    data={k:getattr(item,k) for k in ('id','document_id','document_title','source_version','recipient_airport','recipient_airport_id','created_by','created_at','expires_at','revoked','reviewed')}
    data['recipient_department']=item.recipient_department
    doc=db.get(__import__('app.documents.models',fromlist=['Document']).Document,item.document_id)
    data['status']='revoked' if item.revoked else 'expired' if date.fromisoformat(item.expires_at)<settings.reference_date else 'superseded' if not doc or doc.version!=item.source_version else 'active'
    data['file_url']=f'/api/shares/{item.id}/file'
    return data

def share_file(db,user,share_id):
    item=db.get(Share,share_id)
    if not item: raise DomainError('Partajarea nu există.',404)
    doc=get_document(db,item.document_id,user)
    require_role(user,'director','reviewer')
    state=serialize(item,db)['status']
    if state!='active': raise DomainError('Accesul a fost revocat, a expirat sau versiunea s-a schimbat.',403)
    preview=db.get(SharePreview,item.preview_id)
    if file_hash(preview.file_path)!=preview.sha256: raise DomainError('Integritatea copiei nu poate fi confirmată.',409)
    record(db,user,'Copie partajată consultată',doc,f'Partajare {item.id}'); db.commit()
    return preview
