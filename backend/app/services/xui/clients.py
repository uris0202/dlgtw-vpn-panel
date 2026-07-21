from uuid import uuid4
import secrets
import time

from app.services.xui.inbounds import XUIInbounds


class XUIClients(XUIInbounds):

    def get_all(
        self,
        page: int = 1,
        page_size: int = 200,
    ):

        response = self.client.get(
            "/panel/api/clients/list/paged",
            params={
                "page": page,
                "pageSize": page_size,
                "sort": "createdAt",
                "order": "ascend",
            },
        )

        response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            raise Exception(
                data.get("msg", "Unable to load clients")
            )

        return data["obj"]

    def get(
        self,
        email: str,
    ):

        response = self.client.get(
            f"/panel/api/clients/get/{email}"
        )

        response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            raise Exception(
                data.get("msg", "Unable to load client")
            )

        return data["obj"]

    def add(
        self,
        inbound_id: int,
        email: str,
        days: int = 30,
        total_gb: int = 0,
        group: str = "",
        comment: str = "",
    ):

        expiry = 0

        if days > 0:
            expiry = int(
                (time.time() + days * 86400) * 1000
            )

        payload = {
            "client": {
                "email": email,
                "subId": secrets.token_hex(8),
                "id": str(uuid4()),
                "password": secrets.token_hex(8),
                "auth": secrets.token_hex(8),
                "flow": "xtls-rprx-vision",
                "security": "auto",
                "totalGB": total_gb * 1024 ** 3,
                "expiryTime": expiry,
                "reset": 0,
                "limitIp": 0,
                "tgId": 0,
                "group": group,
                "comment": comment,
                "enable": True,
            },
            "inboundIds": [
                inbound_id
            ],
        }

        response = self.client.post(
            "/panel/api/clients/add",
            json=payload,
        )

        response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            raise Exception(
                data.get("msg", "Unable to add client")
            )

        return True

    def update(
        self,
        current_email: str,
        **kwargs,
    ):

        data = self.get(current_email)

        client = data["client"]

        client_id = client.get("uuid") or client.get("id")

        if not client_id:
            raise Exception("Unable to update client: client id is missing")

        payload = {
            "email": client.get("email", current_email),
            "subId": client.get("subId", ""),
            "id": client_id,
            "password": client.get("password", ""),
            "auth": client.get("auth", ""),
            "flow": client.get("flow", ""),
            "security": client.get("security", "auto"),
            "limitIp": client.get("limitIp", 0),
            "totalGB": client.get("totalGB", 0),
            "expiryTime": client.get("expiryTime", 0),
            "enable": client.get("enable", client.get("enabled", True)),
            "tgId": client.get("tgId", 0),
            "group": client.get("group", ""),
            "comment": client.get("comment", ""),
            "reset": client.get("reset", 0),
        }

        payload.update(kwargs)

        response = self.client.post(
            f"/panel/api/clients/update/{current_email}",
            json=payload,
        )

        try:
            data = response.json()
        except ValueError:
            data = {}

        if response.is_error:
            raise Exception(
                data.get("msg")
                or response.text
                or f"3X-UI returned HTTP {response.status_code}"
            )

        if not data.get("success"):
            raise Exception(
                data.get("msg", "Unable to update client")
            )

        return True

    def delete(
        self,
        email: str,
    ):

        response = self.client.post(
            f"/panel/api/clients/del/{email}",
        )

        response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            raise Exception(
                data.get("msg", "Unable to delete client")
            )

        return True
