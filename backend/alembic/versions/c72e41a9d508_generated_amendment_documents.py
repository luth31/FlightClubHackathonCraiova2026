"""Link amendment forms to their generated document and revision.

Revision ID: c72e41a9d508
Revises: b19a5c732e04
"""
from alembic import op
import sqlalchemy as sa

revision = 'c72e41a9d508'
down_revision = 'b19a5c732e04'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('contract_amendment_drafts') as batch:
        batch.add_column(sa.Column('generated_document_id', sa.String(), nullable=True))
        batch.add_column(sa.Column('generated_revision', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('generated_document_version', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_amendment_generated_document', 'documents', ['generated_document_id'], ['id'])
        batch.create_unique_constraint('uq_amendment_generated_document', ['generated_document_id'])


def downgrade():
    with op.batch_alter_table('contract_amendment_drafts') as batch:
        batch.drop_constraint('uq_amendment_generated_document', type_='unique')
        batch.drop_constraint('fk_amendment_generated_document', type_='foreignkey')
        batch.drop_column('generated_document_version')
        batch.drop_column('generated_revision')
        batch.drop_column('generated_document_id')
