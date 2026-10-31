from sqlalchemy import String,Text,Integer,Float,JSON
from sqlalchemy.orm import Mapped,mapped_column
from app.database import Base

class Supplier(Base):
    __tablename__='suppliers'
    id: Mapped[str]=mapped_column(String,primary_key=True)
    name: Mapped[str]=mapped_column(String)
    airport_id: Mapped[str]=mapped_column(String)
    document_id: Mapped[str]=mapped_column(String)
    source_version: Mapped[int]=mapped_column(Integer)
    expected_iban: Mapped[str]=mapped_column(String)
    verified_contact: Mapped[str]=mapped_column(String)
    trust_status: Mapped[str]=mapped_column(String)
    bank_history: Mapped[list]=mapped_column(JSON,default=list)

class SupplierReview(Base):
    __tablename__='supplier_reviews'
    id: Mapped[str]=mapped_column(String,primary_key=True)
    fingerprint: Mapped[str]=mapped_column(String,unique=True)
    airport_id: Mapped[str]=mapped_column(String)
    document_id: Mapped[str | None]=mapped_column(String,nullable=True)
    source_version: Mapped[int | None]=mapped_column(Integer,nullable=True)
    supplier_id: Mapped[str | None]=mapped_column(String,nullable=True)
    supplier_name: Mapped[str]=mapped_column(String)
    expected_iban: Mapped[str]=mapped_column(String)
    observed_iban: Mapped[str]=mapped_column(String)
    sender_email: Mapped[str]=mapped_column(String)
    verified_contact: Mapped[str]=mapped_column(String)
    invoice_amount: Mapped[float | None]=mapped_column(Float,nullable=True)
    message: Mapped[str]=mapped_column(Text)
    reasons: Mapped[list]=mapped_column(JSON)
    status: Mapped[str]=mapped_column(String)
    created_by: Mapped[str]=mapped_column(String)
    created_at: Mapped[str]=mapped_column(String)
    verified_by: Mapped[str | None]=mapped_column(String,nullable=True)
    verified_at: Mapped[str | None]=mapped_column(String,nullable=True)
    verification_note: Mapped[str]=mapped_column(Text,default='')
    approved_by: Mapped[str | None]=mapped_column(String,nullable=True)
    approved_at: Mapped[str | None]=mapped_column(String,nullable=True)
    decision_note: Mapped[str]=mapped_column(Text,default='')
