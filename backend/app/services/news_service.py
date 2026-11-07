from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.news import News


class NewsService:
    def __init__(self, db: Session):
        self.db = db

    def get_page(self, *, public=False, status="all", query_text="", limit=20, offset=0):
        query = self.db.query(News)
        if public:
            query = query.filter(
                News.is_published.is_(True),
                News.published_at <= datetime.now(timezone.utc),
            )
        elif status != "all":
            query = query.filter(News.is_published.is_(status == "published"))
        if query_text.strip():
            query = query.filter(News.title.ilike(f"%{query_text.strip()}%"))
        total = query.count()
        ordering = (
            (News.is_pinned.desc(), News.published_at.desc(), News.id.desc())
            if public else (News.updated_at.desc(), News.id.desc())
        )
        return {
            "items": query.order_by(*ordering).offset(offset).limit(limit).all(),
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get(self, news_id):
        return self.db.get(News, news_id)

    def create(self, payload):
        news = News(**payload.model_dump())
        news.published_at = datetime.now(timezone.utc) if news.is_published else None
        self.db.add(news)
        self.db.commit()
        self.db.refresh(news)
        return news

    def update(self, news, payload):
        values = payload.model_dump(exclude_unset=True)
        if "is_published" in values and values["is_published"] != news.is_published:
            news.published_at = datetime.now(timezone.utc) if values["is_published"] else None
        for key, value in values.items():
            setattr(news, key, value)
        self.db.commit()
        self.db.refresh(news)
        return news

    def delete(self, news):
        self.db.delete(news)
        self.db.commit()
