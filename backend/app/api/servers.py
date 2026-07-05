from app.auth.dependencies import get_current_user
from app.models.user import User
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException

from sqlalchemy.orm import Session

from app.db.deps import get_db

from app.schemas.server import (
    ServerCreate,
    ServerResponse,
)

from app.services.server_service import ServerService

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    service = ServerService(db)

    return service.create(server)


@router.delete("/{server_id}")
def delete_server(
    server_id: int,
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

    service.delete(server)

    return {
        "success": True,
    }
