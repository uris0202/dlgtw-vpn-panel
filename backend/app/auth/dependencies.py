from fastapi import Depends
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.security import HTTPBearer

from jose import JWTError

from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.user import User
from app.auth.jwt import decode_token

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):

    try:

        payload = decode_token(credentials.credentials)

        token_type = payload.get("token_type")

        # Tokens issued before session versioning did not carry a type.
        # Keep them valid until the first security-sensitive session rotation.
        if token_type not in {None, "admin"}:
            raise JWTError

        user_id = int(payload["sub"])
        session_version = int(payload.get("session_version", 0))

    except (JWTError, KeyError, TypeError, ValueError):

        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )

    user = db.get(
        User,
        user_id,
    )

    if (
        user is None
        or not user.is_admin
        or int(user.session_version or 0) != session_version
    ):

        raise HTTPException(
            status_code=401,
            detail="Session expired",
        )

    return user
