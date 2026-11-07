import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api import clients as api
from app.auth.dependencies import get_current_user
from app.db.deps import get_db


class ClientRenewalAuditTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(api.router)
        app.dependency_overrides[get_db] = lambda: SimpleNamespace()
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, email="admin@example.test")
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        service = patch.object(api, "ClientService")
        self.service = service.start()
        self.addCleanup(service.stop)
        audit = patch.object(api, "AuditLogService")
        self.audit = audit.start()
        self.addCleanup(audit.stop)

    def test_days_are_recorded_without_new_routes_or_changed_payload(self):
        response = self.client.patch("/clients/1/Alex", json={"days": 30, "enable": True})
        self.assertEqual(response.status_code, 200)
        details = self.audit.return_value.record_admin.call_args.kwargs["details"]
        self.assertEqual(details["added_days"], 30)
        self.assertEqual(details["changed_fields"], ["days", "enable"])

    def test_empty_days_do_not_claim_a_renewal(self):
        response = self.client.patch("/clients/1/Alex", json={"comment": "note", "days": None})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("added_days", self.audit.return_value.record_admin.call_args.kwargs["details"])

    def test_failed_update_never_records_a_successful_extension(self):
        self.service.return_value.update.side_effect = RuntimeError("Unavailable")
        self.assertEqual(self.client.patch("/clients/1/Alex", json={"days": 30}).status_code, 400)
        self.audit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
