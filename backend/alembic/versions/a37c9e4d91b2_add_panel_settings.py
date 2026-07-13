"""add panel settings

Revision ID: a37c9e4d91b2
Revises: 88e046ccab2d
Create Date: 2026-07-08 21:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a37c9e4d91b2"
down_revision: Union[str, Sequence[str], None] = "88e046ccab2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    panel_settings = op.create_table(
        "panel_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("panel_name", sa.String(length=100), nullable=False),
        sa.Column("default_client_days", sa.Integer(), nullable=False),
        sa.Column("default_traffic_gb", sa.Integer(), nullable=False),
        sa.Column("default_inbound_id", sa.Integer(), nullable=False),
        sa.Column("subscription_port", sa.Integer(), nullable=False),
        sa.Column("subscription_path", sa.String(length=100), nullable=False),
        sa.Column("support_contact", sa.String(length=255), nullable=False),
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
        panel_settings,
        [
            {
                "id": 1,
                "panel_name": "DLGTW VPN",
                "default_client_days": 30,
                "default_traffic_gb": 0,
                "default_inbound_id": 1,
                "subscription_port": 2096,
                "subscription_path": "subs",
                "support_contact": "",
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("panel_settings")
