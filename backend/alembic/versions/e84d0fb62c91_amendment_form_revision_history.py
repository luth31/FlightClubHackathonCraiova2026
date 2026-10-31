"""Retain amendment form revisions without inventing past edit history.

Revision ID: e84d0fb62c91
Revises: c72e41a9d508
"""
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = 'e84d0fb62c91'
down_revision = 'c72e41a9d508'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('contract_amendment_revisions',
        sa.Column('draft_id', sa.String(), sa.ForeignKey('contract_amendment_drafts.id'), primary_key=True),
        sa.Column('revision', sa.Integer(), primary_key=True),
        sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('clause_reference', sa.String(200), nullable=False),
        sa.Column('current_wording', sa.Text(), nullable=False),
        sa.Column('proposed_wording', sa.Text(), nullable=False),
        sa.Column('proposed_effective_date', sa.String(10), nullable=True),
        sa.Column('saved_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('saved_by_name', sa.String(), nullable=True),
        sa.Column('saved_at', sa.String(), nullable=True),
        sa.Column('recorded_at', sa.String(), nullable=False),
        sa.Column('origin', sa.String(), nullable=False),
        sa.CheckConstraint('revision >= 1', name='ck_amendment_revision_positive'),
        sa.CheckConstraint("origin IN ('saved', 'migration')", name='ck_amendment_revision_origin'),
    )
    # Only the current form still exists; earlier wording and editors are unknown.
    op.get_bind().execute(sa.text('''
        INSERT INTO contract_amendment_revisions (
            draft_id, revision, source_version, title, reason, clause_reference,
            current_wording, proposed_wording, proposed_effective_date,
            saved_by, saved_by_name, saved_at, recorded_at, origin
        )
        SELECT id, revision, source_version, title, reason, clause_reference,
            current_wording, proposed_wording, proposed_effective_date,
            NULL, NULL, NULL, :recorded_at, 'migration'
        FROM contract_amendment_drafts
    '''), {'recorded_at': datetime.now(timezone.utc).isoformat(timespec='seconds')})
    if op.get_bind().dialect.name == 'sqlite':
        # Corrections append a revision instead of changing retained history.
        op.execute(sa.text('''
            CREATE TRIGGER amendment_revision_no_replace
            BEFORE INSERT ON contract_amendment_revisions
            WHEN EXISTS (
                SELECT 1 FROM contract_amendment_revisions
                WHERE draft_id = NEW.draft_id AND revision = NEW.revision
            )
            BEGIN
                SELECT RAISE(ABORT, 'Amendment revision history is read-only');
            END
        '''))
        for action in ('UPDATE', 'DELETE'):
            op.execute(sa.text(f'''
                CREATE TRIGGER amendment_revision_no_{action.lower()}
                BEFORE {action} ON contract_amendment_revisions
                BEGIN
                    SELECT RAISE(ABORT, 'Amendment revision history is read-only');
                END
            '''))


def downgrade():
    if op.get_bind().dialect.name == 'sqlite':
        for action in ('replace', 'update', 'delete'):
            op.execute(sa.text(f'DROP TRIGGER IF EXISTS amendment_revision_no_{action}'))
    op.drop_table('contract_amendment_revisions')
