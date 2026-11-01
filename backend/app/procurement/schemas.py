from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.procurement.catalog import money
from app.core.exceptions import DomainError


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class CaseCreate(StrictModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default='', max_length=10000)
    owner_id: str = Field(min_length=1, max_length=200)
    currency: str = Field(pattern=r'^[A-Z]{3}$')
    anticipated_value: str
    deadline: date | None = None

    @field_validator('anticipated_value')
    @classmethod
    def valid_money(cls, value):
        try: return format(money(value), '.2f')
        except DomainError as exc: raise ValueError(exc.message)

    @field_validator('title')
    @classmethod
    def title_required(cls, value):
        if not value.strip(): raise ValueError('Titlul este obligatoriu.')
        return value.strip()


class Revision(StrictModel):
    revision: int = Field(ge=1)


class CasePatch(Revision):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=10000)
    owner_id: str | None = Field(default=None, min_length=1, max_length=200)
    anticipated_value: str | None = None
    deadline: date | None = None
    primary_document_id: str | None = None


class Attach(Revision):
    document_id: str
    version: int = Field(ge=1)
    template_id: str


class Link(Revision):
    source_id: str
    target_id: str
    source_version: int = Field(ge=1)
    target_version: int = Field(ge=1)
    type: str


class Allocation(Revision):
    invoice_id: str
    acceptance_id: str
    invoice_version: int = Field(ge=1)
    acceptance_version: int = Field(ge=1)
    amount: str


class Action(Revision):
    action: Literal['advance', 'return', 'cancel', 'reopen']
    comment: str = Field(default='', max_length=10000)
    target_stage: str | None = None


class Payment(Revision):
    invoice_id: str
    invoice_version: int = Field(ge=1)
    kind: Literal['payment', 'refund']
    amount: str
    date: date
    reference: str = Field(min_length=1, max_length=500)


class Reverse(Revision):
    comment: str = Field(min_length=1, max_length=10000)
    date: date
    reference: str = Field(min_length=1, max_length=500)


class DocumentPatch(StrictModel):
    version: int = Field(ge=1)
    template_id: str
    fields: dict
