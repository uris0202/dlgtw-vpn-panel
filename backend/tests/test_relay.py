import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from app.scripts.prepare_relay import plan_routes, render_haproxy
from app.services.relay_service import RelayConfigurationError
from app.services.vless_service import build_vless_url


def endpoint(server_id=1, inbound_id=1):
    return {"server_id": server_id, "inbound_id": inbound_id, "upstream_host": "192.0.2.10",
            "upstream_ip": "192.0.2.10", "upstream_port": 888}


class RelayTests(unittest.TestCase):
    def test_each_country_gets_its_own_port_and_regeneration_keeps_old_ports(self):
        first = plan_routes([endpoint(3), endpoint(1)], "139.100.235.247")
        updated = plan_routes([endpoint(1), endpoint(2), endpoint(3)], "139.100.235.247", first)
        ports = {route["server_id"]: route["listen_port"] for route in updated["routes"]}
        self.assertEqual(ports, {1: 24443, 2: 24445, 3: 24444})

    def test_raw_tcp_forwarding_preserves_reality_without_tls_or_proxy_termination(self):
        config = render_haproxy(plan_routes([endpoint()], "139.100.235.247"))
        self.assertIn("mode tcp", config)
        self.assertIn("bind 0.0.0.0:24443", config)
        self.assertIn("192.0.2.10:888 check", config)
        self.assertNotIn("send-proxy", config)
        self.assertNotIn(" ssl", config)

    def test_renderer_rejects_injected_hostname_and_duplicate_port(self):
        config = plan_routes([endpoint()], "139.100.235.247")
        with self.assertRaises(ValueError):
            render_haproxy({**config, "routes": [{**config["routes"][0], "upstream_ip": "host\nmalicious"}]})
        with self.assertRaises(ValueError):
            render_haproxy({**config, "routes": config["routes"] * 2})

    def test_reality_keys_uuid_flow_and_sni_survive_relay_rewrite(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "routes.json"
            path.write_text(json.dumps(plan_routes([endpoint()], "139.100.235.247")))
            with patch.dict(os.environ, {"VPN_RELAY_CONFIG": str(path)}):
                url = build_vless_url(
                    SimpleNamespace(id=1, name="Germany", host="https://192.0.2.10:10000"),
                    {"id": 1, "port": 888},
                    {"id": "uuid", "email": "Alice", "flow": "xtls-rprx-vision"},
                    {"network": "tcp", "security": "reality", "realitySettings": {
                        "publicKey": "public-key", "shortIds": ["abcd"],
                        "serverNames": ["www.amd.com"], "settings": {"fingerprint": "firefox"},
                    }},
                )
                parsed = urlsplit(url)
                query = parse_qs(parsed.query)
                self.assertEqual((parsed.hostname, parsed.port, parsed.username), ("139.100.235.247", 443, "uuid"))
                self.assertEqual(query["pbk"], ["public-key"])
                self.assertEqual(query["sid"], ["abcd"])
                self.assertEqual(query["sni"], ["www.amd.com"])
                self.assertEqual(query["flow"], ["xtls-rprx-vision"])

    def test_missing_route_never_silently_issues_blocked_direct_address(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "routes.json"
            path.write_text(json.dumps(plan_routes([endpoint(2)], "139.100.235.247")))
            with patch.dict(os.environ, {"VPN_RELAY_CONFIG": str(path)}), self.assertRaises(RelayConfigurationError):
                build_vless_url(SimpleNamespace(id=1, name="Germany", host="https://192.0.2.10"),
                                {"id": 1, "port": 888}, {"id": "uuid"}, {})


if __name__ == "__main__":
    unittest.main()
