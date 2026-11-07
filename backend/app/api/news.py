from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.request import get_client_ip
from app.db.deps import get_db
from app.models.user import User
from app.schemas.news import NewsCreate, NewsPage, NewsResponse, NewsUpdate, PublicNewsPage
from app.services.audit_log_service import AuditLogService
from app.services.news_service import NewsService
from app.services.settings_service import SettingsService


router = APIRouter(prefix="/news", tags=["News"])
public_router = APIRouter(prefix="/public/news", tags=["Public"])


@public_router.get("", response_model=PublicNewsPage)
def get_public_news(
    response: Response,
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return {
        **NewsService(db).get_page(public=True, limit=limit, offset=offset),
        "panel_name": SettingsService(db).get().panel_name,
    }


@router.get("", response_model=NewsPage)
def get_news(
    response: Response,
    status: Literal["all", "published", "draft"] = "all",
    q: str = Query(default="", max_length=160),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return NewsService(db).get_page(status=status, query_text=q, limit=limit, offset=offset)


def record_change(db, current_user, request, news, action):
    AuditLogService(db).record_admin(
        current_user,
        action=f"news.{action}",
        entity_type="news",
        entity_id=news.id,
        summary=f"Новость: {news.title}",
        details={"is_published": news.is_published, "is_pinned": news.is_pinned},
        ip_address=get_client_ip(request),
    )


@router.post("", response_model=NewsResponse, status_code=201)
def create_news(
    payload: NewsCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    news = NewsService(db).create(payload)
    record_change(db, current_user, request, news, "created")
    return news


def require_news(service, news_id):
    news = service.get(news_id)
    if news is None:
        raise HTTPException(status_code=404, detail="Новость не найдена")
    return news


@router.patch("/{news_id}", response_model=NewsResponse)
def update_news(
    news_id: int,
    payload: NewsUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NewsService(db)
    news = service.update(require_news(service, news_id), payload)
    record_change(db, current_user, request, news, "updated")
    return news


@router.delete("/{news_id}")
def delete_news(
    news_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = NewsService(db)
    news = require_news(service, news_id)
    service.delete(news)
    record_change(db, current_user, request, news, "deleted")
    return {"success": True}
