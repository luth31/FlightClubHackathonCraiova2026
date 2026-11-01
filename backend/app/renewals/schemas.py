from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class Acknowledgement(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=1)


class Progress(Acknowledgement):
    comment: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=2000)]
    next_due_date: date | None = None


class Closure(Acknowledgement):
    comment: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=2000)]


class Assignment(Acknowledgement):
    assigned_to: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    comment: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=2000)]
    due_date: date | None = None
