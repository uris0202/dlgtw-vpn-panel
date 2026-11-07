import os
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import servers
from app.auth.jwt import create_access_token
from app.db.base import Base
from app.db.deps import get_db
from app.models.server import Server
from app.models.user import User
from app.services.relay_admin_service import RelayUpdateError


class RelayAdminApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        self.factory = sessionmaker(bind=self.engine)
        Base.metadata.create_all(self.engine, tables=[User.__table__, Server.__table__])
        with self.factory() as db:
            db.add(User(id=1, email="admin@example.com", password_hash="unused", is_admin=True))
            db.add(Server(id=2, name="Amsterdam", country="NL", host="https://192.0.2.2:10000", base_path="", username="admin", password="private-password", enabled=True))
            db.commit()
        def database():
            with self.factory() as db:
                yield db
        app = FastAPI()
        app.include_router(servers.router)
        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer " + create_access_token({"sub": "1", "token_type": "admin"})}

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_customer_token_cannot_modify_relay(self):
        headers = {"Authorization": "Bearer " + create_access_token({"sub": "1", "token_type": "client"})}
        with patch.object(servers, "sync_server_relay") as sync:
            result = self.client.post("/servers/2/relay-sync", headers=headers)
            self.assertEqual(result.status_code, 401)
            sync.assert_not_called()

    def test_server_list_includes_route_state_without_credentials(self):
        with patch.object(servers, "relay_status", return_value={"configured": True, "synchronized": False}):
            result = self.client.get("/servers", headers=self.headers)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertNotIn("private-password", result.text)
        self.assertFalse(result.json()[0]["relay"]["synchronized"])

    def test_admin_can_apply_route_and_action_is_audited(self):
        with patch.object(servers, "sync_server_relay", return_value={"success": True, "relay": {"destinations": ["192.0.2.20:30001"]}}) as sync, patch.object(servers, "AuditLogService") as audit:
            result = self.client.post("/servers/2/relay-sync", headers=self.headers)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(sync.call_args.args[0].id, 2)
            self.assertEqual(audit.return_value.record_admin.call_args.kwargs["action"], "server.relay_updated")

    def test_failed_check_returns_actionable_error_and_no_success_audit(self):
        with patch.object(servers, "sync_server_relay", side_effect=RelayUpdateError("VPN-порт недоступен")), patch.object(servers, "AuditLogService") as audit:
            result = self.client.post("/servers/2/relay-sync", headers=self.headers)
            self.assertEqual(result.status_code, 400)
            self.assertEqual(result.json()["detail"], "VPN-порт недоступен")
            audit.assert_not_called()

    def test_existing_server_edit_accepts_new_url_and_keeps_password(self):
        with patch.object(servers, "AuditLogService"):
            result = self.client.patch("/servers/2", headers=self.headers, json={"host": "https://192.0.2.20:10000"})
        self.assertEqual(result.status_code, 200, result.text)
        with self.factory() as db:
            server = db.get(Server, 2)
            self.assertEqual(server.host, "https://192.0.2.20:10000/")
            self.assertEqual(server.password, "private-password")


if __name__ == "__main__":
    unittest.main()
