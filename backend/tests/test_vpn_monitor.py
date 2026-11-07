import copy
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.services.vpn_monitor_service import IncidentStore, confirm_observations, observations
from app.services import vpn_monitor_service as monitor
from app.scripts import monitor_vpn_servers as worker


def credentials(enabled=True):
    return SimpleNamespace(telegram_notifications_enabled=enabled, telegram_bot_token="PRIVATE-BOT-TOKEN", telegram_chat_id="PRIVATE-CHAT")


def observation(state="down", key="1:api"):
    return {key: {"server_id": 1, "name": "Amsterdam", "label": "API 3X-UI (канал управления)", "state": state}}


def report():
    return {"server_id": 1, "server_name": "Amsterdam", "checks": {
        "xui_api": {"state": "error", "summary": "PRIVATE-ERROR"},
        "xray_runtime": {"state": "not_checked"},
        "management_tls": {"state": "warning"}, "relay_config": {"state": "warning"}},
        "inbounds": [{"audit": {"state": "warning", "findings": [{"summary": "No Vision"}]}}],
        "vpn_ports": [{"inbound_id": 2, "port": 30001, "state": "ok"}],
        "entry_ports": [{"inbound_id": 2, "port": 24444, "state": "warning"}]}


class AvailabilityMappingTests(unittest.TestCase):
    def test_api_and_tcp_are_independent_static_warnings_ignored(self):
        result = observations(report())
        self.assertEqual(result["1:api"]["state"], "down")
        self.assertEqual(result["1:vpn:2"]["state"], "up")
        self.assertEqual(result["1:entry:2"]["state"], "unknown")
        self.assertEqual(result["1:xray"]["state"], "unknown")
        self.assertEqual(len(result), 6)
        self.assertNotIn("PRIVATE-ERROR", json.dumps(result))

    def test_haproxy_accepting_tcp_does_not_hide_failed_backend(self):
        with patch.object(monitor, "runtime_command", return_value="# pxname,svname,status\nvpn_1_2,destination,DOWN\n") as command:
            result = monitor.relay_observations(report())
        self.assertEqual(result["1:relay_backend:2"]["state"], "down")
        command.assert_called_once_with("show stat")

    def test_haproxy_up_is_a_separate_tcp_check(self):
        with patch.object(monitor, "runtime_command", return_value="# pxname,svname,status\nvpn_1_2,destination,UP\n"):
            result = monitor.relay_observations(report())
        self.assertEqual(result["1:relay_backend:2"]["state"], "up")
        self.assertEqual(result["1:relay_probe"]["state"], "up")

    def test_unreadable_or_unsupported_haproxy_status_is_not_a_vpn_claim(self):
        for body in ("", "Unsupported command", "# pxname,svname,status\nother,destination,UP\n"):
            with patch.object(monitor, "runtime_command", return_value=body):
                result = monitor.relay_observations(report())
            self.assertTrue(any(item["state"] == "down" for item in result.values()))
        with patch.object(monitor, "runtime_command", side_effect=RuntimeError("PRIVATE-TOKEN")):
            result = monitor.relay_observations(report())
        self.assertIn("неизвестна", result["1:relay_probe"]["label"])
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_single_failure_recovery_or_unknown_does_not_confirm_down(self):
        for second, expected in ((observation("down"), "down"), (observation("up"), "up"), (observation("unknown"), "unknown"), ({}, "unknown")):
            self.assertEqual(confirm_observations(observation(), second)["1:api"]["state"], expected)

    def test_new_failure_during_confirmation_is_not_a_false_recovery(self):
        first = {**observation(), **observation("up", "1:vpn:2")}
        second = {**observation(), **observation("down", "1:vpn:2")}
        self.assertEqual(confirm_observations(first, second)["1:vpn:2"]["state"], "unknown")


class IncidentTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / "incidents.json"
        self.store = IncidentStore(self.path)
        self.sender = Mock()

    def tearDown(self):
        self.temp.cleanup()

    def test_healthy_checks_are_silent(self):
        self.store.apply(observation("up"), {1})
        self.assertEqual(self.store.deliver(credentials(), self.sender), 0)
        self.sender.assert_not_called()

    def test_alert_is_sent_once_and_persists_across_restart(self):
        self.store.apply(observation(), {1})
        self.store.save()
        self.assertEqual(self.store.deliver(credentials(), self.sender), 1)
        restarted = IncidentStore(self.path)
        restarted.apply(observation(), {1})
        self.assertEqual(restarted.deliver(credentials(), self.sender), 0)
        self.sender.assert_called_once()

    def test_recovery_is_sent_once_after_an_announced_outage(self):
        self.store.apply(observation(), {1})
        self.store.deliver(credentials(), self.sender)
        self.store.apply(observation("up"), {1})
        self.store.deliver(credentials(), self.sender)
        self.assertIn("Восстановлена доступность", self.sender.call_args.args[2])
        self.store.apply(observation("up"), {1})
        self.assertEqual(self.store.deliver(credentials(), self.sender), 0)
        self.assertEqual(self.sender.call_count, 2)

    def test_unknown_never_closes_an_outage(self):
        self.store.apply(observation(), {1})
        self.store.deliver(credentials(), self.sender)
        self.store.apply(observation("unknown"), {1})
        self.assertTrue(self.store.data["incidents"]["1:api"]["active"])
        self.assertEqual(self.store.deliver(credentials(), self.sender), 0)

    def test_failed_telegram_delivery_is_retried_without_leaking_secrets(self):
        self.store.apply(observation(), {1})
        self.sender.side_effect = RuntimeError("PRIVATE-BOT-TOKEN PRIVATE-CHAT")
        with self.assertLogs("app.services.vpn_monitor_service", level="WARNING") as logs:
            self.assertEqual(self.store.deliver(credentials(), self.sender), 0)
        self.assertNotIn("PRIVATE", str(logs.output))
        self.assertFalse(self.store.data["incidents"]["1:api"]["notified"])
        self.sender.side_effect = None
        self.assertEqual(self.store.deliver(credentials(), self.sender), 1)
        text = self.sender.call_args.args[2]
        self.assertNotIn("PRIVATE", text)
        self.assertIn("API 3X-UI", text)
        self.assertNotIn("PRIVATE", self.path.read_text())

    def test_unannounced_failure_that_recovers_is_not_delivered_late(self):
        self.store.apply(observation(), {1})
        self.store.apply(observation("up"), {1})
        self.assertEqual(self.store.deliver(credentials(), self.sender), 0)

    def test_disabled_or_removed_server_does_not_send_a_false_recovery(self):
        self.store.apply(observation(), {1})
        self.store.deliver(credentials(), self.sender)
        self.store.apply({}, set())
        self.assertEqual(self.store.deliver(credentials(), self.sender), 0)
        self.assertEqual(self.store.data["incidents"], {})

    def test_disabled_notifications_preserve_pending_incidents(self):
        self.store.apply(observation(), {1})
        self.assertEqual(self.store.deliver(credentials(False), self.sender), 0)
        self.sender.assert_not_called()
        self.assertEqual(self.store.deliver(credentials(), self.sender), 1)

    def test_multiple_failed_layers_are_grouped_by_server(self):
        self.store.apply({**observation(), **observation("down", "1:vpn:2")}, {1})
        self.assertEqual(self.store.deliver(credentials(), self.sender), 1)
        self.sender.assert_called_once()
        self.assertTrue(all(item["notified"] for item in self.store.data["incidents"].values()))

    def test_new_outage_cancels_an_undelivered_recovery(self):
        self.store.apply(observation(), {1})
        self.store.deliver(credentials(), self.sender)
        self.store.apply(observation("up"), {1})
        self.store.apply(observation(), {1})
        self.assertEqual(self.store.deliver(credentials(), self.sender), 0)
        self.assertEqual(self.sender.call_count, 1)

    def test_invalid_state_is_not_silently_discarded(self):
        self.path.write_text("broken", encoding="utf-8")
        with self.assertRaises(ValueError):
            IncidentStore(self.path)


