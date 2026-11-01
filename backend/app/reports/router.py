from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import date
from typing import Literal

from app.core.security import current_user
from app.database import get_db
from app.reports import service
from app.reports.briefing import build

router = APIRouter(prefix='/api/reports', tags=['Reports'])


@router.get('')
def catalog(db: Session = Depends(get_db), user=Depends(current_user)):
    return service.catalog(db, user)


@router.get('/briefing')
def briefing(department: str = Query('', max_length=100), db: Session = Depends(get_db), user=Depends(current_user)):
    return build(db, user, department)


@router.get('/operations')
def operations(days: Literal['0', '7', '30'] = '7', scope: Literal['all', 'current'] = 'all',
               db: Session = Depends(get_db), user=Depends(current_user)):
    from app.reports.operations import build as build_operations
    return build_operations(db, user, int(days), scope)


@router.get('/{report_id}/export.csv')
def export(report_id: str, days: int = Query(90, ge=30, le=365),
           department: str = Query('', max_length=100),
           as_of: date | None = None,
           db: Session = Depends(get_db), user=Depends(current_user)):
    data = service.report(db, user, report_id, days, department, reference_date=as_of)
    return Response(service.export_csv(data), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="flyleaf-{data["report"]["id"]}.csv"', 'Cache-Control': 'no-store'})


@router.get('/{report_id}')
def detail(report_id: str, days: int = Query(90, ge=30, le=365),
           department: str = Query('', max_length=100),
           as_of: date | None = None,
           db: Session = Depends(get_db), user=Depends(current_user)):
    return service.report(db, user, report_id, days, department, reference_date=as_of)
