from sqlalchemy import Boolean, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CollaborationThread(Base):
    __tablename__ = 'collaboration_threads'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    requester_airport_id: Mapped[str] = mapped_column(String)
    recipient_airport_id: Mapped[str] = mapped_column(String)
    requester_department: Mapped[str | None] = mapped_column(String, nullable=True)
    recipient_department: Mapped[str | None] = mapped_column(String, nullable=True)
    requester_contact: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recipient_contact: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    category: Mapped[str] = mapped_column(String, default='request', server_default='request')
    subject: Mapped[str] = mapped_column(String)
    topic: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)


class CollaborationEvent(Base):
    __tablename__ = 'collaboration_events'
    __table_args__ = (
        UniqueConstraint('airport_id', 'author_id', 'idempotency_key', name='uq_collaboration_idempotency'),
        UniqueConstraint('airport_id', 'author_airport_id', 'origin_sequence', name='uq_collaboration_origin'),
    )
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String, unique=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    thread_id: Mapped[str] = mapped_column(String, index=True)
    author_airport_id: Mapped[str] = mapped_column(String)
    author_id: Mapped[str | None] = mapped_column(String, nullable=True)
    author_role: Mapped[str] = mapped_column(String)
    origin_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String)
    attachment: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String, nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String, nullable=True)


class CollaborationSync(Base):
    __tablename__ = 'collaboration_sync'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String)
    peer_airport_id: Mapped[str] = mapped_column(String)
    received_cursor: Mapped[int] = mapped_column(Integer, default=0)
    peer_name: Mapped[str | None] = mapped_column(String, nullable=True)
    departments: Mapped[list | None] = mapped_column(JSON, nullable=True)
    last_synced_at: Mapped[str | None] = mapped_column(String, nullable=True)
    acknowledged_cursor: Mapped[int] = mapped_column(Integer, default=0)
    participation_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default='0')
    contacts: Mapped[list | None] = mapped_column(JSON, nullable=True)


class CollaborationParticipation(Base):
    __tablename__ = 'collaboration_participation'
    airport_id: Mapped[str] = mapped_column(String, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String, nullable=True)


class CollaborationMailboxState(Base):
    __tablename__ = 'collaboration_mailbox_state'
    airport_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    thread_id: Mapped[str] = mapped_column(String, primary_key=True)
    read_sequence: Mapped[int] = mapped_column(Integer, default=0)
    starred: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