class WorkerTests(unittest.TestCase):
    def test_failed_server_is_rechecked_after_a_minute_without_rechecking_healthy_nodes(self):
        servers = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
        store, stop, heartbeat = Mock(), Mock(), Mock()
        stop.is_set.return_value = False
        stop.wait.return_value = False
        with patch.object(worker, "load_snapshot", return_value=(servers, credentials())), patch.object(worker, "collect", side_effect=[observation(), observation()]) as collect:
            worker.cycle(store, stop, 60, heartbeat)
        stop.wait.assert_called_once_with(60)
        self.assertEqual(collect.call_args_list[1].args[0], [servers[0]])
        self.assertEqual(store.apply.call_args.args[0]["1:api"]["state"], "down")

    def test_healthy_cycle_does_not_wait_for_confirmation(self):
        store, stop = Mock(), Mock()
        stop.is_set.return_value = False
        with patch.object(worker, "load_snapshot", return_value=([SimpleNamespace(id=1)], credentials())), patch.object(worker, "collect", return_value=observation("up")):
            worker.cycle(store, stop, 60, Mock())
        stop.wait.assert_not_called()

    def test_stop_during_confirmation_does_not_apply_partial_results(self):
        store, stop = Mock(), Mock()
        stop.wait.return_value = True
        with patch.object(worker, "load_snapshot", return_value=([SimpleNamespace(id=1)], credentials())), patch.object(worker, "collect", return_value=observation()):
            self.assertIsNone(worker.cycle(store, stop, 60, Mock()))
        store.apply.assert_not_called()

    def test_unexpected_probe_failure_is_explicitly_labeled_unknown_vpn(self):
        with patch.object(worker, "diagnose_server", side_effect=RuntimeError("PRIVATE-BOT-TOKEN")), self.assertLogs(worker.logger, level="ERROR") as logs:
            result = worker.collect([SimpleNamespace(id=1, name="Amsterdam")], Event(), Mock())
        self.assertEqual(result["1:probe"]["state"], "down")
        self.assertIn("состояние VPN неизвестно", result["1:probe"]["label"])
        self.assertNotIn("PRIVATE", str(logs.output))

    def test_database_snapshot_is_read_only_and_skips_disabled_servers(self):
        database = Mock()
        database.get.return_value = credentials()
        server = SimpleNamespace(id=1, name="A", host="https://192.0.2.1", username="u", password="p", base_path="", enabled=True)
        disabled = copy.copy(server)
        disabled.enabled = False
        with patch.object(worker, "SessionLocal") as factory, patch.object(worker, "ServerService") as service:
            factory.return_value.__enter__.return_value = database
            service.return_value.get_all.return_value = [server, disabled]
            nodes, config = worker.load_snapshot()
        self.assertEqual(len(nodes), 1)
        self.assertEqual(config.telegram_chat_id, "PRIVATE-CHAT")
        database.commit.assert_not_called()
        database.add.assert_not_called()

    def test_health_is_stale_failed_or_unconfigured_not_healthy(self):
        with TemporaryDirectory() as temp:
            directory = Path(temp)
            self.assertFalse(worker.healthy(directory, 3600, now=10000))
            path = directory / "health.json"
            base = {"heartbeat": 9990, "last_cycle": 9900, "telegram_configured": True, "cycle_error": False}
            path.write_text(json.dumps(base))
            self.assertTrue(worker.healthy(directory, 3600, now=10000))
            for update in ({"heartbeat": 9000}, {"last_cycle": 100}, {"telegram_configured": False}, {"cycle_error": True}):
                path.write_text(json.dumps({**base, **update}))
                self.assertFalse(worker.healthy(directory, 3600, now=10000))

    def test_worker_keeps_hourly_cadence_and_retries_notifications_between_cycles(self):
        clock = SimpleNamespace(now=1000.0, stopped=False)
        class Stop:
            def is_set(self):
                return clock.stopped
            def wait(self, seconds):
                clock.now += seconds
                clock.stopped = clock.now >= 4601
                return clock.stopped
        with TemporaryDirectory() as temp, patch.object(worker.time, "monotonic", side_effect=lambda: clock.now), patch.object(worker.time, "time", side_effect=lambda: clock.now), patch.object(worker, "cycle", return_value=credentials()) as cycle, patch.object(worker, "load_snapshot", return_value=([], credentials())), patch.object(IncidentStore, "deliver") as delivery:
            self.assertEqual(worker.run(Path(temp), 3600, 60, stop=Stop()), 0)
        self.assertEqual(cycle.call_count, 2)
        self.assertGreater(delivery.call_count, 2)


if __name__ == "__main__":
    unittest.main()
