from fastapi import APIRouter, Depends, Header
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from app.dependencies import current_user, get_db
from app.exchange import service

router = APIRouter(prefix='/api', tags=['Airport exchange'])


def peer(authorization: str = Header(default=''), x_peer_airport: str = Header(default=''),
         x_requester_id: str = Header(default=''), x_requester_roles: str = Header(default=''),
         x_requester_department: str = Header(default='')):
    return service.authenticated_peer(authorization, x_peer_airport, x_requester_id, x_requester_roles,x_requester_department)


@router.get('/exchange/shares')
def incoming(db: Session = Depends(get_db), airport=Depends(peer)):
    return service.incoming_list(db, airport)


@router.get('/exchange/shares/{share_id}/file')
def incoming_file(share_id: str, db: Session = Depends(get_db), airport=Depends(peer)):
    preview = service.incoming_file(db, airport, share_id)
    return FileResponse(preview.file_path, media_type='application/pdf', headers={'Cache-Control': 'no-store'})


@router.get('/received')
def received(db: Session = Depends(get_db), user=Depends(current_user)):
    return service.fetch_peer(db, user).json()


@router.get('/received/{share_id}/file')
def received_file(share_id: str, db: Session = Depends(get_db), user=Depends(current_user)):
    result = service.fetch_peer(db, user, f'/{share_id}/file')
    return Response(result.content, media_type='application/pdf', headers={'Cache-Control': 'no-store'})
