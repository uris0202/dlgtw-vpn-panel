import os
import unittest


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel",
)
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from app.services.audit_log_service import AuditLogService


class AuditLogSecurityTests(unittest.TestCase):
    def test_sensitive_values_are_removed_from_nested_details(self):
        sanitized = AuditLogService.sanitize_details({
            "status": "paid",
            "password": "secret",
            "nested": {
                "telegram_bot_token": "secret-token",
                "account_token": "secret-account-token",
                "totp_secret_encrypted": "encrypted-secret",
                "recovery_codes": ["ABCDE-FGHIJ"],
                "code": "123456",
                "server_ids": [1, 2],
            },
        })

        self.assertEqual(sanitized["status"], "paid")
        self.assertNotIn("password", sanitized)
        self.assertNotIn("telegram_bot_token", sanitized["nested"])
        self.assertNotIn("account_token", sanitized["nested"])
        self.assertNotIn("totp_secret_encrypted", sanitized["nested"])
        self.assertNotIn("recovery_codes", sanitized["nested"])
        self.assertNotIn("code", sanitized["nested"])
        self.assertEqual(sanitized["nested"]["server_ids"], [1, 2])


if __name__ == "__main__":
    unittest.main()
