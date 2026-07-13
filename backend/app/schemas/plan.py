from pydantic import BaseModel
from pydantic import Field


class PlanCreate(BaseModel):
    name: str
    description: str = ""
    duration_days: int = Field(default=30, ge=0)
    traffic_gb: int = Field(default=0, ge=0)
    server_limit: int = Field(default=1, ge=1)
    price: int = Field(default=0, ge=0)
    currency: str = "RUB"
    is_active: bool = True


class PlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    duration_days: int | None = Field(default=None, ge=0)
    traffic_gb: int | None = Field(default=None, ge=0)
    server_limit: int | None = Field(default=None, ge=1)
    price: int | None = Field(default=None, ge=0)
    currency: str | None = None
    is_active: bool | None = None


class PlanResponse(BaseModel):
    id: int
    name: str
    description: str
    duration_days: int
    traffic_gb: int
    server_limit: int
    price: int
    currency: str
    is_active: bool

    class Config:
        from_attributes = True
