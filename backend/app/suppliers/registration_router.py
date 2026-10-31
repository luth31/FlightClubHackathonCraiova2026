from fastapi import APIRouter,Depends
from app.database import get_db
from app.core.security import current_user
from app.suppliers import registration
from app.suppliers.schemas import RegistrationCreate,RegistrationVerification,Decision
router=APIRouter(prefix='/api/supplier-registrations',tags=['Supplier onboarding'])
@router.get('')
def listing(db=Depends(get_db),user=Depends(current_user)): return registration.listing(db,user)
@router.post('',status_code=201)
def create(body:RegistrationCreate,db=Depends(get_db),user=Depends(current_user)): return registration.create(db,user,body)
@router.get('/{identifier}')
def detail(identifier:str,db=Depends(get_db),user=Depends(current_user)): return registration.serialize(db,user,registration.get_registration(db,user,identifier))
@router.post('/{identifier}/verify')
def verify(identifier:str,body:RegistrationVerification,db=Depends(get_db),user=Depends(current_user)): return registration.verify(db,user,identifier,body)
@router.post('/{identifier}/approve')
def approve(identifier:str,body:Decision,db=Depends(get_db),user=Depends(current_user)): return registration.approve(db,user,identifier,body.comment)
@router.post('/{identifier}/reject')
def reject(identifier:str,body:Decision,db=Depends(get_db),user=Depends(current_user)): return registration.reject(db,user,identifier,body.comment)
