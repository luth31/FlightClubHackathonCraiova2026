"""Interactive operation mode and persistent grouped demonstration ledger."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_operations_ledger'
down_revision = '20261101_airport_operations'
branch_labels = None
depends_on = None


def upgrade():
    # New and upgraded sessions use interactive controls. A reset preserves prior history.
    op.add_column('operation_simulations', sa.Column('scenario_mode', sa.String(), nullable=False, server_default='interactive'))
    op.create_table('operation_ledger_groups',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('operational_date', sa.String(), nullable=False),
        sa.Column('data', sa.JSON(), nullable=False))
    op.create_index('ix_operation_ledger_groups_airport_id', 'operation_ledger_groups', ['airport_id'])
    op.create_index('ix_operation_ledger_groups_operational_date', 'operation_ledger_groups', ['operational_date'])


def downgrade():
    op.drop_table('operation_ledger_groups')
    op.drop_column('operation_simulations', 'scenario_mode')
