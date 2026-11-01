"""Equipment support teams and explicit employee assignment."""
from alembic import op
import sqlalchemy as sa

revision = 'c8e715bf402a'
down_revision = 'b7d4029e1a63'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('equipment_teams',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('airport_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.UniqueConstraint('airport_id', 'name'))
    op.create_index('ix_equipment_teams_airport_id', 'equipment_teams', ['airport_id'])
    op.create_table('equipment_team_members',
        sa.Column('team_id', sa.String(), sa.ForeignKey('equipment_teams.id'), primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), primary_key=True))
    # SQLite supports additive nullable REFERENCES columns without rewriting existing equipment.
    if op.get_bind().dialect.name == 'sqlite':
        op.execute('ALTER TABLE equipment ADD COLUMN support_team_id VARCHAR REFERENCES equipment_teams (id)')
    else:
        op.add_column('equipment', sa.Column('support_team_id', sa.String(), sa.ForeignKey('equipment_teams.id', name='fk_equipment_team')))
    op.add_column('equipment_jobs', sa.Column('assignment_department', sa.String(), nullable=False, server_default='Tehnic'))
    op.execute("UPDATE equipment_jobs SET assignment_department = COALESCE((SELECT department FROM users WHERE users.id = equipment_jobs.assigned_to), 'Tehnic')")


def downgrade():
    if op.get_bind().dialect.name == 'sqlite':
        op.execute('ALTER TABLE equipment_jobs DROP COLUMN assignment_department')
        op.execute('ALTER TABLE equipment DROP COLUMN support_team_id')
    else:
        op.drop_column('equipment_jobs', 'assignment_department')
        op.drop_constraint('fk_equipment_team', 'equipment', type_='foreignkey')
        op.drop_column('equipment', 'support_team_id')
    op.drop_table('equipment_team_members')
    op.drop_index('ix_equipment_teams_airport_id', table_name='equipment_teams')
    op.drop_table('equipment_teams')
