import base64
import copy
import json
import os
import socket
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

import httpx
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from app.services import server_diagnostics_service as d
from app.services.xui_service import XUIService


def key_string(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def inbound():
    private = b"x" * 32
    public = X25519PrivateKey.from_private_bytes(private).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return {"id": 1, "port": 888, "protocol": "vless", "enable": True,
            "remark": "private-remark", "settings": json.dumps({"clients": [{"id": "private-uuid", "email": "private-email", "password": "private-password", "flow": "xtls-rprx-vision"}]}),
            "streamSettings": json.dumps({"network": "tcp", "security": "reality", "realitySettings": {
                "privateKey": key_string(private), "serverNames": ["www.example.com"],
                "target": "www.example.com:443", "shortIds": ["aabbccdd"],
                "settings": {"publicKey": key_string(public), "fingerprint": "firefox", "serverName": "www.example.com", "shortId": "aabbccdd"},
            }})}


class RealityAuditTests(unittest.TestCase):
    def test_valid_static_configuration_does_not_claim_vpn_or_blocking_protection(self):
        result = d.reality_audit(inbound())
        self.assertEqual(result["state"], "ok")
        self.assertIn("не проверка VPN", result["summary"])

    def test_no_secrets_or_client_metadata_are_returned(self):
        value = inbound()
        stream = json.loads(value["streamSettings"])
        serialized = json.dumps(d.reality_audit(value))
        for secret in ("private-remark", "private-email", "private-password", "private-uuid", "aabbccdd", stream["realitySettings"]["privateKey"], stream["realitySettings"]["settings"]["publicKey"], "www.example.com"):
            self.assertNotIn(secret, serialized)

    def test_missing_key_or_sni_mismatch_is_an_audit_error(self):
        for change in (lambda r: r.pop("privateKey"), lambda r: r["settings"].update(serverName="different.example.com"), lambda r: r.update(shortIds=["bad-length-x"])):
            value = inbound()
            stream = json.loads(value["streamSettings"])
            change(stream["realitySettings"])
            value["streamSettings"] = stream
            self.assertEqual(d.reality_audit(value)["state"], "error")

    def test_empty_short_id_is_valid_when_explicitly_allowed(self):
        value = inbound()
        stream = json.loads(value["streamSettings"])
        stream["realitySettings"]["shortIds"] = [""]
        stream["realitySettings"]["settings"]["shortId"] = ""
        value["streamSettings"] = stream
        self.assertEqual(d.reality_audit(value)["state"], "ok")

    def test_mismatched_client_key_is_a_warning_and_never_repaired(self):
        value = inbound()
        stream = json.loads(value["streamSettings"])
        stream["realitySettings"]["settings"]["publicKey"] = key_string(b"y" * 32)
        value["streamSettings"] = stream
        old = copy.deepcopy(value)
        self.assertEqual(d.reality_audit(value)["state"], "warning")
        self.assertEqual(value, old)

    def test_non_reality_is_not_reported_as_a_failed_reality_configuration(self):
        value = inbound()
        value["streamSettings"] = {"network": "ws", "security": "tls"}
        self.assertEqual(d.reality_audit(value)["state"], "not_checked")

    def test_malformed_fingerprint_does_not_raise_or_leak(self):
        value = inbound()
        stream = json.loads(value["streamSettings"])
        stream["realitySettings"]["settings"]["fingerprint"] = {"private": "secret"}
        value["streamSettings"] = stream
        result = d.reality_audit(value)
        self.assertEqual(result["state"], "warning")
        self.assertNotIn("secret", json.dumps(result))


class ServerDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.server = SimpleNamespace(id=1, name="Germany", host="https://192.0.2.1:10000", enabled=True, username="private-user", password="private-password", base_path="/private-path")
        self.stack = []
        def mock(name, **options):
            context = patch.object(d, name, **options)
            self.stack.append(context)
            return context.start()
        self.panel = mock("panel_checks", return_value={"website": d.check("ok", "HTTP 200"), "panel_api": d.check("ok", "HTTP 200")})
        self.tls = mock("probe_certificate", return_value={"state": "ok", "summary": "Certificate probe succeeded", "policy": "warning_only", "verification_enforced": False})
        self.probe = mock("tcp_probe", return_value=d.check("ok", "TCP: 2 из 2 соединений", connected=2, attempts=2, latency_ms=10))
        self.routes = mock("load_relay_routes", return_value={"public_host": "vpn.example.com", "routes": [{"server_id": 1, "inbound_id": 1, "upstream_port": 888, "listen_port": 24443}]})
        self.relay = mock("relay_status", return_value={"synchronized": True})
        self.xui_service = mock("XUIService")
        self.xui = self.xui_service.connect.return_value
        self.xui.get_inbounds.return_value = [inbound()]
        self.xui.client.get.return_value.json.return_value = {"success": True, "obj": {"xray": {"state": "running", "version": "v26.9.8"}}}

    def tearDown(self):
        for context in reversed(self.stack):
            context.stop()

    def test_healthy_control_and_tcp_never_claim_full_vpn_success(self):
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["checks"]["management_tls"]["state"], "ok")
        self.assertEqual(result["checks"]["xray_runtime"]["version"], "v26.9.8")
        self.assertEqual(result["vpn_ports"][0]["state"], "ok")
        self.assertEqual(result["checks"]["vpn_session"]["state"], "not_checked")
        self.assertEqual(result["checks"]["subscription"]["state"], "not_checked")
        self.xui.get_all.assert_not_called()
        self.xui.add.assert_not_called()
        self.xui.update.assert_not_called()
        self.xui.delete.assert_not_called()
        self.xui.client.close.assert_called_once()

    def test_api_failure_does_not_prevent_saved_vpn_port_probe(self):
        self.xui_service.connect.side_effect = httpx.ConnectTimeout("private-password and private-path")
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "error")
        self.assertEqual(result["checks"]["management_tls"]["state"], "ok")
        self.assertEqual(result["vpn_ports"][0]["state"], "ok")
        self.assertEqual(result["checks"]["vpn_session"]["state"], "not_checked")
        self.assertNotIn("private-password", json.dumps(result))

    def test_certificate_failure_is_reported_separately_and_redacted(self):
        self.tls.return_value = {"state": "warning", "summary": "Certificate failed", "verification_enforced": False}
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["management_tls"]["state"], "warning")
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["vpn_ports"][0]["state"], "ok")
        self.assertNotIn("private", json.dumps(result))

    def test_http_does_not_claim_certificate_verification(self):
        self.server.host = "http://192.0.2.1:10000"
        self.tls.return_value = {"state": "warning", "summary": "HTTP has no certificate", "verification_enforced": False}
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["management_tls"]["state"], "warning")

    def test_unexpected_certificate_probe_failure_does_not_mark_api_down(self):
        self.tls.side_effect = RuntimeError("private URL")
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["checks"]["management_tls"]["state"], "not_checked")
        self.assertNotIn("private", json.dumps(result))

    def test_inbound_audit_error_is_not_mislabeled_as_api_failure(self):
        value = inbound()
        value["streamSettings"] = {"network": "tcp", "security": "reality"}
        self.xui.get_inbounds.return_value = [value]
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["inbounds"][0]["audit"]["state"], "error")

    def test_stopped_xray_is_distinct_from_healthy_api(self):
        self.xui.client.get.return_value.json.return_value = {"success": True, "obj": {"xray": {"state": "stopped", "version": "v26.9.8", "errorMsg": "private-key"}}}
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["checks"]["xray_runtime"]["state"], "error")
        self.assertNotIn("private-key", json.dumps(result))

    def test_optional_status_unsupported_does_not_mark_api_down(self):
        self.xui.client.get.side_effect = RuntimeError("private backend error")
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["checks"]["xray_runtime"]["state"], "not_checked")
        self.assertNotIn("private backend error", json.dumps(result))

    def test_disabled_server_does_not_start_network_checks(self):
        self.server.enabled = False
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "disabled")
        self.panel.assert_not_called()
        self.probe.assert_not_called()
        self.tls.assert_not_called()
        self.xui_service.connect.assert_not_called()

    def test_changed_vpn_port_is_reported_without_syncing(self):
        self.xui.get_inbounds.return_value[0]["port"] = 999
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["relay_config"]["state"], "warning")
        self.assertEqual(result["vpn_ports"][0]["port"], 999)

    def test_malformed_saved_routes_do_not_prevent_api_diagnostics(self):
        self.routes.return_value["routes"][0]["upstream_port"] = "private-invalid-port"
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["checks"]["relay_config"]["state"], "error")
        self.assertNotIn("private-invalid-port", json.dumps(result))

    def test_broken_public_http_check_is_not_an_api_or_vpn_error(self):
        self.panel.side_effect = RuntimeError("private url")
        result = d.diagnose_server(self.server)
        self.assertEqual(result["checks"]["website"]["state"], "error")
        self.assertEqual(result["checks"]["xui_api"]["state"], "ok")
        self.assertEqual(result["vpn_ports"][0]["state"], "ok")


