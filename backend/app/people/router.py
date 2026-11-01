from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.dependencies import current_user, get_db
from app.people.models import User
from app.people import service
from app.people.schemas import AccountUpdate, DelegationCreate, LeaveCreate, LeaveDecision
from app.people.schemas import EmployeeCreate, EmployeeUpdate, AppointmentCreate, SigningAuthority
from app.people import management
from app.people import profile
from app.people.schemas import PresenceUpdate, StatusMessageUpdate

router = APIRouter(prefix='/api/people', tags=['people'])


@router.get('')
def directory(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.directory(db, user)


@router.get('/me/profile')
def own_profile(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return profile.own_profile(db, user)


@router.patch('/me/presence')
def update_presence(payload: PresenceUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return profile.set_presence(db, user, payload)


@router.patch('/me/status-message')
def update_status_message(payload: StatusMessageUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return profile.set_message(db, user, payload)


@router.post('/me/photo')
def update_photo(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    return profile.set_photo(db, user, file.file.read(profile.MAX_PHOTO_BYTES + 1))


@router.delete('/me/photo')
def delete_photo(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return profile.remove_photo(db, user)


@router.get('/{user_id}/photo')
def get_photo(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return Response(profile.read_photo(db, user, user_id), media_type='image/png')


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
    return management.update_account(db, user, user_id, payload)


@router.post('', status_code=201)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.create_employee(db, user, payload)


@router.patch('/{user_id}/profile')
def edit_employee(user_id: str, payload: EmployeeUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.update_profile(db, user, user_id, payload)


@router.post('/{user_id}/provision')
def retry_provision(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.retry_provision(db, user, user_id)


@router.post('/{user_id}/sync-identity')
def sync_identity(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.sync_identity(db, user, user_id)


@router.post('/{user_id}/activation-instructions')
def activation_instructions(user_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.activation_instructions(db, user, user_id)


@router.get('/appointments')
def appointments(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.list_appointments(db, user)


@router.post('/appointments', status_code=201)
def propose_head(payload: AppointmentCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.propose_head(db, user, payload)


@router.post('/appointments/{appointment_id}/decision')
def decide_head(appointment_id: str, payload: LeaveDecision, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.decide_head(db, user, appointment_id, payload)


@router.post('/{user_id}/signing-authority')
def signing_authority(user_id: str, payload: SigningAuthority, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return management.signing_authority(db, user, user_id, payload)
