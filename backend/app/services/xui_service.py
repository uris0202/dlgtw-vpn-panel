from app.models.server import Server
from app.services.xui.clients import XUIClients


class XUIService:

    @staticmethod
    def connect(server: Server) -> XUIClients:

        xui = XUIClients(
            host=server.host,
            username=server.username,
            password=server.password,
            base_path=server.base_path,
            verify=False,
        )

        xui.login()

        return xui
