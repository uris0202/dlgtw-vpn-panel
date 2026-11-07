from datetime import datetime
from datetime import timedelta
from datetime import timezone

from jose import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def create_access_token(
    data: dict,
    expires_minutes: int | None = None,
):

    payload = data.copy()

    now = datetime.now(timezone.utc)
    payload["iat"] = now
    payload["exp"] = now + timedelta(
        minutes=(
            expires_minutes
            if expires_minutes is not None
            else settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )


def create_admin_access_token(user):
    return create_access_token(
        {
            "sub": str(user.id),
            "token_type": "admin",
            "session_version": int(user.session_version or 0),
        }
    )


def create_two_factor_challenge_token(user, challenge_id: str):
    return create_access_token(
        {
            "sub": str(user.id),
            "token_type": "admin_2fa",
            "session_version": int(user.session_version or 0),
            "challenge_id": challenge_id,
        },
        expires_minutes=settings.ADMIN_2FA_CHALLENGE_EXPIRE_MINUTES,
    )


def decode_token(token: str):
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[ALGORITHM],
    )
