"""Object-store access (S3 in cloud, MinIO locally/on-prem).

PR2 wires the client and a health probe so the object store is part of the
stack; presigned uploads/downloads and per-artifact keys arrive with file
management. boto3 is imported lazily so the dependency is only paid when used.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from .config import get_settings

if TYPE_CHECKING:  # pragma: no cover - typing only
    from mypy_boto3_s3 import S3Client


@lru_cache
def get_s3_client() -> "S3Client":
    import boto3
    from botocore.config import Config

    settings = get_settings()
    kwargs: dict = {"region_name": settings.s3_region}
    # An explicit endpoint means MinIO (or another S3-compatible store); without
    # it boto3 resolves the regional AWS S3 endpoint and uses the instance role.
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    if settings.s3_access_key and settings.s3_secret_key:
        kwargs["aws_access_key_id"] = settings.s3_access_key
        kwargs["aws_secret_access_key"] = settings.s3_secret_key
    # Path-style addressing keeps MinIO happy; harmless on AWS with s3v4.
    kwargs["config"] = Config(s3={"addressing_style": "path"}, signature_version="s3v4")
    return boto3.client("s3", **kwargs)


def _bucket() -> str:
    return get_settings().s3_bucket


def storage_ok() -> bool:
    """Best-effort reachability check for the configured bucket."""
    try:
        get_s3_client().head_bucket(Bucket=_bucket())
        return True
    except Exception:  # noqa: BLE001 - any failure means "not ready"
        return False


def ensure_bucket() -> None:
    """Create the bucket if it does not exist (idempotent)."""
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=_bucket())
    except Exception:  # noqa: BLE001 - missing/forbidden → try to create
        client.create_bucket(Bucket=_bucket())


def put_fileobj(
    key: str, fileobj, content_type: str = "application/octet-stream"
) -> None:
    """Stream a file-like object into the store under ``key`` (upload via app)."""
    get_s3_client().upload_fileobj(
        fileobj, _bucket(), key, ExtraArgs={"ContentType": content_type}
    )


def get_object(key: str) -> tuple:
    """Open a stored object: returns ``(body_stream, content_type, length)``."""
    obj = get_s3_client().get_object(Bucket=_bucket(), Key=key)
    return (
        obj["Body"],
        obj.get("ContentType", "application/octet-stream"),
        obj.get("ContentLength"),
    )


# Presigned direct-to-store transfer is kept for large print media (GB video /
# sensor files) handled in a later phase; STL parts upload through the app.
def presign_put(
    key: str, content_type: str = "application/octet-stream", expires: int = 3600
) -> str:
    """Presigned URL for a direct browser ``PUT`` upload to the object store."""
    return get_s3_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": _bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=expires,
    )


def presign_get(key: str, expires: int = 3600) -> str:
    """Presigned URL for a direct browser ``GET`` download from the object store."""
    return get_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=expires,
    )


def delete_object(key: str) -> None:
    """Best-effort delete of a stored object."""
    try:
        get_s3_client().delete_object(Bucket=_bucket(), Key=key)
    except Exception:  # noqa: BLE001 - deletion is best-effort
        pass
