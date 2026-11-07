"""add admin security

Revision ID: a2c7e91d4f60
Revises: f4b7d8e2a610
Create Date: 2026-09-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a2c7e91d4f60"
down_revision: Union[str, Sequence[str], None] = "f4b7d8e2a610"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "session_version",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "totp_enabled",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "totp_secret_encrypted",
            sa.Text(),
            server_default=sa.text("''"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "totp_pending_secret_encrypted",
            sa.Text(),
            server_default=sa.text("''"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "totp_last_used_step",
            sa.BigInteger(),
            server_default="-1",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "recovery_code_hashes",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "two_factor_challenge_hash",
            sa.String(length=64),
            server_default=sa.text("''"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "two_factor_enabled_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    for column_name in (
        "session_version",
        "totp_enabled",
        "totp_secret_encrypted",
        "totp_pending_secret_encrypted",
        "totp_last_used_step",
        "recovery_code_hashes",
        "two_factor_challenge_hash",
    ):
        op.alter_column("users", column_name, server_default=None)


def downgrade() -> None:
    op.drop_column("users", "two_factor_enabled_at")
    op.drop_column("users", "two_factor_challenge_hash")
    op.drop_column("users", "recovery_code_hashes")
    op.drop_column("users", "totp_last_used_step")
    op.drop_column("users", "totp_pending_secret_encrypted")
    op.drop_column("users", "totp_secret_encrypted")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "session_version")
