"""Equipment register, incidents, work orders and verification history."""
from alembic import op
import sqlalchemy as sa

revision = 'a109d3e67b52'
down_revision = 'f6a9c182b407'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('equipment',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('location', sa.String(), nullable=False),
        sa.Column('department', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('supplier', sa.String(), nullable=False),
        sa.Column('document_id', sa.String(), sa.ForeignKey('documents.id')),
        sa.Column('next_inspection', sa.String()),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.UniqueConstraint('airport_id', 'code'),
        sa.CheckConstraint("status IN ('unknown','available','degraded','out_of_service','maintenance')"))
    op.create_index('ix_equipment_airport_id', 'equipment', ['airport_id'])
    op.create_table('equipment_incidents',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('equipment_id', sa.String(), sa.ForeignKey('equipment.id'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('reported_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False))
    op.create_index('ix_equipment_incidents_equipment_id', 'equipment_incidents', ['equipment_id'])
    op.create_table('equipment_jobs',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('equipment_id', sa.String(), sa.ForeignKey('equipment.id'), nullable=False),
        sa.Column('incident_id', sa.String(), sa.ForeignKey('equipment_incidents.id')),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('assigned_to', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('due_date', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('evidence', sa.Text(), nullable=False),
        sa.Column('evidence_document_id', sa.String(), sa.ForeignKey('documents.id')),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.CheckConstraint("status IN ('assigned','acknowledged','in_progress','blocked','awaiting_verification','closed','cancelled')"))
    op.create_index('ix_equipment_jobs_equipment_id', 'equipment_jobs', ['equipment_id'])
    op.create_table('equipment_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('equipment_id', sa.String(), sa.ForeignKey('equipment.id'), nullable=False),
        sa.Column('job_id', sa.String(), sa.ForeignKey('equipment_jobs.id')),
        sa.Column('actor_id', sa.String(), nullable=False),
        sa.Column('actor', sa.String(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False))
    op.create_index('ix_equipment_events_equipment_id', 'equipment_events', ['equipment_id'])


def downgrade():
    for table in ('equipment_events', 'equipment_jobs', 'equipment_incidents', 'equipment'):
        op.drop_table(table)
