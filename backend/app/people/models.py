from sqlalchemy import Boolean, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
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
