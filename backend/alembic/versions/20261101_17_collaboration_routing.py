"""Route partner requests to departments and retain verified connection metadata."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_collaboration_routing'
down_revision = '20261101_partner_collaboration'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('collaboration_threads', sa.Column('requester_department', sa.String(), nullable=True))
    op.add_column('collaboration_threads', sa.Column('recipient_department', sa.String(), nullable=True))
    op.add_column('collaboration_sync', sa.Column('peer_name', sa.String(), nullable=True))
    op.add_column('collaboration_sync', sa.Column('departments', sa.JSON(), nullable=True))
    op.add_column('collaboration_sync', sa.Column('last_synced_at', sa.String(), nullable=True))

def downgrade():
    for name in ('last_synced_at', 'departments', 'peer_name'):
        op.drop_column('collaboration_sync', name)
    for name in ('recipient_department', 'requester_department'):
        op.drop_column('collaboration_threads', name)
