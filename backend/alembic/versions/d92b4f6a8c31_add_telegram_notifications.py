"""add telegram notifications

Revision ID: d92b4f6a8c31
Revises: b71f2d8e4c90
Create Date: 2026-07-13 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d92b4f6a8c31"
down_revision: Union[str, Sequence[str], None] = "b71f2d8e4c90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "panel_settings",
        sa.Column(
            "telegram_notifications_enabled",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "panel_settings",
        sa.Column(
            "telegram_bot_token",
            sa.String(length=255),
            server_default="",
            nullable=False,
        ),
    )
    op.add_column(
        "panel_settings",
        sa.Column(
            "telegram_chat_id",
            sa.String(length=100),
            server_default="",
            nullable=False,
        ),
    )
    op.alter_column(
        "panel_settings",
        "telegram_notifications_enabled",
        server_default=None,
    )
    op.alter_column(
        "panel_settings",
        "telegram_bot_token",
        server_default=None,
    )
    op.alter_column(
        "panel_settings",
        "telegram_chat_id",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("panel_settings", "telegram_chat_id")
    op.drop_column("panel_settings", "telegram_bot_token")
    op.drop_column("panel_settings", "telegram_notifications_enabled")
