from fastapi import APIRouter,Depends
from fastapi.responses import FileResponse
from sqlalchemy import select,desc
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user,require_role,can_read
from app.core.exceptions import DomainError
from app.core.audit import record
from app.documents.models import Document
from app.documents.service import get_document
from app.sharing.models import Share,SharePreview
from app.sharing.schemas import PreviewRequest,ShareRequest
from app.sharing import service
from app.sharing.suggestions import redaction_suggestions
router=APIRouter(prefix='/api',tags=['Sharing'])

@router.get('/documents/{document_id}/redaction-suggestions')
def suggestions(document_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return redaction_suggestions(db,user,document_id)

@router.post('/documents/{document_id}/share-preview')
def preview(document_id: str,body: PreviewRequest,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.preview(db,user,document_id,body.redact_terms)

@router.get('/share-previews/{preview_id}/file')
def preview_file(preview_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    item=db.get(SharePreview,preview_id)
    if not item or item.creator_id!=user.id: raise DomainError('Copia nu a fost găsită.',404)
    get_document(db,item.document_id,user)
    return FileResponse(item.file_path,media_type='application/pdf',headers={'Cache-Control':'no-store'})

@router.post('/documents/{document_id}/shares',status_code=201)
def create(document_id: str,body: ShareRequest,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.create_share(db,user,document_id,body)

@router.get('/shares')
def listing(db: Session=Depends(get_db),user=Depends(current_user)):
    require_role(user,'director','reviewer')
    items=[s for s in db.scalars(select(Share).order_by(desc(Share.created_at))).all() if (d:=db.get(Document,s.document_id)) and can_read(user,d)]
    return {'items':[service.serialize(s,db) for s in items],'total':len(items)}

@router.post('/shares/{share_id}/revoke')
def revoke(share_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    require_role(user,'director','reviewer')
    share=db.get(Share,share_id)
    if not share: raise DomainError('Partajarea nu există.',404)
    doc=get_document(db,share.document_id,user)
    if not share.revoked:
        share.revoked=True; record(db,user,'Partajare revocată',doc,share.recipient_airport); db.commit()
    return service.serialize(share,db)

@router.get('/shares/{share_id}/file')
def file(share_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    item=service.share_file(db,user,share_id)
    return FileResponse(item.file_path,media_type='application/pdf',headers={'Cache-Control':'no-store'})
