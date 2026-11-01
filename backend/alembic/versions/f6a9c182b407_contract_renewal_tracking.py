"""Persist contract follow-up and expiry reminders

Revision ID: f6a9c182b407
Revises: 20261101_mailbox_release_merge
"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a9c182b407'
down_revision = '20261101_mailbox_release_merge'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('contract_renewals',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('contract_id', sa.String(), sa.ForeignKey('documents.id'), nullable=False),
        sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.String(10), nullable=False),
        sa.Column('assigned_to', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('due_date', sa.String(10), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('acknowledged_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('acknowledged_at', sa.String(), nullable=True),
        sa.Column('closed_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('closed_at', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.UniqueConstraint('contract_id', 'source_version', 'expires_at', name='uq_contract_renewal_source'),
        sa.ForeignKeyConstraint(['contract_id', 'source_version'],
            ['document_versions.document_id', 'document_versions.version'], name='fk_renewal_source_version'),
        sa.CheckConstraint("status IN ('pending', 'acknowledged', 'in_progress', 'completed', 'cancelled')", name='ck_renewal_status'),
        sa.CheckConstraint('revision >= 1', name='ck_renewal_revision'),
    )
    op.create_index('ix_contract_renewals_contract_id', 'contract_renewals', ['contract_id'])
    op.create_index('ix_contract_renewals_airport_id', 'contract_renewals', ['airport_id'])
    op.create_table('contract_renewal_reminders',
        sa.Column('renewal_id', sa.String(), sa.ForeignKey('contract_renewals.id'), primary_key=True),
        sa.Column('threshold_days', sa.Integer(), primary_key=True),
        sa.Column('due_date', sa.String(10), nullable=False),
        sa.Column('triggered_at', sa.String(), nullable=True),
        sa.CheckConstraint('threshold_days IN (90, 60, 30)', name='ck_renewal_reminder_threshold'),
    )
    op.create_table('contract_renewal_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('renewal_id', sa.String(), sa.ForeignKey('contract_renewals.id'), nullable=False),
        sa.Column('actor_id', sa.String(), nullable=True),
        sa.Column('actor', sa.String(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
    )
    op.create_index('ix_contract_renewal_events_renewal_id', 'contract_renewal_events', ['renewal_id'])


def downgrade():
    op.drop_table('contract_renewal_events')
    op.drop_table('contract_renewal_reminders')
    op.drop_table('contract_renewals')
