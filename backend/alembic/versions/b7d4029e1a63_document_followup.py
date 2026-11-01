"""Personal document reminders and explicit contract non-renewal decisions."""
from alembic import op
import sqlalchemy as sa

revision = 'b7d4029e1a63'
down_revision = 'a109d3e67b52'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('document_reminders',
        sa.Column('document_id', sa.String(), sa.ForeignKey('documents.id'), primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.String()), sa.Column('remind_on', sa.String()),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False))
    op.create_table('document_renewal_decisions',
        sa.Column('document_id', sa.String(), sa.ForeignKey('documents.id'), primary_key=True),
        sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.String()),
        sa.Column('responsible_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('decided_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False))


def downgrade():
    op.drop_table('document_renewal_decisions')
    op.drop_table('document_reminders')
