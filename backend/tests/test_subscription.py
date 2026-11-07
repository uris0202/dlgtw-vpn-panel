import base64
import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import public
from app.core.config import settings
from app.db.deps import get_db
from app.services.subscription_service import (
    active_subscription, encode_subscription, entitled_server_ids, subscription_signature,
)


def order(status="paid", servers=None, **values):
    return SimpleNamespace(**{
        "id": 1, "account_token": "private-account-token", "client_email": "Alice",
        "status": status, "server_ids": servers or [1], "server_id": 1,
        "activated_server_ids": servers or [1], "activated_at": datetime.now(timezone.utc),
        "activation_error": "", **values,
    })


class SubscriptionTests(unittest.TestCase):
    def test_only_paid_activated_and_admin_granted_servers_are_included(self):
        orders = [
            order(servers=[1, 2]), order("pending", [3]), order("canceled", [4]),
            order("paid", [5, 6], activated_server_ids=[5], activated_at=None, activation_error="failed"),
            order("access", [7], activated_server_ids=[], activated_at=None),
            order("paid", [8], activated_server_ids=[], activated_at=None),
        ]
        self.assertEqual(entitled_server_ids(orders), [1, 2, 5, 7])

    def test_legacy_paid_order_without_per_server_flags_is_supported(self):
        self.assertEqual(entitled_server_ids([order(servers=[1, 2], activated_server_ids=[])]), [1, 2])

    def test_inactive_and_exhausted_connections_are_excluded(self):
        good = {"enabled": True, "expiry": 2000, "traffic": 10, "total_gb": 100}
        self.assertTrue(active_subscription(good, now_ms=1000))
        for changed in ({"enabled": False}, {"expiry": 1000}, {"traffic": 100}, {"error": "offline"}):
            self.assertFalse(active_subscription({**good, **changed}, now_ms=1000))
        self.assertTrue(active_subscription({**good, "expiry": -86400000}, now_ms=1000))

    def test_base64_contains_all_unique_active_links_and_no_inactive_fallback(self):
        encoded = encode_subscription([
            {"enabled": True, "vless_urls": ["vless://one", "vless://two"]},
            {"enabled": True, "vless_urls": ["vless://one"]},
            {"enabled": False, "vless_urls": ["vless://disabled"]},
            {"enabled": True, "vless_urls": [], "vless_url": "vless://expired-inbound"},
        ])
        self.assertEqual(base64.b64decode(encoded).decode(), "vless://one\nvless://two")

    def test_subscription_token_cannot_be_used_as_account_token_and_rotates_on_reset(self):
        account = order()
        token = subscription_signature(account, "secret")
        self.assertNotIn(account.account_token, token)
        self.assertNotEqual(token, subscription_signature(order(account_token="reset"), "secret"))
        self.assertNotEqual(token, subscription_signature(order(id=2), "secret"))


class SubscriptionApiTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(public.router)
        app.dependency_overrides[get_db] = lambda: SimpleNamespace()
        self.client = TestClient(app)
        self.anchor = order()
        self.url = f"/public/subscriptions/1/{subscription_signature(self.anchor, settings.JWT_SECRET)}"
        public.subscription_limiter.reset("1")

    def tearDown(self):
        self.client.close()

    def test_subscription_requires_a_valid_independent_token(self):
        with patch.object(public, "OrderService") as service, patch.object(public, "build_subscriptions") as build:
            service.return_value.get.return_value = self.anchor
            for token in ("invalid", "я" * 64, "0" * 64, self.anchor.account_token):
                self.assertEqual(self.client.get(f"/public/subscriptions/1/{token}").status_code, 404)
            build.assert_not_called()

    def test_vpn_application_gets_base64_without_login_cookie(self):
        with patch.object(public, "OrderService") as service, patch.object(public, "build_subscriptions") as build:
            service.return_value.get.return_value = self.anchor
            service.return_value.get_all_by_account_token.return_value = [self.anchor]
            build.return_value = [{"enabled": True, "vless_urls": ["vless://paid"]}]
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(base64.b64decode(response.text), b"vless://paid")
            self.assertEqual(response.headers["cache-control"], "no-store")

    def test_temporary_upstream_failure_does_not_publish_partial_subscription(self):
        with patch.object(public, "OrderService") as service, patch.object(public, "build_subscriptions") as build:
            service.return_value.get.return_value = self.anchor
            build.return_value = [{"error": "offline"}]
            self.assertEqual(self.client.get(self.url).status_code, 503)

    def test_account_builder_never_queries_servers_from_unpaid_orders(self):
        with patch.object(public, "ServerService") as servers, patch.object(public, "SettingsService") as panel, patch.object(public, "build_subscription") as build:
            panel.return_value.get.return_value = SimpleNamespace(subscription_port=2096, subscription_path="subs")
            servers.return_value.get.side_effect = lambda server_id: SimpleNamespace(
                id=server_id, name="VPN", country="DE", host="https://192.0.2.10",
                username="user", password="password", base_path="", enabled=True,
            )
            build.return_value = {"enabled": True}
            public.build_subscriptions(SimpleNamespace(), "Alice", [order(servers=[1]), order("pending", [2, 3])])
            self.assertEqual([call.args[0] for call in servers.return_value.get.call_args_list], [1])

    def test_subscription_finds_paid_client_beyond_the_first_200_clients(self):
        with patch.object(public, "XUIService") as service, patch.object(public, "attach_client_links", side_effect=lambda **kwargs: kwargs["clients"]):
            xui = service.connect.return_value
            xui.get_all.side_effect = [
                {"items": [{"email": "other"}], "total": 201},
                {"items": [{"email": "Alice", "enable": True}], "total": 201},
            ]
            result = public.build_subscription(SimpleNamespace(id=1, name="Germany", country="DE"), "Alice", 2096, "subs")
            self.assertEqual(result["error"], "")
            self.assertEqual(xui.get_all.call_count, 2)


if __name__ == "__main__":
    unittest.main()
