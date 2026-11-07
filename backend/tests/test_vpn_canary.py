import asyncio
from contextlib import redirect_stdout
from contextlib import contextmanager
import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.services import vpn_canary_service as canary
from app.scripts import configure_vpn_canary as setup
from app.services.public_status_service import public_snapshot, public_status
from app.services.vpn_monitor_service import IncidentStore


UUID = "c73bb16b-1c16-48b0-9694-bfb657ca9ce8"
URL = f"vless://{UUID}@vpn.example.test:24443?security=reality&type=tcp&sni=www.example.test&pbk={'A' * 43}&sid=0123456789abcdef&fp=chrome&flow=xtls-rprx-vision"


def owned():
    return {"id": UUID, "email": canary.PROFILE_NAME, "group": canary.PROFILE_GROUP, "comment": canary.PROFILE_COMMENT, "enable": True, "expiryTime": 0, "totalGB": 0, "limitIp": 0}


def inbound():
    return {"id": 7, "port": 30001, "enable": True, "protocol": "vless", "settings": {"clients": [owned()]}, "streamSettings": {"network": "tcp", "security": "reality", "realitySettings": {"serverNames": ["www.example.test"], "publicKey": "A" * 43, "shortIds": ["0123456789abcdef"], "settings": {"fingerprint": "chrome"}}}}


class CanaryConfigTests(unittest.TestCase):
    def test_runtime_binds_loopback_and_has_no_direct_fallback_or_logging(self):
        config = canary.build_xray_config(URL, 12345)
        self.assertEqual(config["inbounds"][0]["listen"], "127.0.0.1")
        self.assertEqual([item["protocol"] for item in config["outbounds"]], ["vless"])
        self.assertEqual(config["routing"]["rules"][0]["outboundTag"], "vpn")
        self.assertEqual(config["log"]["loglevel"], "none")
        self.assertEqual(config["outbounds"][0]["settings"]["vnext"][0]["address"], "vpn.example.test")
        self.assertEqual(config["outbounds"][0]["streamSettings"]["realitySettings"]["password"], "A" * 43)

    def test_tls_verification_cannot_be_disabled_by_url_options(self):
        config = canary.build_xray_config(URL.replace("security=reality", "security=tls") + "&allowInsecure=1", 12345)
        self.assertFalse(config["outbounds"][0]["streamSettings"]["tlsSettings"]["allowInsecure"])

    def test_unsupported_ambiguous_unencrypted_and_invalid_profiles_are_rejected(self):
        for url in ("https://PRIVATE", URL + "&sni=other", URL.replace("type=tcp", "type=ws"), URL.replace("security=reality", "security=none"), URL.replace("pbk=" + "A" * 43, "pbk=bad"), URL.replace("sid=0123456789abcdef", "sid=123")):
            with self.subTest(url=url[-30:]), self.assertRaises(canary.CanaryConfigurationError) as error:
                canary.build_xray_config(url, 12345)
            self.assertNotIn("vless://", str(error.exception))
        for port in (0, 80, 65536, "12345"):
            with self.assertRaises(canary.CanaryConfigurationError):
                canary.build_xray_config(URL, port)

    def test_missing_default_config_is_disabled_and_corruption_is_not_silently_enabled(self):
        with TemporaryDirectory() as temp, patch.dict(os.environ, {"VPN_MONITOR_STATE_DIR": temp}):
            self.assertFalse(canary.load_config()["enabled"])
            path = Path(temp) / "canary.json"
            for value in ("bad", json.dumps({"version": 1, "enabled": "yes", "client_email": canary.PROFILE_NAME}), "x" * 4097):
                path.write_text(value)
                with self.assertRaises(canary.CanaryConfigurationError):
                    canary.load_config()

    def test_customer_disabled_or_expiring_profiles_are_not_used_for_tests(self):
        for updates in ({"comment": "Customer"}, {"email": "dlgtw-monitor-other"}, {"enable": False}, {"expiryTime": 1000}, {"expiryTime": -1000}, {"totalGB": 10}, {"limitIp": 1}):
            with self.assertRaises(canary.CanaryConfigurationError):
                canary.validate_profile({**owned(), **updates}, canary.PROFILE_NAME)

    def test_only_same_uuid_exact_name_and_supported_inbound_are_selected(self):
        xui = Mock()
        xui.get.return_value = {"client": owned()}
        xui.get_inbounds.return_value = [inbound()]
        with patch.object(canary, "build_vless_url", return_value=URL):
            self.assertEqual(canary.profile_links(SimpleNamespace(), xui, canary.PROFILE_NAME)[0]["inbound_id"], 7)
            xui.get_inbounds.return_value[0]["settings"]["clients"][0]["id"] = "different"
            with self.assertRaises(canary.CanaryConfigurationError):
                canary.profile_links(SimpleNamespace(), xui, canary.PROFILE_NAME)

    def test_global_numeric_id_does_not_override_the_vless_uuid(self):
        xui = Mock()
        xui.get.return_value = {"client": {**owned(), "id": 42, "uuid": UUID}}
        xui.get_inbounds.return_value = [inbound()]
        with patch.object(canary, "build_vless_url", return_value=URL):
            self.assertEqual(canary.profile_links(SimpleNamespace(), xui, canary.PROFILE_NAME)[0]["inbound_id"], 7)


