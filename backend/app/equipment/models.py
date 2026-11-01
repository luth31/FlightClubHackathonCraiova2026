from sqlalchemy import String, Text, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class EquipmentTeam(Base):
    __tablename__ = 'equipment_teams'
    __table_args__ = (UniqueConstraint('airport_id', 'name'),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)


class EquipmentTeamMember(Base):
    __tablename__ = 'equipment_team_members'
    team_id: Mapped[str] = mapped_column(ForeignKey('equipment_teams.id'), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)


class Equipment(Base):
    __tablename__ = 'equipment'
    __table_args__ = (UniqueConstraint('airport_id', 'code'),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String, index=True)
    code: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    department: Mapped[str] = mapped_column(String, default='Tehnic')
    support_team_id: Mapped[str | None] = mapped_column(ForeignKey('equipment_teams.id'), nullable=True)
    status: Mapped[str] = mapped_column(String, default='unknown')
    supplier: Mapped[str] = mapped_column(String, default='')
    document_id: Mapped[str | None] = mapped_column(ForeignKey('documents.id'), nullable=True)
    next_inspection: Mapped[str | None] = mapped_column(String, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)


class EquipmentIncident(Base):
    __tablename__ = 'equipment_incidents'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    equipment_id: Mapped[str] = mapped_column(ForeignKey('equipment.id'), index=True)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default='open')
    reported_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[str] = mapped_column(String)


class EquipmentJob(Base):
    __tablename__ = 'equipment_jobs'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    equipment_id: Mapped[str] = mapped_column(ForeignKey('equipment.id'), index=True)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey('equipment_incidents.id'), nullable=True)
    title: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)
    assigned_to: Mapped[str] = mapped_column(ForeignKey('users.id'))
    assignment_department: Mapped[str] = mapped_column(String, default='Tehnic')
    due_date: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default='assigned')
    evidence: Mapped[str] = mapped_column(Text, default='')
    evidence_document_id: Mapped[str | None] = mapped_column(ForeignKey('documents.id'), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)


class EquipmentEvent(Base):
    __tablename__ = 'equipment_events'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    equipment_id: Mapped[str] = mapped_column(ForeignKey('equipment.id'), index=True)
    job_id: Mapped[str | None] = mapped_column(ForeignKey('equipment_jobs.id'), nullable=True)
    actor_id: Mapped[str] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    comment: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[str] = mapped_column(String)
