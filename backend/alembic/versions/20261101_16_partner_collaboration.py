"""Persistent requests and read-only peer synchronization between airport databases."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_partner_collaboration'
down_revision = '20261101_strategy_analysis'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('collaboration_threads',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('requester_airport_id', sa.String(), nullable=False), sa.Column('recipient_airport_id', sa.String(), nullable=False),
        sa.Column('subject', sa.String(), nullable=False), sa.Column('topic', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False))
    op.create_index('ix_collaboration_threads_airport_id', 'collaboration_threads', ['airport_id'])
    op.create_table('collaboration_events',
        sa.Column('sequence', sa.Integer(), primary_key=True, autoincrement=True), sa.Column('id', sa.String(), nullable=False, unique=True),
        sa.Column('airport_id', sa.String(), nullable=False), sa.Column('thread_id', sa.String(), nullable=False),
        sa.Column('author_airport_id', sa.String(), nullable=False), sa.Column('author_id', sa.String(), nullable=True),
        sa.Column('author_role', sa.String(), nullable=False), sa.Column('origin_sequence', sa.Integer(), nullable=True),
        sa.Column('kind', sa.String(), nullable=False), sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False), sa.Column('attachment', sa.JSON(), nullable=True),
        sa.Column('idempotency_key', sa.String(), nullable=True), sa.Column('request_hash', sa.String(), nullable=True),
        sa.UniqueConstraint('airport_id', 'author_id', 'idempotency_key', name='uq_collaboration_idempotency'),
        sa.UniqueConstraint('airport_id', 'author_airport_id', 'origin_sequence', name='uq_collaboration_origin'))
    op.create_index('ix_collaboration_events_airport_id', 'collaboration_events', ['airport_id'])
    op.create_index('ix_collaboration_events_thread_id', 'collaboration_events', ['thread_id'])
    op.create_table('collaboration_sync',
        sa.Column('id', sa.String(), primary_key=True), sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('peer_airport_id', sa.String(), nullable=False), sa.Column('received_cursor', sa.Integer(), nullable=False),
        sa.Column('acknowledged_cursor', sa.Integer(), nullable=False))


def downgrade():
    op.drop_table('collaboration_sync')
    op.drop_table('collaboration_events')
    op.drop_table('collaboration_threads')
