import os
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://vpnpanel:vpnpanel@localhost/vpnpanel",
)
os.environ.setdefault(
    "JWT_SECRET",
    "test-secret-that-is-longer-than-thirty-two-characters",
)

from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token
from app.auth.jwt import create_admin_access_token


class FakeDatabase:
    def __init__(self, user):
        self.user = user

    def get(self, model, user_id):
        if self.user is not None and self.user.id == user_id:
            return self.user
        return None


def credentials(token):
    return HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=token,
    )


class AdminSessionTests(unittest.TestCase):
    def setUp(self):
        self.user = SimpleNamespace(
            id=7,
            is_admin=True,
            session_version=0,
        )
        self.db = FakeDatabase(self.user)

    def test_current_admin_token_is_accepted(self):
        token = create_admin_access_token(self.user)

        current = get_current_user(credentials(token), self.db)

        self.assertIs(current, self.user)

    def test_legacy_admin_token_is_accepted_before_session_rotation(self):
        token = create_access_token({"sub": str(self.user.id)})

        current = get_current_user(credentials(token), self.db)

        self.assertIs(current, self.user)

    def test_legacy_token_is_rejected_after_session_rotation(self):
        token = create_access_token({"sub": str(self.user.id)})
        self.user.session_version = 1

        with self.assertRaises(HTTPException) as context:
            get_current_user(credentials(token), self.db)

        self.assertEqual(context.exception.status_code, 401)

    def test_stale_admin_token_is_rejected(self):
        token = create_admin_access_token(self.user)
        self.user.session_version = 1

        with self.assertRaises(HTTPException) as context:
            get_current_user(credentials(token), self.db)

        self.assertEqual(context.exception.status_code, 401)

    def test_client_token_cannot_access_admin_api(self):
        token = create_access_token({
            "sub": str(self.user.id),
            "token_type": "client",
            "session_version": 0,
        })

        with self.assertRaises(HTTPException) as context:
            get_current_user(credentials(token), self.db)

        self.assertEqual(context.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
