from pydantic import BaseModel


class ClientCreate(BaseModel):
    email: str
    inbound_id: int = 1
    days: int = 30
    total_gb: int = 0
    group: str = ""
    comment: str = ""


class ClientUpdate(BaseModel):
    group: str | None = None
    comment: str | None = None
    enable: bool | None = None
    total_gb: int | None = None
    days: int | None = None
