from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import current_user, require_role
from app.database import get_db
from app.renewals import service
from app.renewals.schemas import Acknowledgement, Assignment, Closure, Progress


router = APIRouter(prefix='/api/contract-renewals', tags=['Contract renewals'])


@router.get('')
def listing(status: str = Query('open', pattern='^(open|closed|all)$'),
        db: Session = Depends(get_db), user = Depends(current_user)):
    return service.list_renewals(db, user, status)


@router.post('/synchronize')
def synchronize(db: Session = Depends(get_db), user = Depends(current_user)):
    require_role(user, 'admin', 'director')
    service.sync_all(user)
    return service.list_renewals(db, user)


@router.get('/{renewal_id}')
def detail(renewal_id: str, db: Session = Depends(get_db), user = Depends(current_user)):
    renewal, document = service.get_renewal(db, user, renewal_id)
    return service.serialize(db, user, renewal, document)


@router.post('/{renewal_id}/acknowledge')
def acknowledge(renewal_id: str, body: Acknowledgement,
        db: Session = Depends(get_db), user = Depends(current_user)):
    return service.acknowledge(db, user, renewal_id, body)


@router.post('/{renewal_id}/progress')
def progress(renewal_id: str, body: Progress,
        db: Session = Depends(get_db), user = Depends(current_user)):
    return service.progress(db, user, renewal_id, body)


@router.post('/{renewal_id}/close')
def close(renewal_id: str, body: Closure,
        db: Session = Depends(get_db), user = Depends(current_user)):
    return service.close(db, user, renewal_id, body)


@router.post('/{renewal_id}/assign')
def assign(renewal_id: str, body: Assignment,
        db: Session = Depends(get_db), user = Depends(current_user)):
    return service.assign(db, user, renewal_id, body)
