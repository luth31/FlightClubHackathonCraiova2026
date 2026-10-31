from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user
from app.contracts import service
from app.documents.service import CATEGORIES
from app.core.exceptions import DomainError

router=APIRouter(prefix='/api',tags=['Workspace'])

@router.get('/contracts')
def contracts(db: Session=Depends(get_db),user=Depends(current_user)):
    return service.contracts(db,user)

@router.get('/dashboard')
def dashboard(db: Session=Depends(get_db),user=Depends(current_user)):
    return service.dashboard(db,user)

@router.get('/audit')
def audit(db: Session=Depends(get_db),user=Depends(current_user)):
    return service.audit(db,user)

@router.get('/reports/register.csv')
def report(category: str='',db: Session=Depends(get_db),user=Depends(current_user)):
    if category and category not in CATEGORIES: raise DomainError('Tipul documentului nu este valid.',422)
    content=service.report(db,user,category)
    return StreamingResponse(iter([content]),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="registru-aerodesk.csv"','Cache-Control':'no-store'})
