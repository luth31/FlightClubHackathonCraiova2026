from sqlalchemy import String, Integer, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class SharePreview(Base):
    __tablename__ = 'share_previews'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(String)
    source_version: Mapped[int] = mapped_column(Integer)
    creator_id: Mapped[str] = mapped_column(String)
    file_path: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String)
    redactions: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String)

class Share(Base):
    __tablename__ = 'shares'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(String)
    document_title: Mapped[str] = mapped_column(String)
    source_version: Mapped[int] = mapped_column(Integer)
    preview_id: Mapped[str] = mapped_column(String)
    recipient_airport: Mapped[str] = mapped_column(String)
    recipient_airport_id: Mapped[str] = mapped_column(String, default='sibiu')
    recipient_department: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    expires_at: Mapped[str] = mapped_column(String)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
