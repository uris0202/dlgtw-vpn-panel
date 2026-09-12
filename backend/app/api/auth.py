from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.jwt import create_access_token
from app.auth.password import hash_password, verify_password
from app.core.config import settings
from app.core.request import get_client_ip
from app.db.deps import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse
from app.services.audit_log_service import AuditLogService
from app.services.rate_limit import RateLimiter
from app.services.user_service import UserService

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

admin_login_limiter = RateLimiter(
    limit=settings.ADMIN_LOGIN_RATE_LIMIT,
    window_seconds=settings.ADMIN_LOGIN_RATE_WINDOW_SECONDS,
)
admin_registration_limiter = RateLimiter(
    limit=5,
    window_seconds=3600,
)
dummy_password_hash = hash_password("DLGTW timing check password")


@router.post("/register", response_model=UserResponse)
def register(
    user: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    rate_limit_key = f"register:{get_client_ip(request)}"

    if not admin_registration_limiter.allow(rate_limit_key):
        raise HTTPException(
            status_code=429,
            detail="Too many registration attempts",
            headers={"Retry-After": "3600"},
        )

    service = UserService(db)

    db.execute(text("LOCK TABLE users IN EXCLUSIVE MODE"))

    if db.query(User).count() > 0:
        raise HTTPException(
            status_code=403,
            detail="Registration is closed",
        )

    if service.get_by_email(user.email):
        raise HTTPException(
            status_code=400,
            detail="Email already exists",
        )

    try:
        created = service.create(
            email=str(user.email),
            password_hash=hash_password(user.password),
        )
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email already exists",
        ) from error

    admin_registration_limiter.reset(rate_limit_key)
    AuditLogService(db).record_admin(
        created,
        action="admin.registered",
        entity_type="admin",
        entity_id=created.id,
        summary=f"Зарегистрирован администратор {created.email}",
        ip_address=get_client_ip(request),
    )

    return created


@router.post("/login")
def login(
    user: UserLogin,
    request: Request,
    db: Session = Depends(get_db),
):
    rate_limit_key = f"login:{get_client_ip(request)}"

    if not admin_login_limiter.allow(rate_limit_key):
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts",
            headers={
                "Retry-After": str(
                    settings.ADMIN_LOGIN_RATE_WINDOW_SECONDS
                ),
            },
        )

    current = UserService(db).get_by_email(str(user.email))
    password_hash = (
        current.password_hash
        if current is not None
        else dummy_password_hash
    )
    password_valid = verify_password(
        user.password,
        password_hash,
    )

    if current is None or not password_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    admin_login_limiter.reset(rate_limit_key)

    token = create_access_token(
        {
            "sub": str(current.id),
            "token_type": "admin",
        }
    )
    AuditLogService(db).record_admin(
        current,
        action="admin.login",
        entity_type="admin",
        entity_id=current.id,
        summary=f"Вход администратора {current.email}",
        ip_address=get_client_ip(request),
    )

    return {
        "access_token": token,
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserResponse)
def me(
    current_user: User = Depends(get_current_user),
):
    return current_user
