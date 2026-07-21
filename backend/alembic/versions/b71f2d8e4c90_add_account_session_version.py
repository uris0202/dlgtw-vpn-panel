"""add account session version

Revision ID: b71f2d8e4c90
Revises: a84e3c1d7f26
Create Date: 2026-07-13 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b71f2d8e4c90"
down_revision: Union[str, Sequence[str], None] = "a84e3c1d7f26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "account_session_version",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.alter_column(
        "orders",
        "account_session_version",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("orders", "account_session_version")
