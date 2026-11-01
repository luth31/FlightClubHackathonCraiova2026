"""Assigned field work, separate from document approvals and simulation events."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_field_actions'
down_revision = '20261101_airport_operations'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('field_actions',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('request_id', sa.String(), nullable=False),
        sa.Column('request_fingerprint', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=False),
        sa.Column('department', sa.String(), nullable=False),
        sa.Column('assigned_to', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('location', sa.String(), nullable=False),
        sa.Column('equipment_ref', sa.String(), nullable=False),
        sa.Column('flight_ref', sa.String(), nullable=False),
        sa.Column('document_id', sa.String(), sa.ForeignKey('documents.id'), nullable=True),
        sa.Column('priority', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('due_at', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.UniqueConstraint('airport_id', 'request_id'))
    op.create_index('ix_field_actions_airport_id', 'field_actions', ['airport_id'])
    op.create_table('field_action_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('action_id', sa.String(), sa.ForeignKey('field_actions.id'), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('actor_id', sa.String(), nullable=False),
        sa.Column('actor', sa.String(), nullable=False),
        sa.Column('assigned_to', sa.String(), nullable=False),
        sa.Column('assignee', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.UniqueConstraint('action_id', 'revision'))
    op.create_index('ix_field_action_events_action_id', 'field_action_events', ['action_id'])


def downgrade():
    op.drop_table('field_action_events')
    op.drop_table('field_actions')
