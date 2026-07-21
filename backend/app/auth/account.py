from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from fastapi import Response
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.security import HTTPBearer
from jose import JWTError
from jose import jwt
from sqlalchemy.orm import Session

from app.auth.jwt import ALGORITHM
from app.auth.jwt import create_access_token
from app.core.config import settings
from app.db.deps import get_db
from app.services.order_service import OrderService


account_security = HTTPBearer(auto_error=False)
ACCOUNT_SESSION_COOKIE = "dlgtw_client_session"
ACCOUNT_SESSION_COOKIE_PATH = "/api/public/account"


def create_account_access_token(order):
    return create_access_token(
        {
            "sub": f"account:{order.account_token}",
            "token_type": "client",
            "account_token": order.account_token,
            "session_version": order.account_session_version,
        },
        expires_minutes=settings.CLIENT_TOKEN_EXPIRE_MINUTES,
    )


def set_account_session_cookie(response: Response, order):
    response.set_cookie(
        key=ACCOUNT_SESSION_COOKIE,
        value=create_account_access_token(order),
        max_age=settings.CLIENT_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.CLIENT_COOKIE_SECURE,
        samesite="lax",
        path=ACCOUNT_SESSION_COOKIE_PATH,
    )


def clear_account_session_cookie(response: Response):
    response.delete_cookie(
        key=ACCOUNT_SESSION_COOKIE,
        httponly=True,
        secure=settings.CLIENT_COOKIE_SECURE,
        samesite="lax",
        path=ACCOUNT_SESSION_COOKIE_PATH,
    )


def get_current_account(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(account_security),
    db: Session = Depends(get_db),
):
    token = request.cookies.get(ACCOUNT_SESSION_COOKIE)

    if not token and credentials is not None:
        token = credentials.credentials

    if not token:
        raise account_unauthorized()

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[ALGORITHM],
        )
        account_token = str(payload.get("account_token") or "")
        session_version = int(payload.get("session_version"))

        if payload.get("token_type") != "client" or not account_token:
            raise ValueError
    except (JWTError, TypeError, ValueError):
        raise account_unauthorized()

    order = OrderService(db).get_by_account_token(account_token)

    if (
        order is None
        or not order.account_password_hash
        or order.account_session_version != session_version
    ):
        raise account_unauthorized()

    return order


def account_unauthorized():
    return HTTPException(
        status_code=401,
        detail="Сессия клиента истекла. Войдите снова.",
        headers={"WWW-Authenticate": "Bearer"},
    )
