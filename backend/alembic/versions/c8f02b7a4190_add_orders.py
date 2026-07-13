"""add orders

Revision ID: c8f02b7a4190
Revises: b94a3b275721
Create Date: 2026-07-11 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8f02b7a4190"
down_revision: Union[str, Sequence[str], None] = "b94a3b275721"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_email", sa.String(length=255), nullable=False),
        sa.Column("server_id", sa.Integer(), nullable=True),
        sa.Column("server_name", sa.String(length=100), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=True),
        sa.Column("plan_name", sa.String(length=100), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("traffic_gb", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("orders")
