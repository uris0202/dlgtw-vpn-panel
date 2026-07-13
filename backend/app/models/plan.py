from sqlalchemy import Boolean
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Text

from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.db.base import Base
from app.db.base import TimestampMixin


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
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

    server_limit: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    price: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(10),
        default="RUB",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
