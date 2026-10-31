from datetime import date
from pydantic import BaseModel,Field
class PreviewRequest(BaseModel):
    redact_terms: list[str]=Field(default_factory=list,max_length=50)
class ShareRequest(BaseModel):
    recipient_airport: str=Field(default='Aeroportul Carpați',max_length=200)
    recipient_airport_id: str=Field(default='carpati',max_length=100)
    recipient_department: str | None=Field(default=None,max_length=100)
    expires_at: date
    preview_id: str
    reviewed: bool
