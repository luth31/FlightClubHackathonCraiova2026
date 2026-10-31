from fastapi import APIRouter, Depends, Response, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession
from sqlalchemy import select
from app.database import get_db
from app.people.models import User, Session
from app.core.security import optional_user, check_password, token_hash, user_dict, issue_session
from app.core.exceptions import DomainError
from app.core.audit import record
from app.config import settings
from app.identity.service import provider_logout_url

router = APIRouter(prefix='/api', tags=['Identity'])
class Login(BaseModel):
    user_id: str = Field(max_length=100)
    password: str = Field(min_length=1,max_length=200)

def session_payload(db, user):
    users = db.scalars(select(User).where(User.airport_id == settings.airport_id, User.active == True)).all()
    login_url = '/api/auth/oidc/login' if settings.auth_mode == 'oidc' else None
    return {'current_user':user_dict(user) if user else None,
        'users':[user_dict(u) for u in users] if user or settings.auth_mode == 'demo' else [],
        'airport':{'id':settings.airport_id,'name':settings.airport_name},
        'reference_date':str(settings.reference_date),'demo':settings.auth_mode == 'demo',
        'auth_mode':settings.auth_mode, 'login_url':login_url, 'logout_url':'/api/auth/logout',
        'auth':{'mode':settings.auth_mode,'login_url':login_url,'logout_url':'/api/auth/logout'}}

@router.get('/session')
def session(db: DbSession = Depends(get_db), user=Depends(optional_user)):
    return session_payload(db,user)

@router.post('/auth/login')
def login(body: Login, response: Response, request: Request, db: DbSession = Depends(get_db)):
    if settings.auth_mode != 'demo':
        raise DomainError('Autentificarea locală este dezactivată. Folosește identitatea aeroportului.',403)
    user = db.get(User,body.user_id)
    if not user or not user.active or user.airport_id != settings.airport_id or not check_password(body.password,user.password_hash):
        raise DomainError('Contul sau parola nu este corectă.',401)
    issue_session(db,user,response,request)
    record(db,user,'Conectare',detail='Sesiune locală autentificată')
    db.commit()
    return session_payload(db,user)

@router.post('/auth/logout')
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)):
    aerodesk_session=request.cookies.get(f'aerodesk_session_{settings.airport_id}')
    if aerodesk_session:
        session = db.get(Session,token_hash(aerodesk_session))
        if session: db.delete(session)
        db.commit()
    response.delete_cookie(f'aerodesk_session_{settings.airport_id}',path='/api')
    response.delete_cookie(f'aerodesk_oidc_{settings.airport_id}',path='/api/auth/oidc')
    return {'ok':True,'redirect_url':provider_logout_url() if settings.auth_mode == 'oidc' else None}
