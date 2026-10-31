"""Stable document ownership and versioned provider synchronization."""
from alembic import op
import sqlalchemy as sa

revision = '20261031_identity_reconcile'
down_revision = '20261031_user_management'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('identity_sync_revision', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('documents', sa.Column('owner_id', sa.String(), nullable=True))
    # Display names only resolve legacy ownership once, when the match is unique.
    op.execute('''UPDATE documents SET owner_id = (
        SELECT min(users.id) FROM users WHERE users.airport_id = documents.airport_id AND users.name = documents.owner
        HAVING count(*) = 1)''')


def downgrade():
    op.drop_column('documents', 'owner_id')
    op.drop_column('users', 'identity_sync_revision')
