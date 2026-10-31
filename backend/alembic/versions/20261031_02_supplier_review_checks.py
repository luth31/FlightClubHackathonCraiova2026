"""Preserve which supplier controls were performed."""
from alembic import op
import sqlalchemy as sa
revision = '20261031_review_checks'
down_revision = '20261031_review_context'
branch_labels = depends_on = None
def upgrade():
    op.add_column('supplier_reviews',sa.Column('checks',sa.JSON(),nullable=True))
def downgrade():
    op.drop_column('supplier_reviews','checks')
