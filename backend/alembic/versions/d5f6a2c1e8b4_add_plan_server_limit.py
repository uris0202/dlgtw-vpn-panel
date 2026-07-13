"""add plan server limit

Revision ID: d5f6a2c1e8b4
Revises: c8f02b7a4190
Create Date: 2026-07-11 14:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5f6a2c1e8b4"
down_revision: Union[str, Sequence[str], None] = "c8f02b7a4190"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column(
            "server_limit",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
    )

    op.alter_column(
        "plans",
        "server_limit",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("plans", "server_limit")
