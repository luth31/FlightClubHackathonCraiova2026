"""Shared permission-first filtering for list and export."""
import unicodedata
from datetime import date
from typing import Literal
from pydantic import BaseModel,Field,model_validator
from sqlalchemy import select,desc
from app.suppliers.models import SupplierReview
from app.documents.models import Document
from app.core.security import require_role,can_read

class ReviewFilters(BaseModel):
    q: str=Field(default='',max_length=250)
    status: Literal['clear','needs_review','verified','approved','rejected'] | None=None
    risk_level: Literal['low','medium','high'] | None=None
    created_from: date | None=None
    created_to: date | None=None
    limit: int=Field(default=25,ge=1,le=100)
    offset: int=Field(default=0,ge=0)
    mine: bool=False
    @model_validator(mode='after')
    def interval(self):
        if self.created_from and self.created_to and self.created_from>self.created_to:
            raise ValueError('Intervalul de date este inversat.')
        return self

def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFD',str(value).casefold()) if not unicodedata.combining(c) and not c.isspace())

def matching_reviews(db,user,filters):
    require_role(user,'director','finance')
    result=[]
    for item in db.scalars(select(SupplierReview).where(SupplierReview.airport_id==user.airport_id).order_by(desc(SupplierReview.created_at),desc(SupplierReview.id))):
        if item.document_id:
            doc=db.get(Document,item.document_id)
            if not doc or not can_read(user,doc): continue
        risk='high' if any(r['code'] in ('iban_mismatch','invalid_iban') for r in item.reasons) else 'medium' if item.reasons else 'low'
        if filters.status and item.status!=filters.status: continue
        if filters.mine and item.assigned_to!=user.id: continue
        if filters.risk_level and risk!=filters.risk_level: continue
        if filters.created_from and item.created_at[:10]<filters.created_from.isoformat(): continue
        if filters.created_to and item.created_at[:10]>filters.created_to.isoformat(): continue
        if filters.q and normalized(filters.q) not in normalized(' '.join((item.id,item.supplier_name,item.sender_email,item.observed_iban,item.expected_iban))): continue
        result.append(item)
    return result
