from datetime import datetime

from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import EmailStr
from pydantic import Field
from pydantic import field_validator


class UserCreate(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Пароль должен быть не длиннее 72 байт.")

        return value


class UserLogin(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=1, max_length=72)


class TwoFactorLoginVerify(BaseModel):
    challenge_token: str = Field(min_length=20, max_length=4096)
    code: str = Field(min_length=6, max_length=32)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip()


class AdminProfileUpdate(BaseModel):
    email: EmailStr = Field(max_length=255)
    current_password: str = Field(min_length=1, max_length=72)


class AdminPasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_new_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Пароль должен быть не длиннее 72 байт.")

        return value


class CurrentPasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)


class TwoFactorCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip()


class TwoFactorProtectedRequest(TwoFactorCodeRequest):
    current_password: str = Field(min_length=1, max_length=72)


class AdminSecurityResponse(BaseModel):
    email: EmailStr
    two_factor_enabled: bool
    two_factor_setup_pending: bool
    recovery_codes_remaining: int = Field(ge=0)
    two_factor_enabled_at: datetime | None = None


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    two_factor_enabled: bool = Field(
        default=False,
        validation_alias="totp_enabled",
    )

    model_config = ConfigDict(from_attributes=True)
