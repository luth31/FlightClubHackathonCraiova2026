from datetime import date as Date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import current_user
from app.database import get_db
from app.operations import service, traffic, ledger, strategies
from app.operations.schemas import ControlInput, EventInput, NfcInput

router = APIRouter(prefix='/api/operations', tags=['operations'])


@router.get('')
def get_operations(user=Depends(current_user), db: Session=Depends(get_db)):
    return service.get_snapshot(db, user)


@router.get('/timeline')
def simulation_timeline(at_seconds: int=Query(ge=0, le=3600), run_id: str=Query(min_length=1, max_length=100),
                        user=Depends(current_user), db: Session=Depends(get_db)):
    return service.timeline_preview(db, user, at_seconds, run_id)


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


@router.post('/nfc')
def scan_card(body: NfcInput, user=Depends(current_user), db: Session=Depends(get_db)):
    return service.nfc(db,user,body)


@router.get('/ledger')
def operational_ledger(date: Date | None=Query(default=None), status: Literal['all','attention']='all',
                       search: str=Query(default='', max_length=120), user=Depends(current_user), db: Session=Depends(get_db)):
    return ledger.get_ledger(db,user,date,status,search)


@router.get('/strategies')
def operational_strategies(user=Depends(current_user), db: Session=Depends(get_db)):
    return strategies.proposals(db,user)


@router.post('/strategies/{strategy_id}/draft')
def create_sop_draft(strategy_id: str, user=Depends(current_user), db: Session=Depends(get_db)):
    return strategies.draft(db,user,strategy_id)


@router.get('/summary')
def operations_summary(user=Depends(current_user), db: Session=Depends(get_db)):
    result=ledger.get_ledger(db,user)
    return {key:result[key] for key in ('metrics','reference_date','period')}


@router.get('/runs')
def previous_runs(offset: int=Query(default=0,ge=0), limit: int=Query(default=100,ge=1,le=200),
                  user=Depends(current_user), db: Session=Depends(get_db)):
    return service.runs(db,user,offset,limit)
