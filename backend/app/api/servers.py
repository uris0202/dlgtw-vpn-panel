from app.auth.dependencies import get_current_user
from app.models.user import User
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request

from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.core.request import get_client_ip

from app.schemas.server import (
    ServerCreate,
    ServerResponse,
    ServerUpdate,
)

from app.services.server_service import ServerService
from app.services.audit_log_service import AuditLogService

router = APIRouter(
    prefix="/servers",
    tags=["Servers"],
)


@router.get(
    "",
    response_model=list[ServerResponse],
)
def get_servers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ServerService(db)

    return service.get_all()


@router.post(
    "",
    response_model=ServerResponse,
)
def create_server(
    server: ServerCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ServerService(db)

    created = service.create(server)
    AuditLogService(db).record_admin(
        current_user,
        action="server.created",
        entity_type="server",
        entity_id=created.id,
        summary=f"Добавлен VPN-сервер {created.name}",
        details={"country": created.country, "enabled": created.enabled},
        ip_address=get_client_ip(request),
    )

    return created


@router.patch(
    "/{server_id}",
    response_model=ServerResponse,
)
def update_server(
    server_id: int,
    payload: ServerUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ServerService(db)

    server = service.get(server_id)

    if server is None:

        raise HTTPException(
            status_code=404,
            detail="Server not found",
        )

    updated = service.update(server, payload)
    AuditLogService(db).record_admin(
        current_user,
        action="server.updated",
        entity_type="server",
        entity_id=updated.id,
        summary=f"Изменён VPN-сервер {updated.name}",
        details={
            "changed_fields": sorted(payload.model_dump(exclude_unset=True).keys()),
        },
        ip_address=get_client_ip(request),
    )

    return updated


@router.delete("/{server_id}")
def delete_server(
    server_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ServerService(db)

    server = service.get(server_id)

    if server is None:

        raise HTTPException(
            status_code=404,
            detail="Server not found",
        )

    server_name = server.name
    service.delete(server)
    AuditLogService(db).record_admin(
        current_user,
        action="server.deleted",
        entity_type="server",
        entity_id=server_id,
        summary=f"Удалён VPN-сервер {server_name}",
        ip_address=get_client_ip(request),
    )

    return {
        "success": True,
    }
