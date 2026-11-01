from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, event as orm_event
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


class StrategyAnalysis(Base):
    __tablename__ = 'operation_strategy_analyses'
    __table_args__ = (UniqueConstraint('airport_id', 'fingerprint', name='uq_strategy_analysis_snapshot'),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    fingerprint: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    created_by: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON, default=dict)


class OperationEntity(Base):
    """Airport-scoped operational identity, independent of ledger presentation."""
    __tablename__ = 'operation_entities'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String)
    code: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)


class OperationFact(Base):
    """Immutable normalized evidence, including the original provenance."""
    __tablename__ = 'operation_facts'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    group_id: Mapped[str] = mapped_column(String, index=True)
    occurred_at: Mapped[str] = mapped_column(String, index=True)
    recorded_at: Mapped[str] = mapped_column(String)
    data: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String)



class OperationFactEntity(Base):
    __tablename__ = 'operation_fact_entities'
    fact_id: Mapped[str] = mapped_column(ForeignKey('operation_facts.id'), primary_key=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey('operation_entities.id'), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String, primary_key=True)


# Application-level immutability, backed by database triggers in the migration.

@orm_event.listens_for(OperationFact, 'before_update')
@orm_event.listens_for(OperationFact, 'before_delete')
@orm_event.listens_for(OperationFactEntity, 'before_update')
@orm_event.listens_for(OperationFactEntity, 'before_delete')
def immutable_operational_evidence(*_):
    raise ValueError('Operational evidence is append-only.')