class CanaryRuntimeTests(unittest.TestCase):
    @contextmanager
    def proxy(self, *args, **kwargs):
        yield "http://127.0.0.1:12345", SimpleNamespace(poll=lambda: None)

    def test_vpn_success_does_not_need_or_count_a_direct_request(self):
        with patch.object(canary, "xray_proxy", self.proxy), patch.object(canary, "https_check", AsyncMock(return_value=True)) as check:
            self.assertEqual(canary.probe_vless(URL, Event(), Mock()), "up")
        self.assertEqual(check.call_count, 1)
        self.assertEqual(check.call_args.args[0], "http://127.0.0.1:12345")

    def test_direct_control_is_not_a_successful_vpn_connection(self):
        for control, expected in ((True, "down"), (False, "unknown")):
            with patch.object(canary, "xray_proxy", self.proxy), patch.object(canary, "https_check", AsyncMock(side_effect=[False, control])) as check:
                self.assertEqual(canary.probe_vless(URL, Event(), Mock()), expected)
                self.assertIsNone(check.call_args.args[0])

    def test_stopping_does_not_start_a_new_xray_process(self):
        stop = Event(); stop.set()
        with patch.object(canary, "xray_proxy") as start:
            self.assertEqual(canary.probe_vless(URL, stop, Mock()), "unknown")
        start.assert_not_called()

    def test_default_off_never_connects_to_customer_api(self):
        with patch.object(canary, "load_config", return_value={"enabled": False}), patch.object(canary, "XUIService") as xui:
            result = canary.canary_observations(SimpleNamespace(id=1, name="Germany"), Event(), Mock())
        self.assertIn("1:vpn_session:disabled", result)
        xui.assert_not_called()

    def test_failures_hide_credentials_and_close_the_api_connection(self):
        xui = Mock()
        with patch.object(canary, "load_config", return_value={"enabled": True, "client_email": canary.PROFILE_NAME}), patch.object(canary.XUIService, "connect", return_value=xui), patch.object(canary, "profile_links", side_effect=ValueError("PRIVATE-UUID PRIVATE-PASSWORD vless://secret")):
            result = canary.canary_observations(SimpleNamespace(id=1, name="Germany"), Event(), Mock())
        self.assertEqual(result["1:vpn_session:config"]["state"], "unknown")
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("vless://", json.dumps(result))
        xui.client.close.assert_called_once()

    def test_temporary_private_config_and_child_are_cleaned_after_probe_failure(self):
        with TemporaryDirectory() as temp:
            binary = Path(temp) / "xray"; binary.touch()
            process = Mock(); process.poll.return_value = None
            with patch.object(canary.subprocess, "Popen", return_value=process) as popen, patch.object(canary.socket, "create_connection"):
                with self.assertRaises(RuntimeError):
                    with canary.xray_proxy(URL, Event(), Mock(), binary):
                        path = Path(popen.call_args.args[0][-1])
                        self.assertTrue(path.exists())
                        self.assertEqual(json.loads(path.read_text())["inbounds"][0]["listen"], "127.0.0.1")
                        self.assertNotIn("DATABASE_URL", popen.call_args.kwargs["env"])
                        raise RuntimeError("stop")
            process.terminate.assert_called_once()
            self.assertFalse(path.exists())


