from fastapi import APIRouter
from fastapi import Depends
from fastapi import Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.audit_log import AuditLogListResponse
from app.services.audit_log_service import AuditLogService


router = APIRouter(
    prefix="/audit-logs",
    tags=["Audit logs"],
)


@router.get("", response_model=AuditLogListResponse)
def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=200),
    actor_type: str = Query(default="", max_length=30),
    entity_type: str = Query(default="", max_length=40),
    action: str = Query(default="", max_length=80),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return AuditLogService(db).get_page(
        limit=limit,
        offset=offset,
        query_text=q,
        actor_type=actor_type,
        entity_type=entity_type,
        action=action,
    )
