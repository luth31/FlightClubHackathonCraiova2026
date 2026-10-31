from typing import Literal
from pydantic import BaseModel, Field, field_validator
from datetime import date

class DocumentPatch(BaseModel):
    title: str | None = Field(default=None,min_length=2,max_length=300)
    category: str | None = Field(default=None,max_length=100)
    department: str | None = Field(default=None,max_length=100)
    supplier: str | None = Field(default=None,max_length=200)
    expires_at: date | None = None
    value: float | None = Field(default=None,ge=0,allow_inf_nan=False)
    metadata: dict | None = None
    summary: str | None = Field(default=None,max_length=10000)
    confidentiality: Literal['public','internal','restricted','confidential'] | None = None

    @field_validator('metadata')
    @classmethod
    def finite_metadata(cls,value):
        import math
        def inspect(item):
            if isinstance(item,float) and not math.isfinite(item): raise ValueError('Metadatele nu pot conține numere infinite.')
            if isinstance(item,dict):
                for child in item.values(): inspect(child)
            if isinstance(item,list):
                for child in item: inspect(child)
        inspect(value)
        return value

class Action(BaseModel):
    action: Literal['submit','validate','approve','reject','archive','sign']
    comment: str = Field(default='',max_length=2000)
    version: int | None = None
