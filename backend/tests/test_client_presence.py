import os
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api import clients as api
from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token
from app.db.deps import get_db
from app.services import client_service as module


class ClientPresenceTests(unittest.TestCase):
    def setUp(self):
        self.service = module.ClientService(SimpleNamespace())
        self.server = SimpleNamespace(id=1)
        self.xui = Mock()
        self.xui.get_all.return_value = {"total": 3, "items": [
            {"email": "Nick", "enable": True, "traffic": {"lastOnline": 1793552400000}},
            {"email": "nick", "enable": True, "traffic": None},
            {"email": "псевдоним", "enable": False},
        ], "summary": {"online": ["Nick", "псевдоним"], "active": 2}}
        for name, value in (("ServerService", Mock()), ("XUIService", Mock()), ("SettingsService", Mock())):
            context = patch.object(module, name, value)
            context.start()
            self.addCleanup(context.stop)
        module.ServerService.return_value.get.return_value = self.server
        module.XUIService.connect.return_value = self.xui
        links = patch.object(module, "attach_client_links", side_effect=lambda **kwargs: kwargs["clients"])
        links.start()
        self.addCleanup(links.stop)

    def test_exact_names_and_access_state_are_independent(self):
        result = self.service.get_all(1)
        self.assertEqual([client["online"] for client in result["clients"]], [True, False, True])
        self.assertFalse(result["clients"][2]["enabled"])
        self.assertEqual(result["online"], 2)
        self.assertTrue(result["online_available"])
        self.assertGreater(result["online_checked_at"], 0)
        self.assertEqual(result["clients"][0]["last_online"], 1793552400000)
        self.assertEqual(result["clients"][1]["traffic"], 0)
        self.xui.client.close.assert_called_once()

    def test_missing_or_malformed_online_list_is_unknown_not_offline(self):
        for value in (None, 2, "Nick", [None], [{"email": "Nick"}]):
            with self.subTest(value=value):
                self.xui.get_all.return_value["summary"]["online"] = value
                result = self.service.get_all(1)
                self.assertFalse(result["online_available"])
                self.assertIsNone(result["online_checked_at"])
                self.assertTrue(all(client["online"] is None for client in result["clients"]))

    def test_explicit_empty_online_list_is_known_offline(self):
        self.xui.get_all.return_value["summary"]["online"] = []
        result = self.service.get_all(1)
        self.assertTrue(result["online_available"])
        self.assertEqual(result["online"], 0)
        self.assertTrue(all(client["online"] is False for client in result["clients"]))

    def test_invalid_summary_does_not_hide_the_client_list(self):
        for value in (None, [], "unexpected", 1):
            self.xui.get_all.return_value["summary"] = value
            result = self.service.get_all(1)
            self.assertEqual(len(result["clients"]), 3)
            self.assertFalse(result["online_available"])

    def test_online_client_after_first_page_is_not_hidden(self):
        self.xui.get_all.side_effect = [
            {"total": 2, "items": [{"email": "first"}], "summary": {"online": ["later"]}},
            {"items": [{"email": "later"}]},
        ]
        result = self.service.get_all(1)
        self.assertEqual([client["online"] for client in result["clients"]], [False, True])
        self.assertFalse(result["truncated"])
        self.xui.get_all.assert_has_calls([call(), call(page=2, page_size=200)])

    def test_empty_later_page_is_bounded_and_reported_as_incomplete(self):
        self.xui.get_all.side_effect = [
            {"total": 500, "items": [{"email": "first"}], "summary": {"online": []}},
            {"items": []},
        ]
        self.assertTrue(self.service.get_all(1)["truncated"])
        self.assertEqual(self.xui.get_all.call_count, 2)

    def test_duplicate_pages_never_create_duplicate_rows_or_unbounded_requests(self):
        self.xui.get_all.return_value = {"total": 100000, "items": [{"email": "Nick"}], "summary": {"online": ["Nick", "Nick"]}}
        result = self.service.get_all(1)
        self.assertEqual(len(result["clients"]), 1)
        self.assertEqual(result["online"], 1)
        self.assertTrue(result["truncated"])
        self.assertEqual(self.xui.get_all.call_count, 100)

    def test_failed_list_closes_connection_and_does_not_mutate_clients(self):
        self.xui.get_all.side_effect = RuntimeError("Unavailable")
        with self.assertRaises(RuntimeError):
            self.service.get_all(1)
        self.xui.client.close.assert_called_once()
        self.xui.add.assert_not_called()
        self.xui.update.assert_not_called()
        self.xui.delete.assert_not_called()

    def test_link_failure_does_not_hide_presence(self):
        self.xui.get_inbounds.side_effect = RuntimeError("Links unavailable")
        self.assertTrue(self.service.get_all(1)["clients"][0]["online"])
        self.xui.client.close.assert_called_once()


class PresenceApiTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(api.router)
        self.app.dependency_overrides[get_db] = lambda: SimpleNamespace()
        self.client = TestClient(self.app)
        context = patch.object(api, "ClientService")
        self.service = context.start()
        self.addCleanup(context.stop)
        self.addCleanup(self.client.close)

    def test_list_remains_admin_only(self):
        self.assertEqual(self.client.get("/clients/1").status_code, 403)
        token = create_access_token({"sub": "1", "token_type": "client"})
        self.assertEqual(self.client.get("/clients/1", headers={"Authorization": f"Bearer {token}"}).status_code, 401)
        self.service.assert_not_called()

    def test_existing_route_exposes_presence_without_caching(self):
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
        self.service.return_value.get_all.return_value = {"clients": [{"email": "Nick", "online": None}], "online_available": False}
        response = self.client.get("/clients/1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertIsNone(response.json()["clients"][0]["online"])


if __name__ == "__main__":
    unittest.main()
