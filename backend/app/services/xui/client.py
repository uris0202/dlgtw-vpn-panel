import httpx
import os


REQUEST_TIMEOUT = float(os.getenv("XUI_REQUEST_TIMEOUT", "8"))


class XUIClient:

    def __init__(
        self,
        host: str,
        base_path: str = "",
        verify: bool = True,
    ):
        self.host = host.rstrip("/")
        self.base_path = "/" + base_path.strip("/") if base_path else ""

        transport = httpx.HTTPTransport(
            verify=verify,
            local_address="0.0.0.0",
            retries=1,
            trust_env=False,
        )
        self.client = httpx.Client(
            base_url=self.host + self.base_path,
            transport=transport,
            follow_redirects=True,
            timeout=httpx.Timeout(REQUEST_TIMEOUT, connect=min(3.0, REQUEST_TIMEOUT)),
            trust_env=False,
            event_hooks={"request": [self._check_origin]},
        )

        self.csrf = None

        self.client.headers.update({
            "X-Requested-With": "XMLHttpRequest",
        })

    def _check_origin(self, request):
        origin = httpx.URL(self.host)
        if (request.url.scheme, request.url.host, request.url.port) != (origin.scheme, origin.host, origin.port):
            raise httpx.RequestError("3X-UI redirect to another origin is not allowed", request=request)

    def _csrf_url(self):
        return "/csrf-token"

    def get_csrf(self):

        response = self.client.get(self._csrf_url())

        response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            raise Exception("Unable to obtain CSRF token")

        self.csrf = data["obj"]

        return self.csrf

    def _prepare_headers(self):

        if self.csrf is None:
            self.get_csrf()

        return {
            "X-CSRF-Token": self.csrf,
        }

    def get(
        self,
        url: str,
        params=None,
    ):

        response = self.client.get(
            url,
            params=params,
            headers=self._prepare_headers(),
        )

        if response.status_code == 403:

            self.get_csrf()

            response = self.client.get(
                url,
                params=params,
                headers=self._prepare_headers(),
            )

        return response

    def post(
        self,
        url: str,
        data=None,
        json=None,
    ):

        response = self.client.post(
            url,
            data=data,
            json=json,
            headers=self._prepare_headers(),
        )

        if response.status_code == 403:

            self.get_csrf()

            response = self.client.post(
                url,
                data=data,
                json=json,
                headers=self._prepare_headers(),
            )

        return response
    def close(self):
        self.client.close()
