import httpx


class XUIClient:

    def __init__(
        self,
        host: str,
        base_path: str = "",
        verify: bool = True,
    ):
        self.host = host.rstrip("/")
        self.base_path = "/" + base_path.strip("/") if base_path else ""

        self.client = httpx.Client(
            base_url=self.host + self.base_path,
            verify=verify,
            follow_redirects=True,
            timeout=20,
        )

        self.csrf = None

        self.client.headers.update({
            "X-Requested-With": "XMLHttpRequest",
        })

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
