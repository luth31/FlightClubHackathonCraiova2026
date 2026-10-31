from sqlalchemy import String, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class AuditEvent(Base):
    __tablename__ = 'audit_events'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String)
    actor_id: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    document_id: Mapped[str | None] = mapped_column(String, nullable=True)
    document_title: Mapped[str] = mapped_column(String, default='')
    created_at: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text, default='')
    airport_id: Mapped[str] = mapped_column(String)
