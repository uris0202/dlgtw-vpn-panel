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

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api import public_status as api
from app.db.deps import get_db
from app.scripts import monitor_vpn_servers as worker
from app.services.public_status_service import public_snapshot, public_status
from app.services.vpn_monitor_service import IncidentStore


NOW = 1793600000
SERVER = SimpleNamespace(id=1, name="Germany", country="Germany", enabled=True, host="PRIVATE-HOST", password="PRIVATE-PASSWORD")


def observations():
    return {f"1:{key}": {"server_id": 1, "state": "up", "label": "PRIVATE-PORT-30001", "uuid": "PRIVATE-UUID"}
            for key in ("api", "xray", "probe", "vpn:1", "entry:1", "relay_config", "relay_probe", "relay_backend:1")}


class PublicStatusTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.current = observations()
        self.snapshot = public_snapshot(self.current, {}, {1}, 3600, NOW)
        self.health = {"heartbeat": NOW, "cycle_error": False, "telegram_bot_token": "PRIVATE-BOT"}

    def read(self, now=NOW):
        (self.root / "public-status.json").write_text(json.dumps(self.snapshot), encoding="utf-8")
        (self.root / "health.json").write_text(json.dumps(self.health), encoding="utf-8")
        return public_status([SERVER], now, self.root)

    def test_fresh_status_is_infrastructure_only_and_contains_no_raw_diagnostics(self):
        result = self.read()
        self.assertEqual(result["state"], "ok")
        self.assertFalse(result["vpn_session_checked"])
        self.assertNotIn("PRIVATE", json.dumps(self.snapshot))
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("30001", json.dumps(result))

    def test_api_failure_does_not_claim_vpn_route_failed(self):
        self.current["1:api"]["state"] = "down"
        self.current["1:xray"]["state"] = "unknown"
        self.snapshot = public_snapshot(self.current, {}, {1}, 3600, NOW)
        result = self.read()
        self.assertEqual(result["state"], "partial")
        self.assertEqual(result["servers"][0]["route"], "up")

    def test_failed_destination_is_not_hidden_by_a_listening_entry_port(self):
        self.current["1:relay_backend:1"]["state"] = "down"
        self.snapshot = public_snapshot(self.current, {}, {1}, 3600, NOW)
        self.assertEqual(self.read()["state"], "issue")

    def test_missing_haproxy_status_or_no_vpn_ports_never_claims_complete_route(self):
        for key in ("1:relay_probe", "1:vpn:1"):
            current = observations()
            del current[key]
            self.assertEqual(public_snapshot(current, {}, {1}, 3600, NOW)["servers"][0]["route"], "unknown")

    def test_every_entry_requires_its_own_haproxy_destination_status(self):
        current = observations()
        current["1:entry:2"] = {"server_id": 1, "state": "up"}
        self.assertEqual(public_snapshot(current, {}, {1}, 3600, NOW)["servers"][0]["route"], "unknown")

    def test_huge_or_boolean_timestamps_fail_closed_without_server_error(self):
        for value in (10 ** 500, True):
            self.snapshot["checked_at"] = value
            self.assertEqual(self.read()["state"], "unknown")

    def test_old_snapshot_dead_heartbeat_failed_cycle_and_future_dates_are_unknown(self):
        for snapshot_change, health_change, now in (({}, {}, NOW + 4501), ({}, {"heartbeat": NOW - 301}, NOW), ({}, {"cycle_error": True}, NOW), ({"checked_at": NOW + 1}, {}, NOW)):
            with self.subTest(snapshot=snapshot_change, health=health_change):
                self.snapshot = {**public_snapshot(observations(), {}, {1}, 3600, NOW), **snapshot_change}
                self.health = {"heartbeat": NOW, **health_change}
                result = self.read(now)
                self.assertEqual(result["state"], "unknown")
                self.assertTrue(all(item["route"] == "unknown" for item in result["servers"]))

    def test_missing_corrupt_oversized_and_wrong_version_data_is_unknown(self):
        path = self.root / "public-status.json"
        self.assertEqual(public_status([SERVER], NOW, self.root)["state"], "unknown")
        for value in ("broken", "[]", '{"version": 2}', "x" * (512 * 1024 + 1)):
            path.write_text(value)
            self.assertEqual(public_status([SERVER], NOW, self.root)["state"], "unknown")

    def test_disabled_deleted_and_new_servers_do_not_inherit_other_node_status(self):
        disabled = SimpleNamespace(id=1, enabled=False)
        new = SimpleNamespace(id=2, name="Poland", country="Poland", enabled=True)
        self.read()
        result = public_status([disabled, new], NOW, self.root)
        self.assertEqual([item["id"] for item in result["servers"]], [2])
        self.assertEqual(result["state"], "unknown")
        self.assertEqual(public_status([], NOW, self.root)["state"], "unknown")

    def test_duplicate_route_incidents_are_collapsed_and_unknown_does_not_hide_open_issue(self):
        incidents = {f"1:{key}": {"server_id": 1, "active": True, "since": "2026-11-01T00:00:00+00:00", "label": "PRIVATE"} for key in ("vpn:1", "entry:1")}
        current = observations()
        current["1:vpn:1"]["state"] = "unknown"
        self.snapshot = public_snapshot(current, incidents, {1}, 3600, NOW)
        result = self.read()
        self.assertEqual(result["state"], "issue")
        self.assertEqual(len(result["servers"][0]["incidents"]), 1)

    def test_malformed_layer_values_and_extra_secret_fields_cannot_leak_or_crash(self):
        node = self.snapshot["servers"][0]
        node.update(route=[], node={"token": "PRIVATE"}, password="PRIVATE", incidents=[{"kind": [], "since": NOW}, {"kind": "route", "since": {"token": "PRIVATE"}}])
        result = self.read()
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertIsNone(result["servers"][0]["incidents"][0]["since"])

    def test_publisher_persists_allowlisted_snapshot_without_changing_incidents(self):
        store = IncidentStore(self.root / "incidents.json")
        store.publish(self.current, [SERVER], 3600)
        self.assertEqual(store.data["incidents"], {})
        self.assertNotIn("PRIVATE", (self.root / "public-status.json").read_text())

    def test_publisher_failure_does_not_stop_monitor_cycle_or_incident_save(self):
        store = Mock()
        store.publish.side_effect = OSError("PRIVATE")
        with patch.object(worker, "load_snapshot", return_value=([SERVER], SimpleNamespace())), patch.object(worker, "collect", return_value=observations()), self.assertLogs(worker.logger, level="WARNING") as logs:
            self.assertIsNotNone(worker.cycle(store, Event(), 60, Mock()))
        store.save.assert_called_once()
        self.assertNotIn("PRIVATE", str(logs.output))


class PublicStatusApiTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(api.router)
        app.dependency_overrides[get_db] = lambda: SimpleNamespace()
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_public_route_uses_cached_snapshot_without_authentication(self):
        with patch.object(api, "limiter") as limiter, patch.object(api, "ServerService") as servers, patch.object(api, "SettingsService") as settings, patch.object(api, "public_status", return_value={"state": "unknown", "servers": []}):
            limiter.allow.return_value = True
            settings.return_value.get.return_value.panel_name = "DLGTW VPN"
            response = self.client.get("/public/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json()["panel_name"], "DLGTW VPN")

    def test_rate_limit_has_clear_retry_and_no_server_reads(self):
        with patch.object(api, "limiter") as limiter, patch.object(api, "ServerService") as servers:
            limiter.allow.return_value = False
            response = self.client.get("/public/status")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "60")
        servers.assert_not_called()


if __name__ == "__main__":
    unittest.main()
