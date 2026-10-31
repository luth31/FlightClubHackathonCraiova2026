"""Remove legacy coordinators outside an employee's department."""
from alembic import op

revision = '20261031_dept_coordinators'
down_revision = '20261031_identity_reconcile'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('''UPDATE users SET manager_id = NULL WHERE manager_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users AS coordinator
            WHERE coordinator.id = users.manager_id AND coordinator.id != users.id
            AND coordinator.airport_id = users.airport_id
            AND (coordinator.department_id = users.department_id
                OR (coordinator.department_id IS NULL AND users.department_id IS NULL
                    AND coordinator.department = users.department)))''')


def downgrade():
    # Historical reporting links cannot safely be reconstructed.
    pass
