from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user
from app.contracts import service
from app.contracts import amendments
from app.contracts import generation
from app.contracts.schemas import AmendmentCreate, AmendmentUpdate, AmendmentGenerate
from app.documents.service import CATEGORIES
from app.core.exceptions import DomainError

router=APIRouter(prefix='/api',tags=['Workspace'])

@router.get('/contracts')
def contracts(db: Session=Depends(get_db),user=Depends(current_user)):
    return service.contracts(db,user)

@router.get('/contracts/{contract_id}/amendment-drafts')
def amendment_drafts(contract_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return amendments.list_drafts(db,user,contract_id)

@router.get('/contracts/{contract_id}/amendment-drafts/{draft_id}/revisions')
def amendment_draft_revisions(contract_id: str,draft_id: str,db: Session=Depends(get_db),user=Depends(current_user)):
    return amendments.list_revisions(db,user,contract_id,draft_id)

@router.post('/contracts/{contract_id}/amendment-drafts',status_code=201)
def create_amendment_draft(contract_id: str,body: AmendmentCreate,db: Session=Depends(get_db),user=Depends(current_user)):
    return amendments.create_draft(db,user,contract_id,body)

@router.patch('/contracts/{contract_id}/amendment-drafts/{draft_id}')
def update_amendment_draft(contract_id: str,draft_id: str,body: AmendmentUpdate,db: Session=Depends(get_db),user=Depends(current_user)):
    return amendments.update_draft(db,user,contract_id,draft_id,body)

@router.post('/contracts/{contract_id}/amendment-drafts/{draft_id}/generate-pdf')
def generate_amendment_pdf(contract_id: str,draft_id: str,body: AmendmentGenerate,db: Session=Depends(get_db),user=Depends(current_user)):
    return generation.generate_pdf(db,user,contract_id,draft_id,body)

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
