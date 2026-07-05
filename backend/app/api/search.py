from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db
from app.models.user import User

from app.services.server_service import ServerService
from app.services.xui_service import XUIService

router = APIRouter(
    prefix="/search",
    tags=["Search"],
)


@router.get("/{email}")
def search_client(
    email: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    servers = ServerService(db).get_all()

    for server in servers:

        try:

            xui = XUIService.connect(server)

            clients = xui.get_all()

            for client in clients["items"]:

                if client["email"] != email:
                    continue

                return {
                    "server": server.name,
                    "country": server.country,
                    "client": client,
                }

        except Exception:
            pass

    return {
        "found": False
    }
