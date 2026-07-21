from datetime import datetime
from datetime import timedelta

from jose import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def create_access_token(
    data: dict,
    expires_minutes: int | None = None,
):

    payload = data.copy()

    payload["exp"] = datetime.utcnow() + timedelta(
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
