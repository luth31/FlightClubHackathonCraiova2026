from sqlalchemy import String, Text, Integer, Boolean, JSON, Float, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Document(Base):
    __tablename__ = 'documents'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    number: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String, index=True)
    department: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)
    expires_at: Mapped[str | None] = mapped_column(String, nullable=True)
    supplier: Mapped[str | None] = mapped_column(String, nullable=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String, default='RON')
    owner: Mapped[str] = mapped_column(String)
    owner_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(String, default='seed')
    confidentiality: Mapped[str] = mapped_column(String, default='internal')
    summary: Mapped[str] = mapped_column(Text, default='')
    searchable_text: Mapped[str] = mapped_column(Text, default='')
    version: Mapped[int] = mapped_column(Integer, default=1)
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    airport_id: Mapped[str] = mapped_column(String)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)

class DocumentVersion(Base):
    __tablename__ = 'document_versions'
    __table_args__ = (UniqueConstraint('document_id', 'version'),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey('documents.id'))
    version: Mapped[int] = mapped_column(Integer)
    file_path: Mapped[str] = mapped_column(String)
    filename: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    created_by: Mapped[str] = mapped_column(String)
    comment: Mapped[str] = mapped_column(Text, default='')
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    approved_by: Mapped[str | None] = mapped_column(String, nullable=True)
    approved_at: Mapped[str | None] = mapped_column(String, nullable=True)
    signed_path: Mapped[str | None] = mapped_column(String, nullable=True)
    signed_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    signer_id: Mapped[str | None] = mapped_column(String, nullable=True)
    certificate_fingerprint: Mapped[str | None] = mapped_column(String, nullable=True)


class DocumentReminder(Base):
    __tablename__ = 'document_reminders'
    document_id: Mapped[str] = mapped_column(ForeignKey('documents.id'), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    source_version: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[str | None] = mapped_column(String, nullable=True)
    remind_on: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[str] = mapped_column(String)


class DocumentRenewalDecision(Base):
    __tablename__ = 'document_renewal_decisions'
    document_id: Mapped[str] = mapped_column(ForeignKey('documents.id'), primary_key=True)
    source_version: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[str | None] = mapped_column(String, nullable=True)
    responsible_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    decided_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    reason: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[str] = mapped_column(String)
