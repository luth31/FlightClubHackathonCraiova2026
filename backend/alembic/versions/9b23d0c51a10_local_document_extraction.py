"""Durable content-addressed extraction jobs and reusable page text."""
from alembic import op
import sqlalchemy as sa

revision = '9b23d0c51a10'
down_revision = '714af828c311'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('document_extractions',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('sha256', sa.String(), nullable=False),
        sa.Column('pipeline', sa.String(), nullable=False),
        sa.Column('source_path', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_at', sa.Float(), nullable=False),
        sa.Column('started_at', sa.Float()),
        sa.Column('completed_at', sa.Float()),
        sa.Column('token', sa.String()),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('error', sa.Text()),
        sa.Column('result', sa.JSON()))
    op.create_index('ix_document_extractions_sha256', 'document_extractions', ['sha256'])
    op.create_index('ix_document_extractions_status', 'document_extractions', ['status'])


def downgrade():
    op.drop_table('document_extractions')
