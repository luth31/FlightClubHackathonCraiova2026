"""Stable supplier identity and explicit contract associations."""
from alembic import op
import sqlalchemy as sa
revision='20261031_supplier_catalog'
down_revision='20261031_review_lineage'
branch_labels=depends_on=None
def upgrade():
    with op.batch_alter_table('suppliers') as batch:
        batch.add_column(sa.Column('tax_id',sa.String(),nullable=True))
        batch.add_column(sa.Column('address',sa.String(),nullable=False,server_default=''))
        batch.add_column(sa.Column('category',sa.String(),nullable=False,server_default=''))
        batch.add_column(sa.Column('state',sa.String(),nullable=False,server_default='active'))
        batch.create_unique_constraint('uq_supplier_airport_tax',['airport_id','tax_id'])
    op.create_table('supplier_contracts',
        sa.Column('document_id',sa.String(),sa.ForeignKey('documents.id'),primary_key=True),
        sa.Column('supplier_id',sa.String(),sa.ForeignKey('suppliers.id'),nullable=False),
        sa.Column('linked_by',sa.String(),nullable=False),sa.Column('linked_at',sa.String(),nullable=False))
    op.create_index('ix_supplier_contracts_supplier_id','supplier_contracts',['supplier_id'])
    db=op.get_bind()
    suppliers=db.execute(sa.text('SELECT id,name,airport_id,document_id FROM suppliers')).all()
    for doc_id,name,airport,created in db.execute(sa.text("SELECT id,supplier,airport_id,created_at FROM documents WHERE category='Contract'")):
        matches=[s for s in suppliers if s.airport_id==airport and (s.document_id==doc_id or ' '.join(s.name.casefold().split())==' '.join((name or '').casefold().split()))]
        if len(matches)==1:
            db.execute(sa.text('INSERT INTO supplier_contracts VALUES (:doc,:supplier,:actor,:at)'),{'doc':doc_id,'supplier':matches[0].id,'actor':'migration','at':created})
def downgrade():
    op.drop_table('supplier_contracts')
    with op.batch_alter_table('suppliers') as batch:
        batch.drop_constraint('uq_supplier_airport_tax',type_='unique')
        for column in ('state','category','address','tax_id'): batch.drop_column(column)
