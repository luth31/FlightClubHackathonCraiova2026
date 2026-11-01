"""Director opt-in, published contacts and personally addressed conversations."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_collaboration_contacts'
down_revision = ('20261101_collaboration_routing', '20261101_profiles_strategy_merge')
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('collaboration_participation',
        sa.Column('airport_id', sa.String(), primary_key=True),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=True),
        sa.Column('updated_by', sa.String(), nullable=True))
    op.add_column('collaboration_threads', sa.Column('requester_contact', sa.JSON(), nullable=True))
    op.add_column('collaboration_threads', sa.Column('recipient_contact', sa.JSON(), nullable=True))
    op.add_column('collaboration_threads', sa.Column('category', sa.String(), server_default='request', nullable=False))
    op.add_column('collaboration_sync', sa.Column('participation_enabled', sa.Boolean(), server_default='0', nullable=False))
    op.add_column('collaboration_sync', sa.Column('contacts', sa.JSON(), nullable=True))


def downgrade():
    for name in ('contacts', 'participation_enabled'):
        op.drop_column('collaboration_sync', name)
    for name in ('category', 'recipient_contact', 'requester_contact'):
        op.drop_column('collaboration_threads', name)
    op.drop_table('collaboration_participation')
