"""Add public news and customer connection visibility setting.

Revision ID: c3d8f102ab67
Revises: a2c7e91d4f60
"""
from alembic import op
import sqlalchemy as sa


revision = "c3d8f102ab67"
down_revision = "a2c7e91d4f60"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "panel_settings",
        sa.Column("client_show_server_links", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "news",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_news_publication", "news", ["is_published", "is_pinned", "published_at"])


def downgrade():
    op.drop_index("ix_news_publication", table_name="news")
    op.drop_table("news")
    op.drop_column("panel_settings", "client_show_server_links")
