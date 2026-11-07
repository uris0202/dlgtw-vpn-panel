import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

from app.services.public_status_service import public_snapshot, public_status
from app.services.vpn_monitor_service import IncidentStore, confirm_observations, observations


def report(state="ok", port=443, include=True):
    checks = {
        "xui_api": {"state": "ok"}, "xray_runtime": {"state": "ok"},
        "relay_config": {"state": "ok"},
    }
    if include:
        checks["edge_sni_sync"] = {"state": state, "message": "secret-token.example"}
    return {"server_id": 1, "server_name": "Germany", "checks": checks,
            "vpn_ports": [{"inbound_id": 1, "port": 30001, "state": "ok"}],
            "entry_ports": [{"inbound_id": 1, "port": port, "state": "ok"}]}


class EdgeSNIMonitorTests(unittest.TestCase):
    def test_fresh_sync_is_up(self):
        self.assertEqual(observations(report())["1:sni_sync"]["state"], "up")

    def test_error_and_stale_warning_are_down(self):
        for state in ("error", "warning"):
            with self.subTest(state=state):
                item = observations(report(state))["1:sni_sync"]
                self.assertEqual(item["state"], "down")
                self.assertNotIn("secret-token", json.dumps(item))

    def test_not_checked_and_unrecognized_are_unknown(self):
        for state in ("not_checked", "disabled", "new_state"):
            self.assertEqual(observations(report(state))["1:sni_sync"]["state"], "unknown")

    def test_legacy_or_missing_check_does_not_create_incident(self):
        self.assertNotIn("1:sni_sync", observations(report(port=24443)))
        self.assertNotIn("1:sni_sync", observations(report(include=False)))

    def test_two_round_confirmation_suppresses_transient_error(self):
        result = confirm_observations(observations(report("error")), observations(report()))
        self.assertEqual(result["1:sni_sync"]["state"], "up")

    def test_missing_second_result_cannot_confirm_error(self):
        result = confirm_observations(observations(report("warning")), {})
        self.assertEqual(result["1:sni_sync"]["state"], "unknown")

    def test_down_notification_is_deduplicated_and_recovery_is_delivered(self):
        credentials = SimpleNamespace(telegram_notifications_enabled=True,
                                      telegram_bot_token="test-token", telegram_chat_id="test-chat")
        sent = []
        with TemporaryDirectory() as directory:
            path = Path(directory) / "incidents.json"
            store = IncidentStore(path)
            down = confirm_observations(observations(report("warning")), observations(report("warning")))
            store.apply(down, {1}, now="2026-11-07T12:00:00+00:00")
            store.save()
            self.assertEqual(store.deliver(credentials, lambda *args: sent.append(args[-1])), 1)
            store = IncidentStore(path)
            store.apply(down, {1}, now="2026-11-07T13:00:00+00:00")
            self.assertEqual(store.deliver(credentials, lambda *args: sent.append(args[-1])), 0)
            store.apply(observations(report()), {1})
            self.assertEqual(store.deliver(credentials, lambda *args: sent.append(args[-1])), 1)
            self.assertEqual(len(sent), 2)
            self.assertIn("SNI Edge", sent[0])
            self.assertNotIn("secret-token", "".join(sent))
            self.assertNotIn("1:sni_sync", store.data["incidents"])

    def test_failed_delivery_remains_pending_and_unknown_does_not_close(self):
        credentials = SimpleNamespace(telegram_notifications_enabled=True,
                                      telegram_bot_token="test-token", telegram_chat_id="test-chat")
        with TemporaryDirectory() as directory:
            store = IncidentStore(Path(directory) / "incidents.json")
            store.apply(observations(report("error")), {1})
            def unavailable(*args):
                raise OSError("test-only failure")
            self.assertEqual(store.deliver(credentials, unavailable), 0)
            store.apply(observations(report("not_checked")), {1})
            self.assertTrue(store.data["incidents"]["1:sni_sync"]["active"])
            self.assertFalse(store.data["incidents"]["1:sni_sync"]["notified"])
            self.assertEqual(store.deliver(credentials, lambda *args: None), 1)

    def test_sni_problem_is_not_reported_as_vpn_outage(self):
        current = observations(report("warning"))
        for suffix in ("relay_probe", "relay_backend:1", "vpn_session:https"):
            current["1:" + suffix] = {"server_id": 1, "state": "up"}
        now = 1794052800
        snapshot = public_snapshot(current, {}, {1}, 3600, now=now)
        self.assertEqual(snapshot["servers"][0]["route"], "up")
        self.assertEqual(snapshot["servers"][0]["checks"], "down")
        with TemporaryDirectory() as directory:
            Path(directory, "public-status.json").write_text(json.dumps(snapshot))
            Path(directory, "health.json").write_text(json.dumps({"heartbeat": now}))
            result = public_status([SimpleNamespace(id=1, enabled=True, name="Germany", country="DE")],
                                   now=now, directory=directory)
            self.assertEqual(result["servers"][0]["state"], "partial")
            self.assertEqual(result["servers"][0]["session"], "up")


if __name__ == "__main__":
    unittest.main()
