from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, UploadFile, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.core.security import current_user,can_read,can_read_version
from app.core.exceptions import DomainError
from app.core.audit import record
from app.core.signing import verify_file
from app.documents import service
from app.documents.models import DocumentVersion
from app.documents.schemas import DocumentPatch,Action
from app.documents.flow import document_flow
from app.workflows.service import apply_action
from app.people.organization import canonical_department

router=APIRouter(prefix='/api/documents',tags=['Documents'])

def detail(db,user,document):
    data=service.serialize(document,db,details=True,user=user)
    data['related_documents']=[d for d in data['related_documents'] if can_read(user,db.get(service.Document,d['id']))]
    return data

@router.get('')
def list_documents(q: str=Query('',max_length=200),category: str='',status: str='',department: str='',limit: int=Query(100,ge=1,le=500),offset: int=Query(0,ge=0),db: Session=Depends(get_db),user=Depends(current_user)):
    docs=service.visible_documents(db,user)
    if q:
        matching=service.matching_document_ids(db,q)
        docs=[d for d in docs if d.id in matching]
    if category: docs=[d for d in docs if d.category==category]
    if status: docs=[d for d in docs if d.status==status or (status=='approved' and d.status=='signed')]
    if department: docs=[d for d in docs if canonical_department(d.department)==canonical_department(department)]
    return {'items':[service.serialize(d,user=user) for d in docs[offset:offset+limit]],'total':len(docs),'categories':service.CATEGORIES,'departments':service.DEPARTMENTS}

@router.get('/flow')
def flow(q: str=Query('',max_length=200),category: str='',status: str='',department: str='',case_id: str=Query('',max_length=200),db: Session=Depends(get_db),user=Depends(current_user)):
    return document_flow(db,user,q,category,status,department,case_id)

@router.post('',status_code=201)
def upload(file: UploadFile=File(...),title: str=Form(''),category: str=Form('Contract'),department: str=Form('Achiziții'),supplier: str=Form(''),expires_at: str=Form(''),db: Session=Depends(get_db),user=Depends(current_user)):
    content=file.file.read(25*1024*1024+1)
    doc=service.create_document(db,user,content,file.filename or 'document.pdf',title,category,department,supplier,expires_at)
    return detail(db,user,doc)

@router.get('/{document_id}')
def get(document_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return detail(db,user,service.get_document(db,document_id,user))

@router.patch('/{document_id}')
def patch(document_id: str,body: DocumentPatch,db: Session=Depends(get_db),user=Depends(current_user)):
    return detail(db,user,service.patch_document(db,user,document_id,body.model_dump(exclude_unset=True)))

@router.post('/{document_id}/versions',status_code=201)
def version(document_id: str,file: UploadFile=File(...),comment: str=Form(''),db: Session=Depends(get_db),user=Depends(current_user)):
    content=file.file.read(25*1024*1024+1)
    return detail(db,user,service.add_version(db,user,document_id,content,file.filename or 'document.pdf',comment))

@router.post('/{document_id}/actions')
def action(document_id: str,body: Action,db: Session=Depends(get_db),user=Depends(current_user)):
    return detail(db,user,apply_action(db,user,document_id,body.action,body.comment,body.version))

@router.get('/{document_id}/file')
def file(document_id: str,version: int | None=None,download: bool=False,db: Session=Depends(get_db),user=Depends(current_user)):
    doc=service.get_document(db,document_id,user)
    v=db.scalar(select(DocumentVersion).where(DocumentVersion.document_id==doc.id,DocumentVersion.version==(version or doc.version)))
    if not v: raise DomainError('Versiunea nu există.',404)
    if not can_read_version(user, doc, v): raise DomainError('Versiunea nu a fost găsită sau nu ai acces.',404)
    path=Path(v.signed_path or v.file_path)
    if not path.is_file(): raise DomainError('Fișierul nu este disponibil.',404)
    expected=v.signed_sha256 or v.sha256
    if service.file_hash(path)!=expected: raise DomainError('Fișierul nu corespunde amprentei înregistrate.',409)
    record(db,user,'Document descărcat' if download else 'Document consultat',doc,f'Versiunea {v.version}')
    db.commit()
    return FileResponse(path,media_type='application/pdf',filename=v.filename,content_disposition_type='attachment' if download else 'inline',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})

@router.get('/{document_id}/extraction')
def extraction(document_id: str,page: int=Query(1,ge=1),db: Session=Depends(get_db),user=Depends(current_user)):
    from app.core.security import require_role
    from app.extraction import service as extraction_service
    doc=service.get_document(db,document_id,user)
    require_role(user,'director','reviewer','finance','hr')
    version=service.current_version(db,doc)
    if service.file_hash(version.file_path)!=version.sha256:
        raise DomainError('Integritatea originalului nu poate fi confirmată.',409)
    data=extraction_service.summary(db,version)
    if data['status']=='ready':
        result=extraction_service.cached_result(db,version)
        if page>len(result['pages']): raise DomainError('Pagina nu există.',404)
        data['page']={k:v for k,v in result['pages'][page-1].items() if k!='words'}
    return data

@router.post('/{document_id}/extraction/retry')
def retry_extraction(document_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    from app.extraction import service as extraction_service
    from sqlalchemy import text
    db.execute(text('BEGIN IMMEDIATE'))
    doc=service.get_document(db,document_id,user,edit=True)
    return extraction_service.retry(db,service.current_version(db,doc),doc)

@router.get('/{document_id}/verify')
def verify(document_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    doc=service.get_document(db,document_id,user)
    v=service.current_version(db,doc)
    if not v.signed_path:
        return {'integrity':service.file_hash(v.file_path)==v.sha256,'signed':False,'version':v.version,'sha256':v.sha256,'trust':'unsigned','reason':'Fișierul corespunde amprentei originale; nu este semnat.'}
    result=verify_file(v.signed_path,v.signer_id,v.certificate_fingerprint)
    result['integrity']=result['integrity'] and service.file_hash(v.signed_path)==v.signed_sha256
    record(db,user,'Semnătură verificată',doc,'Validă' if result['integrity'] else 'Integritate compromisă')
    db.commit()
    return {**result,'signed':True,'signer':v.signer_id,'version':v.version,'sha256':v.signed_sha256,'certificate_fingerprint':v.certificate_fingerprint,'trust':'demo-certificate'}
