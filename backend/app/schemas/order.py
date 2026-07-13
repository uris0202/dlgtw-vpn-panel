from datetime import datetime

from pydantic import BaseModel
from pydantic import Field


class OrderCreate(BaseModel):
    client_email: str
    customer_contact: str = ""
    public_request_id: str | None = None
    account_token: str = ""
    account_login: str = ""
    server_id: int | None = None
    server_name: str = ""
    server_ids: list[int] = Field(default_factory=list)
    server_names: str = ""
    plan_id: int | None = None
    plan_name: str = ""
    duration_days: int = Field(default=30, ge=0)
    traffic_gb: int = Field(default=0, ge=0)
    amount: int = Field(default=0, ge=0)
    currency: str = "RUB"
    status: str = Field(default="pending", pattern="^(pending|paid|canceled|access)$")
    note: str = ""


class OrderUpdate(BaseModel):
    client_email: str | None = None
    customer_contact: str | None = None
    account_token: str | None = None
    account_login: str | None = None
    server_id: int | None = None
    server_name: str | None = None
    server_ids: list[int] | None = None
    server_names: str | None = None
    plan_id: int | None = None
    plan_name: str | None = None
    duration_days: int | None = Field(default=None, ge=0)
    traffic_gb: int | None = Field(default=None, ge=0)
    amount: int | None = Field(default=None, ge=0)
    currency: str | None = None
    status: str | None = Field(default=None, pattern="^(pending|paid|canceled|access)$")
    note: str | None = None


class OrderAccountAccessCreate(BaseModel):
    client_email: str
    customer_contact: str = ""
    server_id: int | None = None
    server_ids: list[int] = Field(default_factory=list)


class OrderResponse(BaseModel):
    id: int
    client_email: str
    customer_contact: str
    public_request_id: str | None
    account_token: str
    account_login: str
    server_id: int | None
    server_name: str
    server_ids: list[int]
    server_names: str
    plan_id: int | None
    plan_name: str
    duration_days: int
    traffic_gb: int
    amount: int
    currency: str
    status: str
    note: str
    paid_at: datetime | None
    activated_at: datetime | None
    activation_error: str
    activated_server_ids: list[int]

    class Config:
        from_attributes = True
