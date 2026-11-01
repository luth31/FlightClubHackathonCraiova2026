from sqlalchemy import Boolean, String, Text, JSON, Integer, UniqueConstraint, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    first_name: Mapped[str] = mapped_column(String, default='')
    middle_name: Mapped[str] = mapped_column(String, default='')
    last_name: Mapped[str] = mapped_column(String, default='')
    email: Mapped[str] = mapped_column(String)
    department: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    roles: Mapped[list] = mapped_column(JSON, default=list)
    airport_id: Mapped[str] = mapped_column(String)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    password_hash: Mapped[str] = mapped_column(String)
    avatar: Mapped[str] = mapped_column(String, default='')
    manager_id: Mapped[str | None] = mapped_column(String, nullable=True)
    job_title: Mapped[str] = mapped_column(String, default='')
    department_id: Mapped[str | None] = mapped_column(String, nullable=True)
    identity_issuer: Mapped[str | None] = mapped_column(String, nullable=True)
    identity_subject: Mapped[str | None] = mapped_column(String, nullable=True)
    provisioning_status: Mapped[str] = mapped_column(String, default='ready')
    provisioning_started_at: Mapped[str | None] = mapped_column(String, nullable=True)
    identity_sync_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    identity_sync_revision: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint('identity_issuer', 'identity_subject', name='uq_user_identity'),)


class UserProfile(Base):
    __tablename__ = 'user_profiles'
    user_id: Mapped[str] = mapped_column(String, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    presence: Mapped[str] = mapped_column(String, default='automatic')
    presence_expires_at: Mapped[str | None] = mapped_column(String, nullable=True)
    status_message: Mapped[str] = mapped_column(String(280), default='')
    message_expires_at: Mapped[str | None] = mapped_column(String, nullable=True)
    photo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    photo_revision: Mapped[str | None] = mapped_column(String, nullable=True)


class Department(Base):
    __tablename__ = 'departments'
    __table_args__ = (UniqueConstraint('airport_id', 'name'),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    head_user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class HeadAppointment(Base):
    __tablename__ = 'head_appointments'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    airport_id: Mapped[str] = mapped_column(String)
    department_id: Mapped[str] = mapped_column(String)
    user_id: Mapped[str] = mapped_column(String)
    proposed_by: Mapped[str] = mapped_column(String)
    effective_date: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text)
    department_revision: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, default='pending')
    created_at: Mapped[str] = mapped_column(String)
    decided_by: Mapped[str | None] = mapped_column(String, nullable=True)
    decided_at: Mapped[str | None] = mapped_column(String, nullable=True)
    decision_comment: Mapped[str] = mapped_column(Text, default='')

class Session(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String)
    expires_at: Mapped[str] = mapped_column(String)
    auth_source: Mapped[str] = mapped_column(String, default='demo')
    auth_issuer: Mapped[str | None] = mapped_column(String, nullable=True)

class Delegation(Base):
    __tablename__ = 'delegations'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    from_user: Mapped[str] = mapped_column(String)
    to_user: Mapped[str] = mapped_column(String)
    starts_at: Mapped[str] = mapped_column(String)
    ends_at: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class LeaveRequest(Base):
    __tablename__ = 'leave_requests'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String)
    starts_at: Mapped[str] = mapped_column(String)
    ends_at: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default='pending')
    approver_id: Mapped[str | None] = mapped_column(String, nullable=True)
