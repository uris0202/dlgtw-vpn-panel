from pydantic import Field
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import urlparse


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str = Field(min_length=32)

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    CLIENT_TOKEN_EXPIRE_MINUTES: int = 10080
    CLIENT_COOKIE_SECURE: bool = True
    API_DOCS_ENABLED: bool = False
    PUBLIC_BASE_URL: str = "https://dlgtw.ru"
    ADMIN_LOGIN_RATE_LIMIT: int = Field(default=10, ge=1, le=100)
    ADMIN_LOGIN_RATE_WINDOW_SECONDS: int = Field(default=600, ge=60, le=86400)
    ADMIN_2FA_CHALLENGE_EXPIRE_MINUTES: int = Field(default=5, ge=2, le=15)
    PUBLIC_ORDER_RATE_LIMIT: int = Field(default=20, ge=1, le=1000)
    PUBLIC_ORDER_RATE_WINDOW_SECONDS: int = Field(default=3600, ge=60, le=86400)

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        normalized = value.strip()
        placeholders = (
            "change_me",
            "replace_",
            "your_",
        )

        if normalized.lower().startswith(placeholders):
            raise ValueError("JWT_SECRET must be a random secret")

        return normalized

    @field_validator("PUBLIC_BASE_URL")
    @classmethod
    def validate_public_base_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.query or parsed.fragment:
            raise ValueError("PUBLIC_BASE_URL must be an HTTPS URL")
        return value.rstrip("/")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
