"""Store separate amendment drafts linked to a contract version.

Revision ID: b19a5c732e04
Revises: 714af828c311
"""
from alembic import op
import sqlalchemy as sa

revision = 'b19a5c732e04'
down_revision = '714af828c311'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('contract_amendment_drafts',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('contract_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False),
        sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('clause_reference', sa.String(200), nullable=False),
        sa.Column('current_wording', sa.Text(), nullable=False),
        sa.Column('proposed_wording', sa.Text(), nullable=False),
        sa.Column('proposed_effective_date', sa.String(10), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ['contract_id', 'source_version'],
            ['document_versions.document_id', 'document_versions.version'],
            name='fk_amendment_draft_source_version',
        ),
    )
    op.create_index('ix_contract_amendment_drafts_contract_id', 'contract_amendment_drafts', ['contract_id'])


def downgrade():
    op.drop_index('ix_contract_amendment_drafts_contract_id', table_name='contract_amendment_drafts')
    op.drop_table('contract_amendment_drafts')
