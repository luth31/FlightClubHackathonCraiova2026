from sqlalchemy import String, Text, Integer, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ProcurementCase(Base):
    __tablename__ = 'procurement_cases'
    __table_args__ = (UniqueConstraint('airport_id', 'number'), UniqueConstraint('airport_id', 'legacy_ref'),
        UniqueConstraint('airport_id', 'request_actor_id', 'request_id'))
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    number: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default='')
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    currency: Mapped[str] = mapped_column(String(3))
    anticipated_value: Mapped[str] = mapped_column(String(32))
    committed_value: Mapped[str] = mapped_column(String(32), default='0.00')
    primary_document_id: Mapped[str | None] = mapped_column(ForeignKey('documents.id'), nullable=True)
    deadline: Mapped[str | None] = mapped_column(String, nullable=True)
    stage: Mapped[str] = mapped_column(String, default='draft')
    template_version: Mapped[int] = mapped_column(Integer, default=1)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)
    legacy_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_actor_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    request_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ProcurementCaseDocument(Base):
    __tablename__ = 'procurement_case_documents'
    __table_args__ = (UniqueConstraint('case_id', 'document_id'), UniqueConstraint('document_id'))
    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('procurement_cases.id'))
    document_id: Mapped[str] = mapped_column(ForeignKey('documents.id'))
    version: Mapped[int] = mapped_column(Integer)
    template_id: Mapped[str] = mapped_column(String)
    attached_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    attached_at: Mapped[str] = mapped_column(String)


class ProcurementDocumentLink(Base):
    __tablename__ = 'procurement_document_links'
    __table_args__ = (UniqueConstraint('case_id', 'source_id', 'target_id', 'type'),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('procurement_cases.id'))
    source_id: Mapped[str] = mapped_column(ForeignKey('documents.id'))
    target_id: Mapped[str] = mapped_column(ForeignKey('documents.id'))
    source_version: Mapped[int] = mapped_column(Integer)
    target_version: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[str] = mapped_column(String)


class ProcurementInvoiceAllocation(Base):
    __tablename__ = 'procurement_invoice_allocations'
    __table_args__ = (UniqueConstraint('case_id', 'invoice_id', 'acceptance_id'),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('procurement_cases.id'))
    invoice_id: Mapped[str] = mapped_column(ForeignKey('documents.id'))
    acceptance_id: Mapped[str] = mapped_column(ForeignKey('documents.id'))
    invoice_version: Mapped[int] = mapped_column(Integer)
    acceptance_version: Mapped[int] = mapped_column(Integer)
    amount: Mapped[str] = mapped_column(String(32))


class ProcurementCaseEvent(Base):
    __tablename__ = 'procurement_case_events'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('procurement_cases.id'))
    action: Mapped[str] = mapped_column(String)
    comment: Mapped[str] = mapped_column(Text, default='')
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    actor: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    from_stage: Mapped[str] = mapped_column(String)
    to_stage: Mapped[str] = mapped_column(String)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)


class ProcurementPayment(Base):
    __tablename__ = 'procurement_payments'
    __table_args__ = (UniqueConstraint('reversed_entry_id'), UniqueConstraint('case_id', 'invoice_id', 'kind', 'reference'))
    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('procurement_cases.id'))
    invoice_id: Mapped[str] = mapped_column(ForeignKey('documents.id'))
    invoice_version: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String)
    amount: Mapped[str] = mapped_column(String(32))
    date: Mapped[str] = mapped_column(String)
    reference: Mapped[str] = mapped_column(String(500))
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    actor: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    reversed_entry_id: Mapped[str | None] = mapped_column(ForeignKey('procurement_payments.id'), nullable=True)
