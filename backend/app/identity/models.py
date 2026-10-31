from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class LoginTransaction(Base):
    __tablename__ = 'oidc_login_transactions'
    state_hash: Mapped[str] = mapped_column(String, primary_key=True)
    browser_hash: Mapped[str] = mapped_column(String)
    nonce: Mapped[str] = mapped_column(String)
    verifier: Mapped[str] = mapped_column(String)
    issuer: Mapped[str] = mapped_column(String)
    client_id: Mapped[str] = mapped_column(String)
    redirect_uri: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    expires_at: Mapped[str] = mapped_column(String, index=True)
