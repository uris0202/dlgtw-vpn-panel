from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy import Integer
from sqlalchemy import JSON
from sqlalchemy import String
from sqlalchemy import Text

from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.db.base import Base
from app.db.base import TimestampMixin


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)

    client_email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    customer_contact: Mapped[str] = mapped_column(
        String(255),
        default="",
        nullable=False,
    )

    public_request_id: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
        unique=True,
        index=True,
    )

    account_token: Mapped[str] = mapped_column(
        String(80),
        default="",
        nullable=False,
        index=True,
    )

    account_login: Mapped[str] = mapped_column(
        String(100),
        default="",
        nullable=False,
        index=True,
    )

    account_password_hash: Mapped[str] = mapped_column(
        String(255),
        default="",
        nullable=False,
    )

    account_password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    account_session_version: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    server_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    server_name: Mapped[str] = mapped_column(
        String(100),
        default="",
        nullable=False,
    )

    server_ids: Mapped[list[int]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    server_names: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    plan_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    plan_name: Mapped[str] = mapped_column(
        String(100),
        default="",
        nullable=False,
    )

    duration_days: Mapped[int] = mapped_column(
        Integer,
        default=30,
        nullable=False,
    )

    traffic_gb: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    amount: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(10),
        default="RUB",
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )

    note: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    activated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    activation_error: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    activated_server_ids: Mapped[list[int]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
