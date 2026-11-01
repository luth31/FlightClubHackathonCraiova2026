from fastapi import APIRouter,Depends
from fastapi.responses import FileResponse,Response
from sqlalchemy import select,desc
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user,require_role,can_read,require_page,is_department_head,can_share_documents,require_share_documents
from app.core.exceptions import DomainError
from app.core.audit import record
from app.documents.models import Document
from app.documents.service import get_document
from app.documents.service import file_hash
from app.sharing.models import Share,SharePreview
from app.sharing.schemas import PreviewRequest,ShareRequest,AnalysisRequest,MatchRequest
from app.sharing import service,studio
from app.sharing.suggestions import redaction_suggestions
def sharing_access(user=Depends(current_user)):
    require_page(user, 'sharing')

router=APIRouter(prefix='/api',tags=['Sharing'],dependencies=[Depends(sharing_access)])

@router.get('/documents/{document_id}/redaction-layout')
def redaction_layout(document_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return studio.layout(db,user,document_id)

@router.get('/documents/{document_id}/redaction-pages/{page_number}')
def redaction_page(document_id: str,page_number: int,source_version: int,source_sha256: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return Response(studio.render_page(db,user,document_id,page_number,source_version,source_sha256),media_type='image/png')

@router.post('/documents/{document_id}/redaction-matches')
def redaction_matches(document_id: str,body: MatchRequest,db: Session=Depends(get_db),user=Depends(current_user)):
    studio.source(db,user,document_id,body.source_version,body.source_sha256)
    return {'items':studio.matches(studio.layout(db,user,document_id)['pages'],body.term)}

@router.post('/documents/{document_id}/redaction-analysis')
def redaction_analysis(document_id: str,body: AnalysisRequest,db: Session=Depends(get_db),user=Depends(current_user)):
    return studio.analyze(db,user,document_id,body)

@router.get('/documents/{document_id}/redaction-suggestions')
def suggestions(document_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return redaction_suggestions(db,user,document_id)

@router.post('/documents/{document_id}/share-preview')
def preview(document_id: str,body: PreviewRequest,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.preview(db,user,document_id,body.redact_terms,body.word_ids,body.source_version,body.source_sha256)

@router.get('/share-previews/{preview_id}/file')
def preview_file(preview_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    item=db.get(SharePreview,preview_id)
    if not item or item.creator_id!=user.id: raise DomainError('Copia nu a fost găsită.',404)
    get_document(db,item.document_id,user)
    if file_hash(item.file_path)!=item.sha256: raise DomainError('Integritatea copiei nu poate fi confirmată.',409)
    return FileResponse(item.file_path,media_type='application/pdf',headers={'Cache-Control':'no-store'})

@router.get('/share-previews/{preview_id}/pages/{page_number}')
def preview_page(preview_id: str,page_number: int,db: Session=Depends(get_db),user=Depends(current_user)):
    item=db.get(SharePreview,preview_id)
    if not item or item.creator_id!=user.id: raise DomainError('Copia nu a fost găsită.',404)
    get_document(db,item.document_id,user)
    if file_hash(item.file_path)!=item.sha256: raise DomainError('Integritatea copiei nu poate fi confirmată.',409)
    return Response(studio.render_file(item.file_path,page_number),media_type='image/png')

@router.post('/documents/{document_id}/shares',status_code=201)
def create(document_id: str,body: ShareRequest,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.create_share(db,user,document_id,body)

@router.get('/shares')
def listing(db: Session=Depends(get_db),user=Depends(current_user)):
    if not is_department_head(user):
        require_role(user,'director','reviewer')
    items=[s for s in db.scalars(select(Share).order_by(desc(Share.created_at))).all() if (d:=db.get(Document,s.document_id)) and can_read(user,d)]
    return {'items':[{**service.serialize(s,db),'can_revoke':can_share_documents(user)} for s in items],'total':len(items)}

@router.post('/shares/{share_id}/revoke')
def revoke(share_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    require_share_documents(user)
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
