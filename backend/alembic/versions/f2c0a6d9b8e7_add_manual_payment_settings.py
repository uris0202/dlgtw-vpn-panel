"""add manual payment settings

Revision ID: f2c0a6d9b8e7
Revises: e17b9f4c02a1
Create Date: 2026-07-11 16:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2c0a6d9b8e7"
down_revision: Union[str, Sequence[str], None] = "e17b9f4c02a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "panel_settings",
        sa.Column(
            "payment_phone",
            sa.String(length=50),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "panel_settings",
        sa.Column(
            "payment_recipient",
            sa.String(length=100),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "panel_settings",
        sa.Column(
            "payment_instructions",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "customer_contact",
            sa.String(length=255),
            server_default="",
            nullable=False,
        ),
    )

    op.alter_column("panel_settings", "payment_phone", server_default=None)
    op.alter_column("panel_settings", "payment_recipient", server_default=None)
    op.alter_column("panel_settings", "payment_instructions", server_default=None)
    op.alter_column("orders", "customer_contact", server_default=None)


def downgrade() -> None:
    op.drop_column("orders", "customer_contact")
    op.drop_column("panel_settings", "payment_instructions")
    op.drop_column("panel_settings", "payment_recipient")
    op.drop_column("panel_settings", "payment_phone")
