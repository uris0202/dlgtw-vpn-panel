"""add plans

Revision ID: b94a3b275721
Revises: a37c9e4d91b2
Create Date: 2026-07-08 21:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b94a3b275721"
down_revision: Union[str, Sequence[str], None] = "a37c9e4d91b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    plans = op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("traffic_gb", sa.Integer(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
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

    op.bulk_insert(
        plans,
        [
            {
                "name": "Старт",
                "description": "Базовый доступ на 30 дней",
                "duration_days": 30,
                "traffic_gb": 0,
                "price": 0,
                "currency": "RUB",
                "is_active": True,
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("plans")
