"""Join the profile feature and operations strategy migration histories.

Both histories have been used locally. Keep their revisions intact so upgrades
preserve existing profiles, photos and operations records from either branch.
"""

revision = '20261101_profiles_strategy_merge'
down_revision = ('20261101_person_profiles', '20261101_strategy_analysis')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
