import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from sqlalchemy.orm import Session

from app.services.server_service import ServerService
from app.services.settings_service import SettingsService
from app.services.xui_service import XUIService
from app.services.vless_service import attach_client_links


MILLISECONDS_PER_DAY = 86400 * 1000


def calculate_extended_expiry(
    current_expiry: int | str | None,
    days: int,
    now_ms: int | None = None,
):
    if days <= 0:
        return 0

    try:
        normalized_expiry = int(current_expiry or 0)
    except (TypeError, ValueError):
        normalized_expiry = 0

    effective_now_ms = now_ms if now_ms is not None else int(time.time() * 1000)

    return max(normalized_expiry, effective_now_ms) + days * MILLISECONDS_PER_DAY


def _client_expiry(client):
    try:
        return int(client.get("expiryTime") or client.get("expiry") or 0)
    except (TypeError, ValueError):
        return 0


def _client_enabled(client):
    return bool(client.get("enable", client.get("enabled", False)))


def _renewal_validation_error(client, expected_expiry):
    errors = []
    actual_expiry = _client_expiry(client)

    if expected_expiry is not None:
        if expected_expiry == 0 and actual_expiry != 0:
            errors.append("бессрочный доступ не применён")
        elif expected_expiry > 0 and actual_expiry < expected_expiry:
            errors.append("новая дата окончания не применена")

    if not _client_enabled(client):
        errors.append("клиент остался выключен")

    if not errors:
        return ""

    return "3X-UI не применил продление: " + ", ".join(errors) + "."


def _find_existing_client(xui, email):
    lookup_error = None

    try:
        data = xui.get(email)
        client = data.get("client")

        if client:
            return client
    except Exception as error:
        lookup_error = error

    try:
        data = xui.get_all()
    except Exception:
        if lookup_error:
            raise lookup_error
        raise

    expected_email = (email or "").strip().lower()

    for client in data.get("items", []):
        if (client.get("email") or "").strip().lower() == expected_email:
            return client

    return None


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

        try:
            data = xui.get_all()
            items = list(data.get("items") or [])
            summary = data.get("summary")
            summary = summary if isinstance(summary, dict) else {}
            names = summary.get("online")
            online_available = isinstance(names, list) and all(isinstance(name, str) for name in names)
            online_names = set(names) if online_available else set()
            checked_at = int(time.time() * 1000)
            total = max(int(data.get("total") or len(items)), len(items))
            loaded = len(items)
            # The 3X-UI summary spans all pages. Do not hide online clients after page 1.
            for page in range(2, 101):
                if loaded >= total:
                    break
                batch = xui.get_all(page=page, page_size=200).get("items") or []
                if not batch:
                    break
                items.extend(batch)
                loaded += len(batch)

            clients = []
            seen = set()
            for item in items:
                email = item.get("email")
                if email in seen:
                    continue
                seen.add(email)
                client = self._format_client(item)
                client["online"] = email in online_names if online_available else None
                clients.append(client)

            try:
                settings = SettingsService(self.db).get()
                clients = attach_client_links(
                    server=server, clients=clients, inbounds=xui.get_inbounds(),
                    subscription_port=settings.subscription_port,
                    subscription_path=settings.subscription_path,
                )
            except Exception:
                pass

            return {
                "total": total,
                "online": len(online_names),
                "online_available": online_available,
                "online_checked_at": checked_at if online_available else None,
                "truncated": len(clients) < total,
                "active": summary.get("active", 0),
                "clients": clients,
            }
        finally:
            self._close_xui(xui)

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

        client = _find_existing_client(xui, email)

        if client is None:
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

        now_ms = int(time.time() * 1000)
        current_expiry = _client_expiry(client)
        needs_reactivation = (
            not _client_enabled(client)
            or (current_expiry > 0 and current_expiry <= now_ms)
        )
        values = {}

        if not needs_reactivation:
            values["enable"] = True

        if days is not None:
            values["expiryTime"] = calculate_extended_expiry(
                current_expiry,
                days,
                now_ms=now_ms,
            )

        if total_gb is not None:
            values["totalGB"] = total_gb * 1024 ** 3

        xui.update(
            email,
            existing_client=client,
            **values,
        )

        reactivation_error = None

        if needs_reactivation:
            try:
                xui.set_enabled(email, True)
            except Exception as error:
                reactivation_error = error
                fallback_client = _find_existing_client(xui, email)

                if fallback_client is None:
                    raise Exception("3X-UI не вернул клиента для повторного включения.")

                xui.update(
                    email,
                    existing_client=fallback_client,
                    enable=True,
                )

        updated_client = _find_existing_client(xui, email)

        if updated_client is None:
            raise Exception("3X-UI не вернул клиента после продления.")

        validation_error = _renewal_validation_error(
            updated_client,
            values.get("expiryTime"),
        )

        if validation_error:
            if reactivation_error:
                validation_error = (
                    f"{validation_error} Повторное включение: {reactivation_error}"
                )

            raise Exception(validation_error)

        return True

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
            existing_client = xui.get(email)["client"]
            values["expiryTime"] = calculate_extended_expiry(
                existing_client.get("expiryTime"),
                client.days,
            )
        else:
            existing_client = None

        return xui.update(
            email,
            existing_client=existing_client,
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

        traffic = item.get("traffic") or {}

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
