"""Persistent airport simulation clock and immutable semantic event history."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_airport_operations'
down_revision = '20261031_airport_names'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('operation_simulations',
        sa.Column('airport_id', sa.String(), primary_key=True),
        sa.Column('run_id', sa.String(), nullable=False, unique=True),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('elapsed_seconds', sa.Float(), nullable=False),
        sa.Column('running', sa.Boolean(), nullable=False),
        sa.Column('speed', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('next_sequence', sa.Integer(), nullable=False))
    op.create_table('operation_events',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('run_id', sa.String(), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('elapsed_seconds', sa.Float(), nullable=False),
        sa.Column('recorded_at', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('event_key', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('detail', sa.Text(), nullable=False),
        sa.Column('actor_id', sa.String(), nullable=False),
        sa.Column('actor', sa.String(), nullable=False),
        sa.Column('flight_id', sa.String(), nullable=True),
        sa.Column('gate_id', sa.String(), nullable=True),
        sa.Column('staff_id', sa.String(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.UniqueConstraint('airport_id', 'run_id', 'sequence', name='uq_operation_event_sequence'),
        sa.UniqueConstraint('airport_id', 'run_id', 'event_key', name='uq_operation_event_key'))
    op.create_index('ix_operation_events_airport_id', 'operation_events', ['airport_id'])
    op.create_index('ix_operation_events_run_id', 'operation_events', ['run_id'])


def downgrade():
    op.drop_table('operation_events')
    op.drop_table('operation_simulations')
