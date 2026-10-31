from sqlalchemy import Boolean, Float, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class OperationSimulation(Base):
    __tablename__ = 'operation_simulations'
    airport_id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(String, unique=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    elapsed_seconds: Mapped[float] = mapped_column(Float, default=0)
    scenario_mode: Mapped[str] = mapped_column(String, default='interactive')
    running: Mapped[bool] = mapped_column(Boolean, default=False)
    speed: Mapped[int] = mapped_column(Integer, default=30)
    updated_at: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    next_sequence: Mapped[int] = mapped_column(Integer, default=1)
    __mapper_args__ = {'version_id_col': revision}


class OperationEvent(Base):
    __tablename__ = 'operation_events'
    __table_args__ = (
        UniqueConstraint('airport_id', 'run_id', 'sequence', name='uq_operation_event_sequence'),
        UniqueConstraint('airport_id', 'run_id', 'event_key', name='uq_operation_event_key'),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    run_id: Mapped[str] = mapped_column(String, index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    elapsed_seconds: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    event_key: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text, default='')
    actor_id: Mapped[str] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String)
    flight_id: Mapped[str | None] = mapped_column(String, nullable=True)
    gate_id: Mapped[str | None] = mapped_column(String, nullable=True)
    staff_id: Mapped[str | None] = mapped_column(String, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class OperationLedgerGroup(Base):
    """Persistent synthetic history, partitioned by tenant and operational day."""
    __tablename__ = 'operation_ledger_groups'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    operational_date: Mapped[str] = mapped_column(String, index=True)
    data: Mapped[dict] = mapped_column(JSON)
