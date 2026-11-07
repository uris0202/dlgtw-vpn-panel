import os
import unittest
from types import SimpleNamespace

import pyotp


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel",
)
os.environ.setdefault(
    "JWT_SECRET",
    "test-secret-that-is-longer-than-thirty-two-characters",
)

from app.services.admin_security_service import consume_recovery_code
from app.services.admin_security_service import create_login_challenge
from app.services.admin_security_service import create_recovery_codes
from app.services.admin_security_service import decrypt_totp_secret
from app.services.admin_security_service import encrypt_totp_secret
from app.services.admin_security_service import verify_login_challenge
from app.services.admin_security_service import verify_second_factor
from app.services.admin_security_service import verify_totp_code


class AdminSecurityServiceTests(unittest.TestCase):
    def test_totp_secret_is_encrypted_and_can_be_decrypted(self):
        secret = "JBSWY3DPEHPK3PXP"

        encrypted = encrypt_totp_secret(secret)

        self.assertNotEqual(encrypted, secret)
        self.assertNotIn(secret, encrypted)
        self.assertEqual(decrypt_totp_secret(encrypted), secret)

    def test_totp_code_is_valid_once_for_the_same_time_step(self):
        secret = "JBSWY3DPEHPK3PXP"
        now = 1_700_000_000
        expected_step = now // 30
        code = pyotp.TOTP(secret).at(expected_step * 30)

        matched_step = verify_totp_code(secret, code, now=now)

        self.assertEqual(matched_step, expected_step)
        self.assertIsNone(
            verify_totp_code(
                secret,
                code,
                now=now,
                last_used_step=matched_step,
            )
        )

    def test_recovery_code_can_only_be_consumed_once(self):
        codes, stored_hashes = create_recovery_codes()

        remaining_hashes = consume_recovery_code(stored_hashes, codes[0])

        self.assertEqual(len(codes), 8)
        self.assertEqual(len(set(codes)), 8)
        self.assertEqual(len(remaining_hashes), 7)
        self.assertIsNone(consume_recovery_code(remaining_hashes, codes[0]))

    def test_second_factor_accepts_recovery_code(self):
        codes, stored_hashes = create_recovery_codes()
        user = SimpleNamespace(
            totp_secret_encrypted="",
            recovery_code_hashes=stored_hashes,
        )

        result = verify_second_factor(user, codes[0].lower())

        self.assertTrue(result.valid)
        self.assertEqual(result.method, "recovery_code")
        self.assertEqual(len(result.recovery_code_hashes), 7)

    def test_login_challenge_is_bound_to_its_random_identifier(self):
        challenge_id, stored_hash = create_login_challenge()

        self.assertTrue(verify_login_challenge(stored_hash, challenge_id))
        self.assertFalse(verify_login_challenge(stored_hash, "different"))


if __name__ == "__main__":
    unittest.main()
