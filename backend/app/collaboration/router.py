from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session
from app.dependencies import current_user, get_db
from app.core.exceptions import DomainError
from app.exchange.router import peer
from app.collaboration import service, participation
from app.collaboration.schemas import CreateRequest, MessageRequest, StatusRequest, ParticipationRequest, MailboxStateRequest

router = APIRouter(prefix='/api', tags=['Partner coordination'])


def coordination_peer(airport=Depends(peer), x_requester_roles: str=Header(default=''),
                      x_requester_department: str=Header(default='')):
    roles = set(x_requester_roles.split(','))
    if not ('director' in roles or 'department_head' in roles):
        raise DomainError('Coordonarea aparține conducerii și responsabililor autorizați.', 403)
    return airport


@router.get('/exchange/collaboration')
def exchange(after: int=Query(default=0, ge=0), airport=Depends(coordination_peer), db: Session=Depends(get_db)):
    return service.outgoing(db, airport, after)


@router.get('/collaboration')
def listing(user=Depends(current_user), db: Session=Depends(get_db)):
    return service.listing(db, user)


@router.post('/collaboration', status_code=201)
def create(body: CreateRequest, user=Depends(current_user), db: Session=Depends(get_db)):
    return service.create(db, user, body)


@router.patch('/collaboration/participation')
def update_participation(body: ParticipationRequest, user=Depends(current_user), db: Session=Depends(get_db)):
    return participation.update(db, user, body)


@router.get('/collaboration/airports')
def airports(q: str=Query(default='',max_length=150), available: bool=True,
             offset: int=Query(default=0,ge=0),limit: int=Query(default=12,ge=1,le=50),
             user=Depends(current_user),db: Session=Depends(get_db)):
    return service.airport_directory(db,user,q,available,offset,limit)


@router.patch('/collaboration/{identifier}/mailbox')
def mailbox(identifier: str,body: MailboxStateRequest,user=Depends(current_user),db: Session=Depends(get_db)):
    return service.update_mailbox(db,user,identifier,body)


@router.get('/collaboration/{identifier}')
def detail(identifier: str, user=Depends(current_user), db: Session=Depends(get_db)):
    return service.detail(db, user, identifier)


@router.post('/collaboration/{identifier}/messages', status_code=201)
def reply(identifier: str, body: MessageRequest, user=Depends(current_user), db: Session=Depends(get_db)):
    return service.append(db, user, identifier, body)


@router.post('/collaboration/{identifier}/status')
def status(identifier: str, body: StatusRequest, user=Depends(current_user), db: Session=Depends(get_db)):
    return service.append(db, user, identifier, body, status_change=True)
