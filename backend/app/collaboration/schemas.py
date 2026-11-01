import unicodedata
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    @field_validator('*', mode='before')
    @classmethod
    def plain_text(cls, value):
        if isinstance(value, str):
            value = unicodedata.normalize('NFC', value).replace('\r\n', '\n')
            if any(unicodedata.category(c) in ('Cc', 'Cf') and c not in '\n\t' for c in value):
                raise ValueError('Textul conține caractere de control nepermise.')
        return value


class Idempotent(Strict):
    idempotency_key: str = Field(min_length=8, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')


class CreateRequest(Idempotent):
    recipient_airport_id: str = Field(min_length=1, max_length=100)
    recipient_user_id: str = Field(min_length=1, max_length=100)
    category: Literal['request', 'document', 'problem'] = 'request'
    share_id: str | None = Field(default=None, max_length=100, pattern=r'^share-[a-zA-Z0-9-]+$')
    subject: str = Field(min_length=3, max_length=160)
    topic: str = Field(default='Proceduri și bune practici', min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=3000)


class MessageRequest(Idempotent):
    body: str = Field(min_length=1, max_length=3000)
    share_id: str | None = Field(default=None, max_length=100, pattern=r'^share-[a-zA-Z0-9-]+$')


class StatusRequest(Idempotent):
    status: Literal['resolved', 'declined']
    body: str = Field(default='', max_length=3000)


class Attachment(Strict):
    share_id: str = Field(max_length=100, pattern=r'^share-[a-zA-Z0-9-]+$')
    title: str = Field(min_length=1, max_length=500)
    source_airport_id: Literal['craiova', 'sibiu', 'cluj', 'iasi']
    source_version: int = Field(ge=1)


class Contact(Strict):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=1, max_length=254)
    department: str = Field(min_length=1, max_length=100)
    job_title: str = Field(min_length=1, max_length=200)
    role: Literal['director', 'department_head']


class MailboxStateRequest(Strict):
    read_sequence: int | None = Field(default=None,ge=0)
    starred: bool | None = None
    archived: bool | None = None


class ParticipationRequest(Strict):
    enabled: bool
    revision: int = Field(ge=0)


class ThreadHeader(Strict):
    requester_contact: Contact | None = None
    recipient_contact: Contact | None = None
    category: Literal['request', 'document', 'problem'] = 'request'
    requester_department: str | None = Field(default=None, max_length=100)
    recipient_department: str | None = Field(default=None, max_length=100)
    id: str = Field(max_length=100, pattern=r'^request-(craiova|sibiu|cluj|iasi)-[a-f0-9]{32}$')
    requester_airport_id: Literal['craiova', 'sibiu', 'cluj', 'iasi']
    recipient_airport_id: Literal['craiova', 'sibiu', 'cluj', 'iasi']
    subject: str = Field(min_length=3, max_length=160)
    topic: str = Field(min_length=1, max_length=80)
    created_at: datetime


class WireEvent(Strict):
    author_id: str | None = Field(default=None, max_length=100)
    id: str = Field(max_length=100, pattern=r'^collab-(craiova|sibiu|cluj|iasi)-[a-f0-9]{32}$')
    sequence: int = Field(ge=1)
    author_airport_id: Literal['craiova', 'sibiu', 'cluj', 'iasi']
    author_role: Literal['director', 'Conformitate', 'department_head']
    kind: Literal['request', 'reply', 'resolved', 'declined']
    body: str = Field(max_length=3000)
    created_at: datetime
    attachment: Attachment | None = None
    thread: ThreadHeader


class PartnerDepartment(Strict):
    name: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=160)


class Feed(Strict):
    participation_enabled: bool = False
    contacts: list[Contact] = Field(default_factory=list, max_length=100)
    source_airport_name: str | None = Field(default=None, max_length=200)
    departments: list[PartnerDepartment] = Field(default_factory=list, max_length=100)
    source_airport_id: Literal['craiova', 'sibiu', 'cluj', 'iasi']
    recipient_airport_id: Literal['craiova', 'sibiu', 'cluj', 'iasi']
    events: list[WireEvent] = Field(max_length=100)
    next_cursor: int = Field(ge=0)
    acknowledged_cursor: int = Field(ge=0)
    has_more: bool

