"""Add versioned procurement dossiers; join the existing workspace histories."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_procurement'
down_revision = ('20261101_collaboration_merge', '20261101_workspace_merge')
branch_labels = None
depends_on = None


def upgrade():
    # A migration-owned schema snapshot keeps future model edits out of upgrades.
    op.create_table('procurement_cases',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('number', sa.String(), nullable=False), sa.Column('title', sa.String(300), nullable=False),
        sa.Column('description', sa.Text(), nullable=False), sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False), sa.Column('anticipated_value', sa.String(32), nullable=False),
        sa.Column('committed_value', sa.String(32), nullable=False), sa.Column('primary_document_id', sa.String(), sa.ForeignKey('documents.id')),
        sa.Column('deadline', sa.String()), sa.Column('stage', sa.String(), nullable=False),
        sa.Column('template_version', sa.Integer(), nullable=False), sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False), sa.Column('updated_at', sa.String(), nullable=False), sa.Column('legacy_ref', sa.String()),
        sa.Column('request_id', sa.String(100)), sa.Column('request_actor_id', sa.String(), sa.ForeignKey('users.id')),
        sa.Column('request_fingerprint', sa.String(64)),
        sa.UniqueConstraint('airport_id', 'number'), sa.UniqueConstraint('airport_id', 'legacy_ref'),
        sa.UniqueConstraint('airport_id', 'request_actor_id', 'request_id'))
    op.create_index('ix_procurement_cases_airport_id', 'procurement_cases', ['airport_id'])
    op.create_table('procurement_case_documents',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('case_id', sa.String(), sa.ForeignKey('procurement_cases.id'), nullable=False),
        sa.Column('document_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False), sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.String(), nullable=False), sa.Column('attached_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('attached_at', sa.String(), nullable=False), sa.UniqueConstraint('case_id', 'document_id'), sa.UniqueConstraint('document_id'))
    op.create_table('procurement_document_links',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('case_id', sa.String(), sa.ForeignKey('procurement_cases.id'), nullable=False),
        sa.Column('source_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False), sa.Column('target_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False),
        sa.Column('source_version', sa.Integer(), nullable=False), sa.Column('target_version', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(), nullable=False), sa.Column('actor_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False), sa.UniqueConstraint('case_id', 'source_id', 'target_id', 'type'))
    op.create_table('procurement_invoice_allocations',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('case_id', sa.String(), sa.ForeignKey('procurement_cases.id'), nullable=False),
        sa.Column('invoice_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False), sa.Column('acceptance_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False),
        sa.Column('invoice_version', sa.Integer(), nullable=False), sa.Column('acceptance_version', sa.Integer(), nullable=False),
        sa.Column('amount', sa.String(32), nullable=False), sa.UniqueConstraint('case_id', 'invoice_id', 'acceptance_id'))
    op.create_table('procurement_case_events',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('case_id', sa.String(), sa.ForeignKey('procurement_cases.id'), nullable=False),
        sa.Column('action', sa.String(), nullable=False), sa.Column('comment', sa.Text(), nullable=False),
        sa.Column('actor_id', sa.String(), sa.ForeignKey('users.id'), nullable=False), sa.Column('actor', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False), sa.Column('from_stage', sa.String(), nullable=False),
        sa.Column('to_stage', sa.String(), nullable=False), sa.Column('evidence', sa.JSON(), nullable=False))
    op.create_table('procurement_payments',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('case_id', sa.String(), sa.ForeignKey('procurement_cases.id'), nullable=False),
        sa.Column('invoice_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False), sa.Column('invoice_version', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False), sa.Column('amount', sa.String(32), nullable=False), sa.Column('date', sa.String(), nullable=False),
        sa.Column('reference', sa.String(500), nullable=False), sa.Column('actor_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('actor', sa.String(), nullable=False), sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('reversed_entry_id', sa.String(), sa.ForeignKey('procurement_payments.id')), sa.UniqueConstraint('reversed_entry_id'),
        sa.UniqueConstraint('case_id', 'invoice_id', 'kind', 'reference'))


def downgrade():
    for table in ['procurement_payments', 'procurement_case_events', 'procurement_invoice_allocations',
                  'procurement_document_links', 'procurement_case_documents', 'procurement_cases']:
        op.drop_table(table)
