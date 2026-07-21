from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    CLIENT_TOKEN_EXPIRE_MINUTES: int = 10080
    CLIENT_COOKIE_SECURE: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
