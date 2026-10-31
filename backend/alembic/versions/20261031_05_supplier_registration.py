"""Independent initial verification of supplier identities and bank details."""
from alembic import op
import sqlalchemy as sa
revision='20261031_supplier_reg'
down_revision='20261031_supplier_catalog'
branch_labels=depends_on=None
def upgrade():
    columns=[sa.Column('id',sa.String(),primary_key=True),sa.Column('airport_id',sa.String(),nullable=False),
        sa.Column('payload',sa.JSON(),nullable=False),sa.Column('status',sa.String(),nullable=False)]
    for name in ('created_by','created_at','verification_note','decision_note'):
        columns.append(sa.Column(name,sa.Text(),nullable=False))
    for name in ('verified_by','verified_at','approved_by','approved_at','supplier_id'):
        columns.append(sa.Column(name,sa.String(),nullable=True))
    columns.append(sa.Column('verification_evidence',sa.JSON(),nullable=True))
    op.create_table('supplier_registrations',*columns)
    op.create_index('ix_supplier_registrations_airport_id','supplier_registrations',['airport_id'])
def downgrade(): op.drop_table('supplier_registrations')
