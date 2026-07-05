from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db

from app.models.user import User

from app.services.server_service import ServerService
from app.services.xui_service import XUIService


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


@router.get("")
def dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    servers = ServerService(db).get_all()

    result = []

    for server in servers:

        try:

            xui = XUIService.connect(server)

            clients = xui.get_all()

            items = clients.get("items", [])
            summary = clients.get("summary", {})

            result.append({
                "id": server.id,
                "name": server.name,
                "country": server.country,
                "clients": clients.get("total", 0),
                "online": len(summary.get("online", [])),
                "enabled": sum(
                    1 for c in items
                    if c.get("enable", False)
                ),
                "disabled": sum(
                    1 for c in items
                    if not c.get("enable", False)
                ),
            })

        except Exception as e:

            result.append({
                "id": server.id,
                "name": server.name,
                "country": server.country,
                "status": "offline",
                "error": str(e),
            })

    return result