class NetworkDiagnosticTests(unittest.TestCase):
    def test_tcp_partial_success_is_not_all_green(self):
        with patch.object(d.socket, "getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("192.0.2.1", 888))]), patch.object(d.socket, "socket") as factory:
            factory.return_value.__enter__.return_value.connect.side_effect = [None, TimeoutError()]
            result = d.tcp_probe("192.0.2.1", 888)
        self.assertEqual(result["state"], "warning")
        self.assertEqual(result["connected"], 1)

    def test_public_http_does_not_follow_redirects_or_send_auth(self):
        requests = []
        def handle(request):
            requests.append(request)
            return httpx.Response(200, json={"status": "ok"}) if request.url.path.endswith("health") else httpx.Response(200, headers={"content-type": "text/html"}, text="<html></html>")
        client = httpx.Client(transport=httpx.MockTransport(handle), follow_redirects=False)
        with patch.object(d.httpx, "Client", return_value=client) as factory:
            result = d.panel_checks()
        self.assertEqual(result["website"]["state"], "ok")
        self.assertEqual(result["panel_api"]["state"], "ok")
        self.assertFalse(factory.call_args.kwargs["trust_env"])
        self.assertTrue(all("authorization" not in request.headers for request in requests))

    def test_wrong_health_json_is_not_healthy(self):
        client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"status": "error"})))
        with patch.object(d.httpx, "Client", return_value=client):
            self.assertEqual(d.panel_checks()["panel_api"]["state"], "error")

    def test_diagnostic_timeout_is_opt_in_and_does_not_change_legacy_connections(self):
        server = SimpleNamespace(host="https://192.0.2.1", username="u", password="p", base_path="")
        with patch("app.services.xui_service.XUIClients") as factory:
            xui = XUIService.connect(server, request_timeout=4)
            self.assertEqual(xui.client.client.timeout.read, 4)
            self.assertEqual(xui.client.client.timeout.connect, 2)
            xui.login.assert_called_once()

    def test_normal_xui_connections_keep_existing_timeout(self):
        server = SimpleNamespace(host="https://192.0.2.1", username="u", password="p", base_path="")
        with patch("app.services.xui_service.XUIClients") as factory:
            previous_timeout = factory.return_value.client.client.timeout
            xui = XUIService.connect(server)
            self.assertIs(xui.client.client.timeout, previous_timeout)


if __name__ == "__main__":
    unittest.main()
