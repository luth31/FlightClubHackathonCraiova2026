from fastapi import APIRouter, Depends, Query, File, Form, UploadFile
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user
from app.procurement import catalog, service, schemas

router=APIRouter(prefix='/api/procurement',tags=['Procurement'])


@router.get('/templates')
def templates(user=Depends(current_user)):
    return dict(version=catalog.VERSION,stages=catalog.STAGES,templates=catalog.TEMPLATES,relationships=catalog.RELATIONSHIPS)


@router.get('/cases')
def cases(q:str=Query('',max_length=200),db:Session=Depends(get_db),user=Depends(current_user)):
    return service.list_cases(db,user,q)


@router.post('/cases',status_code=201)
def create(body:schemas.CaseCreate,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.create_case(db,user,body)


@router.get('/cases/{ident}')
def get(ident:str,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.detail(db,user,service.get_case(db,user,ident))


@router.patch('/cases/{ident}')
def patch(ident:str,body:schemas.CasePatch,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.patch_case(db,user,ident,body)


@router.post('/cases/{ident}/documents')
def attach(ident:str,body:schemas.Attach,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.associate(db,user,ident,body)


@router.post('/cases/{ident}/upload',status_code=201)
def upload(ident:str,revision:int=Form(...,ge=1),template_id:str=Form(...),file:UploadFile=File(...),
           db:Session=Depends(get_db),user=Depends(current_user)):
    content=file.file.read(25*1024*1024+1)
    return service.upload_document(db,user,ident,revision,template_id,content,file.filename or 'document.pdf')


@router.delete('/cases/{ident}/documents/{document_id}')
def detach(ident:str,document_id:str,revision:int=Query(ge=1),db:Session=Depends(get_db),user=Depends(current_user)):
    return service.remove_association(db,user,ident,document_id,revision)


@router.post('/cases/{ident}/links')
def link(ident:str,body:schemas.Link,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.add_link(db,user,ident,body)


@router.delete('/cases/{ident}/links/{link_id}')
def unlink(ident:str,link_id:str,revision:int=Query(ge=1),db:Session=Depends(get_db),user=Depends(current_user)):
    return service.remove_link(db,user,ident,link_id,revision)


@router.post('/cases/{ident}/allocations')
def allocate(ident:str,body:schemas.Allocation,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.allocate(db,user,ident,body)


@router.delete('/cases/{ident}/allocations/{allocation_id}')
def unallocate(ident:str,allocation_id:str,revision:int=Query(ge=1),db:Session=Depends(get_db),user=Depends(current_user)):
    return service.remove_allocation(db,user,ident,allocation_id,revision)


@router.post('/cases/{ident}/actions')
def action(ident:str,body:schemas.Action,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.act(db,user,ident,body)


@router.post('/cases/{ident}/payments')
def payment(ident:str,body:schemas.Payment,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.pay(db,user,ident,body)


@router.post('/cases/{ident}/payments/{payment_id}/reverse')
def reversal(ident:str,payment_id:str,body:schemas.Reverse,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.reverse(db,user,ident,payment_id,body)


@router.get('/documents/{document_id}')
def document(document_id:str,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.document_detail(db,user,document_id)


@router.patch('/documents/{document_id}')
def metadata(document_id:str,body:schemas.DocumentPatch,db:Session=Depends(get_db),user=Depends(current_user)):
    return service.patch_metadata(db,user,document_id,body)
