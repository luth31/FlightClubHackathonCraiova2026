from datetime import date
from pydantic import BaseModel,Field
class PreviewRequest(BaseModel):
    redact_terms: list[str]=Field(default_factory=list,max_length=50)
    word_ids: list[str]=Field(default_factory=list,max_length=5000)
    source_version: int | None=Field(default=None,ge=1)
    source_sha256: str | None=Field(default=None,pattern=r'^[a-f0-9]{64}$')
class StudioRequest(BaseModel):
    source_version: int=Field(ge=1)
    source_sha256: str=Field(pattern=r'^[a-f0-9]{64}$')
class MatchRequest(StudioRequest):
    term: str=Field(min_length=1,max_length=500)
class AnalysisRequest(StudioRequest):
    context: str=Field(default='',max_length=3000)
    purpose: str=Field(default='Schimb controlat cu aeroportul partener',max_length=300)
class ShareRequest(BaseModel):
    recipient_airport: str=Field(default='Aeroportul Carpați',max_length=200)
    recipient_airport_id: str=Field(default='carpati',max_length=100)
    recipient_department: str | None=Field(default=None,max_length=100)
    expires_at: date
    preview_id: str
    reviewed: bool
