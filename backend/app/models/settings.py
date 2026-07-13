from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Text

from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

from app.db.base import Base
from app.db.base import TimestampMixin


class PanelSettings(Base, TimestampMixin):
    __tablename__ = "panel_settings"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        default=1,
    )

    panel_name: Mapped[str] = mapped_column(
        String(100),
        default="DLGTW VPN",
        nullable=False,
    )

    default_client_days: Mapped[int] = mapped_column(
        Integer,
        default=30,
        nullable=False,
    )

    default_traffic_gb: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    default_inbound_id: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    subscription_port: Mapped[int] = mapped_column(
        Integer,
        default=2096,
        nullable=False,
    )

    subscription_path: Mapped[str] = mapped_column(
        String(100),
        default="subs",
        nullable=False,
    )

    support_contact: Mapped[str] = mapped_column(
        String(255),
        default="",
        nullable=False,
    )

    payment_phone: Mapped[str] = mapped_column(
        String(50),
        default="",
        nullable=False,
    )

    payment_recipient: Mapped[str] = mapped_column(
        String(100),
        default="",
        nullable=False,
    )

    payment_instructions: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )
