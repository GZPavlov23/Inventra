"""Application settings loaded from environment variables (and an optional .env file).

Every configurable value lives here, so no other module reads os.environ directly.
"""

from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Inventra"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://inventra:inventra_dev@localhost:5432/inventra"
    test_database_url: str = (
        "postgresql+psycopg://inventra:inventra_dev@localhost:5432/inventra_test"
    )

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # Base address of the web app, used to build links in emails (e.g. email verification).
    web_app_url: str = "http://localhost:5173"

    # Authentication
    session_cookie_name: str = "inventra_session"
    session_lifetime_days: int = 7
    email_verification_lifetime_hours: int = 24
    # After this many wrong passwords in a row, the account is locked for lockout_minutes.
    max_failed_logins: int = 5
    lockout_minutes: int = 15

    @property
    def cookie_secure(self) -> bool:
        # Secure cookies are only sent over HTTPS. Local development runs on plain HTTP.
        return self.environment != "development"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
