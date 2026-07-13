from pydantic import BaseModel
from pydantic import Field


class SettingsUpdate(BaseModel):
    panel_name: str | None = None
    default_client_days: int | None = Field(default=None, ge=0)
    default_traffic_gb: int | None = Field(default=None, ge=0)
    default_inbound_id: int | None = Field(default=None, ge=1)
    subscription_port: int | None = Field(default=None, ge=1, le=65535)
    subscription_path: str | None = None
    support_contact: str | None = None
    payment_phone: str | None = None
    payment_recipient: str | None = None
    payment_instructions: str | None = None


class SettingsResponse(BaseModel):
    id: int
    panel_name: str
    default_client_days: int
    default_traffic_gb: int
    default_inbound_id: int
    subscription_port: int
    subscription_path: str
    support_contact: str
    payment_phone: str
    payment_recipient: str
    payment_instructions: str

    class Config:
        from_attributes = True
