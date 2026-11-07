import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel",
)
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.services import client_service as client_service_module


DAY_MS = 86400 * 1000


class FakeXUI:
    def __init__(
        self,
        expiry,
        enabled=True,
        apply_changes=True,
        direct_lookup_fails=False,
    ):
        self.client = {
            "id": "client-id",
            "email": "alex",
            "expiryTime": expiry,
            "enable": enabled,
        }
        self.updated = None
        self.enable_calls = []
        self.apply_changes = apply_changes
        self.direct_lookup_fails = direct_lookup_fails
        self.add_calls = []

    def get(self, email):
        if self.direct_lookup_fails:
            raise Exception("record not found")
        return {"client": self.client}

    def get_all(self):
        return {"items": [self.client]}

    def add(self, **values):
        self.add_calls.append(values)
        return True

    def update(self, email, existing_client=None, **values):
        self.updated = {
            "email": email,
            "existing_client": existing_client,
            "values": values,
        }
        if self.apply_changes:
            self.client.update(values)
        return True

    def set_enabled(self, email, enabled=True):
        self.enable_calls.append((email, enabled))
        if self.apply_changes:
            self.client["enable"] = enabled
        return True


def make_update(days):
    return SimpleNamespace(
        email=None,
        group=None,
        comment=None,
        enable=None,
        total_gb=None,
        days=days,
    )


class ClientServiceTests(unittest.TestCase):
    def update_client(self, current_expiry, days, now_ms):
        xui = FakeXUI(current_expiry)
        service = client_service_module.ClientService(SimpleNamespace())
        service._connect = lambda server_id: xui

        with patch.object(client_service_module.time, "time", return_value=now_ms / 1000):
            service.update(1, "alex", make_update(days))

        return xui

    def test_active_client_is_extended_from_current_expiry(self):
        now_ms = 1_700_000_000_000
        current_expiry = now_ms + 10 * DAY_MS

        xui = self.update_client(current_expiry, 30, now_ms)
        updated = xui.updated

        self.assertEqual(
            updated["values"]["expiryTime"],
            current_expiry + 30 * DAY_MS,
        )
        self.assertIs(updated["existing_client"], xui.client)

    def test_expired_client_is_extended_from_current_time(self):
        now_ms = 1_700_000_000_000
        current_expiry = now_ms - 10 * DAY_MS

        updated = self.update_client(current_expiry, 30, now_ms).updated

        self.assertEqual(
            updated["values"]["expiryTime"],
            now_ms + 30 * DAY_MS,
        )

    def test_zero_days_switches_client_to_unlimited_expiry(self):
        now_ms = 1_700_000_000_000

        updated = self.update_client(now_ms + 10 * DAY_MS, 0, now_ms).updated

        self.assertEqual(updated["values"]["expiryTime"], 0)

    def test_paid_renewal_reactivates_expired_client_and_verifies_result(self):
        now_ms = 1_700_000_000_000
        xui = FakeXUI(
            expiry=now_ms - 10 * DAY_MS,
            enabled=False,
        )
        service = client_service_module.ClientService(SimpleNamespace())
        service._connect = lambda server_id: xui

        with patch.object(client_service_module.time, "time", return_value=now_ms / 1000):
            result = service.renew_or_create(
                server_id=1,
                email="alex",
                inbound_id=1,
                days=30,
                total_gb=0,
            )

        self.assertTrue(result)
        self.assertEqual(xui.enable_calls, [("alex", True)])
        self.assertTrue(xui.client["enable"])
        self.assertEqual(
            xui.client["expiryTime"],
            now_ms + 30 * DAY_MS,
        )

    def test_paid_renewal_fails_when_xui_does_not_apply_changes(self):
        now_ms = 1_700_000_000_000
        xui = FakeXUI(
            expiry=now_ms - 10 * DAY_MS,
            enabled=False,
            apply_changes=False,
        )
        service = client_service_module.ClientService(SimpleNamespace())
        service._connect = lambda server_id: xui

        with (
            patch.object(client_service_module.time, "time", return_value=now_ms / 1000),
            self.assertRaisesRegex(Exception, "3X-UI не применил продление"),
        ):
            service.renew_or_create(
                server_id=1,
                email="alex",
                inbound_id=1,
                days=30,
                total_gb=0,
            )

    def test_expired_client_is_found_in_list_when_direct_lookup_fails(self):
        now_ms = 1_700_000_000_000
        xui = FakeXUI(
            expiry=now_ms - DAY_MS,
            enabled=False,
            direct_lookup_fails=True,
        )
        service = client_service_module.ClientService(SimpleNamespace())
        service._connect = lambda server_id: xui

        with patch.object(client_service_module.time, "time", return_value=now_ms / 1000):
            result = service.renew_or_create(
                server_id=1,
                email="Alex",
                inbound_id=1,
                days=30,
                total_gb=0,
            )

        self.assertTrue(result)
        self.assertEqual(xui.add_calls, [])
        self.assertEqual(xui.client["expiryTime"], now_ms + 30 * DAY_MS)
        self.assertTrue(xui.client["enable"])


if __name__ == "__main__":
    unittest.main()
