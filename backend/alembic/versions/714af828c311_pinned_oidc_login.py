"""One-use OIDC login transactions and authentication source binding.

Revision ID: 714af828c311
Revises: 6a170c11f201
"""
from alembic import op
import sqlalchemy as sa

revision = '714af828c311'
down_revision = '6a170c11f201'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('oidc_login_transactions',
        sa.Column('state_hash', sa.String(), primary_key=True),
        sa.Column('browser_hash', sa.String(), nullable=False),
        sa.Column('nonce', sa.String(), nullable=False),
        sa.Column('verifier', sa.String(), nullable=False),
        sa.Column('issuer', sa.String(), nullable=False),
        sa.Column('client_id', sa.String(), nullable=False),
        sa.Column('redirect_uri', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('expires_at', sa.String(), nullable=False))
    op.create_index('ix_oidc_login_transactions_expires_at', 'oidc_login_transactions', ['expires_at'])
    op.add_column('sessions', sa.Column('auth_source', sa.String(), nullable=False, server_default='demo'))
    op.add_column('sessions', sa.Column('auth_issuer', sa.String(), nullable=True))


def downgrade():
    op.drop_column('sessions', 'auth_issuer')
    op.drop_column('sessions', 'auth_source')
    op.drop_index('ix_oidc_login_transactions_expires_at', table_name='oidc_login_transactions')
    op.drop_table('oidc_login_transactions')
