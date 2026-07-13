"""add order account token

Revision ID: 9a7c4e2f1b63
Revises: f2c0a6d9b8e7
Create Date: 2026-07-11 17:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9a7c4e2f1b63"
down_revision: Union[str, Sequence[str], None] = "f2c0a6d9b8e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "account_token",
            sa.String(length=80),
            server_default="",
            nullable=False,
        ),
    )
    op.create_index(
        "ix_orders_account_token",
        "orders",
        ["account_token"],
        unique=False,
    )
    op.execute(
        """
        WITH account_tokens AS (
            SELECT
                client_email,
                md5(client_email || min(id)::text || random()::text || clock_timestamp()::text) AS token
            FROM orders
            GROUP BY client_email
        )
        UPDATE orders
        SET account_token = account_tokens.token
        FROM account_tokens
        WHERE orders.client_email = account_tokens.client_email
          AND orders.account_token = ''
        """
    )
    op.alter_column("orders", "account_token", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_orders_account_token", table_name="orders")
    op.drop_column("orders", "account_token")
