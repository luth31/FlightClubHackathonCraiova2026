"""Merge collaboration routing with profiles and strategy revisions.

Restore the merge revision already recorded by the local databases.
This revision performs no schema or data changes.
"""

revision = '20261101_collaboration_merge'
down_revision = ('20261101_profiles_strategy_merge', '20261101_collaboration_routing')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
