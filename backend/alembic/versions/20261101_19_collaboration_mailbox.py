"""Personal inbox read state, stars and archive; never shared with another airport."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_collaboration_mailbox'
down_revision = '20261101_collaboration_contacts'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('collaboration_mailbox_state',
        sa.Column('airport_id',sa.String(),primary_key=True),
        sa.Column('user_id',sa.String(),primary_key=True),
        sa.Column('thread_id',sa.String(),primary_key=True),
        sa.Column('read_sequence',sa.Integer(),nullable=False,server_default='0'),
        sa.Column('starred',sa.Boolean(),nullable=False,server_default='0'),
        sa.Column('archived',sa.Boolean(),nullable=False,server_default='0'))


def downgrade():
    op.drop_table('collaboration_mailbox_state')
