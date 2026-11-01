from urllib.parse import urlencode
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.audit import record
from app.core.exceptions import DomainError
from app.core.security import issue_session
from app.database import get_db
from app.identity import service
from app.identity.origins import request_origin, primary_origin

router = APIRouter(prefix='/api/auth/oidc', tags=['Identity'])


def require_oidc():
    if settings.auth_mode != 'oidc':
        raise DomainError('Identitatea externă nu este activată pentru acest aeroport.',404)


def destination(error=None, origin=None):
    origin = origin or primary_origin()
    service.validate_configuration()
    return origin.frontend_url + ('?' + urlencode({'auth_error':error}) if error else '')


@router.get('/login')
def login(request: Request, login_hint: str | None = Query(default=None, min_length=1, max_length=254), db: Session = Depends(get_db)):
    require_oidc()
    origin = request_origin(request)
    try:
        url, browser = service.start_login(db, login_hint, origin)
    except service.IdentityError as exc:
        if exc.code == 'configuration_error':
            raise DomainError('Identitatea aeroportului nu este configurată corect.',503) from exc
        return RedirectResponse(destination(exc.code, origin),status_code=303)
    response = RedirectResponse(url,status_code=303)
    response.set_cookie(f'flyleaf_oidc_{settings.airport_id}',browser,httponly=True,
        secure=origin.secure,samesite='lax',max_age=service.FLOW_SECONDS,path='/api/auth/oidc')
    return response


@router.get('/callback')
def callback(request: Request, state: str | None = Query(default=None,max_length=256),
        code: str | None = Query(default=None,max_length=4096),
        error: str | None = Query(default=None,max_length=200),
        iss: str | None = Query(default=None,max_length=2000), db: Session = Depends(get_db)):
    require_oidc()
    origin = request_origin(request)
    try:
        transaction = service.consume_transaction(db,state,request.cookies.get(f'flyleaf_oidc_{settings.airport_id}'), origin)
        if error or not code:
            raise service.IdentityError('login_cancelled')
        if iss is not None and iss != origin.issuer:
            raise service.IdentityError('invalid_provider')
        user = service.complete_login(db,transaction,code)
        response = RedirectResponse(destination(origin=origin),status_code=303)
        issue_session(db,user,response,request,auth_source='oidc')
        record(db,user,'Conectare',detail='Identitate OIDC verificată · roluri locale')
        db.commit()
    except service.IdentityError as exc:
        db.rollback()
        response = RedirectResponse(destination(exc.code, origin),status_code=303)
    response.delete_cookie(f'flyleaf_oidc_{settings.airport_id}',path='/api/auth/oidc')
    return response
