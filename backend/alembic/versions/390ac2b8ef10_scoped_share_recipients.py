"""Optional recipient department on reviewed sharing grants."""
from alembic import op
import sqlalchemy as sa

revision='390ac2b8ef10'
down_revision='222e645153de'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('shares',sa.Column('recipient_department',sa.String(),nullable=True))

def downgrade():
    op.drop_column('shares','recipient_department')
