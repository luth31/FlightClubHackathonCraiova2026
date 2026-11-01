"""Merge equipment and atomic operations histories
Revision ID: 98ba68090c4a
Revises: 20261101_atomic_operations, c8e715bf402a
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '98ba68090c4a'
down_revision: Union[str, Sequence[str], None] = ('20261101_atomic_operations', 'c8e715bf402a')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
def upgrade() -> None:
    pass
def downgrade() -> None:
    pass
