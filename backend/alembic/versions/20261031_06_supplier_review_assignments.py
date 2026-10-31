"""Organizational ownership for supplier cases."""
from alembic import op
import sqlalchemy as sa
revision='20261031_supplier_assign'
down_revision='20261031_supplier_reg'
branch_labels=depends_on=None
def upgrade():
    op.add_column('supplier_reviews',sa.Column('assigned_to',sa.String(),nullable=True))
    op.add_column('supplier_reviews',sa.Column('due_date',sa.String(),nullable=True))
    op.add_column('supplier_reviews',sa.Column('assignment_revision',sa.Integer(),nullable=False,server_default='1'))
    op.add_column('supplier_reviews',sa.Column('assignment_history',sa.JSON(),nullable=False,server_default='[]'))
def downgrade():
    for column in ('assignment_history','assignment_revision','due_date','assigned_to'): op.drop_column('supplier_reviews',column)
