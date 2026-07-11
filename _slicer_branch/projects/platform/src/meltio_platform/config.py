"""Runtime configuration for the platform, read from the environment.

Defaults target the bundled Docker Compose stack (Postgres service ``db`` +
MinIO service ``minio``). In the cloud, point ``DATABASE_URL`` at RDS and the
``PLATFORM_S3_*`` vars at real S3; on-prem the bundled defaults work as-is.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # env_file is intentionally None: config comes from real environment vars
    # (compose / the shell), never from the repo-root .env used by other tooling.
    model_config = SettingsConfigDict(
        env_file=None, extra="ignore", case_sensitive=False, populate_by_name=True
    )

    database_url: str = Field(
        default="postgresql+psycopg://meltio:meltio@db:5432/meltio",
        alias="DATABASE_URL",
    )

    # Local dev has no Cloudflare Access in front, so the SSO header is absent.
    # Setting this fakes an authenticated identity so you can work locally.
    dev_user_email: str = Field(default="", alias="PLATFORM_DEV_USER_EMAIL")

    # Directory of slicer machine profiles (the factory preset is re-seeded here).
    profiles_dir: str = Field(default="profiles", alias="PLATFORM_PROFILES_DIR")

    # Comma-separated emails granted the superuser role on sign-in (bootstrap).
    superuser_emails: str = Field(default="", alias="PLATFORM_SUPERUSER_EMAILS")

    def superuser_email_set(self) -> set[str]:
        return {
            e.strip().lower() for e in self.superuser_emails.split(",") if e.strip()
        }

    # Object store (S3 in cloud; bundled MinIO locally/on-prem via endpoint URL).
    s3_endpoint_url: str = Field(default="", alias="PLATFORM_S3_ENDPOINT_URL")
    s3_region: str = Field(default="eu-north-1", alias="PLATFORM_S3_REGION")
    s3_bucket: str = Field(default="meltio-platform", alias="PLATFORM_S3_BUCKET")
    s3_access_key: str = Field(default="", alias="PLATFORM_S3_ACCESS_KEY")
    s3_secret_key: str = Field(default="", alias="PLATFORM_S3_SECRET_KEY")


@lru_cache
def get_settings() -> Settings:
    return Settings()
