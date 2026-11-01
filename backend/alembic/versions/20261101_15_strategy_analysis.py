"""Persist evidence snapshots and AI procedure recommendations."""
from alembic import op
import sqlalchemy as sa
revision = '20261101_strategy_analysis'
down_revision = '20261101_operations_ledger'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('operation_strategy_analyses',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('fingerprint', sa.String(), nullable=False), sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False), sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False), sa.Column('model', sa.String(), nullable=True),
        sa.Column('snapshot', sa.JSON(), nullable=False), sa.Column('result', sa.JSON(), nullable=False),
        sa.UniqueConstraint('airport_id', 'fingerprint', name='uq_strategy_analysis_snapshot'))
    op.create_index('ix_operation_strategy_analyses_airport_id', 'operation_strategy_analyses', ['airport_id'])


def downgrade():
    op.drop_table('operation_strategy_analyses')
