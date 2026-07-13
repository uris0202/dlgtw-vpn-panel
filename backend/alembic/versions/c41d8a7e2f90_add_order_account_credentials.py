"""add order account credentials

Revision ID: c41d8a7e2f90
Revises: 9a7c4e2f1b63
Create Date: 2026-07-11 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c41d8a7e2f90"
down_revision: Union[str, Sequence[str], None] = "9a7c4e2f1b63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "account_login",
            sa.String(length=100),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "account_password_hash",
            sa.String(length=255),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "account_password_changed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_orders_account_login",
        "orders",
        ["account_login"],
        unique=False,
    )
    op.alter_column("orders", "account_login", server_default=None)
    op.alter_column("orders", "account_password_hash", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_orders_account_login", table_name="orders")
    op.drop_column("orders", "account_password_changed_at")
    op.drop_column("orders", "account_password_hash")
    op.drop_column("orders", "account_login")
