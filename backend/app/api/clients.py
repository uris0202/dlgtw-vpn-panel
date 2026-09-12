from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.request import get_client_ip
from app.db.deps import get_db

from app.models.user import User

from app.schemas.client import (
    ClientCreate,
    ClientUpdate,
)

from app.services.client_service import ClientService
from app.services.audit_log_service import AuditLogService


router = APIRouter(
    prefix="/clients",
    tags=["Clients"],
)

@router.get("/search/{email}")
def search_client(
    email: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ClientService(db)

    return service.search(email)

@router.get("/{server_id}")
def get_clients(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ClientService(db)

    return service.get_all(server_id)


@router.post("/{server_id}")
def create_client(
    server_id: int,
    client: ClientCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ClientService(db)

    try:
        service.create(
            server_id,
            client,
        )
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    AuditLogService(db).record_admin(
        current_user,
        action="client.created",
        entity_type="client",
        entity_id=f"{server_id}:{client.email}",
        summary=f"Создан клиент {client.email} на сервере #{server_id}",
        details={"server_id": server_id},
        ip_address=get_client_ip(request),
    )

    return {
        "success": True,
    }


@router.patch("/{server_id}/{email}")
def update_client(
    server_id: int,
    email: str,
    client: ClientUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ClientService(db)

    try:
        service.update(
            server_id,
            email,
            client,
        )
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    updated_email = (client.email or email).strip()
    AuditLogService(db).record_admin(
        current_user,
        action="client.updated",
        entity_type="client",
        entity_id=f"{server_id}:{updated_email}",
        summary=f"Изменён клиент {email} на сервере #{server_id}",
        details={
            "server_id": server_id,
            "changed_fields": sorted(client.model_dump(exclude_unset=True).keys()),
        },
        ip_address=get_client_ip(request),
    )

    return {
        "success": True,
    }


@router.delete("/{server_id}/{email}")
def delete_client(
    server_id: int,
    email: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ClientService(db)

    try:
        service.delete(
            server_id,
            email,
        )
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    AuditLogService(db).record_admin(
        current_user,
        action="client.deleted",
        entity_type="client",
        entity_id=f"{server_id}:{email}",
        summary=f"Удалён клиент {email} с сервера #{server_id}",
        details={"server_id": server_id},
        ip_address=get_client_ip(request),
    )

    return {
        "success": True,
    }
