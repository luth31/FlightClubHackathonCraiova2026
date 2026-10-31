from pydantic import BaseModel,Field,field_validator,model_validator
from datetime import date
from typing import Literal
from app.suppliers.validation import normalize_email
class ReviewCreate(BaseModel):
    document_id: str | None=Field(default=None,max_length=100)
    supplier_name: str=Field(default='',max_length=200)
    supplier_id: str | None=Field(default=None,max_length=100)
    previous_review_id: str | None=Field(default=None,max_length=100)
    observed_iban: str=Field(min_length=1,max_length=80)
    sender_email: str=Field(min_length=3,max_length=250)
    invoice_amount: float | None=Field(default=None,ge=0,allow_inf_nan=False)
    invoice_currency: str | None=Field(default=None,pattern='^[A-Z]{3}$')
    service_date: date | None=None
    message: str=Field(default='',max_length=10000)

    @field_validator('sender_email')
    @classmethod
    def sender(cls,value):
        return normalize_email(value)

    @field_validator('invoice_currency',mode='before')
    @classmethod
    def currency(cls,value):
        return value.strip().upper() if isinstance(value,str) else value

    @model_validator(mode='after')
    def amount_currency(self):
        self.invoice_currency=(self.invoice_currency or 'RON') if self.invoice_amount is not None else None
        return self
class Verification(BaseModel):
    contact_used: str=Field(min_length=3,max_length=250)
    note: str=Field(min_length=10,max_length=2000)

    @field_validator('contact_used','note',mode='before')
    @classmethod
    def trim_evidence(cls,value):
        return value.strip() if isinstance(value,str) else value
class Decision(BaseModel):
    comment: str=Field(default='',max_length=2000)

class ContractLink(BaseModel):
    document_id: str=Field(min_length=1,max_length=100)
    version: int=Field(ge=1)

class SupplierUpdate(BaseModel):
    model_config={'extra':'forbid'}
    address: str | None=Field(default=None,max_length=500)
    category: str | None=Field(default=None,max_length=100)
    state: Literal['active','suspended'] | None=None
    registry_revision: int=Field(ge=1)
    comment: str=Field(min_length=3,max_length=2000)
    @field_validator('comment','address','category','state',mode='before')
    @classmethod
    def trim(cls,value):
        if value is None: raise ValueError('Valoarea nu poate fi null.')
        return value.strip() if isinstance(value,str) else value
