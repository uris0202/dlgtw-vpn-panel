from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

MAX_PASSWORD_BYTES = 72


def hash_password(password: str):
    if not password or len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(
            "Пароль должен содержать от 1 до 72 байт."
        )

    return pwd_context.hash(password)


def verify_password(password, hashed):
    if (
        not isinstance(password, str)
        or not isinstance(hashed, str)
        or not hashed
        or len(password.encode("utf-8")) > MAX_PASSWORD_BYTES
    ):
        return False

    try:
        return pwd_context.verify(
            password,
            hashed,
        )
    except (TypeError, ValueError):
        return False
