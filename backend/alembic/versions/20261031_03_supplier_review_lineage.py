"""Link reevaluations without changing prior decisions."""
from alembic import op
import sqlalchemy as sa
revision='20261031_review_lineage'
down_revision='20261031_review_checks'
branch_labels=depends_on=None
def upgrade():
    op.add_column('supplier_reviews',sa.Column('previous_review_id',sa.String(),nullable=True))
    op.create_index('ix_supplier_review_previous','supplier_reviews',['previous_review_id'])
def downgrade():
    op.drop_index('ix_supplier_review_previous',table_name='supplier_reviews')
    op.drop_column('supplier_reviews','previous_review_id')
