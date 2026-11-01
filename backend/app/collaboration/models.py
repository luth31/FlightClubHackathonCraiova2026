from sqlalchemy import Integer, JSON, String, Text, UniqueConstraint
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

