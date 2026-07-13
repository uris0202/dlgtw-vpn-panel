from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db

from app.models.user import User

from app.schemas.client import (
    ClientCreate,
    ClientUpdate,
)

from app.services.client_service import ClientService


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

    return {
        "success": True,
    }


@router.patch("/{server_id}/{email}")
def update_client(
    server_id: int,
    email: str,
    client: ClientUpdate,
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

    return {
        "success": True,
    }


@router.delete("/{server_id}/{email}")
def delete_client(
    server_id: int,
    email: str,
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

    return {
        "success": True,
    }
