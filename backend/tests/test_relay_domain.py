import json
import os
from pathlib import Path
import socket
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.scripts import set_relay_public_host as change
from app.scripts.prepare_relay import plan_routes, render_haproxy
from app.services import relay_admin_service
from app.services.relay_service import RelayConfigurationError, load_relay_routes, normalize_public_host
from app.services.subscription_service import encode_subscription, subscription_url
from app.services.vless_service import build_vless_url


def answer(address="139.100.235.247"):
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    return (family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 0))


class RelayDomainTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.path = self.directory / "routes.json"
        self.configuration = {"version": 1, "public_host": "139.100.235.247", "routes": [
            {"server_id": 1, "inbound_id": 1, "upstream_host": "192.0.2.10", "upstream_ip": "192.0.2.10", "upstream_port": 888, "listen_port": 24443},
            {"server_id": 2, "inbound_id": 2, "upstream_host": "192.0.2.20", "upstream_ip": "192.0.2.20", "upstream_port": 30001, "listen_port": 24444},
        ]}
        self.path.write_text(json.dumps(self.configuration))
        self.haproxy = self.directory / "haproxy.cfg"
        self.haproxy.write_text(render_haproxy(self.configuration))
        self.environment = patch.dict(os.environ, {"VPN_RELAY_CONFIG": str(self.path)})
        self.environment.start()
        self.dns_patch = patch.object(change.socket, "getaddrinfo", return_value=[answer()])
        self.dns = self.dns_patch.start()

    def tearDown(self):
        self.dns_patch.stop()
        self.environment.stop()
        self.temporary.cleanup()

    def test_hostname_normalization_and_legacy_ips(self):
        for value, expected in (("VPN.DLGTW.RU.", "vpn.dlgtw.ru"), ("139.100.235.247", "139.100.235.247"), ("2001:db8::1", "2001:db8::1"), ("vpn.xn--p1ai.ru", "vpn.xn--p1ai.ru")):
            self.assertEqual(normalize_public_host(value), expected)

    def test_rejects_urls_ports_injection_and_invalid_names(self):
        for value in (None, "", " vpn.dlgtw.ru", "vpn.dlgtw.ru ", "https://vpn.dlgtw.ru", "vpn.dlgtw.ru:24443", "vpn.dlgtw.ru/path", "vpn.dlgtw.ru\nmalicious", "vpn.dlgtw.ru\x00", "*.dlgtw.ru", "vpn_bad.dlgtw.ru", "vpn..ru", "-vpn.ru", "vpn-.ru", "999.1.2.3", "localhost", "пример.рф", "fe80::1%eth0", "x" * 64 + ".ru", "x." * 127 + "ru"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_public_host(value)

    def test_switch_only_changes_advertised_host_and_keeps_ports_routes_and_haproxy(self):
        old_haproxy = self.haproxy.read_bytes()
        result = change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        saved = load_relay_routes()
        self.assertTrue(result["changed"])
        self.assertEqual(saved["public_host"], "vpn.dlgtw.ru")
        self.assertEqual(saved["bind_address"], "0.0.0.0")
        self.assertEqual(saved["routes"], self.configuration["routes"])
        self.assertEqual(self.haproxy.read_bytes(), old_haproxy)
        self.assertEqual(render_haproxy(saved), self.haproxy.read_text())
        self.assertEqual(json.loads((Path(result["backup"]) / "routes.json").read_text()), self.configuration)

    def test_check_mode_does_not_publish_the_hostname(self):
        old = self.path.read_bytes()
        result = change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"], check_only=True)
        self.assertTrue(result["check_only"])
        self.assertFalse(result["changed"])
        self.assertEqual(self.path.read_bytes(), old)
        self.assertFalse((self.directory / "history").exists())

    def test_missing_expected_ip_does_not_resolve_or_change_configuration(self):
        with self.assertRaisesRegex(ValueError, "expected-ip"):
            change.set_public_host("vpn.dlgtw.ru")
        self.dns.assert_not_called()
        self.assertEqual(load_relay_routes()["public_host"], "139.100.235.247")

    def test_wrong_or_extra_dns_records_leave_current_configuration_untouched(self):
        old = self.path.read_bytes()
        for answers in ([answer("192.0.2.99")], [answer(), answer("2001:db8::99")], []):
            self.dns.return_value = answers
            with self.assertRaisesRegex(ValueError, "DNS mismatch"):
                change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
            self.assertEqual(self.path.read_bytes(), old)

    def test_dns_failure_does_not_publish_hostname(self):
        self.dns.side_effect = socket.gaierror("not found")
        with self.assertRaisesRegex(ValueError, "DNS lookup failed"):
            change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        self.assertEqual(load_relay_routes()["public_host"], "139.100.235.247")

    def test_subscription_generation_does_not_depend_on_live_dns(self):
        change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        self.dns.reset_mock()
        self.dns.side_effect = OSError("DNS temporarily offline")
        anchor = SimpleNamespace(id=12, account_token="account-secret")
        before = subscription_url(anchor, "https://dlgtw.ru", "secret")
        url = build_vless_url(
            SimpleNamespace(id=1, name="Germany", host="https://192.0.2.10:10000"),
            {"id": 1, "port": 888},
            {"id": "uuid", "email": "Alice", "flow": "xtls-rprx-vision"},
            {"network": "tcp", "security": "reality", "realitySettings": {
                "publicKey": "public-key", "shortIds": ["abcd"], "serverNames": ["www.amd.com"],
                "settings": {"fingerprint": "firefox"},
            }},
        )
        parsed = urlsplit(url)
        self.assertEqual((parsed.hostname, parsed.port, parsed.username), ("vpn.dlgtw.ru", 24443, "uuid"))
        query = parse_qs(parsed.query)
        self.assertEqual(query["sni"], ["www.amd.com"])
        self.assertEqual(query["pbk"], ["public-key"])
        self.assertEqual(query["sid"], ["abcd"])
        self.assertEqual(query["fp"], ["firefox"])
        self.assertEqual(query["flow"], ["xtls-rprx-vision"])
        self.assertEqual(subscription_url(anchor, "https://dlgtw.ru", "secret"), before)
        self.dns.assert_not_called()

    def test_initial_planning_and_regeneration_keep_country_ports(self):
        endpoints = [{key: value for key, value in route.items() if key != "listen_port"} for route in self.configuration["routes"]]
        planned = plan_routes(endpoints, "vpn.dlgtw.ru", self.configuration)
        self.assertEqual(planned["routes"], self.configuration["routes"])
        self.assertEqual(render_haproxy(planned), render_haproxy(self.configuration))
        self.assertIn("bind 0.0.0.0:24443", render_haproxy(plan_routes(endpoints, "vpn.dlgtw.ru")))

    def test_legacy_ipv6_listener_is_preserved_on_switch_to_domain(self):
        self.configuration["public_host"] = "2001:db8::1"
        self.path.write_text(json.dumps(self.configuration))
        self.haproxy.write_text(render_haproxy(self.configuration))
        self.dns.return_value = [answer("2001:db8::1")]
        change.set_public_host("vpn.dlgtw.ru", ["2001:db8::1"])
        self.assertIn("bind [::]:24443", render_haproxy(load_relay_routes()))
        endpoints = [{key: value for key, value in route.items() if key != "listen_port"} for route in self.configuration["routes"]]
        self.assertEqual(plan_routes(endpoints, "vpn.dlgtw.ru", self.configuration)["bind_address"], "::")

    def test_wrong_address_family_is_not_silently_advertised(self):
        self.dns.return_value = [answer("2001:db8::1")]
        with self.assertRaisesRegex(ValueError, "address family"):
            change.set_public_host("vpn.dlgtw.ru", ["2001:db8::1"])
        self.assertEqual(load_relay_routes()["public_host"], "139.100.235.247")

    def test_domain_survives_existing_web_route_update(self):
        change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        server = SimpleNamespace(id=2, name="Amsterdam", host="https://192.0.2.20:10000", enabled=True)
        destinations = {"vpn_1_1": ("192.0.2.10", 888), "vpn_2_2": ("192.0.2.20", 30001)}
        with patch.object(relay_admin_service, "runtime_destinations", return_value=destinations), patch.object(relay_admin_service, "runtime_command"), patch.object(relay_admin_service, "XUIService") as xui, patch.object(relay_admin_service, "reachable_address", return_value="192.0.2.20"):
            xui.connect.return_value.get_inbounds.return_value = [{"id": 2, "port": 30001, "protocol": "vless", "enable": True}]
            relay_admin_service.sync_server_relay(server)
        self.assertEqual(load_relay_routes()["public_host"], "vpn.dlgtw.ru")
        self.assertIn("bind 0.0.0.0:24444", self.haproxy.read_text())

    def test_disk_failure_does_not_publish_hostname(self):
        old = self.path.read_bytes()
        with patch.object(change, "atomic_write", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        self.assertEqual(self.path.read_bytes(), old)

    def test_post_write_failure_restores_previous_configuration(self):
        old = self.path.read_bytes()
        real_load = change.load_relay_routes
        reads = 0
        def fail_verification():
            nonlocal reads
            reads += 1
            if reads == 2:
                raise ValueError("verification failed")
            return real_load()
        with patch.object(change, "load_relay_routes", side_effect=fail_verification):
            with self.assertRaisesRegex(ValueError, "verification failed"):
                change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        self.assertEqual(self.path.read_bytes(), old)

    def test_repeat_is_idempotent_and_switch_back_to_ip_is_supported(self):
        change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        self.assertFalse(change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])["changed"])
        self.assertTrue(change.set_public_host("139.100.235.247")["changed"])
        self.assertEqual(load_relay_routes()["public_host"], "139.100.235.247")

    def test_invalid_saved_hostname_or_listener_is_rejected(self):
        for values in ({"public_host": "https://vpn.dlgtw.ru"}, {"bind_address": "0.0.0.0\nmalicious"}):
            self.path.write_text(json.dumps({**self.configuration, **values}))
            with self.assertRaises(RelayConfigurationError):
                load_relay_routes()

    def test_unified_subscription_has_three_domain_endpoints_and_excludes_inactive_profiles(self):
        import base64
        self.configuration["routes"].append({"server_id": 3, "inbound_id": 1, "upstream_host": "192.0.2.30", "upstream_ip": "192.0.2.30", "upstream_port": 30001, "listen_port": 24445})
        self.path.write_text(json.dumps(self.configuration))
        self.haproxy.write_text(render_haproxy(self.configuration))
        change.set_public_host("vpn.dlgtw.ru", ["139.100.235.247"])
        profiles = []
        for route in self.configuration["routes"]:
            url = build_vless_url(
                SimpleNamespace(id=route["server_id"], name=f"Server {route['server_id']}", host=f"https://{route['upstream_host']}:10000"),
                {"id": route["inbound_id"], "port": route["upstream_port"]},
                {"id": f"uuid-{route['server_id']}", "email": "Alice"},
                {"network": "tcp", "security": "reality"},
            )
            profiles.append({"enabled": True, "vless_urls": [url]})
        links = base64.b64decode(encode_subscription(profiles)).decode().splitlines()
        self.assertEqual([(urlsplit(link).hostname, urlsplit(link).port) for link in links], [
            ("vpn.dlgtw.ru", 24443), ("vpn.dlgtw.ru", 24444), ("vpn.dlgtw.ru", 24445),
        ])
        profiles[-1]["enabled"] = False
        self.assertEqual(len(base64.b64decode(encode_subscription(profiles)).decode().splitlines()), 2)


if __name__ == "__main__":
    unittest.main()
