from app.models.server import Server
from app.services.xui.clients import XUIClients
import httpx
import ssl


def is_certificate_error(error):
    seen = set()
    while error is not None and id(error) not in seen:
        if isinstance(error, ssl.SSLCertVerificationError):
            return True
        seen.add(id(error))
        error = error.__cause__ or error.__context__
    return False


class XUIService:

    @staticmethod
    def connect(server: Server, request_timeout: float | None = None) -> XUIClients:

        xui = XUIClients(
            host=server.host,
            username=server.username,
            password=server.password,
            base_path=server.base_path,
            # Availability-first policy: certificate checks are separate diagnostics.
            verify=False,
        )

        try:
            if request_timeout is not None:
                xui.client.client.timeout = httpx.Timeout(request_timeout, connect=min(2.0, request_timeout))
            xui.login()
        except Exception:
            xui.client.close()
            raise

        return xui
