"""Join main and procurement migration histories without schema changes."""

revision = '20261101_main_proc_merge'
down_revision = ('98ba68090c4a', '20261101_personal_proc_merge')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
