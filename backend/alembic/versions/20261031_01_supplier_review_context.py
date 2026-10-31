"""Persist the evidence evaluated in supplier reviews."""
import json
from alembic import op
import sqlalchemy as sa

revision = '20261031_review_context'
down_revision = '714af828c311'
branch_labels = depends_on = None


def upgrade():
    op.add_column('suppliers', sa.Column('registry_revision', sa.Integer(), nullable=False, server_default='1'))
    db = op.get_bind()
    for identifier, history in db.execute(sa.text('SELECT id,bank_history FROM suppliers')):
        db.execute(sa.text('UPDATE suppliers SET registry_revision=:version WHERE id=:id'),
            {'version': max(1, len(json.loads(history or '[]'))), 'id': identifier})
    for name, kind in [('service_date', sa.String()), ('invoice_currency', sa.String()),
                       ('registry_revision', sa.Integer()), ('contract_snapshot', sa.JSON())]:
        op.add_column('supplier_reviews', sa.Column(name, kind, nullable=True))


def downgrade():
    for name in ('contract_snapshot', 'registry_revision', 'invoice_currency', 'service_date'):
        op.drop_column('supplier_reviews', name)
    op.drop_column('suppliers', 'registry_revision')
