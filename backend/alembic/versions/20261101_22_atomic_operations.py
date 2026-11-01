"""Persistent operational identities and immutable atomic evidence."""
from alembic import op
import sqlalchemy as sa

revision = '20261101_atomic_operations'
down_revision = '20261101_mailbox_release_merge'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('operation_entities',
        sa.Column('id',sa.String(),primary_key=True),sa.Column('airport_id',sa.String(),nullable=False),
        sa.Column('kind',sa.String(),nullable=False),sa.Column('code',sa.String(),nullable=False),
        sa.Column('label',sa.String(),nullable=False),sa.Column('attributes',sa.JSON(),nullable=False))
    op.create_index('ix_operation_entities_airport_id','operation_entities',['airport_id'])
    op.create_table('operation_facts',
        sa.Column('id',sa.String(),primary_key=True),sa.Column('airport_id',sa.String(),nullable=False),
        sa.Column('group_id',sa.String(),nullable=False),sa.Column('occurred_at',sa.String(),nullable=False),
        sa.Column('recorded_at',sa.String(),nullable=False),sa.Column('data',sa.JSON(),nullable=False),
        sa.Column('digest',sa.String(),nullable=False))
    for field in ('airport_id','group_id','occurred_at'):
        op.create_index('ix_operation_facts_'+field,'operation_facts',[field])
    op.create_table('operation_fact_entities',
        sa.Column('fact_id',sa.String(),sa.ForeignKey('operation_facts.id'),primary_key=True),
        sa.Column('entity_id',sa.String(),sa.ForeignKey('operation_entities.id'),primary_key=True),
        sa.Column('role',sa.String(),primary_key=True))
    op.create_index('ix_operation_fact_entities_entity_id','operation_fact_entities',['entity_id'])
    dialect = op.get_bind().dialect.name
    if dialect == 'sqlite':
        for table in ('operation_facts','operation_fact_entities'):
            for action in ('UPDATE','DELETE'):
                op.execute(f"CREATE TRIGGER {table}_no_{action.lower()} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT, 'Operational evidence is append-only'); END")
    elif dialect == 'postgresql':
        op.execute("CREATE FUNCTION reject_operation_fact_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Operational evidence is append-only'; END $$")
        for table in ('operation_facts','operation_fact_entities'):
            op.execute(f'CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION reject_operation_fact_change()')


def downgrade():
    op.drop_table('operation_fact_entities')
    op.drop_table('operation_facts')
    op.drop_table('operation_entities')
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('DROP FUNCTION reject_operation_fact_change()')
