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


class ServerResponse(BaseModel):
    id: int
    name: str
    country: str
    host: str
    base_path: str
    enabled: bool

    class Config:
        from_attributes = True
