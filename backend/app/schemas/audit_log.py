from datetime import datetime
from typing import Any

from pydantic import BaseModel
from pydantic import Field


class AuditLogResponse(BaseModel):
    id: int
    actor_type: str
    actor_id: int | None
    actor_label: str
    action: str
    entity_type: str
    entity_id: str
    summary: str
    details: dict[str, Any]
    ip_address: str
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
