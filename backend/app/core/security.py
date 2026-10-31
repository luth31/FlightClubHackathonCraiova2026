import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Request, Depends
from sqlalchemy.orm import Session as DbSession
from app.database import get_db
from app.people.models import User, Session
from app.config import settings
from app.core.exceptions import DomainError

def hash_password(password: str, salt: str | None = None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120000).hex()
    return f'{salt}:{digest}'

def check_password(password: str, encoded: str):
    return hmac.compare_digest(hash_password(password, encoded.split(':')[0]), encoded)

def token_hash(token: str):
    return hashlib.sha256(token.encode()).hexdigest()

def issue_session(db, user, response, request=None, auth_source='demo'):
    """Rotate the browser's app session; identity-provider tokens never reach it."""
    if request:
        previous = request.cookies.get(f'aerodesk_session_{settings.airport_id}')
        if previous:
            old_session = db.get(Session, token_hash(previous))
            if old_session:
                db.delete(old_session)
    token = secrets.token_urlsafe(48)
    seconds = min(max(settings.oidc_session_minutes, 1), 720) * 60 if auth_source == 'oidc' else 43200
    db.add(Session(token_hash=token_hash(token), user_id=user.id,
        expires_at=(datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(),
        auth_source=auth_source, auth_issuer=settings.oidc_issuer if auth_source == 'oidc' else None))
    response.set_cookie(f'aerodesk_session_{settings.airport_id}', token,
        httponly=True, secure=settings.cookie_secure, samesite='strict', max_age=seconds, path='/api')

def optional_user(request: Request, db: DbSession = Depends(get_db)):
    aerodesk_session=request.cookies.get(f'aerodesk_session_{settings.airport_id}')
    if not aerodesk_session:
        return None
    session = db.get(Session, token_hash(aerodesk_session))
    if not session or datetime.fromisoformat(session.expires_at) <= datetime.now(timezone.utc):
        return None
    if session.auth_source != settings.auth_mode:
        return None
    if settings.auth_mode == 'oidc' and session.auth_issuer != settings.oidc_issuer:
        return None
    user = db.get(User, session.user_id)
    return user if user and user.active and user.airport_id == settings.airport_id else None

def current_user(user: User | None = Depends(optional_user), db: DbSession = Depends(get_db)):
    if not user:
        raise DomainError('Conectează-te pentru a continua.', 401)
    from app.people.management import refresh_appointments
    refresh_appointments(db)
    return user

def user_dict(user: User):
    return {k:getattr(user,k) for k in ('id','name','email','department','role','roles','airport_id','active','avatar')}

def has_role(user, *roles):
    return bool(set(user.roles) & set(roles))

def require_role(user, *roles):
    if not has_role(user, *roles):
        raise DomainError('Nu ai permisiunea necesară pentru această acțiune.', 403)

def can_read(user, document):
    if document.airport_id != user.airport_id:
        return False
    if document.department == 'Resurse umane':
        return has_role(user, 'hr') or (has_role(user, 'department_head') and user.department == document.department) or document.owner_id == user.id or document.created_by == user.id
    if has_role(user, 'director'):
        return True
    if has_role(user, 'department_head') and user.department == document.department:
        return True
    if has_role(user, 'technician'):
        return document.department == 'Tehnic' and document.category in ('Raport de mentenanță','Proces-verbal','Procedură','Instruire') and document.confidentiality not in ('restricted','confidential','confidențial')
    if has_role(user, 'hr'):
        return document.category == 'Procedură' or document.confidentiality == 'public'
    return document.department == user.department or document.confidentiality == 'public' or document.category in ('Contract','Procedură','Act adițional')

def can_edit(user, document):
    return can_read(user,document) and (has_role(user, 'director','reviewer','finance','hr') or document.created_by == user.id)
