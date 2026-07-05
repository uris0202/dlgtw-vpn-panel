from app.services.xui.auth import XUIAuth


class XUIInbounds(XUIAuth):

    def get_all(self):

        response = self.client.get(
            "/panel/api/inbounds/list"
        )

        response.raise_for_status()

        data = response.json()

        if not data.get("success"):

            raise Exception(
                data.get(
                    "msg",
                    "Unable to load inbounds",
                )
            )

        return data["obj"]
