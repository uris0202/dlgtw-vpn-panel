from datetime import datetime

from sqlalchemy import BigInteger
from sqlalchemy import Boolean
from sqlalchemy import DateTime
from sqlalchemy import Integer
from sqlalchemy import JSON
from sqlalchemy import String
from sqlalchemy import Text

from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.db.base import Base
from app.db.base import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255)
    )

    is_admin: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    session_version: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    totp_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    totp_secret_encrypted: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    totp_pending_secret_encrypted: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )

    totp_last_used_step: Mapped[int] = mapped_column(
        BigInteger,
        default=-1,
        nullable=False,
    )

    recovery_code_hashes: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    two_factor_challenge_hash: Mapped[str] = mapped_column(
        String(64),
        default="",
        nullable=False,
    )

    two_factor_enabled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
