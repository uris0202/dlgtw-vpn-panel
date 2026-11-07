import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpcore
import httpx

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.services.xui.client import XUIClient, REQUEST_TIMEOUT
from app.services.xui_service import XUIService


class XUITransportTests(unittest.TestCase):
    def test_connection_timeout_is_retried_before_any_http_request_is_sent(self):
        with patch("httpcore._backends.sync.SyncBackend.connect_tcp") as connect:
            stream = connect.return_value
            connect.side_effect = [httpcore.ConnectTimeout("first SYN lost"), stream]
            stream.read.side_effect = [b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}"]
            client = XUIClient("http://192.0.2.1:10000", verify=False)
            try:
                response = client.client.get("/csrf-token")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(connect.call_count, 2)
                for call in connect.call_args_list:
                    self.assertEqual(call.kwargs["local_address"], "0.0.0.0")
                    self.assertEqual(call.kwargs["timeout"], min(3.0, REQUEST_TIMEOUT))
                sent = b"".join(call.args[0] for call in stream.write.call_args_list)
                self.assertEqual(sent.count(b"GET /csrf-token HTTP/1.1"), 1)
            finally:
                client.close()

    def test_persistent_connection_failure_stops_after_two_attempts(self):
        with patch("httpcore._backends.sync.SyncBackend.connect_tcp", side_effect=httpcore.ConnectTimeout("unreachable")) as connect:
            client = XUIClient("http://192.0.2.1:10000", verify=False)
            try:
                with self.assertRaises(httpx.ConnectTimeout):
                    client.client.get("/csrf-token")
                self.assertEqual(connect.call_count, 2)
            finally:
                client.close()

    def test_client_ignores_environment_proxy_and_preserves_tls_verification_setting(self):
        with patch.dict(os.environ, {"HTTPS_PROXY": "http://proxy.invalid:9999"}), patch("app.services.xui.client.httpx.HTTPTransport") as transport, patch("app.services.xui.client.httpx.Client") as client:
            XUIClient("https://192.0.2.1:10000", base_path="/panel/", verify=True)
            self.assertTrue(transport.call_args.kwargs["verify"])
            self.assertFalse(transport.call_args.kwargs["trust_env"])
            self.assertFalse(client.call_args.kwargs["trust_env"])
            self.assertEqual(client.call_args.kwargs["base_url"], "https://192.0.2.1:10000/panel")

    def test_read_timeout_does_not_resend_a_client_change(self):
        with patch("httpcore._backends.sync.SyncBackend.connect_tcp") as connect:
            stream = connect.return_value
            stream.read.side_effect = httpcore.ReadTimeout("response lost")
            client = XUIClient("http://192.0.2.1:10000", verify=False)
            try:
                with self.assertRaises(httpx.ReadTimeout):
                    client.client.post("/panel/api/clients/add", json={"example": True})
                self.assertEqual(connect.call_count, 1)
                sent = b"".join(call.args[0] for call in stream.write.call_args_list)
                self.assertEqual(sent.count(b"POST /panel/api/clients/add HTTP/1.1"), 1)
            finally:
                client.close()

    def test_failed_login_closes_client_without_retrying_authentication(self):
        server = SimpleNamespace(host="https://192.0.2.1", username="user", password="password", base_path="")
        with patch("app.services.xui_service.XUIClients") as clients:
            xui = clients.return_value
            xui.login.side_effect = httpx.ConnectTimeout("unreachable")
            with self.assertRaises(httpx.ConnectTimeout):
                XUIService.connect(server)
            xui.login.assert_called_once()
            xui.client.close.assert_called_once()

    def test_successful_login_leaves_client_open_for_the_caller(self):
        server = SimpleNamespace(host="https://192.0.2.1", username="user", password="password", base_path="")
        with patch("app.services.xui_service.XUIClients") as clients:
            self.assertIs(XUIService.connect(server), clients.return_value)
            self.assertFalse(clients.call_args.kwargs["verify"])
            clients.return_value.client.close.assert_not_called()

    def test_working_api_uses_warning_only_certificate_policy(self):
        server = SimpleNamespace(host="https://192.0.2.1", username="user", password="password", base_path="")
        with patch("app.services.xui_service.XUIClients") as clients:
            XUIService.connect(server)
            clients.assert_called_once()
            self.assertFalse(clients.call_args.kwargs["verify"])
            clients.return_value.login.assert_called_once()

    def test_redirect_cannot_send_credentials_to_http_or_a_different_origin(self):
        for target in ("http://192.0.2.1/login", "https://other.example/login", "https://192.0.2.1:8443/login"):
            client = XUIClient("https://192.0.2.1")
            try:
                with self.assertRaises(httpx.RequestError):
                    client._check_origin(httpx.Request("POST", target))
            finally:
                client.close()

    def test_same_origin_path_redirect_is_still_allowed(self):
        client = XUIClient("https://192.0.2.1:10000", base_path="/panel/")
        try:
            client._check_origin(httpx.Request("GET", "https://192.0.2.1:10000/panel/login/"))
        finally:
            client.close()

    def test_httpx_hook_blocks_redirect_before_forwarding_post_data(self):
        for target in ("http://192.0.2.1/login", "https://other.example/login"):
            received = []
            def handle(request):
                received.append(request)
                return httpx.Response(307, headers={"Location": target})
            with patch("app.services.xui.client.httpx.HTTPTransport", return_value=httpx.MockTransport(handle)):
                client = XUIClient("https://192.0.2.1")
                try:
                    with self.assertRaises(httpx.RequestError):
                        client.client.post("/login", data={"password": "test-private-password"})
                finally:
                    client.close()
            self.assertEqual(len(received), 1)
            self.assertEqual(str(received[0].url), "https://192.0.2.1/login")


if __name__ == "__main__":
    unittest.main()
