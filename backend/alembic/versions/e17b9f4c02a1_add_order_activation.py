"""add order activation

Revision ID: e17b9f4c02a1
Revises: d5f6a2c1e8b4
Create Date: 2026-07-11 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e17b9f4c02a1"
down_revision: Union[str, Sequence[str], None] = "d5f6a2c1e8b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "server_ids",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "server_names",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "activated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "activation_error",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
    )

    op.execute(
        """
        UPDATE orders
        SET server_ids = json_build_array(server_id)
        WHERE server_id IS NOT NULL
        """
    )

    op.execute(
        """
        UPDATE orders
        SET server_names = server_name
        WHERE server_name IS NOT NULL AND server_name <> ''
        """
    )

    op.alter_column(
        "orders",
        "server_ids",
        server_default=None,
    )
    op.alter_column(
        "orders",
        "server_names",
        server_default=None,
    )
    op.alter_column(
        "orders",
        "activation_error",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("orders", "activation_error")
    op.drop_column("orders", "activated_at")
    op.drop_column("orders", "server_names")
    op.drop_column("orders", "server_ids")
