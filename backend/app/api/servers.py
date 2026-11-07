from pydantic import BaseModel, Field
from typing import Literal

from app.auth.dependencies import get_current_user
from app.models.user import User
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from fastapi import Response
from threading import BoundedSemaphore

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
from app.services.relay_admin_service import RelayUpdateError, relay_status, sync_server_relay
from app.services.relay_transport_service import update_relay_transport
from app.services.relay_service import RelayConfigurationError
from app.services.server_diagnostics_service import diagnose_server
from app.services.rate_limit import RateLimiter

router = APIRouter(
    prefix="/servers",
    tags=["Servers"],
)

diagnostics_limiter = RateLimiter(limit=3, window_seconds=60)
diagnostics_slots = BoundedSemaphore(2)


@router.get("/{server_id}/diagnostics")
def server_diagnostics(
    server_id: int,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = ServerService(db).get(server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if not diagnostics_limiter.allow(f"{current_user.id}:{server_id}"):
        raise HTTPException(status_code=429, detail="Диагностика доступна до трёх раз в минуту на сервер.", headers={"Retry-After": "60"})
    if not diagnostics_slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Уже выполняются две проверки. Повторите позже.", headers={"Retry-After": "10"})
    try:
        response.headers["Cache-Control"] = "no-store"
        return diagnose_server(server)
    finally:
        diagnostics_slots.release()


@router.get(
    "",
    response_model=list[ServerResponse],
)
def get_servers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ServerService(db)

    return [serialize_server(server) for server in service.get_all()]


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



@router.get("/{server_id}/relay-transport")
def get_relay_transport(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = ServerService(db).get(server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return relay_status(server)


class RelayTransportRequest(BaseModel):
    inbound_id: int = Field(ge=1)
    mode: Literal["tcp", "tls"]
    tls_port: int | None = Field(default=None, ge=1, le=65535)
    tls_server_name: str | None = Field(default=None, min_length=1, max_length=253)


@router.post("/{server_id}/relay-transport")
def set_relay_transport(
    server_id: int,
    payload: RelayTransportRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = ServerService(db).get_for_update(server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        result = update_relay_transport(server, payload.model_dump())
    except (RelayUpdateError, RelayConfigurationError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    AuditLogService(db).record_admin(
        current_user,
        action="server.relay_transport_updated",
        entity_type="server",
        entity_id=server.id,
        summary=f"Изменён транспорт VPN-сервера {server.name}",
        details={"inbound_id": payload.inbound_id, "transport": payload.mode},
        ip_address=get_client_ip(request),
    )
    return result


@router.post("/{server_id}/relay-sync")
def update_server_relay(
    server_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    server = ServerService(db).get_for_update(server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        result = sync_server_relay(server)
    except (RelayUpdateError, RelayConfigurationError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except OSError as error:
        raise HTTPException(status_code=503, detail="Нет доступа к файлам маршрута. Выполните установку веб-управления каскадом.") from error
    AuditLogService(db).record_admin(
        current_user, action="server.relay_updated", entity_type="server", entity_id=server.id,
        summary=f"Обновлён маршрут VPN-сервера {server.name}",
        details={"destinations": result["relay"].get("destinations", [])},
        ip_address=get_client_ip(request),
    )
    return result


def serialize_server(server):
    result = ServerResponse.model_validate(server, from_attributes=True).model_dump()
    result["relay"] = relay_status(server)
    return result


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
