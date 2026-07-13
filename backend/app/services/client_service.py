from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from sqlalchemy.orm import Session

from app.services.server_service import ServerService
from app.services.settings_service import SettingsService
from app.services.xui_service import XUIService
from app.services.vless_service import attach_client_links


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

        server = ServerService(self.db).get(server_id)

        if server is None:
            raise Exception("Server not found")

        xui = XUIService.connect(server)

        data = xui.get_all()

        clients = []

        for item in data.get("items", []):

            clients.append(self._format_client(item))

        summary = data.get("summary", {})

        try:
            settings = SettingsService(self.db).get()

            clients = attach_client_links(
                server=server,
                clients=clients,
                inbounds=xui.get_inbounds(),
                subscription_port=settings.subscription_port,
                subscription_path=settings.subscription_path,
            )
        except Exception:
            pass

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

    def renew_or_create(
        self,
        server_id: int,
        email: str,
        inbound_id: int | None,
        days: int,
        total_gb: int,
        group: str = "",
        comment: str = "",
    ):

        xui = self._connect(server_id)

        try:
            data = xui.get(email)
            client = data["client"]
        except Exception:
            resolved_inbound_id = self._resolve_inbound_id(
                xui,
                inbound_id,
            )

            return xui.add(
                inbound_id=resolved_inbound_id,
                email=email,
                days=days,
                total_gb=total_gb,
                group=group,
                comment=comment,
            )

        values = {
            "enable": True,
        }

        if days is not None:

            if days > 0:
                import time

                now_ms = int(time.time() * 1000)
                current_expiry = int(client.get("expiryTime") or 0)
                base_expiry = max(current_expiry, now_ms)

                values["expiryTime"] = int(
                    base_expiry + days * 86400 * 1000
                )
            else:
                values["expiryTime"] = 0

        if total_gb is not None:
            values["totalGB"] = total_gb * 1024 ** 3

        return xui.update(
            email,
            **values,
        )

    def _resolve_inbound_id(
        self,
        xui,
        inbound_id: int | None,
    ):

        inbounds = xui.get_inbounds()

        if inbound_id:

            for inbound in inbounds:

                if int(inbound.get("id") or 0) == int(inbound_id):
                    return int(inbound_id)

        for inbound in inbounds:

            if inbound.get("protocol") == "vless":
                return int(inbound.get("id"))

        for inbound in inbounds:

            if inbound.get("id"):
                return int(inbound.get("id"))

        raise Exception("VLESS inbound not found on selected server")

    def update(
        self,
        server_id: int,
        email: str,
        client,
    ):

        xui = self._connect(server_id)

        values = {}

        if client.email is not None:

            new_email = client.email.strip()

            if new_email:
                values["email"] = new_email

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
        query = email.strip().lower()

        if not query:
            return result

        servers = [
            self._server_ref(server)
            for server in ServerService(self.db).get_all()
        ]
        settings = SettingsService(self.db).get()

        with ThreadPoolExecutor(max_workers=self._worker_count(servers)) as executor:
            results = executor.map(
                lambda server: self._search_server(
                    server,
                    query,
                    settings,
                ),
                servers,
            )

            for clients in results:
                result.extend(clients)

        return result

    def _search_server(self, server, query, settings):

        xui = None

        try:
            xui = XUIService.connect(server)
            data = xui.get_all()
            clients = []

            for item in data.get("items", []):

                client = self._format_client(item)

                if self._matches_search(client, query):
                    clients.append(client)

            try:
                clients = attach_client_links(
                    server=server,
                    clients=clients,
                    inbounds=xui.get_inbounds(),
                    subscription_port=settings.subscription_port,
                    subscription_path=settings.subscription_path,
                )
            except Exception:
                pass

            return [
                {
                    "server_id": server.id,
                    "server": server.name,
                    "country": server.country,
                    **client,
                }
                for client in clients
            ]

        except Exception:
            return []
        finally:
            self._close_xui(xui)

    def _server_ref(self, server):

        return SimpleNamespace(
            id=server.id,
            name=server.name,
            country=server.country,
            host=server.host,
            username=server.username,
            password=server.password,
            base_path=server.base_path,
        )

    def _worker_count(self, items):

        return max(1, min(6, len(items) or 1))

    def _close_xui(self, xui):

        if xui is None:
            return

        try:
            xui.client.close()
        except Exception:
            pass

    def _format_client(self, item):

        traffic = item.get("traffic", {})

        up = traffic.get("up", item.get("up", 0))
        down = traffic.get("down", item.get("down", 0))

        return {
            "email": item.get("email"),
            "group": item.get("group", ""),
            "comment": item.get("comment", ""),
            "enabled": item.get("enable", item.get("enabled", False)),

            # Использованный трафик
            "traffic": up + down,

            "up": up,
            "down": down,

            "last_online": traffic.get("lastOnline", item.get("lastOnline", 0)),

            "expiry": item.get("expiryTime", item.get("expiry", 0)),
            "created": item.get("createdAt", 0),
            "updated": item.get("updatedAt", 0),
        }

    def _matches_search(self, client, query):

        values = [
            client.get("email"),
            client.get("group"),
            client.get("comment"),
        ]

        return any(
            query in str(value).lower()
            for value in values
            if value
        )
