from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class AmendmentFields(BaseModel):
    model_config = ConfigDict(extra='forbid')

    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=5000)]
    clause_reference: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
    current_wording: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)] = ''
    proposed_wording: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=10000)]
    proposed_effective_date: date | None = None


class AmendmentCreate(AmendmentFields):
    source_version: int = Field(ge=1)


class AmendmentUpdate(AmendmentFields):
    revision: int = Field(ge=1)
