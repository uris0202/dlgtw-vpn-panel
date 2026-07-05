from fastapi import Depends
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.security import HTTPBearer

from jose import jwt
from jose import JWTError

from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.user import User
from app.core.config import settings

security = HTTPBearer()

ALGORITHM = "HS256"


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):

    try:

        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET,
            algorithms=[ALGORITHM],
        )

    except JWTError:

        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )

    user = db.get(
        User,
        int(payload["sub"]),
    )

    if user is None:

        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    return user
