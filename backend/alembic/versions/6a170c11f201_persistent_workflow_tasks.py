"""Persist version-specific workflow assignment and history.
Revision ID: 6a170c11f201
Revises: 390ac2b8ef10
"""
from alembic import op
import sqlalchemy as sa
revision='6a170c11f201'
down_revision='390ac2b8ef10'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('workflow_tasks',
        sa.Column('id',sa.String(),primary_key=True),
        sa.Column('document_id',sa.String(),sa.ForeignKey('documents.id'),nullable=False),
        sa.Column('document_version',sa.Integer(),nullable=False),
        sa.Column('type',sa.String(),nullable=False),
        sa.Column('status',sa.String(),nullable=False),
        sa.Column('assigned_to',sa.String(),nullable=True),
        sa.Column('due_date',sa.String(),nullable=False),
        sa.Column('created_at',sa.String(),nullable=False),
        sa.Column('updated_at',sa.String(),nullable=False),
        sa.Column('completed_by',sa.String(),nullable=True),
        sa.UniqueConstraint('document_id','document_version','type'))
    op.create_table('task_events',
        sa.Column('id',sa.Integer(),primary_key=True,autoincrement=True),
        sa.Column('task_id',sa.String(),sa.ForeignKey('workflow_tasks.id'),nullable=False),
        sa.Column('actor_id',sa.String(),nullable=False),
        sa.Column('actor',sa.String(),nullable=False),
        sa.Column('action',sa.String(),nullable=False),
        sa.Column('comment',sa.Text(),nullable=False),
        sa.Column('created_at',sa.String(),nullable=False))

def downgrade():
    op.drop_table('task_events')
    op.drop_table('workflow_tasks')
