"""Employee identities, stable departments and approved authority."""
from alembic import op
import sqlalchemy as sa

revision = '20261031_user_management'
down_revision = '20261031_supplier_ocr_merge'
branch_labels = None
depends_on = None


def upgrade():
    for column in [sa.Column('department_id', sa.String(), nullable=True),
        sa.Column('identity_issuer', sa.String(), nullable=True),
        sa.Column('identity_subject', sa.String(), nullable=True),
        sa.Column('provisioning_status', sa.String(), nullable=False, server_default='ready'),
        sa.Column('provisioning_started_at', sa.String(), nullable=True),
        sa.Column('identity_sync_pending', sa.Boolean(), nullable=False, server_default=sa.false())]:
        op.add_column('users', column)
    op.create_index('uq_user_identity', 'users', ['identity_issuer', 'identity_subject'], unique=True)
    op.execute('CREATE UNIQUE INDEX uq_airport_user_email ON users (airport_id, lower(trim(email)))')
    op.add_column('workflow_tasks', sa.Column('reassignment_required', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table('departments', sa.Column('id', sa.String(), primary_key=True),
        sa.Column('airport_id', sa.String(), nullable=False), sa.Column('name', sa.String(), nullable=False),
        sa.Column('head_user_id', sa.String(), nullable=True), sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.UniqueConstraint('airport_id', 'name'))
    op.create_table('head_appointments', sa.Column('id', sa.String(), primary_key=True),
        sa.Column('airport_id', sa.String(), nullable=False), sa.Column('department_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False), sa.Column('proposed_by', sa.String(), nullable=False),
        sa.Column('effective_date', sa.String(), nullable=False), sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('department_revision', sa.Integer(), nullable=False), sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False), sa.Column('decided_by', sa.String(), nullable=True),
        sa.Column('decided_at', sa.String(), nullable=True), sa.Column('decision_comment', sa.Text(), nullable=False, server_default=''))
    op.execute("CREATE UNIQUE INDEX uq_open_head_appointment ON head_appointments (department_id) WHERE status IN ('pending', 'approved')")


def downgrade():
    op.drop_table('head_appointments')
    op.drop_table('departments')
    op.drop_column('workflow_tasks', 'reassignment_required')
    op.drop_index('uq_airport_user_email', table_name='users')
    op.drop_index('uq_user_identity', table_name='users')
    for name in ('identity_sync_pending', 'provisioning_started_at', 'provisioning_status', 'identity_subject', 'identity_issuer', 'department_id'):
        op.drop_column('users', name)
