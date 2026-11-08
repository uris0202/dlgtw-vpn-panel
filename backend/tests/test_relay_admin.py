import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.services import relay_admin_service as relay
from app.scripts.prepare_relay import render_haproxy


class RelayAdminTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.routes_path = self.directory / "routes.json"
        self.config_path = self.directory / "haproxy.cfg"
        self.configuration = {"version": 1, "public_host": "139.100.235.247", "routes": [
            {"server_id": 1, "inbound_id": 1, "upstream_host": "192.0.2.1", "upstream_ip": "192.0.2.1", "upstream_port": 888, "listen_port": 24443},
            {"server_id": 2, "inbound_id": 2, "upstream_host": "192.0.2.2", "upstream_ip": "192.0.2.2", "upstream_port": 30001, "listen_port": 24444},
        ]}
        self.routes_path.write_text(json.dumps(self.configuration))
        self.config_path.write_text(render_haproxy(self.configuration))
        (self.directory / "control").mkdir()
        (self.directory / "control/admin.sock").touch()
        self.environment = patch.dict(os.environ, {"VPN_RELAY_CONFIG": str(self.routes_path)})
        self.environment.start()
        self.server = SimpleNamespace(id=2, name="Amsterdam", host="https://192.0.2.20:10000", enabled=True)
        self.live = {"vpn_1_1": ("192.0.2.1", 888), "vpn_2_2": ("192.0.2.2", 30001)}
        self.commands = []
        self.command_patch = patch.object(relay, "runtime_command", side_effect=self.command)
        self.command_patch.start()
        self.xui_patch = patch.object(relay, "XUIService")
        self.xui = self.xui_patch.start().connect.return_value
        self.xui.get_inbounds.return_value = [{"id": 2, "port": 30001, "protocol": "vless", "enable": True}]
        self.probe_patch = patch.object(relay, "reachable_address", return_value="192.0.2.20")
        self.probe = self.probe_patch.start()

    def tearDown(self):
        self.probe_patch.stop()
        self.xui_patch.stop()
        self.command_patch.stop()
        self.environment.stop()
        self.temporary.cleanup()

    def command(self, command):
        self.commands.append(command)
        if command == "show servers state":
            lines = ["1", "# be_id be_name srv_id srv_name srv_addr srv_port"]
            for name, (address, port) in self.live.items():
                lines.append(f"1 {name} 1 destination {address} {port}")
            return "\n".join(lines)
        words = command.split()
        self.live[words[2].split("/")[0]] = (words[4], int(words[6]))
        return "IP changed"

    def test_update_changes_only_selected_server_and_keeps_customer_port(self):
        result = relay.sync_server_relay(self.server)
        saved = json.loads(self.routes_path.read_text())
        self.assertTrue(result["success"])
        self.assertTrue(result["relay"]["synchronized"])
        self.assertEqual(saved["routes"][0], self.configuration["routes"][0])
        self.assertEqual(saved["routes"][1]["listen_port"], 24444)
        self.assertEqual(saved["routes"][1]["upstream_ip"], "192.0.2.20")
        self.assertEqual(self.live["vpn_2_2"], ("192.0.2.20", 30001))
        self.assertIn("192.0.2.20:30001", self.config_path.read_text())
        self.assertTrue(list((self.directory / "history").glob("*/routes.json")))
        self.xui.client.close.assert_called_once()

    def test_vpn_port_is_read_from_xui_not_from_management_url(self):
        self.xui.get_inbounds.return_value[0]["port"] = 34443
        relay.sync_server_relay(self.server)
        self.assertEqual(self.live["vpn_2_2"], ("192.0.2.20", 34443))
        self.assertEqual(self.probe.call_args_list[0].args, ("192.0.2.20", 34443))

    def test_unreachable_new_port_leaves_files_and_live_route_unchanged(self):
        old_routes, old_config = self.routes_path.read_bytes(), self.config_path.read_bytes()
        old_live = dict(self.live)
        self.probe.side_effect = OSError("unreachable")
        with self.assertRaises(relay.RelayUpdateError) as raised:
            relay.sync_server_relay(self.server)
        self.assertIn("192.0.2.20:30001", str(raised.exception))
        self.assertIn("TCP/TLS", str(raised.exception))
        self.assertIsInstance(raised.exception.__cause__, OSError)
        self.assertEqual(self.routes_path.read_bytes(), old_routes)
        self.assertEqual(self.config_path.read_bytes(), old_config)
        self.assertEqual(self.live, old_live)
        self.assertFalse(any(command.startswith("set server") for command in self.commands))
        self.xui.client.close.assert_called_once()

    def test_missing_inbound_does_not_change_any_route(self):
        self.xui.get_inbounds.return_value = []
        with self.assertRaisesRegex(relay.RelayUpdateError, "inbound #2"):
            relay.sync_server_relay(self.server)
        self.probe.assert_not_called()

    def test_failed_login_is_reported_without_mutating_routes(self):
        with patch.object(relay.XUIService, "connect", side_effect=OSError("connect timeout")):
            with self.assertRaisesRegex(relay.RelayUpdateError, "3X-UI"):
                relay.sync_server_relay(self.server)
        self.assertFalse(any(command.startswith("set server") for command in self.commands))

    def test_disk_failure_rolls_back_runtime_and_both_files(self):
        old_routes, old_config = self.routes_path.read_text(), self.config_path.read_text()
        real_write = relay.atomic_write
        writes = 0
        def fail_once(path, content):
            nonlocal writes
            writes += 1
            if writes == 2:
                raise OSError("disk full")
            real_write(path, content)
        with patch.object(relay, "atomic_write", side_effect=fail_once):
            with self.assertRaisesRegex(relay.RelayUpdateError, "восстановлена"):
                relay.sync_server_relay(self.server)
        self.assertEqual(self.live["vpn_2_2"], ("192.0.2.2", 30001))
        self.assertEqual(self.routes_path.read_text(), old_routes)
        self.assertEqual(self.config_path.read_text(), old_config)

    def test_runtime_refusal_is_detected_and_not_persisted(self):
        old = self.routes_path.read_text()
        def reject(command):
            return "No such server" if command.startswith("set server") else self.command(command)
        with patch.object(relay, "runtime_command", side_effect=reject):
            with self.assertRaises(relay.RelayUpdateError):
                relay.sync_server_relay(self.server)
        self.assertEqual(self.routes_path.read_text(), old)

    def test_manually_edited_file_does_not_mean_live_route_is_applied(self):
        self.server.host = "https://192.0.2.2:10000"
        self.live["vpn_2_2"] = ("192.0.2.99", 30001)
        self.assertFalse(relay.relay_status(self.server)["synchronized"])

    def test_disabled_server_is_not_synchronized(self):
        self.server.enabled = False
        with self.assertRaisesRegex(relay.RelayUpdateError, "отключён"):
            relay.sync_server_relay(self.server)
        self.xui.get_inbounds.assert_not_called()


if __name__ == "__main__":
    unittest.main()
