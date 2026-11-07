from datetime import datetime
from datetime import timezone

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from jose import JWTError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.jwt import create_admin_access_token
from app.auth.jwt import decode_token
from app.auth.password import hash_password
from app.auth.password import verify_password
from app.core.request import get_client_ip
from app.db.deps import get_db
from app.models.user import User
from app.schemas.user import AdminPasswordChange
from app.schemas.user import AdminProfileUpdate
from app.schemas.user import AdminSecurityResponse
from app.schemas.user import CurrentPasswordRequest
from app.schemas.user import TwoFactorCodeRequest
from app.schemas.user import TwoFactorLoginVerify
from app.schemas.user import TwoFactorProtectedRequest
from app.services.admin_security_service import create_recovery_codes
from app.services.admin_security_service import create_totp_setup
from app.services.admin_security_service import decrypt_totp_secret
from app.services.admin_security_service import encrypt_totp_secret
from app.services.admin_security_service import verify_login_challenge
from app.services.admin_security_service import verify_second_factor
from app.services.admin_security_service import verify_totp_code
from app.services.audit_log_service import AuditLogService
from app.services.rate_limit import RateLimiter
from app.services.settings_service import SettingsService
from app.services.user_service import UserService


router = APIRouter(
    prefix="/auth",
    tags=["Admin security"],
)

two_factor_login_limiter = RateLimiter(
    limit=10,
    window_seconds=600,
)


