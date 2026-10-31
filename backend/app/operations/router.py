from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import current_user
from app.database import get_db
from app.operations import service, traffic
from app.operations.schemas import ControlInput, EventInput

router = APIRouter(prefix='/api/operations', tags=['operations'])


@router.get('')
def get_operations(user=Depends(current_user), db: Session=Depends(get_db)):
    return service.get_snapshot(db, user)


@router.post('/control')
def control_operations(body: ControlInput, user=Depends(current_user), db: Session=Depends(get_db)):
    return service.control(db, user, body)


@router.post('/events')
def create_event(body: EventInput, user=Depends(current_user), db: Session=Depends(get_db)):
    return service.input_event(db, user, body)


@router.get('/events')
def list_events(run_id: str | None=Query(default=None, max_length=100), offset: int=Query(default=0, ge=0),
                limit: int=Query(default=200, ge=1, le=1000), user=Depends(current_user), db: Session=Depends(get_db)):
    return service.history(db, user, run_id, offset, limit)


@router.get('/traffic')
def live_traffic(user=Depends(current_user)):
    return traffic.get_traffic(user)
