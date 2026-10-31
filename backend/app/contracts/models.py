from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AmendmentDraft(Base):
    __tablename__ = 'contract_amendment_drafts'
    __table_args__ = (
        # Keep each proposal tied to the exact contract version it references.
        ForeignKeyConstraint(
            ['contract_id', 'source_version'],
            ['document_versions.document_id', 'document_versions.version'],
            name='fk_amendment_draft_source_version',
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey('documents.id'), index=True)
    source_version: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300))
    reason: Mapped[str] = mapped_column(Text)
    clause_reference: Mapped[str] = mapped_column(String(200))
    current_wording: Mapped[str] = mapped_column(Text, default='')
    proposed_wording: Mapped[str] = mapped_column(Text)
    proposed_effective_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String, default='draft')
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)
    generated_document_id: Mapped[str | None] = mapped_column(ForeignKey('documents.id'), nullable=True, unique=True)
    generated_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_document_version: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AmendmentDraftRevision(Base):
    __tablename__ = 'contract_amendment_revisions'
    __table_args__ = (
        CheckConstraint('revision >= 1', name='ck_amendment_revision_positive'),
        CheckConstraint("origin IN ('saved', 'migration')", name='ck_amendment_revision_origin'),
    )

    # Each saved revision keeps its wording and the actual editor's identity.
    draft_id: Mapped[str] = mapped_column(ForeignKey('contract_amendment_drafts.id'), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_version: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300))
    reason: Mapped[str] = mapped_column(Text)
    clause_reference: Mapped[str] = mapped_column(String(200))
    current_wording: Mapped[str] = mapped_column(Text)
    proposed_wording: Mapped[str] = mapped_column(Text)
    proposed_effective_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    saved_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    saved_by_name: Mapped[str | None] = mapped_column(String, nullable=True)
    saved_at: Mapped[str | None] = mapped_column(String, nullable=True)
    recorded_at: Mapped[str] = mapped_column(String)
    origin: Mapped[str] = mapped_column(String)