class CanarySetupTests(unittest.TestCase):
    def test_dry_run_reports_the_existing_enabled_state_without_rewriting_it(self):
        from app.scripts import monitor_vpn_servers as worker
        output = io.StringIO()
        with patch.object(setup, "load_config", return_value={"enabled": True}), patch.object(setup, "prepare_profiles", return_value=[]), patch.object(worker, "load_snapshot", return_value=([], None)), patch("sys.argv", ["configure"]), patch.object(setup, "atomic_json") as write, redirect_stdout(output):
            self.assertEqual(setup.main(), 0)
        self.assertTrue(json.loads(output.getvalue())["enabled"])
        write.assert_not_called()

    def test_explicit_disable_can_repair_a_corrupt_config_without_customer_writes(self):
        with TemporaryDirectory() as temp, patch.object(setup, "load_config", side_effect=canary.CanaryConfigurationError("INVALID_CONFIG")), patch.object(setup, "config_path", return_value=Path(temp) / "canary.json"), patch("sys.argv", ["configure", "--disable"]), redirect_stdout(io.StringIO()):
            self.assertEqual(setup.main(), 0)
            self.assertFalse(json.loads((Path(temp) / "canary.json").read_text())["enabled"])

    def test_case_collision_and_incomplete_pages_cannot_repurpose_an_existing_profile(self):
        xui = Mock()
        for client in ({"email": "DLGTW-MONITOR", "comment": "Customer"}, {"email": canary.PROFILE_NAME, "comment": "Customer"}):
            xui.get_all.return_value = {"items": [client], "total": 1}
            with self.assertRaisesRegex(canary.CanaryConfigurationError, "NAME_ALREADY_IN_USE"):
                setup.find_profile(xui, canary.PROFILE_NAME)
        xui.get_all.return_value = {"items": [{"email": "other"}], "total": 3}
        with self.assertRaisesRegex(canary.CanaryConfigurationError, "INCOMPLETE_CLIENT_LIST"):
            setup.find_profile(xui, canary.PROFILE_NAME)
        xui.add.assert_not_called()

    def test_setup_reads_all_servers_before_creating_anything(self):
        nodes = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
        xui = Mock(); xui.get_inbounds.return_value = [inbound()]
        with patch.object(setup.XUIService, "connect", return_value=xui), patch.object(setup, "find_profile", side_effect=[None, canary.CanaryConfigurationError("NAME_ALREADY_IN_USE")]), patch.object(setup, "build_vless_url", return_value=URL):
            with self.assertRaises(canary.CanaryConfigurationError):
                setup.prepare_profiles(nodes, canary.PROFILE_NAME, create=True)
        xui.add.assert_not_called()

    def test_dry_run_never_creates_or_updates_profiles_and_real_creation_uses_marker(self):
        for create in (False, True):
            xui = Mock(); xui.get_inbounds.return_value = [inbound()]
            with patch.object(setup.XUIService, "connect", return_value=xui), patch.object(setup, "find_profile", return_value=None), patch.object(setup, "build_vless_url", return_value=URL), patch.object(setup, "profile_links"):
                result = setup.prepare_profiles([SimpleNamespace(id=1, name="A")], canary.PROFILE_NAME, create=create)
            self.assertEqual(result[0]["profile"], "created" if create else "would_create")
            self.assertEqual(xui.add.call_count, int(create))
            xui.update.assert_not_called()
            xui.delete.assert_not_called()
            if create:
                self.assertEqual(xui.add.call_args.kwargs["days"], 0)
                self.assertEqual(xui.add.call_args.kwargs["comment"], canary.PROFILE_COMMENT)


class CanaryStatusTests(unittest.TestCase):
    def test_session_and_disabled_state_are_separate_from_tcp_and_no_secrets_are_published(self):
        from test_public_status import observations, SERVER, NOW
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "health.json").write_text(json.dumps({"heartbeat": NOW}))
            for state, overall, checked in (("up", "ok", True), ("down", "issue", True), ("unknown", "partial", False)):
                current = observations()
                current["1:vpn_session:7"] = {"server_id": 1, "state": state, "label": "PRIVATE-UUID"}
                snapshot = public_snapshot(current, {}, {1}, 3600, NOW)
                (root / "public-status.json").write_text(json.dumps(snapshot))
                result = public_status([SERVER], NOW, root)
                self.assertEqual(result["state"], overall)
                self.assertEqual(result["vpn_session_checked"], checked)
                self.assertNotIn("PRIVATE", json.dumps(result))

    def test_explicit_disabling_drops_only_canary_incidents_without_a_recovery_message(self):
        with TemporaryDirectory() as temp:
            store = IncidentStore(Path(temp) / "incidents.json")
            def item(): return {"server_id": 1, "name": "A", "label": "probe", "state": "down"}
            store.apply({"1:api": item(), "1:vpn_session:7": item()}, {1})
            store.apply({"1:vpn_session:disabled": {**item(), "state": "unknown"}}, {1})
            self.assertEqual(set(store.data["incidents"]), {"1:api"})


if __name__ == "__main__":
    unittest.main()
