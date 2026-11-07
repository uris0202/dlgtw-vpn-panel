from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class NewsCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=20000)
    is_published: bool = False
    is_pinned: bool = False

    @field_validator("title", "body")
    @classmethod
    def trim_content(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Поле не может быть пустым")
        return value


class NewsUpdate(NewsCreate):
    title: str = Field(default=None, min_length=1, max_length=160)
    body: str = Field(default=None, min_length=1, max_length=20000)
    is_published: bool = Field(default=None)
    is_pinned: bool = Field(default=None)

class PublicNewsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    is_pinned: bool
    published_at: datetime


class NewsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    is_published: bool
    is_pinned: bool
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class NewsPage(BaseModel):
    items: list[NewsResponse]
    total: int
    limit: int
    offset: int


class PublicNewsPage(BaseModel):
    items: list[PublicNewsResponse]
    total: int
    limit: int
    offset: int
    panel_name: str
