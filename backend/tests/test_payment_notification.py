import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import BackgroundTasks
from fastapi import HTTPException


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel",
)
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.api import public


class FakeDatabase:
    def __init__(self):
        self.commits = 0
        self.refreshed = []

    def commit(self):
        self.commits += 1

    def refresh(self, value):
        self.refreshed.append(value)


class PaymentNotificationTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()
        self.order = SimpleNamespace(
            id=42,
            client_email="Test_Client",
            customer_contact="@test",
            account_token="private-account-token",
            account_login="test-client",
            plan_name="ProGTW",
            server_names="Germany, Amsterdam",
            server_id=1,
            server_ids=[1, 2],
            amount=300,
            currency="RUB",
            status="pending",
            paid_at=None,
            payment_notified_at=None,
            activated_at=None,
            activation_error="",
            activated_server_ids=[],
        )
        self.settings = SimpleNamespace(
            payment_phone="+70000000000",
            payment_recipient="DLGTW",
            payment_instructions="",
            support_contact="@support",
        )
        self.request = SimpleNamespace(
            headers={},
            client=SimpleNamespace(host="203.0.113.10"),
        )

    def test_repeated_payment_report_sends_one_notification(self):
        with (
            patch.object(public, "get_account_order", return_value=self.order),
            patch.object(public, "enforce_rate_limit") as rate_limit,
            patch.object(public, "SettingsService") as settings_service,
            patch.object(public, "AuditLogService") as audit_service,
            patch.object(
                public.TelegramNotificationService,
                "queue_payment_notification",
            ) as telegram_queue,
        ):
            settings_service.return_value.get.return_value = self.settings

            first = public.notify_order_payment_response(
                self.db,
                self.order,
                self.order.id,
                self.request,
                BackgroundTasks(),
            )
            second = public.notify_order_payment_response(
                self.db,
                self.order,
                self.order.id,
                self.request,
                BackgroundTasks(),
            )

        self.assertIsNotNone(first["payment_notified_at"])
        self.assertEqual(first["payment_notified_at"], second["payment_notified_at"])
        self.assertEqual(self.db.commits, 1)
        rate_limit.assert_called_once()
        telegram_queue.assert_called_once()
        audit_service.return_value.record_customer.assert_called_once()

    def test_canceled_order_cannot_report_payment(self):
        self.order.status = "canceled"

        with patch.object(public, "get_account_order", return_value=self.order):
            with self.assertRaises(HTTPException) as raised:
                public.notify_order_payment_response(
                    self.db,
                    self.order,
                    self.order.id,
                    self.request,
                    BackgroundTasks(),
                )

        self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
