"""add order activated servers

Revision ID: 7d2f6a9c4b11
Revises: c41d8a7e2f90
Create Date: 2026-07-12 01:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7d2f6a9c4b11"
down_revision: Union[str, Sequence[str], None] = "c41d8a7e2f90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "activated_server_ids",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )
    op.execute(
        "UPDATE orders "
        "SET activated_server_ids = server_ids "
        "WHERE activated_at IS NOT NULL "
        "AND COALESCE(activation_error, '') = ''"
    )
    op.alter_column(
        "orders",
        "activated_server_ids",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("orders", "activated_server_ids")
