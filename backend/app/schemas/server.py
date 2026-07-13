from pydantic import BaseModel
from pydantic import HttpUrl


class ServerCreate(BaseModel):
    name: str
    country: str
    host: HttpUrl
    base_path: str
    username: str
    password: str
    enabled: bool = True


class ServerUpdate(BaseModel):
    name: str | None = None
    country: str | None = None
    host: HttpUrl | None = None
    base_path: str | None = None
    username: str | None = None
    password: str | None = None
    enabled: bool | None = None


class ServerResponse(BaseModel):
    id: int
    name: str
    country: str
    host: str
    base_path: str
    username: str
    enabled: bool

    class Config:
        from_attributes = True
