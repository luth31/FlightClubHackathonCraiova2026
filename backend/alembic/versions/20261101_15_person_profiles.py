"""Personal presence, status messages and normalized profile photos."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_person_profiles'
down_revision = '20261101_field_actions'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('user_profiles',
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('presence', sa.String(), nullable=False, server_default='automatic'),
        sa.Column('presence_expires_at', sa.String(), nullable=True),
        sa.Column('status_message', sa.String(280), nullable=False, server_default=''),
        sa.Column('message_expires_at', sa.String(), nullable=True),
        sa.Column('photo', sa.LargeBinary(), nullable=True),
        sa.Column('photo_revision', sa.String(), nullable=True))


def downgrade():
    op.drop_table('user_profiles')