@router.post("/2fa/verify")
def verify_two_factor_login(
    payload: TwoFactorLoginVerify,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        token_payload = decode_token(payload.challenge_token)

        if token_payload.get("token_type") != "admin_2fa":
            raise JWTError

        user_id = int(token_payload["sub"])
        session_version = int(token_payload.get("session_version", 0))
        challenge_id = str(token_payload["challenge_id"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Срок подтверждения входа истёк. Введите пароль ещё раз.",
        )

    rate_limit_key = f"admin-2fa:{user_id}:{get_client_ip(request)}"

    if not two_factor_login_limiter.allow(rate_limit_key):
        raise HTTPException(
            status_code=429,
            detail="Слишком много попыток подтверждения. Попробуйте через 10 минут.",
            headers={"Retry-After": "600"},
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .one_or_none()
    )

    if (
        user is None
        or not user.is_admin
        or not user.totp_enabled
        or int(user.session_version or 0) != session_version
        or not verify_login_challenge(
            user.two_factor_challenge_hash,
            challenge_id,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Срок подтверждения входа истёк. Введите пароль ещё раз.",
        )

    result = verify_second_factor(user, payload.code)

    if not result.valid:
        raise HTTPException(
            status_code=401,
            detail="Неверный код подтверждения.",
        )

    apply_second_factor_result(user, result)
    user.two_factor_challenge_hash = ""
    db.commit()
    db.refresh(user)
    two_factor_login_limiter.reset(rate_limit_key)

    AuditLogService(db).record_admin(
        user,
        action="admin.login",
        entity_type="admin",
        entity_id=user.id,
        summary=f"Вход администратора {user.email} с двухфакторной защитой",
        details={"method": result.method},
        ip_address=get_client_ip(request),
    )

    return token_response(
        user,
        recovery_code_used=result.method == "recovery_code",
        recovery_codes_remaining=len(user.recovery_code_hashes or []),
    )


@router.get("/security", response_model=AdminSecurityResponse)
def get_admin_security(
    current_user: User = Depends(get_current_user),
):
    return security_response(current_user)


@router.patch("/profile")
def update_admin_profile(
    payload: AdminProfileUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_admin_user(db, current_user)
    require_current_password(current_user, payload.current_password)
    normalized_email = str(payload.email).strip().lower()
    old_email = current_user.email

    if normalized_email == old_email.lower():
        return token_response(
            current_user,
            security=security_response(current_user),
        )

    existing = UserService(db).get_by_email(normalized_email)

    if existing is not None and existing.id != current_user.id:
        raise HTTPException(
            status_code=409,
            detail="Этот email уже используется.",
        )

    current_user.email = normalized_email
    rotate_admin_sessions(current_user)

    try:
        db.commit()
        db.refresh(current_user)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Этот email уже используется.",
        ) from error

    AuditLogService(db).record_admin(
        current_user,
        action="admin.profile_updated",
        entity_type="admin",
        entity_id=current_user.id,
        summary=f"Email администратора изменён на {current_user.email}",
        details={"old_email": old_email, "new_email": current_user.email},
        ip_address=get_client_ip(request),
    )

    return token_response(
        current_user,
        security=security_response(current_user),
    )


@router.post("/password")
def change_admin_password(
    payload: AdminPasswordChange,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_admin_user(db, current_user)
    require_current_password(current_user, payload.current_password)

    if verify_password(payload.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Новый пароль должен отличаться от текущего.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    rotate_admin_sessions(current_user)
    db.commit()
    db.refresh(current_user)

    AuditLogService(db).record_admin(
        current_user,
        action="admin.password_changed",
        entity_type="admin",
        entity_id=current_user.id,
        summary=f"Администратор {current_user.email} изменил пароль",
        ip_address=get_client_ip(request),
    )

    return token_response(
        current_user,
        security=security_response(current_user),
    )


@router.post("/2fa/setup")
def start_two_factor_setup(
    payload: CurrentPasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_admin_user(db, current_user)

    if current_user.totp_enabled:
        raise HTTPException(
            status_code=409,
            detail="Двухфакторная защита уже включена.",
        )

    require_current_password(current_user, payload.current_password)
    panel_settings = SettingsService(db).get()
    setup = create_totp_setup(
        current_user.email,
        panel_settings.panel_name,
    )
    current_user.totp_pending_secret_encrypted = encrypt_totp_secret(
        setup["secret"]
    )
    db.commit()

    AuditLogService(db).record_admin(
        current_user,
        action="admin.two_factor_setup_started",
        entity_type="admin",
        entity_id=current_user.id,
        summary=f"Администратор {current_user.email} начал настройку 2FA",
        ip_address=get_client_ip(request),
    )

    return {
        "provisioning_uri": setup["provisioning_uri"],
        "manual_key": setup["secret"],
    }


@router.post("/2fa/enable")
def enable_two_factor(
    payload: TwoFactorCodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_admin_user(db, current_user)

    if current_user.totp_enabled:
        raise HTTPException(
            status_code=409,
            detail="Двухфакторная защита уже включена.",
        )

    try:
        secret = decrypt_totp_secret(
            current_user.totp_pending_secret_encrypted
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail="Сначала запустите настройку 2FA заново.",
        ) from error

    matched_step = verify_totp_code(secret, payload.code)

    if matched_step is None:
        raise HTTPException(
            status_code=400,
            detail="Неверный код. Проверьте время на телефоне и повторите.",
        )

    recovery_codes, recovery_hashes = create_recovery_codes()
    current_user.totp_secret_encrypted = (
        current_user.totp_pending_secret_encrypted
    )
    current_user.totp_pending_secret_encrypted = ""
    current_user.totp_enabled = True
    current_user.totp_last_used_step = matched_step
    current_user.recovery_code_hashes = recovery_hashes
    current_user.two_factor_enabled_at = datetime.now(timezone.utc)
    rotate_admin_sessions(current_user)
    db.commit()
    db.refresh(current_user)

    AuditLogService(db).record_admin(
        current_user,
        action="admin.two_factor_enabled",
        entity_type="admin",
        entity_id=current_user.id,
        summary=f"Администратор {current_user.email} включил 2FA",
        details={"recovery_codes_count": len(recovery_codes)},
        ip_address=get_client_ip(request),
    )

    return token_response(
        current_user,
        security=security_response(current_user),
        recovery_codes=recovery_codes,
    )


@router.post("/2fa/disable")
def disable_two_factor(
    payload: TwoFactorProtectedRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_admin_user(db, current_user)
    require_two_factor_enabled(current_user)
    require_current_password(current_user, payload.current_password)
    result = require_second_factor(current_user, payload.code)

    current_user.totp_enabled = False
    current_user.totp_secret_encrypted = ""
    current_user.totp_pending_secret_encrypted = ""
    current_user.totp_last_used_step = -1
    current_user.recovery_code_hashes = []
    current_user.two_factor_enabled_at = None
    rotate_admin_sessions(current_user)
    db.commit()
    db.refresh(current_user)

    AuditLogService(db).record_admin(
        current_user,
        action="admin.two_factor_disabled",
        entity_type="admin",
        entity_id=current_user.id,
        summary=f"Администратор {current_user.email} отключил 2FA",
        details={"method": result.method},
        ip_address=get_client_ip(request),
    )

    return token_response(
        current_user,
        security=security_response(current_user),
    )


@router.post("/2fa/recovery-codes")
def regenerate_recovery_codes(
    payload: TwoFactorProtectedRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_admin_user(db, current_user)
    require_two_factor_enabled(current_user)
    require_current_password(current_user, payload.current_password)
    result = require_second_factor(current_user, payload.code)
    apply_second_factor_result(current_user, result)

    recovery_codes, recovery_hashes = create_recovery_codes()
    current_user.recovery_code_hashes = recovery_hashes
    rotate_admin_sessions(current_user)
    db.commit()
    db.refresh(current_user)

    AuditLogService(db).record_admin(
        current_user,
        action="admin.recovery_codes_regenerated",
        entity_type="admin",
        entity_id=current_user.id,
        summary=f"Администратор {current_user.email} обновил резервные коды 2FA",
        details={"recovery_codes_count": len(recovery_codes)},
        ip_address=get_client_ip(request),
    )

    return token_response(
        current_user,
        security=security_response(current_user),
        recovery_codes=recovery_codes,
    )


@router.post("/sessions/revoke")
def revoke_admin_sessions(
    payload: CurrentPasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_admin_user(db, current_user)
    require_current_password(current_user, payload.current_password)
    rotate_admin_sessions(current_user)
    db.commit()
    db.refresh(current_user)

    AuditLogService(db).record_admin(
        current_user,
        action="admin.sessions_revoked",
        entity_type="admin",
        entity_id=current_user.id,
        summary=f"Администратор {current_user.email} завершил остальные сессии",
        ip_address=get_client_ip(request),
    )

    return token_response(
        current_user,
        security=security_response(current_user),
    )


def require_current_password(user, password):
    if not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Текущий пароль указан неверно.",
        )


def lock_admin_user(db, user):
    locked_user = (
        db.query(User)
        .filter(User.id == user.id)
        .with_for_update()
        .one_or_none()
    )

    if locked_user is None or not locked_user.is_admin:
        raise HTTPException(
            status_code=401,
            detail="Сессия администратора завершена.",
        )

    return locked_user


def require_two_factor_enabled(user):
    if not user.totp_enabled:
        raise HTTPException(
            status_code=409,
            detail="Двухфакторная защита не включена.",
        )


def require_second_factor(user, code):
    result = verify_second_factor(user, code)

    if not result.valid:
        raise HTTPException(
            status_code=400,
            detail="Неверный код подтверждения.",
        )

    return result


def apply_second_factor_result(user, result):
    if result.method == "totp":
        user.totp_last_used_step = result.totp_step
    elif result.method == "recovery_code":
        user.recovery_code_hashes = result.recovery_code_hashes or []


def rotate_admin_sessions(user):
    user.session_version = int(user.session_version or 0) + 1
    user.two_factor_challenge_hash = ""


def security_response(user):
    return {
        "email": user.email,
        "two_factor_enabled": bool(user.totp_enabled),
        "two_factor_setup_pending": bool(
            user.totp_pending_secret_encrypted
            and not user.totp_enabled
        ),
        "recovery_codes_remaining": len(user.recovery_code_hashes or []),
        "two_factor_enabled_at": user.two_factor_enabled_at,
    }


def token_response(user, **values):
    return {
        "access_token": create_admin_access_token(user),
        "token_type": "bearer",
        **values,
    }
