from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ContractRenewal(Base):
    __tablename__ = 'contract_renewals'
    __table_args__ = (
        UniqueConstraint('contract_id', 'source_version', 'expires_at', name='uq_contract_renewal_source'),
        ForeignKeyConstraint(['contract_id', 'source_version'],
            ['document_versions.document_id', 'document_versions.version'], name='fk_renewal_source_version'),
        CheckConstraint("status IN ('pending', 'acknowledged', 'in_progress', 'completed', 'cancelled')", name='ck_renewal_status'),
        CheckConstraint('revision >= 1', name='ck_renewal_revision'),
    )

    # Follow-up belongs to an exact contract version and expiry date
    id: Mapped[str] = mapped_column(String, primary_key=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey('documents.id'), index=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    source_version: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[str] = mapped_column(String(10))
    assigned_to: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    due_date: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String, default='pending')
    revision: Mapped[int] = mapped_column(Integer, default=1)
    acknowledged_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    acknowledged_at: Mapped[str | None] = mapped_column(String, nullable=True)
    closed_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    closed_at: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)


class RenewalReminder(Base):
    __tablename__ = 'contract_renewal_reminders'
    __table_args__ = (CheckConstraint('threshold_days IN (90, 60, 30)', name='ck_renewal_reminder_threshold'),)

    renewal_id: Mapped[str] = mapped_column(ForeignKey('contract_renewals.id'), primary_key=True)
    threshold_days: Mapped[int] = mapped_column(Integer, primary_key=True)
    due_date: Mapped[str] = mapped_column(String(10))
    triggered_at: Mapped[str | None] = mapped_column(String, nullable=True)


class RenewalEvent(Base):
    __tablename__ = 'contract_renewal_events'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    renewal_id: Mapped[str] = mapped_column(ForeignKey('contract_renewals.id'), index=True)
    actor_id: Mapped[str | None] = mapped_column(String, nullable=True)
    actor: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    comment: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[str] = mapped_column(String)
