from fastapi import APIRouter,Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user
from app.suppliers import service
from app.suppliers.schemas import ReviewCreate,Verification,Decision
router=APIRouter(prefix='/api/supplier-reviews',tags=['Supplier review'])

@router.get('')
def listing(db: Session=Depends(get_db),user=Depends(current_user)):
    return service.list_reviews(db,user)

@router.post('',status_code=201)
def create(body: ReviewCreate,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.create_review(db,user,body)

@router.post('/{case_id}/verify')
def verify(case_id: str,body: Verification,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.verify(db,user,case_id,body)

@router.post('/{case_id}/approve')
def approve(case_id: str,body: Decision,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.approve(db,user,case_id,body.comment)

@router.post('/{case_id}/reject')
def reject(case_id: str,body: Decision,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.reject(db,user,case_id,body.comment)

@router.get('/registry/{supplier_id}')
def registry_detail(supplier_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.registry_detail(db,user,supplier_id)

@router.get('/{case_id}')
def detail(case_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return service.detail(db,user,case_id)
