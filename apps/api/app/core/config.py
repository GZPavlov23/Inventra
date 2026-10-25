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

    # TEMPORARY: replaced by the authenticated user's store in Milestone 2.
    dev_store_id: int = 1

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
