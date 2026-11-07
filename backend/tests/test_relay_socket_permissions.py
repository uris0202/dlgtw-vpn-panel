import copy
import unittest

from app.scripts.prepare_relay import plan_routes, render_haproxy


def route(server_id=1, inbound_id=1, port=24443, transport="tcp"):
    value = {"server_id": server_id, "inbound_id": inbound_id, "listen_port": port,
             "upstream_host": "192.0.2.10", "upstream_ip": "192.0.2.10", "upstream_port": 30001}
    if transport == "tls":
        value.update(transport="tls", tls_port=8443, tls_server_name="node.example.internal")
    return value


class RelaySocketPermissionsTests(unittest.TestCase):
    def render(self, routes=None):
        return render_haproxy({"version": 1, "public_host": "vpn.example.test", "bind_address": "0.0.0.0",
                               "routes": routes or [route()]})

    def test_admin_socket_is_group_only(self):
        config = self.render()
        self.assertIn("stats socket /app/relay/control/admin.sock mode 660 level admin", config)
        self.assertNotIn("mode 666", config)
        self.assertEqual(config.count("stats socket"), 1)

    def test_owner_is_inherited_not_forced_by_unprivileged_haproxy(self):
        line = next(line for line in self.render().splitlines() if "stats socket" in line)
        self.assertNotIn(" uid ", line)
        self.assertNotIn(" gid ", line)

    def test_tcp_transport_unchanged(self):
        config = self.render()
        self.assertIn("bind 0.0.0.0:24443", config)
        self.assertIn("server destination 192.0.2.10:30001 check inter 10s fall 3 rise 2", config)
        self.assertNotIn("send-proxy", config)
        self.assertNotIn(" ssl", config)

    def test_mtls_verification_and_client_identity_remain_enabled(self):
        config = self.render([route(transport="tls")])
        for value in ("192.0.2.10:8443 ssl verify required", "ca-file /app/relay/tls/ca.crt",
                      "crt /app/relay/tls/client.pem", "sni str(node.example.internal)",
                      "check-sni node.example.internal", "verifyhost node.example.internal"):
            self.assertIn(value, config)
        self.assertNotIn("verify none", config)

    def test_generating_config_does_not_modify_routes(self):
        routes = [route(transport="tls"), route(2, 2, 24444), route(3, 1, 24445)]
        previous = copy.deepcopy(routes)
        self.render(routes)
        self.assertEqual(routes, previous)

    def test_replanning_preserves_mtls_and_existing_ports(self):
        old = {"version": 1, "public_host": "vpn.example.test", "bind_address": "0.0.0.0",
               "routes": [route(transport="tls")]}
        current = plan_routes([route()], "vpn.example.test", old)
        self.assertEqual(current["routes"][0]["listen_port"], 24443)
        self.assertEqual(current["routes"][0]["tls_port"], 8443)
        self.assertEqual(current["routes"][0]["transport"], "tls")
        self.assertIn("mode 660 level admin", render_haproxy(current))

    def test_ipv6_bind_and_destination_unchanged(self):
        config = render_haproxy({"version": 1, "public_host": "vpn.example.test", "bind_address": "::",
                                 "routes": [{**route(), "upstream_ip": "2001:db8::1"}]})
        self.assertIn("bind [::]:24443", config)
        self.assertIn("server destination [2001:db8::1]:30001", config)


if __name__ == "__main__":
    unittest.main()
