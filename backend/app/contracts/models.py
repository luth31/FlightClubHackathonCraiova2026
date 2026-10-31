from sqlalchemy import ForeignKey, ForeignKeyConstraint, Integer, String, Text
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
