"""Persist given names and surnames without changing legacy display names."""
from alembic import op
import sqlalchemy as sa

revision = '20261031_employee_name_parts'
down_revision = '20261031_dept_coordinators'
branch_labels = None
depends_on = None


def upgrade():
    for key in ('first_name', 'middle_name', 'last_name'):
        op.add_column('users', sa.Column(key, sa.String(), nullable=False, server_default=''))
    connection = op.get_bind()
    for row in connection.execute(sa.text('SELECT id, name FROM users')).all():
        parts = (row.name or '').split()
        connection.execute(sa.text('''UPDATE users SET first_name = :first,
            middle_name = :middle, last_name = :last WHERE id = :id'''), {
            'id': row.id, 'first': parts[0] if parts else '',
            'middle': ' '.join(parts[1:-1]), 'last': parts[-1] if len(parts) > 1 else ''})


def downgrade():
    for key in ('last_name', 'middle_name', 'first_name'):
        op.drop_column('users', key)
