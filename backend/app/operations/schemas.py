from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class ControlInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['start', 'pause', 'step', 'advance', 'reset']
    seconds: int = Field(default=300, ge=1, le=3600)
    speed: int | None = Field(default=None, ge=1, le=120)
    expected_revision: int | None = Field(default=None, ge=1)


class EventInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['nfc_check_in', 'nfc_check_out', 'gate_open', 'gate_close', 'emergency_declared', 'emergency_cleared']
    staff_id: str | None = Field(default=None, max_length=80)
    gate_id: str | None = Field(default=None, max_length=80)
    flight_id: str | None = Field(default=None, max_length=80)
    note: str = Field(default='', max_length=500)
    request_id: UUID | None = None
    expected_revision: int | None = Field(default=None, ge=1)
