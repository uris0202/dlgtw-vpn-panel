import logging

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


logger = logging.getLogger(__name__)


class AuditLogService:
    SENSITIVE_DETAIL_KEYS = {
        "password",
        "password_hash",
        "current_password",
        "telegram_bot_token",
        "token",
        "access_token",
        "account_token",
        "uuid",
    }

    def __init__(self, db: Session):
        self.db = db

    def get_page(
        self,
        *,
        limit=50,
        offset=0,
        query_text="",
        actor_type="",
        entity_type="",
        action="",
    ):
        query = self.db.query(AuditLog)

        if actor_type:
            query = query.filter(AuditLog.actor_type == actor_type)

        if entity_type:
            query = query.filter(AuditLog.entity_type == entity_type)

        if action:
            query = query.filter(AuditLog.action == action)

        normalized_query = (query_text or "").strip()

        if normalized_query:
            pattern = f"%{normalized_query}%"
            query = query.filter(
                or_(
                    AuditLog.actor_label.ilike(pattern),
                    AuditLog.summary.ilike(pattern),
                    AuditLog.entity_id.ilike(pattern),
                )
            )

        total = query.count()
        items = (
            query
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def record(
        self,
        *,
        actor_type,
        actor_label,
        action,
        entity_type,
        entity_id,
        summary,
        actor_id=None,
        details=None,
        ip_address="",
    ):
        try:
            event = AuditLog(
                actor_type=str(actor_type or "system")[:30],
                actor_id=actor_id,
                actor_label=str(actor_label or "Система")[:255],
                action=str(action or "unknown")[:80],
                entity_type=str(entity_type or "system")[:40],
                entity_id=str(entity_id or "")[:255],
                summary=str(summary or "Событие")[:2000],
                details=self.sanitize_details(details or {}),
                ip_address=str(ip_address or "")[:64],
            )
            self.db.add(event)
            self.db.commit()
            self.db.refresh(event)
            return event
        except Exception:
            self.db.rollback()
            logger.exception("Unable to save audit log action=%s", action)
            return None

    def record_admin(self, user, **values):
        return self.record(
            actor_type="admin",
            actor_id=getattr(user, "id", None),
            actor_label=getattr(user, "email", "Администратор"),
            **values,
        )

    def record_customer(self, order, **values):
        label = (
            getattr(order, "account_login", "")
            or getattr(order, "client_email", "")
            or "Клиент"
        )
        return self.record(
            actor_type="customer",
            actor_label=label,
            **values,
        )

    @classmethod
    def sanitize_details(cls, value):
        if isinstance(value, dict):
            return {
                str(key)[:100]: cls.sanitize_details(item)
                for key, item in value.items()
                if str(key).lower() not in cls.SENSITIVE_DETAIL_KEYS
            }

        if isinstance(value, (list, tuple, set)):
            return [cls.sanitize_details(item) for item in value][:100]

        if value is None or isinstance(value, (str, int, float, bool)):
            return value

        return str(value)[:500]
