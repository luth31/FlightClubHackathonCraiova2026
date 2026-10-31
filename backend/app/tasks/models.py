from sqlalchemy import String,Text,Integer,UniqueConstraint,ForeignKey
from sqlalchemy.orm import Mapped,mapped_column
from app.database import Base

class WorkflowTask(Base):
    __tablename__='workflow_tasks'
    __table_args__=(UniqueConstraint('document_id','document_version','type'),)
    id: Mapped[str]=mapped_column(String,primary_key=True)
    document_id: Mapped[str]=mapped_column(ForeignKey('documents.id'))
    document_version: Mapped[int]=mapped_column(Integer)
    type: Mapped[str]=mapped_column(String)
    status: Mapped[str]=mapped_column(String,default='pending')
    assigned_to: Mapped[str | None]=mapped_column(String,nullable=True)
    due_date: Mapped[str]=mapped_column(String)
    created_at: Mapped[str]=mapped_column(String)
    updated_at: Mapped[str]=mapped_column(String)
    completed_by: Mapped[str | None]=mapped_column(String,nullable=True)

class TaskEvent(Base):
    __tablename__='task_events'
    id: Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True)
    task_id: Mapped[str]=mapped_column(ForeignKey('workflow_tasks.id'))
    actor_id: Mapped[str]=mapped_column(String)
    actor: Mapped[str]=mapped_column(String)
    action: Mapped[str]=mapped_column(String)
    comment: Mapped[str]=mapped_column(Text,default='')
    created_at: Mapped[str]=mapped_column(String)
