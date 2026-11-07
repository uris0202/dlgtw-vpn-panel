import base64
from dataclasses import dataclass
import hashlib
import hmac
import secrets
import time

from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken
import pyotp

from app.core.config import settings


TOTP_INTERVAL_SECONDS = 30
RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
RECOVERY_CODE_COUNT = 8
RECOVERY_CODE_LENGTH = 10


@dataclass(frozen=True)
class SecondFactorResult:
    valid: bool
    method: str = ""
    totp_step: int | None = None
    recovery_code_hashes: list[str] | None = None


def create_totp_setup(email: str, issuer: str):
    secret = pyotp.random_base32()
    provisioning_uri = pyotp.TOTP(
        secret,
        interval=TOTP_INTERVAL_SECONDS,
    ).provisioning_uri(
        name=email,
        issuer_name=(issuer or "DLGTW VPN").strip() or "DLGTW VPN",
    )

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
    }


def encrypt_totp_secret(secret: str) -> str:
    if not secret:
        raise ValueError("TOTP secret is empty")

    return _fernet().encrypt(secret.encode("ascii")).decode("ascii")


def decrypt_totp_secret(encrypted_secret: str) -> str:
    if not encrypted_secret:
        raise ValueError("TOTP secret is not configured")

    try:
        return _fernet().decrypt(encrypted_secret.encode("ascii")).decode("ascii")
    except (InvalidToken, UnicodeError, ValueError) as error:
        raise ValueError("TOTP secret cannot be decrypted") from error


def verify_totp_code(
    secret: str,
    code: str,
    *,
    last_used_step: int = -1,
    now: float | None = None,
):
    normalized_code = (code or "").strip().replace(" ", "")

    if len(normalized_code) != 6 or not normalized_code.isdigit():
        return None

    current_step = int(now if now is not None else time.time()) // TOTP_INTERVAL_SECONDS
    generator = pyotp.TOTP(secret, interval=TOTP_INTERVAL_SECONDS)

    for step in range(current_step - 1, current_step + 2):
        expected = generator.at(step * TOTP_INTERVAL_SECONDS)

        if hmac.compare_digest(expected, normalized_code):
            if step <= int(last_used_step or -1):
                return None

            return step

    return None


def create_recovery_codes(count: int = RECOVERY_CODE_COUNT):
    codes = []
    normalized_codes = set()

    while len(codes) < count:
        raw_code = "".join(
            secrets.choice(RECOVERY_CODE_ALPHABET)
            for _ in range(RECOVERY_CODE_LENGTH)
        )

        if raw_code in normalized_codes:
            continue

        normalized_codes.add(raw_code)
        codes.append(f"{raw_code[:5]}-{raw_code[5:]}")

    return codes, [hash_recovery_code(code) for code in codes]


def hash_recovery_code(code: str) -> str:
    normalized = normalize_recovery_code(code)
    return _keyed_hash("admin-recovery-code-v1", normalized)


def normalize_recovery_code(code: str) -> str:
    return "".join(
        character
        for character in (code or "").strip().upper()
        if character not in {"-", " "}
    )


def consume_recovery_code(stored_hashes, code: str):
    normalized = normalize_recovery_code(code)

    if (
        len(normalized) != RECOVERY_CODE_LENGTH
        or any(character not in RECOVERY_CODE_ALPHABET for character in normalized)
    ):
        return None

    candidate_hash = hash_recovery_code(normalized)
    remaining = []
    matched = False

    for stored_hash in list(stored_hashes or []):
        if not matched and hmac.compare_digest(str(stored_hash), candidate_hash):
            matched = True
            continue

        remaining.append(str(stored_hash))

    return remaining if matched else None


def verify_second_factor(user, code: str) -> SecondFactorResult:
    encrypted_secret = getattr(user, "totp_secret_encrypted", "") or ""

    if encrypted_secret:
        try:
            secret = decrypt_totp_secret(encrypted_secret)
            step = verify_totp_code(
                secret,
                code,
                last_used_step=int(getattr(user, "totp_last_used_step", -1) or -1),
            )
        except ValueError:
            step = None

        if step is not None:
            return SecondFactorResult(
                valid=True,
                method="totp",
                totp_step=step,
            )

    remaining_hashes = consume_recovery_code(
        getattr(user, "recovery_code_hashes", []) or [],
        code,
    )

    if remaining_hashes is not None:
        return SecondFactorResult(
            valid=True,
            method="recovery_code",
            recovery_code_hashes=remaining_hashes,
        )

    return SecondFactorResult(valid=False)


def create_login_challenge():
    challenge_id = secrets.token_urlsafe(32)
    return challenge_id, hash_login_challenge(challenge_id)


def hash_login_challenge(challenge_id: str) -> str:
    return _keyed_hash("admin-login-challenge-v1", challenge_id or "")


def verify_login_challenge(stored_hash: str, challenge_id: str) -> bool:
    if not stored_hash or not challenge_id:
        return False

    return hmac.compare_digest(
        str(stored_hash),
        hash_login_challenge(challenge_id),
    )


def _keyed_hash(domain: str, value: str) -> str:
    key = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        domain.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).hexdigest()


def _fernet():
    raw_key = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        b"admin-totp-encryption-v1",
        hashlib.sha256,
    ).digest()
    return Fernet(base64.urlsafe_b64encode(raw_key))
