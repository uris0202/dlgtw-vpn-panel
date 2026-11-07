import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api import servers
from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token
from app.db.deps import get_db


class ServerDiagnosticsApiTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(servers.router)
        self.app.dependency_overrides[get_db] = lambda: SimpleNamespace()
        self.client = TestClient(self.app)
        self.service = patch.object(servers, "ServerService").start()
        self.service.return_value.get.return_value = SimpleNamespace(id=1)
        self.audit = patch.object(servers, "diagnose_server", return_value={"server_id": 1, "checks": {"vpn_session": {"state": "not_checked"}}}).start()
        servers.diagnostics_limiter.reset("1:1")

    def tearDown(self):
        self.client.close()
        patch.stopall()

    def authenticate(self):
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)

    def test_anonymous_and_customer_cannot_start_diagnostics(self):
        self.assertEqual(self.client.get("/servers/1/diagnostics").status_code, 403)
        token = create_access_token({"sub": "1", "token_type": "client"})
        self.assertEqual(self.client.get("/servers/1/diagnostics", headers={"Authorization": f"Bearer {token}"}).status_code, 401)
        self.audit.assert_not_called()

    def test_admin_read_has_no_cache_and_no_database_mutations(self):
        self.authenticate()
        response = self.client.get("/servers/1/diagnostics")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json()["checks"]["vpn_session"]["state"], "not_checked")
        self.service.return_value.update.assert_not_called()
        self.service.return_value.get_for_update.assert_not_called()

    def test_missing_server_returns_404(self):
        self.authenticate()
        self.service.return_value.get.return_value = None
        self.assertEqual(self.client.get("/servers/1/diagnostics").status_code, 404)
        self.audit.assert_not_called()

    def test_repeated_requests_are_bounded(self):
        self.authenticate()
        for _ in range(3):
            self.assertEqual(self.client.get("/servers/1/diagnostics").status_code, 200)
        response = self.client.get("/servers/1/diagnostics")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "60")

    def test_busy_worker_returns_retry_without_starting_another_probe(self):
        self.authenticate()
        with patch.object(servers, "diagnostics_slots") as slots:
            slots.acquire.return_value = False
            response = self.client.get("/servers/1/diagnostics")
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["retry-after"], "10")
            slots.release.assert_not_called()
        self.audit.assert_not_called()

    def test_unexpected_failure_releases_worker_slot(self):
        self.authenticate()
        self.audit.side_effect = RuntimeError("test failure")
        with patch.object(servers, "diagnostics_slots") as slots:
            slots.acquire.return_value = True
            with self.assertRaises(RuntimeError):
                self.client.get("/servers/1/diagnostics")
            slots.release.assert_called_once()


if __name__ == "__main__":
    unittest.main()
