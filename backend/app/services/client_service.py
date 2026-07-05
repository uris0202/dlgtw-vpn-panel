from sqlalchemy.orm import Session

from app.services.server_service import ServerService
from app.services.xui_service import XUIService


class ClientService:

    def __init__(self, db: Session):
        self.db = db

    def _connect(self, server_id: int):

        server = ServerService(self.db).get(server_id)

        if server is None:
            raise Exception("Server not found")

        return XUIService.connect(server)

    def get_all(
        self,
        server_id: int,
    ):

        data = self._connect(server_id).get_all()

        clients = []

        for item in data.get("items", []):

            traffic = item.get("traffic", {})

            up = traffic.get("up", 0)
            down = traffic.get("down", 0)

            clients.append({
                "email": item.get("email"),
                "group": item.get("group", ""),
                "comment": item.get("comment", ""),
                "enabled": item.get("enable", False),

                # Использованный трафик
                "traffic": up + down,

                "up": up,
                "down": down,

                "last_online": traffic.get("lastOnline", 0),

                "expiry": item.get("expiryTime", 0),
                "created": item.get("createdAt", 0),
                "updated": item.get("updatedAt", 0),
            })

        summary = data.get("summary", {})

        return {
            "total": data.get("total", 0),
            "online": len(summary.get("online", [])),
            "active": summary.get("active", 0),
            "clients": clients,
        }

    def get(
        self,
        server_id: int,
        email: str,
    ):

        return self._connect(server_id).get(email)

    def create(
        self,
        server_id: int,
        client,
    ):

        return self._connect(server_id).add(
            inbound_id=client.inbound_id,
            email=client.email,
            days=client.days,
            total_gb=client.total_gb,
            group=client.group,
            comment=client.comment,
        )

    def update(
        self,
        server_id: int,
        email: str,
        client,
    ):

        xui = self._connect(server_id)

        values = {}

        if client.group is not None:
            values["group"] = client.group

        if client.comment is not None:
            values["comment"] = client.comment

        if client.enable is not None:
            values["enable"] = client.enable

        if client.total_gb is not None:
            values["totalGB"] = client.total_gb * 1024 ** 3

        if client.days is not None:

            import time

            values["expiryTime"] = int(
                (time.time() + client.days * 86400) * 1000
            )

        return xui.update(
            email,
            **values,
        )

    def delete(
        self,
        server_id: int,
        email: str,
    ):

        return self._connect(server_id).delete(email)

    def search(
        self,
        email: str,
    ):

        result = []

        servers = ServerService(self.db).get_all()

        for server in servers:

            try:

                xui = XUIService.connect(server)

                client = xui.get(email)

                info = client["client"]

                result.append({
                    "server_id": server.id,
                    "server": server.name,
                    "country": server.country,
                    "email": info["email"],
                    "group": info.get("group", ""),
                    "comment": info.get("comment", ""),
                    "enabled": info.get("enable", False),
                    "traffic": client.get("usedTraffic", 0),
                    "expiry": info.get("expiryTime", 0),
                    "uuid": info.get("uuid"),
                    "inbound": client.get("inboundIds", []),
                })

            except Exception:
                pass

        return result
