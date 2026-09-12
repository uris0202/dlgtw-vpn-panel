import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel",
)
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.services import order_service as order_service_module


class OrderActivationTests(unittest.TestCase):
    def test_paid_full_plan_activates_every_selected_server(self):
        service = order_service_module.OrderService(SimpleNamespace())
        order = SimpleNamespace(
            id=17,
            client_email="Full_Plan_Client",
            server_id=1,
            server_ids=[1, 2],
            activated_server_ids=[],
            activated_at=None,
            activation_error="",
            duration_days=30,
            traffic_gb=0,
            plan_name="ProGTW",
        )

        with (
            patch.object(order_service_module, "SettingsService") as settings_service,
            patch.object(order_service_module, "ClientService") as client_service,
        ):
            settings_service.return_value.get.return_value = SimpleNamespace(
                default_inbound_id=1,
            )
            service._activate_order(order)

        calls = client_service.return_value.renew_or_create.call_args_list
        self.assertEqual([call.kwargs["server_id"] for call in calls], [1, 2])
        self.assertEqual(order.activated_server_ids, [1, 2])
        self.assertEqual(order.activation_error, "")
        self.assertIsNotNone(order.activated_at)


if __name__ == "__main__":
    unittest.main()
