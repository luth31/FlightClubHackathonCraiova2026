from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.dependencies import current_user, get_db
from app.people.models import User
from app.people import service
from app.people.schemas import AccountUpdate, DelegationCreate, LeaveCreate, LeaveDecision

router = APIRouter(prefix='/api/people', tags=['people'])


@router.get('')
def directory(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.directory(db, user)


@router.post('/delegations', status_code=201)
def create_delegation(payload: DelegationCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.create_delegation(db, user, payload)


@router.post('/delegations/{delegation_id}/revoke')
def revoke_delegation(delegation_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.revoke_delegation(db, user, delegation_id)


@router.post('/leave', status_code=201)
def create_leave(payload: LeaveCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.create_leave(db, user, payload)


@router.post('/leave/{leave_id}/decision')
def decide_leave(leave_id: str, payload: LeaveDecision, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.decide_leave(db, user, leave_id, payload)


@router.patch('/{user_id}')
def update_account(user_id: str, payload: AccountUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.update_account(db, user, user_id, payload)
