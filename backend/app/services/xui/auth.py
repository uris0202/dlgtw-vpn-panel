from app.services.xui.client import XUIClient


class XUIAuth:

    def __init__(
        self,
        host,
        username,
        password,
        base_path="",
        verify=True,
    ):

        self.client = XUIClient(
            host=host,
            base_path=base_path,
            verify=verify,
        )

        self.username = username
        self.password = password

    def login(self):

        response = self.client.post(
            "/login",
            data={
                "username": self.username,
                "password": self.password,
            },
        )

        response.raise_for_status()

        data = response.json()

        if not data.get("success"):

            raise Exception(
                data.get("msg", "Login failed")
            )

        return True
