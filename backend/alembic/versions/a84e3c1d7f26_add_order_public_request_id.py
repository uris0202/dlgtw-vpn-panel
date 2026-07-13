"""add order public request id

Revision ID: a84e3c1d7f26
Revises: 7d2f6a9c4b11
Create Date: 2026-07-12 02:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a84e3c1d7f26"
down_revision: Union[str, Sequence[str], None] = "7d2f6a9c4b11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "public_request_id",
            sa.String(length=80),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_orders_public_request_id",
        "orders",
        ["public_request_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_orders_public_request_id", table_name="orders")
    op.drop_column("orders", "public_request_id")
