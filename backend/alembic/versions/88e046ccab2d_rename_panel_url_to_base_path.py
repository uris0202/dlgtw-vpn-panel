"""rename panel_url to base_path

Revision ID: 88e046ccab2d
Revises: fe777a1c9795
Create Date: 2026-07-02 19:14:42.325295

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '88e046ccab2d'
down_revision: Union[str, Sequence[str], None] = 'fe777a1c9795'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "servers",
        "panel_url",
        new_column_name="base_path",
        existing_type=sa.String(length=255),
    )

def downgrade() -> None:
    op.alter_column(
        "servers",
        "base_path",
        new_column_name="panel_url",
        existing_type=sa.String(length=255),
    )
