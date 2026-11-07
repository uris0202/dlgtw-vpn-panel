import os
import unittest

import pyotp
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel",
)
os.environ.setdefault(
    "JWT_SECRET",
    "test-secret-that-is-longer-than-thirty-two-characters",
)
os.environ.setdefault("API_DOCS_ENABLED", "false")

from app.auth.password import hash_password
from app.db.base import Base
from app.db.deps import get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.settings import PanelSettings
from app.models.user import User


class AdminSecurityApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.session_factory = sessionmaker(
            bind=cls.engine,
            autoflush=False,
            autocommit=False,
        )

        def override_get_db():
            db = cls.session_factory()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        app.dependency_overrides.clear()
        cls.engine.dispose()

    def setUp(self):
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                PanelSettings.__table__,
                AuditLog.__table__,
            ],
        )

        with self.session_factory() as db:
            db.add(PanelSettings(id=1, panel_name="DLGTW VPN"))
            db.add(User(
                email="admin@example.com",
                password_hash=hash_password("strong-password"),
                is_admin=True,
            ))
            db.commit()

    def test_complete_two_factor_login_flow(self):
        login = self.client.post("/auth/login", json={
            "email": "admin@example.com",
            "password": "strong-password",
        })
        self.assertEqual(login.status_code, 200, login.text)
        original_token = login.json()["access_token"]

        setup = self.client.post(
            "/auth/2fa/setup",
            headers=authorization(original_token),
            json={"current_password": "strong-password"},
        )
        self.assertEqual(setup.status_code, 200, setup.text)
        setup_data = setup.json()
        self.assertTrue(setup_data["provisioning_uri"].startswith("otpauth://totp/"))

        enable = self.client.post(
            "/auth/2fa/enable",
            headers=authorization(original_token),
            json={"code": pyotp.TOTP(setup_data["manual_key"]).now()},
        )
        self.assertEqual(enable.status_code, 200, enable.text)
        enable_data = enable.json()
        protected_token = enable_data["access_token"]
        recovery_codes = enable_data["recovery_codes"]
        self.assertEqual(len(recovery_codes), 8)
        self.assertTrue(enable_data["security"]["two_factor_enabled"])

        expired_session = self.client.get(
            "/auth/security",
            headers=authorization(original_token),
        )
        self.assertEqual(expired_session.status_code, 401)

        me = self.client.get(
            "/auth/me",
            headers=authorization(protected_token),
        )
        self.assertEqual(me.status_code, 200, me.text)
        self.assertTrue(me.json()["two_factor_enabled"])

        protected_login = self.client.post("/auth/login", json={
            "email": "admin@example.com",
            "password": "strong-password",
        })
        self.assertEqual(protected_login.status_code, 200, protected_login.text)
        challenge_data = protected_login.json()
        self.assertTrue(challenge_data["requires_2fa"])
        self.assertNotIn("access_token", challenge_data)

        verified = self.client.post("/auth/2fa/verify", json={
            "challenge_token": challenge_data["challenge_token"],
            "code": recovery_codes[0],
        })
        self.assertEqual(verified.status_code, 200, verified.text)
        self.assertTrue(verified.json()["recovery_code_used"])
        self.assertEqual(verified.json()["recovery_codes_remaining"], 7)

        reused_challenge = self.client.post("/auth/2fa/verify", json={
            "challenge_token": challenge_data["challenge_token"],
            "code": recovery_codes[1],
        })
        self.assertEqual(reused_challenge.status_code, 401)


def authorization(token):
    return {"Authorization": f"Bearer {token}"}


if __name__ == "__main__":
    unittest.main()
